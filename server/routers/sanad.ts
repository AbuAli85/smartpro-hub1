import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { and, asc, avg, count, desc, eq, exists, gte, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { SanadLifecycleOfficeInput } from "@shared/sanadLifecycle";
import {
  listSanadLifecycleBlockers,
  recommendedSanadPartnerNextActions,
  resolveSanadLifecycleStage,
  sanadLifecycleBadge,
  sanadPublicProfileCompleteness,
} from "@shared/sanadLifecycle";
import { validateEnablePublicListing } from "@shared/sanadLifecycleTransitions";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { getDb } from "../db";
import {
  companies,
  officerCompanyAssignments,
  omaniProOfficers,
  sanadApplications,
  sanadIntelCenterOperations,
  sanadIntelCenters,
  sanadOffices,
  sanadOfficeMembers,
  sanadServiceCatalogue,
  sanadServiceRequests,
  users,
} from "../../drizzle/schema";
import {
  createSanadApplication,
  createSanadOffice,
  getAllSanadApplications,
  getAllSanadOffices,
  getSanadApplicationById,
  getSanadApplications,
  updateSanadApplication,
  updateSanadOffice,
} from "../db";
import { getActiveCompanyMembership } from "../_core/membership";
import { assertRowBelongsToActiveCompany, requireActiveCompanyId } from "../_core/tenant";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getCenterDetail } from "../sanad-intelligence/queries";
import { computeSanadGoLiveReadiness, computeSanadMarketplaceReadiness } from "@shared/sanadMarketplaceReadiness";
import {
  assertSanadOfficeAccess,
  assertSanadOfficeCatalogueAccess,
  assertSanadOfficeProfileAccess,
  assertSanadOfficeRosterAdmin,
  canViewSensitiveOfficeDashboard,
  countSanadOfficeOwners,
  getSanadOfficesForUser,
} from "../sanadAccess";
import { canAccessSanadIntelFull, canAccessSanadIntelRead } from "@shared/sanadRoles";
import { sanadIntelligenceRouter } from "./sanadIntelligence";

export const PROVIDER_TYPES = [
  "pro_office",
  "typing_centre",
  "admin_bureau",
  "legal_services",
  "attestation",
  "visa_services",
  "business_setup",
  "other",
] as const;

export const SERVICE_TYPES = [
  "work_permit",
  "work_permit_renewal",
  "work_permit_cancellation",
  "labor_card",
  "labor_card_renewal",
  "residence_visa",
  "residence_visa_renewal",
  "visit_visa",
  "exit_reentry",
  "commercial_registration",
  "commercial_registration_renewal",
  "business_license",
  "document_typing",
  "document_translation",
  "document_attestation",
  "pasi_registration",
  "omanisation_report",
  "other",
] as const;

export const WORK_ORDER_STATUSES = [
  "draft",
  "submitted",
  "in_progress",
  "awaiting_documents",
  "awaiting_payment",
  "completed",
  "rejected",
  "cancelled",
] as const;

function assertCanAssignSanadOfficeOwner(user: { platformRole?: string | null; role?: string | null }): void {
  if (canAccessGlobalAdminProcedures(user)) return;
  if (canAccessSanadIntelFull(user)) return;
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Only platform or SANAD network administrators can assign the owner role.",
  });
}

async function requireGoLiveOkForPublicListing(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  officeRow: typeof sanadOffices.$inferSelect,
  officeId: number,
): Promise<void> {
  const [catRow] = await db
    .select({ n: count() })
    .from(sanadServiceCatalogue)
    .where(and(eq(sanadServiceCatalogue.officeId, officeId), eq(sanadServiceCatalogue.isActive, 1)));
  const activeN = Number(catRow?.n ?? 0);
  const draft: SanadLifecycleOfficeInput = {
    name: officeRow.name,
    description: officeRow.description,
    phone: officeRow.phone,
    governorate: officeRow.governorate,
    city: officeRow.city,
    languages: officeRow.languages,
    logoUrl: officeRow.logoUrl,
    status: officeRow.status,
    isPublicListed: 1,
    avgRating: officeRow.avgRating,
    totalReviews: officeRow.totalReviews,
    isVerified: officeRow.isVerified,
  };
  const v = validateEnablePublicListing(draft, activeN);
  if (!v.ok) {
    throw new TRPCError({ code: v.code, message: v.message });
  }
}

