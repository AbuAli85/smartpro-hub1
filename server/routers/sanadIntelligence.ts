import { TRPCError } from "@trpc/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { NOT_ADMIN_ERR_MSG } from "@shared/const";
import { canAccessSanadIntelFull, canAccessSanadIntelRead } from "@shared/sanadRoles";
import {
  sanadIntelCenterComplianceItems,
  sanadIntelCenterOperations,
  sanadIntelCenters,
  sanadIntelLicenseRequirements,
  sanadOffices,
  sanadOfficeMembers,
} from "../../drizzle/schema";
import { getDb } from "../db";
import {
  buildSanadInvitePath,
  computeCenterActivationReadiness,
  ensureCenterOperations,
  evaluateActivationServerGate,
  findByInviteToken,
  generateInviteTokenValue,
  inviteIsExpired,
  isSanadInviteOnboardingChannelOpen,
  SANAD_INVITE_PEEK_NOT_FOUND_MESSAGE,
} from "../sanad-intelligence/activation";
import { insertSanadIntelAuditEvent } from "../sanad-intelligence/sanadIntelAudit";
import {
  getCenterDetail,
  getLatestMetricYear,
  getOverviewSummary,
  getRegionalOpportunity,
  getTopServices,
  getWorkforce,
  listCenters,
  listGovernorateKeysFromCenters,
  listWilayatForGovernorate,
  getSanadNetworkLifecycleKpis,
  getSanadOperationalKpis,
} from "../sanad-intelligence/queries";
import { protectedProcedure, publicProcedure, router, t } from "../_core/trpc";
import { throwIfSanadIntelSchemaMissing } from "../sanad-intelligence/dbErrors";

const sanadIntelSchemaGuard = t.middleware(async ({ next }) => {
  try {
    return await next();
  } catch (e) {
    throwIfSanadIntelSchemaMissing(e);
  }
});

