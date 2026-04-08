import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  sanadIntelCenterComplianceItems,
  sanadIntelCenterOperations,
  sanadIntelCenters,
  sanadIntelLicenseRequirements,
  sanadOffices,
} from "../../drizzle/schema";
import { getDb } from "../db";
import {
  buildSanadInvitePath,
  computeCenterActivationReadiness,
  ensureCenterOperations,
  findByInviteToken,
  generateInviteTokenValue,
  inviteIsExpired,
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
} from "../sanad-intelligence/queries";
import { adminProcedure, protectedProcedure, publicProcedure, router, t } from "../_core/trpc";
import { throwIfSanadIntelSchemaMissing } from "../sanad-intelligence/dbErrors";

const adminSanadIntelProcedure = adminProcedure.use(
  t.middleware(async ({ next }) => {
    try {
      return await next();
    } catch (e) {
      throwIfSanadIntelSchemaMissing(e);
    }
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
  overviewSummary: adminSanadIntelProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    return getOverviewSummary(db as never);
  }),

  transactionsTrend: adminSanadIntelProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const o = await getOverviewSummary(db as never);
    return o.trends.transactions;
  }),

  incomeTrend: adminSanadIntelProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const o = await getOverviewSummary(db as never);
    return o.trends.income;
  }),

  listCenters: adminSanadIntelProcedure
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

  getCenter: adminSanadIntelProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const row = await getCenterDetail(db as never, input.id);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Center not found" });
    return row;
  }),

  filterOptions: adminSanadIntelProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const governorates = await listGovernorateKeysFromCenters(db as never);
    return { governorates };
  }),

  wilayatForGovernorate: adminSanadIntelProcedure
    .input(z.object({ governorateKey: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const rows = await listWilayatForGovernorate(db as never, input.governorateKey);
      return rows.map((r) => r.wilayat).filter(Boolean) as string[];
    }),

  updateCenterOperations: adminSanadIntelProcedure
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

  regionalOpportunity: adminSanadIntelProcedure
    .input(z.object({ year: z.number().min(2000).max(2100).optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const y = input.year ?? (await getLatestMetricYear(db as never));
      if (y === null) return { year: null as number | null, rows: [], serviceRelevanceNational: 0 };
      return getRegionalOpportunity(db as never, y);
    }),

  topServicesByYear: adminSanadIntelProcedure
    .input(z.object({ year: z.number().min(2000).max(2100) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      return getTopServices(db as never, input.year);
    }),

  serviceDemandInsights: adminSanadIntelProcedure
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

  workforceByGovernorate: adminSanadIntelProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    return getWorkforce(db as never);
  }),

  listLicenseRequirements: adminSanadIntelProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    return db
      .select()
      .from(sanadIntelLicenseRequirements)
      .orderBy(asc(sanadIntelLicenseRequirements.sortOrder), asc(sanadIntelLicenseRequirements.id));
  }),

  listCenterCompliance: adminSanadIntelProcedure.input(z.object({ centerId: z.number() })).query(async ({ input }) => {
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

  upsertCenterComplianceItem: adminSanadIntelProcedure
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

  seedComplianceForCenter: adminSanadIntelProcedure.input(z.object({ centerId: z.number() })).mutation(async ({ input }) => {
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

  latestMetricYear: adminSanadIntelProcedure.query(async () => {
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
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Invalid or unknown invite link" });
      const expired = inviteIsExpired(row.ops.inviteExpiresAt);
      return {
        expired,
        centerId: row.center.id,
        centerName: row.center.centerName,
        governorateLabelRaw: row.center.governorateLabelRaw,
        wilayat: row.center.wilayat,
        leadCaptured: Boolean(row.ops.inviteAcceptAt),
        hasLinkedAccount: row.ops.registeredUserId != null,
      };
    }),

  generateCenterInvite: adminSanadIntelProcedure
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

      await ensureCenterOperations(db as never, input.centerId);
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
        metadata: { expiresInDays: days },
      });

      const invitePath = buildSanadInvitePath(token);
      return { token, invitePath, inviteSentAt: now, inviteExpiresAt };
    }),

  getCenterInvite: adminSanadIntelProcedure.input(z.object({ centerId: z.number() })).query(async ({ input }) => {
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
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Invalid or unknown invite link" });
      if (inviteIsExpired(row.ops.inviteExpiresAt)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This invite has expired. Ask your SmartPRO contact for a new link." });
      }

      const partnerStatus =
        row.ops.partnerStatus === "unknown" ? "prospect" : row.ops.partnerStatus;
      const onboardingStatus =
        row.ops.onboardingStatus === "not_started" ? "intake" : row.ops.onboardingStatus;

      await db
        .update(sanadIntelCenterOperations)
        .set({
          partnerStatus,
          onboardingStatus,
          inviteAcceptName: input.name.trim(),
          inviteAcceptPhone: input.phone.trim(),
          inviteAcceptEmail: input.email?.trim() ?? null,
          inviteAcceptAt: new Date(),
        })
        .where(eq(sanadIntelCenterOperations.centerId, row.center.id));

      await insertSanadIntelAuditEvent(db as never, {
        actorUserId: null,
        entityType: "sanad_intel_center",
        entityId: row.center.id,
        action: "sanad_intel_invite_accepted",
        metadata: { hasEmail: Boolean(input.email) },
      });

      return {
        success: true as const,
        centerId: row.center.id,
        centerName: row.center.centerName,
        nextStep: "sign_in" as const,
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
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Invalid or unknown invite link" });
      if (inviteIsExpired(row.ops.inviteExpiresAt)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This invite has expired." });
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
      });

      return {
        success: true as const,
        centerId: row.center.id,
        redirectTo: "/dashboard" as const,
        alreadyLinked: false as const,
      };
    }),

  activateCenterAsOffice: adminSanadIntelProcedure
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
      const detail = await getCenterDetail(db as never, input.centerId);
      if (!detail) throw new TRPCError({ code: "NOT_FOUND", message: "Center not found" });

      const ops = detail.ops ?? (await ensureCenterOperations(db as never, input.centerId));

      if (ops.linkedSanadOfficeId) {
        const [office] = await db.select().from(sanadOffices).where(eq(sanadOffices.id, ops.linkedSanadOfficeId)).limit(1);
        return { office, alreadyLinked: true as const };
      }

      const c = detail.center;
      const name = (input.name ?? c.centerName).trim();
      if (!name) throw new TRPCError({ code: "BAD_REQUEST", message: "Centre name is required to create an office" });

      const payload = {
        providerType: input.providerType ?? ("typing_centre" as const),
        name,
        nameAr: input.nameAr ?? null,
        phone: (input.phone ?? c.contactNumber ?? "").trim() || null,
        governorate: (input.governorate ?? c.governorateLabelRaw ?? "").trim() || null,
        city: (input.city ?? c.wilayat ?? c.village ?? "").trim() || null,
        contactPerson: (input.contactPerson ?? c.responsiblePerson ?? "").trim() || null,
        location: input.location?.trim() || null,
        status: "active" as const,
        isPublicListed: 0,
        updatedAt: new Date(),
      };

      const [result] = await db.insert(sanadOffices).values(payload);
      const officeId = Number((result as { insertId?: number }).insertId);
      if (!officeId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not create office" });

      const now = new Date();
      await db
        .update(sanadIntelCenterOperations)
        .set({
          linkedSanadOfficeId: officeId,
          activatedAt: now,
          activationSource: "admin_created",
          partnerStatus: "active",
          onboardingStatus: detail.ops?.onboardingStatus === "licensed" ? "licensed" : "licensing_review",
        })
        .where(eq(sanadIntelCenterOperations.centerId, input.centerId));

      await insertSanadIntelAuditEvent(db as never, {
        actorUserId: ctx.user.id,
        entityType: "sanad_intel_center",
        entityId: input.centerId,
        action: "sanad_intel_center_activated_office",
        metadata: { officeId },
      });

      const [office] = await db.select().from(sanadOffices).where(eq(sanadOffices.id, officeId)).limit(1);
      return { office, alreadyLinked: false as const };
    }),

  updateCenterOutreach: adminSanadIntelProcedure
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
      });

      return { success: true as const };
    }),

  centerActivationReadiness: adminSanadIntelProcedure
    .input(z.object({ centerId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const r = await computeCenterActivationReadiness(db as never, input.centerId);
      if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Center not found" });
      return r;
    }),
});
