import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  sanadIntelCenterComplianceItems,
  sanadIntelCenterOperations,
  sanadIntelCenters,
  sanadIntelLicenseRequirements,
} from "../../drizzle/schema";
import { getDb } from "../db";
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
import { adminProcedure, router, t } from "../_core/trpc";
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
});