export const sanadRouter = router({
  // ─── Service Providers (Sanad Offices) ────────────────────────────────────

  /** List all service providers — filterable by type/search */
  listProviders: protectedProcedure
    .input(
      z.object({
        providerType: z.enum(PROVIDER_TYPES).optional(),
        search: z.string().optional(),
        status: z.enum(["active", "inactive", "pending_approval", "suspended"]).optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      let offices: Awaited<ReturnType<typeof getAllSanadOffices>>;
      if (canAccessGlobalAdminProcedures(ctx.user)) {
        offices = await getAllSanadOffices();
      } else if (db) {
        offices = await getSanadOfficesForUser(db as never, ctx.user.id);
      } else {
        offices = [];
      }
      let results = offices as any[];
      if (input?.providerType) results = results.filter((o: any) => o.providerType === input.providerType);
      if (input?.status) results = results.filter((o: any) => o.status === input.status);
      if (input?.search) {
        const q = input.search.toLowerCase();
        results = results.filter(
          (o: any) =>
            (o.name ?? "").toLowerCase().includes(q) ||
            (o.nameAr ?? "").toLowerCase().includes(q) ||
            (o.city ?? "").toLowerCase().includes(q) ||
            (o.description ?? "").toLowerCase().includes(q)
        );
      }
      return results;
    }),

  /** Get a single provider by id */
  getProvider: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      if (canAccessGlobalAdminProcedures(ctx.user)) {
        const offices = await getAllSanadOffices();
        const office = (offices as any[]).find((o: any) => o.id === input.id);
        if (!office) throw new TRPCError({ code: "NOT_FOUND", message: "Service provider not found" });
        return office;
      }
      await assertSanadOfficeAccess(db as never, ctx.user.id, input.id);
      const [office] = await db.select().from(sanadOffices).where(eq(sanadOffices.id, input.id)).limit(1);
      if (!office) throw new TRPCError({ code: "NOT_FOUND", message: "Service provider not found" });
      return office;
    }),

  /** Create a new service provider (admin only) */
  createProvider: protectedProcedure
    .input(
      z.object({
        providerType: z.enum(PROVIDER_TYPES).default("pro_office"),
        name: z.string().min(2),
        nameAr: z.string().optional(),
        description: z.string().optional(),
        licenseNumber: z.string().optional(),
        location: z.string().optional(),
        city: z.string().optional(),
        governorate: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        website: z.string().optional(),
        contactPerson: z.string().optional(),
        openingHours: z.string().optional(),
        services: z.array(z.string()).default([]),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!canAccessGlobalAdminProcedures(ctx.user)) throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can register service providers" });
      await createSanadOffice({ ...input } as any);
      return { success: true };
    }),

  /** Update a service provider */
  updateProvider: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        providerType: z.enum(PROVIDER_TYPES).optional(),
        name: z.string().optional(),
        nameAr: z.string().optional(),
        description: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        website: z.string().optional(),
        contactPerson: z.string().optional(),
        location: z.string().optional(),
        city: z.string().optional(),
        governorate: z.string().optional(),
        openingHours: z.string().optional(),
        services: z.array(z.string()).optional(),
        status: z.enum(["active", "inactive", "pending_approval", "suspended"]).optional(),
        isVerified: z.boolean().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!canAccessGlobalAdminProcedures(ctx.user)) throw new TRPCError({ code: "FORBIDDEN" });
      const { id, ...data } = input;
      await updateSanadOffice(id, data as any);
      return { success: true };
    }),

  // ─── Work Orders (Service Requests) ──────────────────────────────────────

  /** List work orders for the current company */
  listWorkOrders: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        status: z.string().optional(),
        serviceType: z.string().optional(),
        providerId: z.number().optional(),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      if (canAccessGlobalAdminProcedures(ctx.user)) {
        return getAllSanadApplications({ status: input?.status });
      }
      const m = await getActiveCompanyMembership(ctx.user.id, input?.companyId);
      if (!m) return [];
      return getSanadApplications(m.companyId, {
        status: input?.status,
        type: input?.serviceType,
      });
    }),

  /** Create a new work order / service request */
  createWorkOrder: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        serviceType: z.enum(SERVICE_TYPES),
        title: z.string().optional(),
        providerId: z.number().optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
        beneficiaryName: z.string().optional(),
        beneficiaryNameAr: z.string().optional(),
        nationality: z.string().optional(),
        passportNumber: z.string().optional(),
        employeeId: z.number().optional(),
        notes: z.string().optional(),
        fees: z.number().optional(),
        dueDate: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { companyId: _cid, ...createInput } = input;
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const referenceNumber = "SAN-" + Date.now() + "-" + nanoid(4).toUpperCase();
      const title = createInput.title || createInput.serviceType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      await createSanadApplication({
        ...createInput,
        title,
        companyId,
        requestedById: ctx.user.id,
        referenceNumber,
        fees: createInput.fees ? String(createInput.fees) : undefined,
        dueDate: createInput.dueDate ? new Date(createInput.dueDate) : undefined,
      } as any);
      return { success: true, referenceNumber };
    }),

  /** Update a work order status / notes */
  updateWorkOrder: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        /** Selected workspace — required for correct tenant boundary (not first membership). */
        companyId: z.number().optional(),
        status: z.enum(WORK_ORDER_STATUSES).optional(),
        assignedToId: z.number().optional(),
        notes: z.string().optional(),
        providerNotes: z.string().optional(),
        rejectionReason: z.string().optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
        fees: z.number().optional(),
        dueDate: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const wo = await getSanadApplicationById(input.id);
      if (!wo) throw new TRPCError({ code: "NOT_FOUND", message: "Work order not found" });
      await assertRowBelongsToActiveCompany(ctx.user, wo.companyId, "Work order", input.companyId);
      const { id, companyId: _wc, ...data } = input;
      const updateData: any = { ...data };
      if (data.fees !== undefined) updateData.fees = String(data.fees);
      if (data.dueDate) updateData.dueDate = new Date(data.dueDate);
      if (data.status === "submitted") updateData.submittedAt = new Date();
      if (data.status === "completed") updateData.completedAt = new Date();
      await updateSanadApplication(id, updateData);
      return { success: true };
    }),

  /** Get a single work order by ID */
  getWorkOrderById: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const wo = await getSanadApplicationById(input.id);
      if (!wo) return null;
      await assertRowBelongsToActiveCompany(ctx.user, wo.companyId, "Work order", input.companyId);
      return wo;
    }),

  /** Rate a completed work order */
  rateWorkOrder: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        companyId: z.number().optional(),
        rating: z.number().min(1).max(5),
        ratingComment: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const wo = await getSanadApplicationById(input.id);
      if (!wo) throw new TRPCError({ code: "NOT_FOUND", message: "Work order not found" });
      await assertRowBelongsToActiveCompany(ctx.user, wo.companyId, "Work order", input.companyId);
      await updateSanadApplication(input.id, {
        rating: input.rating,
        ratingComment: input.ratingComment,
      } as any);
      return { success: true };
    }),

  // ─── Office Dashboard ────────────────────────────────────────────────────
  /**
   * KPI summary for a Sanad office: officer count, total monthly earnings,
   * active company assignments, and average client rating.
   */
  officeDashboard: protectedProcedure
    .input(z.object({ officeId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        const role = await assertSanadOfficeAccess(db as never, ctx.user.id, input.officeId);
        if (!canViewSensitiveOfficeDashboard(role)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Office analytics require owner or manager access.",
          });
        }
      }

      // Officers belonging to this office
      const officerRows = await db
        .select({
          id: omaniProOfficers.id,
          fullName: omaniProOfficers.fullName,
          fullNameAr: omaniProOfficers.fullNameAr,
          status: omaniProOfficers.status,
          employmentTrack: omaniProOfficers.employmentTrack,
          monthlySalary: omaniProOfficers.monthlySalary,
          maxCompanies: omaniProOfficers.maxCompanies,
          hiredAt: omaniProOfficers.hiredAt,
        })
        .from(omaniProOfficers)
        .where(and(
          eq(omaniProOfficers.sanadOfficeId, input.officeId),
          sql`${omaniProOfficers.status} != 'terminated'`
        ));

      const officerIds = officerRows.map((o) => o.id);

      if (officerIds.length === 0) {
        return {
          totalOfficers: 0,
          activeOfficers: 0,
          trackAOfficers: 0,
          trackBOfficers: 0,
          totalActiveAssignments: 0,
          totalMonthlyRevenue: 0,
          totalMonthlySalaries: 0,
          netMonthlyEarnings: 0,
          avgRating: null,
          totalWorkOrders: 0,
          completedWorkOrders: 0,
          inProgressWorkOrders: 0,
          rejectedWorkOrders: 0,
          completionRate: 0,
          officers: [],
        };
      }

      // Assignment stats per officer
      const assignStats = await db
        .select({
          officerId: officerCompanyAssignments.officerId,
          activeCount: sql<number>`SUM(CASE WHEN ${officerCompanyAssignments.status} = 'active' THEN 1 ELSE 0 END)`,
          monthlyRevenue: sql<number>`SUM(CASE WHEN ${officerCompanyAssignments.status} = 'active' THEN ${officerCompanyAssignments.monthlyFee} ELSE 0 END)`,
        })
        .from(officerCompanyAssignments)
        .where(sql`${officerCompanyAssignments.officerId} IN (${sql.join(officerIds.map(id => sql`${id}`), sql`, `)})`)
        .groupBy(officerCompanyAssignments.officerId);

      const assignMap = new Map(assignStats.map((a) => [a.officerId, a]));

      // Work order stats per officer (via providerId = officeId)
      const woStats = await db
        .select({
          total: count(),
          completed: sql<number>`SUM(CASE WHEN ${sanadApplications.status} = 'completed' THEN 1 ELSE 0 END)`,
          inProgress: sql<number>`SUM(CASE WHEN ${sanadApplications.status} IN ('in_progress','submitted','awaiting_documents','awaiting_payment') THEN 1 ELSE 0 END)`,
          rejected: sql<number>`SUM(CASE WHEN ${sanadApplications.status} = 'rejected' THEN 1 ELSE 0 END)`,
          avgRating: avg(sanadApplications.rating),
        })
        .from(sanadApplications)
        .where(eq(sanadApplications.providerId, input.officeId));

      const wo = woStats[0];
      const totalWO = Number(wo.total);
      const completedWO = Number(wo.completed ?? 0);

      // Enrich each officer
      const enrichedOfficers = officerRows.map((o) => {
        const aStats = assignMap.get(o.id);
        const active = Number(aStats?.activeCount ?? 0);
        const revenue = Number(aStats?.monthlyRevenue ?? 0);
        const salary = Number(o.monthlySalary);
        return {
          ...o,
          monthlySalary: salary,
          activeAssignments: active,
          availableSlots: o.maxCompanies - active,
          capacityPct: Math.round((active / o.maxCompanies) * 100),
          monthlyRevenue: revenue,
          netEarnings: revenue - salary,
        };
      });

      const totalActive = enrichedOfficers.filter((o) => o.status === "active").length;
      const totalRevenue = enrichedOfficers.reduce((s, o) => s + o.monthlyRevenue, 0);
      const totalSalaries = enrichedOfficers.reduce((s, o) => s + o.monthlySalary, 0);

      return {
        totalOfficers: officerRows.length,
        activeOfficers: totalActive,
        trackAOfficers: officerRows.filter((o) => o.employmentTrack === "platform").length,
        trackBOfficers: officerRows.filter((o) => o.employmentTrack === "sanad").length,
        totalActiveAssignments: enrichedOfficers.reduce((s, o) => s + o.activeAssignments, 0),
        totalMonthlyRevenue: totalRevenue,
        totalMonthlySalaries: totalSalaries,
        netMonthlyEarnings: totalRevenue - totalSalaries,
        avgRating: wo.avgRating ? Number(wo.avgRating) : null,
        totalWorkOrders: totalWO,
        completedWorkOrders: completedWO,
        inProgressWorkOrders: Number(wo.inProgress ?? 0),
        rejectedWorkOrders: Number(wo.rejected ?? 0),
        completionRate: totalWO > 0 ? Math.round((completedWO / totalWO) * 100) : 0,
        officers: enrichedOfficers,
      };
    }),

  /**
   * Per-officer performance breakdown for a Sanad office.
   * Returns work order counts, earnings, and rating for each officer.
   */
  officerPerformance: protectedProcedure
    .input(z.object({ officeId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        const role = await assertSanadOfficeAccess(db as never, ctx.user.id, input.officeId);
        if (!canViewSensitiveOfficeDashboard(role)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Officer performance requires owner or manager access.",
          });
        }
      }

      const officerRows = await db
        .select()
        .from(omaniProOfficers)
        .where(and(
          eq(omaniProOfficers.sanadOfficeId, input.officeId),
          sql`${omaniProOfficers.status} != 'terminated'`
        ));

      if (officerRows.length === 0) return [];

      const officerIds = officerRows.map((o) => o.id);

      const assignStats = await db
        .select({
          officerId: officerCompanyAssignments.officerId,
          activeCount: sql<number>`SUM(CASE WHEN ${officerCompanyAssignments.status} = 'active' THEN 1 ELSE 0 END)`,
          totalRevenue: sql<number>`SUM(CASE WHEN ${officerCompanyAssignments.status} = 'active' THEN ${officerCompanyAssignments.monthlyFee} ELSE 0 END)`,
        })
        .from(officerCompanyAssignments)
        .where(sql`${officerCompanyAssignments.officerId} IN (${sql.join(officerIds.map(id => sql`${id}`), sql`, `)})`)
        .groupBy(officerCompanyAssignments.officerId);

      const assignMap = new Map(assignStats.map((a) => [a.officerId, a]));

      // Work orders handled by companies assigned to each officer
      // We join through officer_company_assignments → sanad_applications.companyId
      const woPerOfficer = await db
        .select({
          officerId: officerCompanyAssignments.officerId,
          total: count(),
          completed: sql<number>`SUM(CASE WHEN ${sanadApplications.status} = 'completed' THEN 1 ELSE 0 END)`,
          inProgress: sql<number>`SUM(CASE WHEN ${sanadApplications.status} IN ('in_progress','submitted','awaiting_documents','awaiting_payment') THEN 1 ELSE 0 END)`,
          rejected: sql<number>`SUM(CASE WHEN ${sanadApplications.status} = 'rejected' THEN 1 ELSE 0 END)`,
          avgRating: avg(sanadApplications.rating),
        })
        .from(officerCompanyAssignments)
        .innerJoin(sanadApplications, and(
          eq(sanadApplications.companyId, officerCompanyAssignments.companyId),
          eq(sanadApplications.providerId, input.officeId)
        ))
        .where(sql`${officerCompanyAssignments.officerId} IN (${sql.join(officerIds.map(id => sql`${id}`), sql`, `)})`)
        .groupBy(officerCompanyAssignments.officerId);

      const woMap = new Map(woPerOfficer.map((w) => [w.officerId, w]));

      return officerRows.map((o) => {
        const a = assignMap.get(o.id);
        const w = woMap.get(o.id);
        const active = Number(a?.activeCount ?? 0);
        const revenue = Number(a?.totalRevenue ?? 0);
        const salary = Number(o.monthlySalary);
        const totalWO = Number(w?.total ?? 0);
        const completedWO = Number(w?.completed ?? 0);
        return {
          id: o.id,
          fullName: o.fullName,
          fullNameAr: o.fullNameAr,
          status: o.status,
          employmentTrack: o.employmentTrack,
          monthlySalary: salary,
          maxCompanies: o.maxCompanies,
          activeAssignments: active,
          availableSlots: o.maxCompanies - active,
          capacityPct: Math.round((active / o.maxCompanies) * 100),
          monthlyRevenue: revenue,
          netEarnings: revenue - salary,
          totalWorkOrders: totalWO,
          completedWorkOrders: completedWO,
          inProgressWorkOrders: Number(w?.inProgress ?? 0),
          rejectedWorkOrders: Number(w?.rejected ?? 0),
          completionRate: totalWO > 0 ? Math.round((completedWO / totalWO) * 100) : 0,
          avgRating: w?.avgRating ? Number(w.avgRating) : null,
          hiredAt: o.hiredAt,
        };
      });
    }),

  /**
   * Monthly earnings trend for a Sanad office (last 6 months).
   * Returns Track B salary cost vs. revenue from company assignments.
   */
  earningsTrend: protectedProcedure
    .input(z.object({ officeId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Platform access required" });
      }
      const db = await getDb();
      if (!db) return [];

      // Build last 6 months array
      const months: { year: number; month: number; label: string }[] = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({
          year: d.getFullYear(),
          month: d.getMonth() + 1,
          label: d.toLocaleString("en", { month: "short", year: "2-digit" }),
        });
      }

      // Officers for this office
      const officerRows = await db
        .select({ id: omaniProOfficers.id, monthlySalary: omaniProOfficers.monthlySalary, employmentTrack: omaniProOfficers.employmentTrack })
        .from(omaniProOfficers)
        .where(and(
          eq(omaniProOfficers.sanadOfficeId, input.officeId),
          sql`${omaniProOfficers.status} != 'terminated'`
        ));

      const trackBOfficers = officerRows.filter((o) => o.employmentTrack === "sanad");
      const trackBSalaryPerMonth = trackBOfficers.reduce((s, o) => s + Number(o.monthlySalary), 0);
      const trackBCommissionPerMonth = trackBOfficers.length * 600; // OMR 600 received from platform per Track B officer

      // For Track A: commission is 10–15% of assignments revenue
      const officerIds = officerRows.map((o) => o.id);
      const trackAOfficers = officerRows.filter((o) => o.employmentTrack === "platform");

      // Active assignments for Track A officers (commission ~12.5% avg)
      let trackARevenue = 0;
      if (trackAOfficers.length > 0) {
        const aIds = trackAOfficers.map((o) => o.id);
        const aStats = await db
          .select({ totalFee: sql<number>`SUM(${officerCompanyAssignments.monthlyFee})` })
          .from(officerCompanyAssignments)
          .where(and(
            sql`${officerCompanyAssignments.officerId} IN (${sql.join(aIds.map(id => sql`${id}`), sql`, `)})`,
            eq(officerCompanyAssignments.status, "active")
          ));
        trackARevenue = Number(aStats[0]?.totalFee ?? 0) * 0.125; // 12.5% commission
      }

      return months.map((m) => ({
        label: m.label,
        year: m.year,
        month: m.month,
        trackBRevenue: trackBCommissionPerMonth,
        trackBSalaryCost: trackBSalaryPerMonth,
        trackBNet: trackBCommissionPerMonth - trackBSalaryPerMonth,
        trackACommission: trackARevenue,
        totalEarnings: trackBCommissionPerMonth - trackBSalaryPerMonth + trackARevenue,
      }));
    }),

  /**
   * Work order volume breakdown by service type and status for a Sanad office.
   */
  workOrderStats: protectedProcedure
    .input(z.object({ officeId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { byServiceType: [], byStatus: [], recentOrders: [] };
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        const role = await assertSanadOfficeAccess(db as never, ctx.user.id, input.officeId);
        if (!canViewSensitiveOfficeDashboard(role)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Work order analytics require owner or manager access.",
          });
        }
      }

      const byServiceType = await db
        .select({
          serviceType: sanadApplications.serviceType,
          total: count(),
          completed: sql<number>`SUM(CASE WHEN ${sanadApplications.status} = 'completed' THEN 1 ELSE 0 END)`,
          avgRating: avg(sanadApplications.rating),
        })
        .from(sanadApplications)
        .where(eq(sanadApplications.providerId, input.officeId))
        .groupBy(sanadApplications.serviceType)
        .orderBy(desc(count()));

      const byStatus = await db
        .select({
          status: sanadApplications.status,
          total: count(),
        })
        .from(sanadApplications)
        .where(eq(sanadApplications.providerId, input.officeId))
        .groupBy(sanadApplications.status);

      const recentOrders = await db
        .select({
          id: sanadApplications.id,
          referenceNumber: sanadApplications.referenceNumber,
          serviceType: sanadApplications.serviceType,
          status: sanadApplications.status,
          beneficiaryName: sanadApplications.beneficiaryName,
          companyName: companies.name,
          rating: sanadApplications.rating,
          completedAt: sanadApplications.completedAt,
          createdAt: sanadApplications.createdAt,
        })
        .from(sanadApplications)
        .innerJoin(companies, eq(companies.id, sanadApplications.companyId))
        .where(eq(sanadApplications.providerId, input.officeId))
        .orderBy(desc(sanadApplications.createdAt))
        .limit(10);

      return {
        byServiceType: byServiceType.map((r) => ({
          serviceType: r.serviceType,
          total: Number(r.total),
          completed: Number(r.completed ?? 0),
          completionRate: Number(r.total) > 0 ? Math.round((Number(r.completed ?? 0) / Number(r.total)) * 100) : 0,
          avgRating: r.avgRating ? Number(r.avgRating) : null,
        })),
        byStatus: byStatus.map((r) => ({ status: r.status, total: Number(r.total) })),
        recentOrders,
      };
    }),

  // ─── Public Marketplace ──────────────────────────────────────────────────
  listPublicProviders: publicProcedure
    .input(
      z
        .object({
          governorate: z.string().optional(),
          wilayat: z.string().optional(),
          providerType: z.enum(PROVIDER_TYPES).optional(),
          serviceType: z.enum(SERVICE_TYPES).optional(),
          language: z.string().optional(),
          minRating: z.number().min(0).max(5).optional(),
          search: z.string().optional(),
          publicListedOnly: z.boolean().optional().default(true),
          /** When true (default), only offices that pass shared marketplace readiness (profile + catalogue + contact + location). */
          marketplaceReadyOnly: z.boolean().optional().default(true),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(sanadOffices.status, "active")];
      const strictMarketplace = input?.marketplaceReadyOnly !== false;
      if (strictMarketplace || input?.publicListedOnly !== false) {
        conds.push(eq(sanadOffices.isPublicListed, 1));
      }
      if (strictMarketplace) {
        conds.push(sql`trim(coalesce(${sanadOffices.phone}, '')) <> ''`);
        conds.push(
          or(
            sql`trim(coalesce(${sanadOffices.governorate}, '')) <> ''`,
            sql`trim(coalesce(${sanadOffices.city}, '')) <> ''`,
          )!,
        );
        conds.push(sql`trim(coalesce(${sanadOffices.name}, '')) <> ''`);
        conds.push(
          exists(
            db
              .select({ id: sanadServiceCatalogue.id })
              .from(sanadServiceCatalogue)
              .where(
                and(
                  eq(sanadServiceCatalogue.officeId, sanadOffices.id),
                  eq(sanadServiceCatalogue.isActive, 1),
                ),
              ),
          ),
        );
      }
      if (input?.governorate?.trim()) {
        conds.push(eq(sanadOffices.governorate, input.governorate.trim()));
      }
      if (input?.wilayat?.trim()) {
        conds.push(eq(sanadOffices.city, input.wilayat.trim()));
      }
      if (input?.providerType) {
        conds.push(eq(sanadOffices.providerType, input.providerType));
      }
      if (input?.serviceType) {
        conds.push(sql`JSON_CONTAINS(${sanadOffices.services}, ${JSON.stringify(input.serviceType)}, '$')`);
      }
      if (input?.language?.trim()) {
        conds.push(like(sanadOffices.languages, `%${input.language.trim()}%`));
      }
      if (input?.minRating != null) {
        conds.push(gte(sanadOffices.avgRating, String(input.minRating)));
      }
      if (input?.search?.trim()) {
        const q = `%${input.search.trim()}%`;
        conds.push(
          or(
            like(sanadOffices.name, q),
            like(sanadOffices.nameAr, q),
            like(sanadOffices.city, q),
            like(sanadOffices.governorate, q),
            like(sanadOffices.description, q),
            like(sanadOffices.descriptionAr, q),
          )!,
        );
      }
      return db
        .select()
        .from(sanadOffices)
        .where(and(...conds))
        .orderBy(desc(sanadOffices.avgRating));
    }),

  getPublicProfile: publicProcedure
    .input(z.object({ officeId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [office] = await db
        .select()
        .from(sanadOffices)
        .where(eq(sanadOffices.id, input.officeId))
        .limit(1);
      if (!office) return null;
      const catalogue = await db
        .select()
        .from(sanadServiceCatalogue)
        .where(and(eq(sanadServiceCatalogue.officeId, input.officeId), eq(sanadServiceCatalogue.isActive, 1)))
        .orderBy(sanadServiceCatalogue.serviceType);
      const reviews = await db
        .select()
        .from(sanadApplications)
        .where(and(eq(sanadApplications.providerId, input.officeId), sql`${sanadApplications.rating} IS NOT NULL`))
        .orderBy(desc(sanadApplications.createdAt))
        .limit(10);
      return { office, catalogue, reviews };
    }),

  updatePublicProfile: protectedProcedure
    .input(
      z.object({
        officeId: z.number(),
        isPublicListed: z.boolean().optional(),
        licenceNumber: z.string().optional(),
        licenceExpiry: z.string().optional(),
        languages: z.string().optional(),
        governorate: z.string().optional(),
        logoUrl: z.string().optional(),
        descriptionAr: z.string().optional(),
        responseTimeHours: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { officeId, ...fields } = input;
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        await assertSanadOfficeProfileAccess(db as never, ctx.user.id, officeId);
      }
      if (fields.isPublicListed === true) {
        const [current] = await db.select().from(sanadOffices).where(eq(sanadOffices.id, officeId)).limit(1);
        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Office not found" });
        const merged = {
          ...current,
          governorate: fields.governorate ?? current.governorate,
          languages: fields.languages ?? current.languages,
          logoUrl: fields.logoUrl ?? current.logoUrl,
          descriptionAr: fields.descriptionAr ?? current.descriptionAr,
        };
        await requireGoLiveOkForPublicListing(db as never, merged, officeId);
      }
      await db
        .update(sanadOffices)
        .set({
          isPublicListed: fields.isPublicListed !== undefined ? (fields.isPublicListed ? 1 : 0) : undefined,
          licenceNumber: fields.licenceNumber,
          licenceExpiry: fields.licenceExpiry ? new Date(fields.licenceExpiry) : undefined,
          languages: fields.languages,
          governorate: fields.governorate,
          logoUrl: fields.logoUrl,
          descriptionAr: fields.descriptionAr,
          responseTimeHours: fields.responseTimeHours,
          updatedAt: new Date(),
        })
        .where(eq(sanadOffices.id, officeId));
      return { success: true };
    }),

  listServiceCatalogue: protectedProcedure
    .input(z.object({ officeId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        await assertSanadOfficeAccess(db as never, ctx.user.id, input.officeId);
      }
      return db
        .select()
        .from(sanadServiceCatalogue)
        .where(eq(sanadServiceCatalogue.officeId, input.officeId))
        .orderBy(sanadServiceCatalogue.serviceType);
    }),

  upsertServiceCatalogue: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        officeId: z.number(),
        serviceType: z.string(),
        serviceName: z.string().min(1),
        serviceNameAr: z.string().optional(),
        priceOmr: z.number().min(0),
        processingDays: z.number().min(1).default(3),
        description: z.string().optional(),
        descriptionAr: z.string().optional(),
        isActive: z.boolean().default(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        await assertSanadOfficeCatalogueAccess(db as never, ctx.user.id, input.officeId);
      }
      if (input.id) {
        await db
          .update(sanadServiceCatalogue)
          .set({
            serviceType: input.serviceType,
            serviceName: input.serviceName,
            serviceNameAr: input.serviceNameAr,
            priceOmr: String(input.priceOmr),
            processingDays: input.processingDays,
            description: input.description,
            descriptionAr: input.descriptionAr,
            isActive: input.isActive ? 1 : 0,
            updatedAt: new Date(),
          })
          .where(eq(sanadServiceCatalogue.id, input.id));
        return { id: input.id };
      }
      const [result] = await db.insert(sanadServiceCatalogue).values({
        officeId: input.officeId,
        serviceType: input.serviceType,
        serviceName: input.serviceName,
        serviceNameAr: input.serviceNameAr,
        priceOmr: String(input.priceOmr),
        processingDays: input.processingDays,
        description: input.description,
        descriptionAr: input.descriptionAr,
        isActive: input.isActive ? 1 : 0,
      });
      return { id: (result as any).insertId };
    }),

  deleteServiceItem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [row] = await db
        .select({ officeId: sanadServiceCatalogue.officeId })
        .from(sanadServiceCatalogue)
        .where(eq(sanadServiceCatalogue.id, input.id))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Catalogue item not found" });
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        await assertSanadOfficeCatalogueAccess(db as never, ctx.user.id, row.officeId);
      }
      await db.delete(sanadServiceCatalogue).where(eq(sanadServiceCatalogue.id, input.id));
      return { success: true };
    }),

  submitServiceRequest: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        officeId: z.number(),
        serviceType: z.string(),
        serviceCatalogueId: z.number().optional(),
        contactName: z.string().min(1),
        contactPhone: z.string().min(1),
        contactEmail: z.string().email().optional(),
        companyName: z.string().optional(),
        companyCr: z.string().optional(),
        message: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const m = await getActiveCompanyMembership(ctx.user.id, input.companyId ?? undefined);
      if (!m) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Select a company workspace to submit a service request." });
      }
      const [co] = await db
        .select({ name: companies.name })
        .from(companies)
        .where(eq(companies.id, m.companyId))
        .limit(1);
      const [result] = await db.insert(sanadServiceRequests).values({
        officeId: input.officeId,
        requesterCompanyId: m.companyId,
        requesterUserId: ctx.user.id,
        serviceType: input.serviceType,
        serviceCatalogueId: input.serviceCatalogueId ?? null,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail ?? null,
        companyName: input.companyName ?? co?.name ?? null,
        companyCr: input.companyCr ?? null,
        message: input.message ?? null,
        status: "new",
      });
      return { id: (result as any).insertId, success: true };
    }),

  listServiceRequests: protectedProcedure
    .input(z.object({ officeId: z.number(), status: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        await assertSanadOfficeAccess(db as never, ctx.user.id, input.officeId);
      }
      const conditions = [eq(sanadServiceRequests.officeId, input.officeId)];
      if (input.status) conditions.push(eq(sanadServiceRequests.status, input.status as any));
      return db
        .select()
        .from(sanadServiceRequests)
        .where(and(...conditions))
        .orderBy(desc(sanadServiceRequests.createdAt));
    }),

  updateServiceRequestStatus: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["new", "contacted", "in_progress", "completed", "declined"]),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [reqRow] = await db
        .select()
        .from(sanadServiceRequests)
        .where(eq(sanadServiceRequests.id, input.id))
        .limit(1);
      if (!reqRow) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Service request not found" });
      }
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        await assertSanadOfficeAccess(db as never, ctx.user.id, reqRow.officeId);
      }
      await db
        .update(sanadServiceRequests)
        .set({ status: input.status, notes: input.notes, updatedAt: new Date() })
        .where(eq(sanadServiceRequests.id, input.id));
      return { success: true };
    }),

  // ─── Sanad Centre Self-Management ──────────────────────────────────────────

  /** Guided onboarding for the centre linked to the signed-in user (invite pipeline). */
  partnerOnboardingWorkspace: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const [intelRow] = await db
      .select({ centerId: sanadIntelCenterOperations.centerId })
      .from(sanadIntelCenterOperations)
      .where(eq(sanadIntelCenterOperations.registeredUserId, ctx.user.id))
      .limit(1);
    if (!intelRow) return null;

    const detail = await getCenterDetail(db as never, intelRow.centerId);
    if (!detail) return null;

    const office =
      detail.ops?.linkedSanadOfficeId != null
        ? (
            await db
              .select()
              .from(sanadOffices)
              .where(eq(sanadOffices.id, detail.ops.linkedSanadOfficeId))
              .limit(1)
          )[0] ?? null
        : null;

    let activeCatalogueCount = 0;
    if (detail.ops?.linkedSanadOfficeId) {
      const [catRow] = await db
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(sanadServiceCatalogue)
        .where(
          and(
            eq(sanadServiceCatalogue.officeId, detail.ops.linkedSanadOfficeId),
            eq(sanadServiceCatalogue.isActive, 1),
          ),
        );
      activeCatalogueCount = catRow?.n ?? 0;
    }

    const doneStatuses = new Set(["verified", "waived", "not_applicable"]);
    const complianceTotal = detail.compliance.length;
    const complianceDone = detail.compliance.filter((r) => doneStatuses.has(r.item.status)).length;

    const stage = resolveSanadLifecycleStage(detail.ops ?? {}, office, { activeCatalogueCount });
    const badge = sanadLifecycleBadge(stage);
    const blockers = listSanadLifecycleBlockers(stage, detail.ops, office, {
      activeCatalogueCount,
      complianceDone,
      complianceTotal,
    });
    const profileCompleteness = sanadPublicProfileCompleteness(office);
    const marketplaceReadiness = computeSanadMarketplaceReadiness(office, activeCatalogueCount);
    const recommendedNextActions = recommendedSanadPartnerNextActions(stage, blockers, marketplaceReadiness.reasons);

    return {
      centerId: detail.center.id,
      centerName: detail.center.centerName,
      governorateLabel: detail.center.governorateLabelRaw,
      wilayat: detail.center.wilayat,
      stage,
      badge,
      blockers,
      compliance: { done: complianceDone, total: complianceTotal },
      profileCompleteness,
      catalogueCompleteness: {
        activeCount: activeCatalogueCount,
        needsAtLeastOneActive: activeCatalogueCount < 1,
      },
      marketplaceReadiness,
      recommendedNextActions,
      contact: {
        inviteAcceptName: detail.ops?.inviteAcceptName,
        inviteAcceptPhone: detail.ops?.inviteAcceptPhone,
        inviteAcceptEmail: detail.ops?.inviteAcceptEmail,
      },
      office,
      ops: detail.ops,
    };
  }),

  /** Get the first Sanad office profile (for self-management by the current user) */
  getMyOfficeProfile: protectedProcedure
    .input(z.object({ officeId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;
      if (canAccessGlobalAdminProcedures(ctx.user)) {
        if (input?.officeId) {
          const [office] = await db.select().from(sanadOffices).where(eq(sanadOffices.id, input.officeId)).limit(1);
          return office ?? null;
        }
        const [office] = await db.select().from(sanadOffices).limit(1);
        return office ?? null;
      }
      const offices = await getSanadOfficesForUser(db as never, ctx.user.id);
      if (input?.officeId) {
        return offices.find((o) => o.id === input.officeId) ?? null;
      }
      return offices[0] ?? null;
    }),

  /** Create or update the Sanad office profile for the current user's company */
  upsertOfficeProfile: protectedProcedure
    .input(
      z.object({
        officeId: z.number().optional(),
        name: z.string().min(1),
        nameAr: z.string().optional(),
        providerType: z.enum(PROVIDER_TYPES).default("pro_office"),
        description: z.string().optional(),
        descriptionAr: z.string().optional(),
        licenseNumber: z.string().optional(),
        city: z.string().optional(),
        governorate: z.string().optional(),
        location: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        website: z.string().optional(),
        contactPerson: z.string().optional(),
        openingHours: z.string().optional(),
        languages: z.string().optional(),
        responseTimeHours: z.number().optional(),
        isPublicListed: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const officeId = input.officeId;
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        if (!officeId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "officeId is required to update a SANAD office profile." });
        }
        await assertSanadOfficeProfileAccess(db as never, ctx.user.id, officeId);
      }
      let existing: (typeof sanadOffices.$inferSelect)[];
      if (officeId) {
        existing = await db.select().from(sanadOffices).where(eq(sanadOffices.id, officeId)).limit(1);
      } else if (canAccessGlobalAdminProcedures(ctx.user)) {
        existing = await db.select().from(sanadOffices).limit(1);
      } else {
        existing = [];
      }
      const payload: any = {
        name: input.name,
        nameAr: input.nameAr,
        providerType: input.providerType,
        description: input.description,
        descriptionAr: input.descriptionAr,
        licenseNumber: input.licenseNumber,
        city: input.city,
        governorate: input.governorate,
        location: input.location,
        phone: input.phone,
        email: input.email,
        website: input.website,
        contactPerson: input.contactPerson,
        openingHours: input.openingHours,
        languages: input.languages,
        responseTimeHours: input.responseTimeHours,
        isPublicListed: input.isPublicListed,
        updatedAt: new Date(),
      };
      if (existing.length === 0 && !canAccessGlobalAdminProcedures(ctx.user)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "SANAD office not found for your account." });
      }
      if (existing.length > 0) {
        const projected = { ...existing[0], ...payload };
        if (payload.isPublicListed === 1) {
          await requireGoLiveOkForPublicListing(db as never, projected, existing[0].id);
        }
        await db.update(sanadOffices).set(payload).where(eq(sanadOffices.id, existing[0].id));

        return { id: existing[0].id };
      }
      if (payload.isPublicListed === 1) {
        const projected = { ...payload, status: "active" as const } as typeof sanadOffices.$inferSelect;
        await requireGoLiveOkForPublicListing(db as never, projected, 0);
      }
      const [result] = await db.insert(sanadOffices).values({ ...payload, status: "active" });
      return { id: (result as any).insertId };
    }),

  /** Add a new service catalogue item */
  addCatalogueItem: protectedProcedure
    .input(
      z.object({
        officeId: z.number(),
        serviceName: z.string().min(1),
        serviceNameAr: z.string().optional(),
        serviceType: z.string(),
        priceOmr: z.string(),
        processingDays: z.number().default(3),
        description: z.string().optional(),
        descriptionAr: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        await assertSanadOfficeCatalogueAccess(db as never, ctx.user.id, input.officeId);
      }
      const [result] = await db.insert(sanadServiceCatalogue).values({
        officeId: input.officeId,
        serviceType: input.serviceType,
        serviceName: input.serviceName,
        serviceNameAr: input.serviceNameAr,
        priceOmr: input.priceOmr,
        processingDays: input.processingDays,
        description: input.description,
        descriptionAr: input.descriptionAr,
        isActive: 1,
      });
      return { id: (result as any).insertId };
    }),

  /** Update an existing catalogue item */
  updateCatalogueItem: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        serviceName: z.string().min(1),
        serviceNameAr: z.string().optional(),
        serviceType: z.string(),
        priceOmr: z.string(),
        processingDays: z.number(),
        description: z.string().optional(),
        descriptionAr: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [row] = await db
        .select({ officeId: sanadServiceCatalogue.officeId })
        .from(sanadServiceCatalogue)
        .where(eq(sanadServiceCatalogue.id, input.id))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Catalogue item not found" });
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        await assertSanadOfficeCatalogueAccess(db as never, ctx.user.id, row.officeId);
      }
      await db.update(sanadServiceCatalogue).set({
        serviceName: input.serviceName,
        serviceNameAr: input.serviceNameAr,
        serviceType: input.serviceType,
        priceOmr: input.priceOmr,
        processingDays: input.processingDays,
        description: input.description,
        descriptionAr: input.descriptionAr,
        updatedAt: new Date(),
      }).where(eq(sanadServiceCatalogue.id, input.id));
      return { success: true };
    }),

  /** Toggle a catalogue item active/inactive */
  toggleCatalogueItem: protectedProcedure
    .input(z.object({ id: z.number(), isActive: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [row] = await db
        .select({ officeId: sanadServiceCatalogue.officeId })
        .from(sanadServiceCatalogue)
        .where(eq(sanadServiceCatalogue.id, input.id))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Catalogue item not found" });
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        await assertSanadOfficeCatalogueAccess(db as never, ctx.user.id, row.officeId);
      }
      await db.update(sanadServiceCatalogue).set({ isActive: input.isActive ? 1 : 0, updatedAt: new Date() }).where(eq(sanadServiceCatalogue.id, input.id));
      return { success: true };
    }),

  /** Delete a catalogue item */
  deleteCatalogueItem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [row] = await db
        .select({ officeId: sanadServiceCatalogue.officeId })
        .from(sanadServiceCatalogue)
        .where(eq(sanadServiceCatalogue.id, input.id))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Catalogue item not found" });
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        await assertSanadOfficeCatalogueAccess(db as never, ctx.user.id, row.officeId);
      }
      await db.delete(sanadServiceCatalogue).where(eq(sanadServiceCatalogue.id, input.id));
      return { success: true };
    }),

  /** Get service catalogue for a specific office (alias used by admin page) */
  getServiceCatalogue: protectedProcedure
    .input(z.object({ officeId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        await assertSanadOfficeAccess(db as never, ctx.user.id, input.officeId);
      }
      return db.select().from(sanadServiceCatalogue).where(eq(sanadServiceCatalogue.officeId, input.officeId)).orderBy(sanadServiceCatalogue.serviceType);
    }),

  /** Go-live / marketplace readiness for an office (owner/manager/staff). */
  officeGoLiveReadiness: protectedProcedure
    .input(z.object({ officeId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;
      await assertSanadOfficeAccess(db as never, ctx.user.id, input.officeId);
      const [office] = await db.select().from(sanadOffices).where(eq(sanadOffices.id, input.officeId)).limit(1);
      if (!office) return null;
      const [catRow] = await db
        .select({ n: count() })
        .from(sanadServiceCatalogue)
        .where(and(eq(sanadServiceCatalogue.officeId, input.officeId), eq(sanadServiceCatalogue.isActive, 1)));
      const activeN = Number(catRow?.n ?? 0);
      return {
        activeCatalogueCount: activeN,
        goLiveReadiness: computeSanadGoLiveReadiness(office, activeN),
        marketplaceAsListed: computeSanadMarketplaceReadiness(office, activeN),
        profileCompleteness: sanadPublicProfileCompleteness(office),
      };
    }),

  /** Search platform users by name/email for SANAD roster assignment (intel read+). */
  searchUsersForSanadRoster: protectedProcedure
    .input(z.object({ query: z.string().min(2).max(120) }))
    .query(async ({ input, ctx }) => {
      if (!canAccessSanadIntelRead(ctx.user)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "SANAD network or compliance access is required to search users for roster assignment.",
        });
      }
      const db = await getDb();
      if (!db) return [];
      const q = `%${input.query.trim()}%`;
      return db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          platformRole: users.platformRole,
        })
        .from(users)
        .where(or(like(users.email, q), like(users.name, q)))
        .orderBy(asc(users.id))
        .limit(20);
    }),

  /** Office roster — platform / SANAD intel read, or any office member. */
  listSanadOfficeMembers: protectedProcedure
    .input(z.object({ officeId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      if (!canAccessSanadIntelRead(ctx.user)) {
        await assertSanadOfficeAccess(db as never, ctx.user.id, input.officeId);
      }
      return db
        .select({
          membershipId: sanadOfficeMembers.id,
          userId: users.id,
          role: sanadOfficeMembers.role,
          name: users.name,
          email: users.email,
          platformRole: users.platformRole,
          createdAt: sanadOfficeMembers.createdAt,
        })
        .from(sanadOfficeMembers)
        .innerJoin(users, eq(users.id, sanadOfficeMembers.userId))
        .where(eq(sanadOfficeMembers.sanadOfficeId, input.officeId))
        .orderBy(desc(sanadOfficeMembers.createdAt));
    }),

  addSanadOfficeMember: protectedProcedure
    .input(
      z.object({
        officeId: z.number(),
        userId: z.number(),
        role: z.enum(["owner", "manager", "staff"]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await assertSanadOfficeRosterAdmin(db as never, ctx.user, input.officeId);
      if (input.role === "owner") {
        assertCanAssignSanadOfficeOwner(ctx.user);
      }
      const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).limit(1);
      if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      try {
        await db.insert(sanadOfficeMembers).values({
          sanadOfficeId: input.officeId,
          userId: input.userId,
          role: input.role,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("Duplicate") || msg.includes("duplicate")) {
          throw new TRPCError({ code: "CONFLICT", message: "This user is already a member of this office." });
        }
        throw e;
      }
      return { success: true };
    }),

  updateSanadOfficeMemberRole: protectedProcedure
    .input(
      z.object({
        officeId: z.number(),
        userId: z.number(),
        role: z.enum(["owner", "manager", "staff"]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await assertSanadOfficeRosterAdmin(db as never, ctx.user, input.officeId);
      const [row] = await db
        .select({ role: sanadOfficeMembers.role })
        .from(sanadOfficeMembers)
        .where(
          and(
            eq(sanadOfficeMembers.sanadOfficeId, input.officeId),
            eq(sanadOfficeMembers.userId, input.userId),
          ),
        )
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Office membership not found." });
      if (input.role === "owner") {
        assertCanAssignSanadOfficeOwner(ctx.user);
      }
      if (row.role === "owner" && input.role !== "owner") {
        const owners = await countSanadOfficeOwners(db as never, input.officeId);
        if (owners <= 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot change role: this is the only owner for the office. Add another owner first.",
          });
        }
      }
      await db
        .update(sanadOfficeMembers)
        .set({ role: input.role })
        .where(
          and(
            eq(sanadOfficeMembers.sanadOfficeId, input.officeId),
            eq(sanadOfficeMembers.userId, input.userId),
          ),
        );
      return { success: true };
    }),

  removeSanadOfficeMember: protectedProcedure
    .input(z.object({ officeId: z.number(), userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await assertSanadOfficeRosterAdmin(db as never, ctx.user, input.officeId);
      const [row] = await db
        .select({ role: sanadOfficeMembers.role })
        .from(sanadOfficeMembers)
        .where(
          and(
            eq(sanadOfficeMembers.sanadOfficeId, input.officeId),
            eq(sanadOfficeMembers.userId, input.userId),
          ),
        )
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Office membership not found." });
      if (row.role === "owner") {
        const owners = await countSanadOfficeOwners(db as never, input.officeId);
        if (owners <= 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot remove the only owner for this office.",
          });
        }
      }
      await db
        .delete(sanadOfficeMembers)
        .where(
          and(
            eq(sanadOfficeMembers.sanadOfficeId, input.officeId),
            eq(sanadOfficeMembers.userId, input.userId),
          ),
        );
      return { success: true };
    }),

  // ─── Legacy aliases (backward compat) ────────────────────────────────────
  listOffices: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    if (canAccessGlobalAdminProcedures(ctx.user)) return getAllSanadOffices();
    return getSanadOfficesForUser(db as never, ctx.user.id);
  }),
  listApplications: protectedProcedure
    .input(
      z
        .object({ companyId: z.number().optional(), status: z.string().optional(), type: z.string().optional() })
        .optional(),
    )
    .query(async ({ input, ctx }) => {
      if (canAccessGlobalAdminProcedures(ctx.user)) return getAllSanadApplications({ status: input?.status });
      const m = await getActiveCompanyMembership(ctx.user.id, input?.companyId);
      if (!m) return [];
      return getSanadApplications(m.companyId, input ?? {});
    }),

  /** Network intelligence (KPIs, directory, opportunity) — also mounted at root `sanadIntelligence` for tRPC path parity */
  intelligence: sanadIntelligenceRouter,
});