const sanadIntelReadProcedure = protectedProcedure.use(sanadIntelSchemaGuard).use(
  t.middleware(({ ctx, next }) => {
    if (!ctx.user || !canAccessSanadIntelRead(ctx.user)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

const sanadIntelFullProcedure = protectedProcedure.use(sanadIntelSchemaGuard).use(
  t.middleware(({ ctx, next }) => {
    if (!ctx.user || !canAccessSanadIntelFull(ctx.user)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

const publicSanadIntelProcedure = publicProcedure.use(
  t.middleware(async ({ next }) => {
    try {
      return await next();
    } catch (e) {
      throwIfSanadIntelSchemaMissing(e);
    }
  }),
);

const protectedSanadIntelProcedure = protectedProcedure.use(
  t.middleware(async ({ next }) => {
    try {
      return await next();
    } catch (e) {
      throwIfSanadIntelSchemaMissing(e);
    }
  }),
);

const partnerStatusZ = z.enum(["unknown", "prospect", "active", "suspended", "churned"]);
const onboardingZ = z.enum([
  "not_started",
  "intake",
  "documentation",
  "licensing_review",
  "licensed",
  "blocked",
]);
const complianceOverallZ = z.enum(["not_assessed", "partial", "complete", "at_risk"]);
const complianceItemZ = z.enum(["pending", "submitted", "verified", "rejected", "waived", "not_applicable"]);
const sanadProviderTypeZ = z.enum([
  "pro_office",
  "typing_centre",
  "admin_bureau",
  "legal_services",
  "attestation",
  "visa_services",
  "business_setup",
  "other",
]);

export const sanadIntelligenceRouter = router({
  networkOperationsMetrics: sanadIntelReadProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const [lifecycle, operational] = await Promise.all([
      getSanadNetworkLifecycleKpis(db as never),
      getSanadOperationalKpis(db as never),
    ]);
    return { lifecycle, operational };
  }),

  overviewSummary: sanadIntelReadProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    return getOverviewSummary(db as never);
  }),

  transactionsTrend: sanadIntelReadProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const o = await getOverviewSummary(db as never);
    return o.trends.transactions;
  }),

  incomeTrend: sanadIntelReadProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const o = await getOverviewSummary(db as never);
    return o.trends.income;
  }),

  listCenters: sanadIntelReadProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          governorateKey: z.string().optional(),
          wilayat: z.string().optional(),
          partnerStatus: partnerStatusZ.optional(),
          limit: z.number().min(1).max(1000).default(50),
          offset: z.number().min(0).default(0),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      return listCenters(db as never, {
        search: input?.search,
        governorateKey: input?.governorateKey,
        wilayat: input?.wilayat,
        partnerStatus: input?.partnerStatus,
        limit: input?.limit ?? 50,
        offset: input?.offset ?? 0,
      });
    }),

  getCenter: sanadIntelReadProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const row = await getCenterDetail(db as never, input.id);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Center not found" });
    return row;
  }),

  filterOptions: sanadIntelReadProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const governorates = await listGovernorateKeysFromCenters(db as never);
    return { governorates };
  }),

  wilayatForGovernorate: sanadIntelReadProcedure
    .input(z.object({ governorateKey: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const rows = await listWilayatForGovernorate(db as never, input.governorateKey);
      return rows.map((r) => r.wilayat).filter(Boolean) as string[];
    }),

  updateCenterOperations: sanadIntelFullProcedure
    .input(
      z.object({
        centerId: z.number(),
        partnerStatus: partnerStatusZ.optional(),
        onboardingStatus: onboardingZ.optional(),
        complianceOverall: complianceOverallZ.optional(),
        internalTags: z.array(z.string()).optional(),
        notes: z.string().optional(),
        internalReviewNotes: z.string().optional(),
        assignedManagerUserId: z.number().nullable().optional(),
        latitude: z.string().nullable().optional(),
        longitude: z.string().nullable().optional(),
        coverageRadiusKm: z.number().nullable().optional(),
        targetSlaHours: z.number().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const { centerId, ...rest } = input;
      const [c] = await db.select({ id: sanadIntelCenters.id }).from(sanadIntelCenters).where(eq(sanadIntelCenters.id, centerId)).limit(1);
      if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Center not found" });

      const [ops] = await db
        .select()
        .from(sanadIntelCenterOperations)
        .where(eq(sanadIntelCenterOperations.centerId, centerId))
        .limit(1);
      if (!ops) {
        await db.insert(sanadIntelCenterOperations).values({ centerId });
      }

      const patch: Record<string, unknown> = {};
      if (rest.partnerStatus !== undefined) patch.partnerStatus = rest.partnerStatus;
      if (rest.onboardingStatus !== undefined) patch.onboardingStatus = rest.onboardingStatus;
      if (rest.complianceOverall !== undefined) patch.complianceOverall = rest.complianceOverall;
      if (rest.internalTags !== undefined) patch.internalTags = rest.internalTags;
      if (rest.notes !== undefined) patch.notes = rest.notes;
      if (rest.internalReviewNotes !== undefined) patch.internalReviewNotes = rest.internalReviewNotes;
      if (rest.assignedManagerUserId !== undefined) patch.assignedManagerUserId = rest.assignedManagerUserId;
      if (rest.latitude !== undefined) patch.latitude = rest.latitude;
      if (rest.longitude !== undefined) patch.longitude = rest.longitude;
      if (rest.coverageRadiusKm !== undefined) patch.coverageRadiusKm = rest.coverageRadiusKm;
      if (rest.targetSlaHours !== undefined) patch.targetSlaHours = rest.targetSlaHours;

      if (Object.keys(patch).length > 0) {
        await db.update(sanadIntelCenterOperations).set(patch as never).where(eq(sanadIntelCenterOperations.centerId, centerId));
      }
      return { success: true as const };
    }),

  regionalOpportunity: sanadIntelReadProcedure
    .input(z.object({ year: z.number().min(2000).max(2100).optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const y = input.year ?? (await getLatestMetricYear(db as never));
      if (y === null) return { year: null as number | null, rows: [], serviceRelevanceNational: 0 };
      return getRegionalOpportunity(db as never, y);
    }),

  topServicesByYear: sanadIntelReadProcedure
    .input(z.object({ year: z.number().min(2000).max(2100) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      return getTopServices(db as never, input.year);
    }),

  serviceDemandInsights: sanadIntelReadProcedure
    .input(z.object({ year: z.number().min(2000).max(2100) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const cur = await getTopServices(db as never, input.year);
      const prev = await getTopServices(db as never, input.year - 1);
      const prevMap = new Map(prev.map((r) => [(r.serviceNameEn ?? r.serviceNameAr ?? "").toLowerCase(), r]));
      const shifts = cur.slice(0, 25).map((r, i) => {
        const key = (r.serviceNameEn ?? r.serviceNameAr ?? "").toLowerCase();
        const p = prevMap.get(key);
        const prevRank = p?.rankOrder ?? null;
        return {
          ...r,
          previousRank: prevRank,
          rankDelta: prevRank !== null ? prevRank - r.rankOrder : null,
          index: i,
        };
      });

      const digitizeFirst = cur.filter((r) =>
        /work|permit|visa|labor|residence|commercial|mol|typing|electronic|online|رخصة|تأشيرة|عمالة/i.test(
          `${r.serviceNameEn ?? ""} ${r.serviceNameAr ?? ""}`,
        ),
      );

      const bundleCandidates = cur.slice(0, 8);

      return {
        year: input.year,
        top: cur,
        shifts,
        recommendations: {
          digitizeFirst: digitizeFirst.slice(0, 12),
          bundleTogether: bundleCandidates,
          assignToSanadPartners: cur.filter((r) =>
            /typing|attest|translation|translation|تصديق|كتابة|ترجمة/i.test(
              `${r.serviceNameEn ?? ""} ${r.serviceNameAr ?? ""}`,
            ),
          ),
          upsellAutomation: cur.filter((r) =>
            /renew|renewal|تجديد|report|تقرير|omanisation|عمانة|بلب/i.test(
              `${r.serviceNameEn ?? ""} ${r.serviceNameAr ?? ""}`,
            ),
          ),
        },
      };
    }),

  workforceByGovernorate: sanadIntelReadProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    return getWorkforce(db as never);
  }),

  listLicenseRequirements: sanadIntelReadProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    return db
      .select()
      .from(sanadIntelLicenseRequirements)
      .orderBy(asc(sanadIntelLicenseRequirements.sortOrder), asc(sanadIntelLicenseRequirements.id));
  }),

  listCenterCompliance: sanadIntelReadProcedure.input(z.object({ centerId: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    return db
      .select({
        item: sanadIntelCenterComplianceItems,
        req: sanadIntelLicenseRequirements,
      })
      .from(sanadIntelCenterComplianceItems)
      .innerJoin(
        sanadIntelLicenseRequirements,
        eq(sanadIntelLicenseRequirements.id, sanadIntelCenterComplianceItems.requirementId),
      )
      .where(eq(sanadIntelCenterComplianceItems.centerId, input.centerId))
      .orderBy(asc(sanadIntelLicenseRequirements.sortOrder));
  }),

  upsertCenterComplianceItem: sanadIntelReadProcedure
    .input(
      z.object({
        centerId: z.number(),
        requirementId: z.number(),
        status: complianceItemZ,
        evidenceNote: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [c] = await db.select({ id: sanadIntelCenters.id }).from(sanadIntelCenters).where(eq(sanadIntelCenters.id, input.centerId)).limit(1);
      if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Center not found" });

      const [existing] = await db
        .select({ id: sanadIntelCenterComplianceItems.id })
        .from(sanadIntelCenterComplianceItems)
        .where(
          and(
            eq(sanadIntelCenterComplianceItems.centerId, input.centerId),
            eq(sanadIntelCenterComplianceItems.requirementId, input.requirementId),
          ),
        )
        .limit(1);

      if (existing) {
        await db
          .update(sanadIntelCenterComplianceItems)
          .set({
            status: input.status,
            evidenceNote: input.evidenceNote ?? null,
            reviewedByUserId: ctx.user.id,
          })
          .where(eq(sanadIntelCenterComplianceItems.id, existing.id));
      } else {
        await db.insert(sanadIntelCenterComplianceItems).values({
          centerId: input.centerId,
          requirementId: input.requirementId,
          status: input.status,
          evidenceNote: input.evidenceNote ?? null,
          reviewedByUserId: ctx.user.id,
        });
      }
      return { success: true as const };
    }),

  seedComplianceForCenter: sanadIntelFullProcedure.input(z.object({ centerId: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const [c] = await db.select({ id: sanadIntelCenters.id }).from(sanadIntelCenters).where(eq(sanadIntelCenters.id, input.centerId)).limit(1);
    if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Center not found" });

    const reqs = await db.select({ id: sanadIntelLicenseRequirements.id }).from(sanadIntelLicenseRequirements);
    let n = 0;
    for (const r of reqs) {
      const [ex] = await db
        .select({ id: sanadIntelCenterComplianceItems.id })
        .from(sanadIntelCenterComplianceItems)
        .where(
          and(
            eq(sanadIntelCenterComplianceItems.centerId, input.centerId),
            eq(sanadIntelCenterComplianceItems.requirementId, r.id),
          ),
        )
        .limit(1);
      if (!ex) {
        await db.insert(sanadIntelCenterComplianceItems).values({
          centerId: input.centerId,
          requirementId: r.id,
          status: "pending",
        });
        n++;
      }
    }
    return { success: true as const, created: n };
  }),

  latestMetricYear: sanadIntelReadProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    return { year: await getLatestMetricYear(db as never) };
  }),

  /** Public: validate token and show centre identity on the join page. */
  peekCenterInvite: publicSanadIntelProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const row = await findByInviteToken(db as never, input.token.trim());
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: SANAD_INVITE_PEEK_NOT_FOUND_MESSAGE });
      if (inviteIsExpired(row.ops.inviteExpiresAt)) {
        throw new TRPCError({ code: "NOT_FOUND", message: SANAD_INVITE_PEEK_NOT_FOUND_MESSAGE });
      }
      if (!isSanadInviteOnboardingChannelOpen(row.ops)) {
        throw new TRPCError({ code: "NOT_FOUND", message: SANAD_INVITE_PEEK_NOT_FOUND_MESSAGE });
      }
      return {
        centerName: row.center.centerName,
        governorateLabelRaw: row.center.governorateLabelRaw,
        wilayat: row.center.wilayat,
        leadCaptured: Boolean(row.ops.inviteAcceptAt),
        hasLinkedAccount: row.ops.registeredUserId != null,
      };
    }),

  generateCenterInvite: sanadIntelFullProcedure
    .input(
      z.object({
        centerId: z.number(),
        expiresInDays: z.number().min(1).max(365).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [c] = await db
        .select({ id: sanadIntelCenters.id })
        .from(sanadIntelCenters)
        .where(eq(sanadIntelCenters.id, input.centerId))
        .limit(1);
      if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Center not found" });

      const prior = await ensureCenterOperations(db as never, input.centerId);
      if (prior.linkedSanadOfficeId != null) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Cannot issue an open invite while this centre is linked to an operational SANAD office. Remove the office link first if onboarding must be reset.",
        });
      }

      const token = generateInviteTokenValue();
      const now = new Date();
      const days = input.expiresInDays ?? 14;
      const inviteExpiresAt = new Date(now.getTime() + days * 86400000);

      await db
        .update(sanadIntelCenterOperations)
        .set({
          inviteToken: token,
          inviteSentAt: now,
          inviteExpiresAt,
        })
        .where(eq(sanadIntelCenterOperations.centerId, input.centerId));

      await insertSanadIntelAuditEvent(db as never, {
        actorUserId: ctx.user.id,
        entityType: "sanad_intel_center",
        entityId: input.centerId,
        action: "sanad_intel_invite_generated",
        metadata: { expiresInDays: days, replacedPriorToken: Boolean(prior.inviteToken) },
        beforeState: { hadInviteToken: Boolean(prior.inviteToken), inviteExpiresAt: prior.inviteExpiresAt },
        afterState: { inviteExpiresAt, reissued: true },
      });

      const invitePath = buildSanadInvitePath(token);
      return { token, invitePath, inviteSentAt: now, inviteExpiresAt };
    }),

  getCenterInvite: sanadIntelReadProcedure.input(z.object({ centerId: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const ops = await ensureCenterOperations(db as never, input.centerId);
    const now = new Date();
    const hasToken = Boolean(ops.inviteToken);
    const expired = inviteIsExpired(ops.inviteExpiresAt);
    const invitePath = hasToken && ops.inviteToken ? buildSanadInvitePath(ops.inviteToken) : null;
    return {
      inviteToken: ops.inviteToken,
      inviteSentAt: ops.inviteSentAt,
      inviteExpiresAt: ops.inviteExpiresAt,
      invitePath,
      hasActiveInvite: hasToken && !expired && ops.inviteExpiresAt != null,
      expired: hasToken && expired,
    };
  }),

  /** Public: capture lead details; user links OAuth account in a follow-up step. */
  acceptCenterInvite: publicSanadIntelProcedure
    .input(
      z.object({
        token: z.string().min(1),
        name: z.string().min(1).max(255),
        phone: z.string().min(3).max(64),
        email: z.string().email().max(320).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const row = await findByInviteToken(db as never, input.token.trim());
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: SANAD_INVITE_PEEK_NOT_FOUND_MESSAGE });
      if (inviteIsExpired(row.ops.inviteExpiresAt)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This invite link is no longer valid. Request a new link from SmartPRO.",
        });
      }
      if (!isSanadInviteOnboardingChannelOpen(row.ops)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This invite link is no longer valid. Request a new link from SmartPRO.",
        });
      }
      if (row.ops.registeredUserId != null) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This onboarding link is already linked to a SmartPRO account.",
        });
      }

      if (row.ops.inviteAcceptAt) {
        return {
          success: true as const,
          centerId: row.center.id,
          centerName: row.center.centerName,
          nextStep: "sign_in" as const,
          leadAlreadyCaptured: true as const,
          message:
            "Your details were already submitted. Sign in with SmartPRO to link your account if you have not done so yet.",
        };
      }

      const partnerStatus =
        row.ops.partnerStatus === "unknown" ? "prospect" : row.ops.partnerStatus;
      const onboardingStatus =
        row.ops.onboardingStatus === "not_started" ? "intake" : row.ops.onboardingStatus;
      const acceptedAt = new Date();

      await db
        .update(sanadIntelCenterOperations)
        .set({
          partnerStatus,
          onboardingStatus,
          inviteAcceptName: input.name.trim(),
          inviteAcceptPhone: input.phone.trim(),
          inviteAcceptEmail: input.email?.trim() ?? null,
          inviteAcceptAt: acceptedAt,
        })
        .where(eq(sanadIntelCenterOperations.centerId, row.center.id));

      await insertSanadIntelAuditEvent(db as never, {
        actorUserId: null,
        entityType: "sanad_intel_center",
        entityId: row.center.id,
        action: "sanad_intel_invite_accepted",
        metadata: { hasEmail: Boolean(input.email) },
        beforeState: { inviteAcceptAt: row.ops.inviteAcceptAt },
        afterState: { inviteAcceptAt: acceptedAt.toISOString() },
      });

      return {
        success: true as const,
        centerId: row.center.id,
        centerName: row.center.centerName,
        nextStep: "sign_in" as const,
        leadAlreadyCaptured: false as const,
        message:
          "Thank you. Sign in with SmartPRO (same browser) to link this centre to your account and continue onboarding.",
      };
    }),

  /** After OAuth sign-in, attach the current user to the invite token. */
  linkSanadInviteToAccount: protectedSanadIntelProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const row = await findByInviteToken(db as never, input.token.trim());
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: SANAD_INVITE_PEEK_NOT_FOUND_MESSAGE });
      if (inviteIsExpired(row.ops.inviteExpiresAt)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This invite link is no longer valid. Request a new link from SmartPRO.",
        });
      }
      if (!isSanadInviteOnboardingChannelOpen(row.ops)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This invite link is no longer valid. Request a new link from SmartPRO.",
        });
      }
      if (!row.ops.inviteAcceptAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Submit your contact details on the invite page before linking your SmartPRO account.",
        });
      }

      if (row.ops.registeredUserId != null) {
        if (row.ops.registeredUserId === ctx.user.id) {
          return {
            success: true as const,
            centerId: row.center.id,
            redirectTo: "/dashboard" as const,
            alreadyLinked: true as const,
          };
        }
        throw new TRPCError({
          code: "CONFLICT",
          message: "This invite is already linked to another SmartPRO account.",
        });
      }

      const partnerStatus = row.ops.partnerStatus === "prospect" ? "active" : row.ops.partnerStatus;
      const onboardingStatus =
        row.ops.onboardingStatus === "intake" ? "documentation" : row.ops.onboardingStatus;

      await db
        .update(sanadIntelCenterOperations)
        .set({
          registeredUserId: ctx.user.id,
          partnerStatus,
          onboardingStatus,
        })
        .where(eq(sanadIntelCenterOperations.centerId, row.center.id));

      await insertSanadIntelAuditEvent(db as never, {
        actorUserId: ctx.user.id,
        entityType: "sanad_intel_center",
        entityId: row.center.id,
        action: "sanad_intel_invite_linked_user",
        metadata: { userId: ctx.user.id },
        beforeState: { registeredUserId: row.ops.registeredUserId },
        afterState: { registeredUserId: ctx.user.id },
      });

      return {
        success: true as const,
        centerId: row.center.id,
        redirectTo: "/dashboard" as const,
        alreadyLinked: false as const,
      };
    }),

  activateCenterAsOffice: sanadIntelFullProcedure
    .input(
      z.object({
        centerId: z.number(),
        providerType: sanadProviderTypeZ.optional(),
        name: z.string().max(255).optional(),
        nameAr: z.string().max(255).optional(),
        phone: z.string().max(32).optional(),
        governorate: z.string().max(100).optional(),
        city: z.string().max(100).optional(),
        contactPerson: z.string().max(255).optional(),
        location: z.string().max(255).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      return await db.transaction(async (tx) => {
        const [centerRow] = await tx
          .select()
          .from(sanadIntelCenters)
          .where(eq(sanadIntelCenters.id, input.centerId))
          .limit(1);
        if (!centerRow) throw new TRPCError({ code: "NOT_FOUND", message: "Center not found" });

        let [opsRow] = await tx
          .select()
          .from(sanadIntelCenterOperations)
          .where(eq(sanadIntelCenterOperations.centerId, input.centerId))
          .limit(1);
        if (!opsRow) {
          await tx.insert(sanadIntelCenterOperations).values({ centerId: input.centerId });
          [opsRow] = await tx
            .select()
            .from(sanadIntelCenterOperations)
            .where(eq(sanadIntelCenterOperations.centerId, input.centerId))
            .limit(1);
        }
        if (!opsRow) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not load centre operations" });
        }

        if (opsRow.linkedSanadOfficeId) {
          const [office] = await tx
            .select()
            .from(sanadOffices)
            .where(eq(sanadOffices.id, opsRow.linkedSanadOfficeId))
            .limit(1);
          return { office, alreadyLinked: true as const };
        }

        const [countRow] = await tx
          .select({ n: sql<number>`count(*)`.mapWith(Number) })
          .from(sanadIntelCenterComplianceItems)
          .where(eq(sanadIntelCenterComplianceItems.centerId, input.centerId));
        const complianceItemsTotal = countRow?.n ?? 0;

        const gate = evaluateActivationServerGate({
          centerName: centerRow.centerName,
          complianceItemsTotal,
          linkedSanadOfficeId: opsRow.linkedSanadOfficeId,
          registeredUserId: opsRow.registeredUserId,
        });
        if (!gate.ok) {
          throw new TRPCError({ code: gate.code, message: gate.message });
        }

        const name = (input.name ?? centerRow.centerName).trim();
        if (!name) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Centre name is required to create an office" });
        }

        const payload = {
          providerType: input.providerType ?? ("typing_centre" as const),
          name,
          nameAr: input.nameAr ?? null,
          phone: (input.phone ?? centerRow.contactNumber ?? "").trim() || null,
          governorate: (input.governorate ?? centerRow.governorateLabelRaw ?? "").trim() || null,
          city: (input.city ?? centerRow.wilayat ?? centerRow.village ?? "").trim() || null,
          contactPerson: (input.contactPerson ?? centerRow.responsiblePerson ?? "").trim() || null,
          location: input.location?.trim() || null,
          status: "active" as const,
          isPublicListed: 0,
          updatedAt: new Date(),
        };

        const [result] = await tx.insert(sanadOffices).values(payload);
        const officeId = Number((result as { insertId?: number }).insertId);
        if (!officeId) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not create office" });
        }

        const ownerUserId = opsRow.registeredUserId!;
        const [existingMember] = await tx
          .select({ id: sanadOfficeMembers.id })
          .from(sanadOfficeMembers)
          .where(
            and(
              eq(sanadOfficeMembers.sanadOfficeId, officeId),
              eq(sanadOfficeMembers.userId, ownerUserId),
            ),
          )
          .limit(1);
        if (!existingMember) {
          await tx.insert(sanadOfficeMembers).values({
            sanadOfficeId: officeId,
            userId: ownerUserId,
            role: "owner",
          });
        }

        const now = new Date();
        await tx
          .update(sanadIntelCenterOperations)
          .set({
            linkedSanadOfficeId: officeId,
            activatedAt: now,
            activationSource: "admin_created",
            partnerStatus: "active",
            onboardingStatus: opsRow.onboardingStatus === "licensed" ? "licensed" : "licensing_review",
            inviteToken: null,
            inviteExpiresAt: null,
            inviteSentAt: null,
          })
          .where(eq(sanadIntelCenterOperations.centerId, input.centerId));

        await insertSanadIntelAuditEvent(tx as never, {
          actorUserId: ctx.user.id,
          entityType: "sanad_intel_center",
          entityId: input.centerId,
          action: "sanad_intel_center_activated_office",
          metadata: { officeId },
          beforeState: {
            linkedSanadOfficeId: opsRow.linkedSanadOfficeId,
            inviteTokenPresent: Boolean(opsRow.inviteToken),
          },
          afterState: { linkedSanadOfficeId: officeId, inviteRevoked: true },
        });

        const [office] = await tx.select().from(sanadOffices).where(eq(sanadOffices.id, officeId)).limit(1);
        return { office, alreadyLinked: false as const };
      });
    }),

  updateCenterOutreach: sanadIntelFullProcedure
    .input(
      z.object({
        centerId: z.number(),
        lastContactedAt: z.coerce.date().optional(),
        contactMethod: z.string().max(64).nullable().optional(),
        followUpDueAt: z.coerce.date().nullable().optional(),
        notesAppend: z.string().max(4000).optional(),
        notesReplace: z.string().max(8000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [c] = await db
        .select({ id: sanadIntelCenters.id })
        .from(sanadIntelCenters)
        .where(eq(sanadIntelCenters.id, input.centerId))
        .limit(1);
      if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Center not found" });

      const hasChange =
        input.lastContactedAt !== undefined ||
        input.contactMethod !== undefined ||
        input.followUpDueAt !== undefined ||
        input.notesAppend !== undefined ||
        input.notesReplace !== undefined;
      if (!hasChange) return { success: true as const };

      const ops = await ensureCenterOperations(db as never, input.centerId);
      let notes = ops.notes ?? "";
      if (input.notesReplace !== undefined) notes = input.notesReplace;
      if (input.notesAppend?.trim()) {
        const line = `[${new Date().toISOString()}] ${input.notesAppend.trim()}`;
        notes = notes ? `${notes}\n${line}` : line;
      }

      const patch: Record<string, unknown> = {};
      if (input.lastContactedAt !== undefined) patch.lastContactedAt = input.lastContactedAt;
      if (input.contactMethod !== undefined) patch.contactMethod = input.contactMethod;
      if (input.followUpDueAt !== undefined) patch.followUpDueAt = input.followUpDueAt;
      if (input.notesReplace !== undefined || input.notesAppend !== undefined) patch.notes = notes || null;

      if (Object.keys(patch).length > 0) {
        await db
          .update(sanadIntelCenterOperations)
          .set(patch as never)
          .where(eq(sanadIntelCenterOperations.centerId, input.centerId));
      }

      await insertSanadIntelAuditEvent(db as never, {
        actorUserId: ctx.user.id,
        entityType: "sanad_intel_center",
        entityId: input.centerId,
        action: "sanad_intel_outreach_updated",
        metadata: {
          lastContactedAt: input.lastContactedAt?.toISOString(),
          contactMethod: input.contactMethod,
          followUpDueAt: input.followUpDueAt?.toISOString() ?? null,
        },
        beforeState: {
          lastContactedAt: ops.lastContactedAt,
          contactMethod: ops.contactMethod,
          followUpDueAt: ops.followUpDueAt,
        },
        afterState: {
          lastContactedAt: input.lastContactedAt ?? ops.lastContactedAt,
          contactMethod: input.contactMethod ?? ops.contactMethod,
          followUpDueAt: input.followUpDueAt !== undefined ? input.followUpDueAt : ops.followUpDueAt,
        },
      });

      return { success: true as const };
    }),

  centerActivationReadiness: sanadIntelReadProcedure
    .input(z.object({ centerId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const r = await computeCenterActivationReadiness(db as never, input.centerId);
      if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Center not found" });
      return r;
    }),
});
