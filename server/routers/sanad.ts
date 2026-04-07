import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { and, avg, count, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { getDb } from "../db";
import {
  companies,
  officerCompanyAssignments,
  omaniProOfficers,
  sanadApplications,
  sanadOffices,
  sanadServiceCatalogue,
  sanadServiceRequests,
} from "../../drizzle/schema";
import {
  createSanadApplication,
  createSanadOffice,
  getAllSanadApplications,
  getAllSanadOffices,
  getSanadApplicationById,
  getSanadApplications,
  getSanadOffices,
  updateSanadApplication,
  updateSanadOffice,
} from "../db";
import { getActiveCompanyMembership } from "../_core/membership";
import { assertRowBelongsToActiveCompany, requireActiveCompanyId } from "../_core/tenant";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
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
      const offices = canAccessGlobalAdminProcedures(ctx.user)
        ? await getAllSanadOffices()
        : await getSanadOffices(0);
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
    .query(async ({ input }) => {
      const offices = await getAllSanadOffices();
      const office = (offices as any[]).find((o: any) => o.id === input.id);
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
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Platform access required" });
      }
      const db = await getDb();
      if (!db) return null;

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
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Platform access required" });
      }
      const db = await getDb();
      if (!db) return [];

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
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Platform access required" });
      }
      const db = await getDb();
      if (!db) return { byServiceType: [], byStatus: [], recentOrders: [] };

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
      z.object({
        governorate: z.string().optional(),
        serviceType: z.string().optional(),
        language: z.string().optional(),
        minRating: z.number().min(0).max(5).optional(),
        search: z.string().optional(),
      }).optional()
    )
    .query(async () => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select()
        .from(sanadOffices)
        .where(eq(sanadOffices.status, "active"))
        .orderBy(desc(sanadOffices.avgRating));
      return rows;
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
      if (!canAccessGlobalAdminProcedures(ctx.user)) throw new Error("FORBIDDEN");
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { officeId, ...fields } = input;
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
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
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
      if (!canAccessGlobalAdminProcedures(ctx.user)) throw new Error("FORBIDDEN");
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
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
      if (!canAccessGlobalAdminProcedures(ctx.user)) throw new Error("FORBIDDEN");
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
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
      if (!canAccessGlobalAdminProcedures(ctx.user)) throw new Error("FORBIDDEN");
      const db = await getDb();
      if (!db) return [];
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
      if (!canAccessGlobalAdminProcedures(ctx.user)) throw new Error("FORBIDDEN");
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db
        .update(sanadServiceRequests)
        .set({ status: input.status, notes: input.notes, updatedAt: new Date() })
        .where(eq(sanadServiceRequests.id, input.id));
      return { success: true };
    }),

  // ─── Sanad Centre Self-Management ──────────────────────────────────────────

  /** Get the first Sanad office profile (for self-management by the current user) */
  getMyOfficeProfile: protectedProcedure
    .input(z.object({ officeId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
      if (!canAccessGlobalAdminProcedures(ctx.user)) return null;
      const db = await getDb();
      if (!db) return null;
      if (input?.officeId) {
        const [office] = await db.select().from(sanadOffices).where(eq(sanadOffices.id, input.officeId)).limit(1);
        return office ?? null;
      }
      const [office] = await db.select().from(sanadOffices).limit(1);
      return office ?? null;
    }),

  /** Create or update the Sanad office profile for the current user's company */
  upsertOfficeProfile: protectedProcedure
    .input(
      z.object({
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
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Platform access required" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const officeId = (input as any).officeId as number | undefined;
      const existing = officeId
        ? await db.select().from(sanadOffices).where(eq(sanadOffices.id, officeId)).limit(1)
        : await db.select().from(sanadOffices).limit(1);
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
      if (existing.length > 0) {
        await db.update(sanadOffices).set(payload).where(eq(sanadOffices.id, existing[0].id));

        return { id: existing[0].id };
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
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Platform access required" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
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
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Platform access required" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
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
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Platform access required" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(sanadServiceCatalogue).set({ isActive: input.isActive ? 1 : 0, updatedAt: new Date() }).where(eq(sanadServiceCatalogue.id, input.id));
      return { success: true };
    }),

  /** Delete a catalogue item */
  deleteCatalogueItem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Platform access required" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(sanadServiceCatalogue).where(eq(sanadServiceCatalogue.id, input.id));
      return { success: true };
    }),

  /** Get service catalogue for a specific office (alias used by admin page) */
  getServiceCatalogue: protectedProcedure
    .input(z.object({ officeId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(sanadServiceCatalogue).where(eq(sanadServiceCatalogue.officeId, input.officeId)).orderBy(sanadServiceCatalogue.serviceType);
    }),

  // ─── Legacy aliases (backward compat) ────────────────────────────────────
  listOffices: protectedProcedure.query(async ({ ctx }) => {
    return canAccessGlobalAdminProcedures(ctx.user) ? getAllSanadOffices() : getSanadOffices(0);
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
