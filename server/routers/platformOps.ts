import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, gte, like, lte, or, sql, sum } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import {
  companies,
  companyMembers,
  officerCompanyAssignments,
  officerPayouts,
  omaniProOfficers,
  proBillingCycles,
  sanadApplications,
  sanadOffices,
  users,
} from "../../drizzle/schema";
import { adminProcedure, router } from "../_core/trpc";

// ─── Platform Operations Router ───────────────────────────────────────────────

export const platformOpsRouter = router({
  /**
   * High-level platform KPI summary for super_admin / platform_admin.
   */
  getPlatformSummary: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return {
      totalRevenuePendingOmr: 0,
      totalRevenuePaidOmr: 0,
      totalRevenueOmr: 0,
      totalCompanies: 0,
      totalOfficers: 0,
      totalActiveAssignments: 0,
      totalSanadCentres: 0,
      avgOfficerUtilisation: 0,
    };

    const [revRow] = await db
      .select({
        totalPending: sql<string>`COALESCE(SUM(CASE WHEN ${proBillingCycles.status} = 'pending' THEN ${proBillingCycles.amountOmr} ELSE 0 END), 0)`,
        totalPaid: sql<string>`COALESCE(SUM(CASE WHEN ${proBillingCycles.status} = 'paid' THEN ${proBillingCycles.amountOmr} ELSE 0 END), 0)`,
        totalAll: sql<string>`COALESCE(SUM(${proBillingCycles.amountOmr}), 0)`,
      })
      .from(proBillingCycles);

    const [compRow] = await db.select({ cnt: count() }).from(companies);
    const [officerRow] = await db.select({ cnt: count() }).from(omaniProOfficers).where(eq(omaniProOfficers.status, "active"));
    const [assignRow] = await db.select({ cnt: count() }).from(officerCompanyAssignments).where(eq(officerCompanyAssignments.status, "active"));
    const [sanadRow] = await db.select({ cnt: count() }).from(sanadOffices);

    const totalOfficers = Number(officerRow.cnt);
    const totalActive = Number(assignRow.cnt);
    const avgUtil = totalOfficers > 0 ? Math.round((totalActive / (totalOfficers * 10)) * 100) : 0;

    return {
      totalRevenuePendingOmr: parseFloat(revRow.totalPending),
      totalRevenuePaidOmr: parseFloat(revRow.totalPaid),
      totalRevenueOmr: parseFloat(revRow.totalAll),
      totalCompanies: Number(compRow.cnt),
      totalOfficers,
      totalActiveAssignments: totalActive,
      totalSanadCentres: Number(sanadRow.cnt),
      avgOfficerUtilisation: avgUtil,
    };
  }),

  /**
   * Monthly revenue breakdown for the last 12 months.
   * Returns array of { year, month, pendingOmr, paidOmr, totalOmr, cycleCount }.
   */
  getMonthlyRevenueTrend: adminProcedure
    .input(z.object({ months: z.number().min(1).max(24).default(12) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const rows = await db
        .select({
          year: proBillingCycles.billingYear,
          month: proBillingCycles.billingMonth,
          pending: sql<string>`COALESCE(SUM(CASE WHEN ${proBillingCycles.status} = 'pending' THEN ${proBillingCycles.amountOmr} ELSE 0 END), 0)`,
          paid: sql<string>`COALESCE(SUM(CASE WHEN ${proBillingCycles.status} = 'paid' THEN ${proBillingCycles.amountOmr} ELSE 0 END), 0)`,
          total: sql<string>`COALESCE(SUM(${proBillingCycles.amountOmr}), 0)`,
          cnt: count(),
        })
        .from(proBillingCycles)
        .groupBy(proBillingCycles.billingYear, proBillingCycles.billingMonth)
        .orderBy(desc(proBillingCycles.billingYear), desc(proBillingCycles.billingMonth))
        .limit(input.months);

      return rows.map((r) => ({
        year: r.year,
        month: r.month,
        pendingOmr: parseFloat(r.pending),
        paidOmr: parseFloat(r.paid),
        totalOmr: parseFloat(r.total),
        cycleCount: Number(r.cnt),
        label: `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][r.month - 1]} ${r.year}`,
      }));
    }),

  /**
   * Sanad centre payment summary — how much each Sanad centre earns from officer assignments.
   */
  getSanadCentrePayments: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    const rows = await db
      .select({
        officeId: sanadOffices.id,
        officeName: sanadOffices.name,
        governorate: sanadOffices.governorate,
        officerCount: count(omaniProOfficers.id),
        totalBilledOmr: sql<string>`COALESCE(SUM(${proBillingCycles.amountOmr}), 0)`,
        totalPaidOmr: sql<string>`COALESCE(SUM(CASE WHEN ${proBillingCycles.status} = 'paid' THEN ${proBillingCycles.amountOmr} ELSE 0 END), 0)`,
        totalPendingOmr: sql<string>`COALESCE(SUM(CASE WHEN ${proBillingCycles.status} = 'pending' THEN ${proBillingCycles.amountOmr} ELSE 0 END), 0)`,
      })
      .from(sanadOffices)
      .leftJoin(omaniProOfficers, and(eq(omaniProOfficers.sanadOfficeId, sanadOffices.id), eq(omaniProOfficers.status, "active")))
      .leftJoin(proBillingCycles, eq(proBillingCycles.officerId, omaniProOfficers.id))
      .groupBy(sanadOffices.id, sanadOffices.name, sanadOffices.governorate)
      .orderBy(desc(sql`SUM(${proBillingCycles.amountOmr})`));

    return rows.map((r) => ({
      officeId: r.officeId,
      officeName: r.officeName,
      governorate: r.governorate ?? "Unknown",
      officerCount: Number(r.officerCount),
      totalBilledOmr: parseFloat(r.totalBilledOmr),
      totalPaidOmr: parseFloat(r.totalPaidOmr),
      totalPendingOmr: parseFloat(r.totalPendingOmr),
    }));
  }),

  /**
   * EBITDA approximation: Revenue - Officer Payouts - Estimated Overhead.
   */
  getEBITDA: adminProcedure
    .input(z.object({ year: z.number().min(2020).max(2100), month: z.number().min(1).max(12) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { revenue: 0, payouts: 0, overhead: 0, ebitda: 0, margin: 0 };

      const [revRow] = await db
        .select({ total: sql<string>`COALESCE(SUM(${proBillingCycles.amountOmr}), 0)` })
        .from(proBillingCycles)
        .where(and(eq(proBillingCycles.billingYear, input.year), eq(proBillingCycles.billingMonth, input.month)));

      const [payRow] = await db
        .select({ total: sql<string>`COALESCE(SUM(${officerPayouts.netOmr}), 0)` })
        .from(officerPayouts)
        .where(and(eq(officerPayouts.payoutYear, input.year), eq(officerPayouts.payoutMonth, input.month)));

      const revenue = parseFloat(revRow.total);
      const payouts = parseFloat(payRow.total);
      // Estimated overhead: 15% of revenue (platform costs, support, infrastructure)
      const overhead = Math.round(revenue * 0.15 * 1000) / 1000;
      const ebitda = Math.round((revenue - payouts - overhead) * 1000) / 1000;
      const margin = revenue > 0 ? Math.round((ebitda / revenue) * 10000) / 100 : 0;

      return { revenue, payouts, overhead, ebitda, margin };
    }),

  /**
   * Regional view: officer capacity by governorate.
   */
  getRegionalCapacity: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    const rows = await db
      .select({
        governorate: sanadOffices.governorate,
        officerCount: count(omaniProOfficers.id),
        maxCapacity: sql<string>`COALESCE(SUM(${omaniProOfficers.maxCompanies}), 0)`,
        activeAssignments: sql<string>`COALESCE(SUM(CASE WHEN ${officerCompanyAssignments.status} = 'active' THEN 1 ELSE 0 END), 0)`,
      })
      .from(sanadOffices)
      .leftJoin(omaniProOfficers, and(eq(omaniProOfficers.sanadOfficeId, sanadOffices.id), eq(omaniProOfficers.status, "active")))
      .leftJoin(officerCompanyAssignments, eq(officerCompanyAssignments.officerId, omaniProOfficers.id))
      .groupBy(sanadOffices.governorate)
      .orderBy(sanadOffices.governorate);

    // Also include officers not linked to any Sanad office
    const [unlinkedRow] = await db
      .select({
        officerCount: count(omaniProOfficers.id),
        maxCapacity: sql<string>`COALESCE(SUM(${omaniProOfficers.maxCompanies}), 0)`,
        activeAssignments: sql<string>`COALESCE(SUM(CASE WHEN ${officerCompanyAssignments.status} = 'active' THEN 1 ELSE 0 END), 0)`,
      })
      .from(omaniProOfficers)
      .leftJoin(officerCompanyAssignments, eq(officerCompanyAssignments.officerId, omaniProOfficers.id))
      .where(sql`${omaniProOfficers.sanadOfficeId} IS NULL`);

    const result = rows
      .filter((r) => r.governorate)
      .map((r) => {
        const maxCap = parseFloat(r.maxCapacity);
        const active = parseFloat(r.activeAssignments);
        return {
          governorate: r.governorate ?? "Unknown",
          officerCount: Number(r.officerCount),
          maxCapacity: maxCap,
          activeAssignments: active,
          availableSlots: Math.max(0, maxCap - active),
          utilisationPct: maxCap > 0 ? Math.round((active / maxCap) * 100) : 0,
        };
      });

    if (Number(unlinkedRow.officerCount) > 0) {
      const maxCap = parseFloat(unlinkedRow.maxCapacity);
      const active = parseFloat(unlinkedRow.activeAssignments);
      result.push({
        governorate: "Unassigned",
        officerCount: Number(unlinkedRow.officerCount),
        maxCapacity: maxCap,
        activeAssignments: active,
        availableSlots: Math.max(0, maxCap - active),
        utilisationPct: maxCap > 0 ? Math.round((active / maxCap) * 100) : 0,
      });
    }

    return result;
  }),

  /**
   * Platform user stats by role.
   */
  getUserStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { total: 0, byRole: [] };

    const [totalRow] = await db.select({ cnt: count() }).from(users);
    const roleRows = await db
      .select({ role: users.platformRole, cnt: count() })
      .from(users)
      .groupBy(users.platformRole);

    return {
      total: Number(totalRow.cnt),
      byRole: roleRows.map((r) => ({ role: r.role, count: Number(r.cnt) })),
    };
  }),

  /**
   * Top companies by billing volume.
   */
  getTopCompaniesByRevenue: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(10) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const rows = await db
        .select({
          companyId: companies.id,
          companyName: companies.name,
          totalBilledOmr: sql<string>`COALESCE(SUM(${proBillingCycles.amountOmr}), 0)`,
          paidOmr: sql<string>`COALESCE(SUM(CASE WHEN ${proBillingCycles.status} = 'paid' THEN ${proBillingCycles.amountOmr} ELSE 0 END), 0)`,
          cycleCount: count(proBillingCycles.id),
        })
        .from(companies)
        .leftJoin(proBillingCycles, eq(proBillingCycles.companyId, companies.id))
        .groupBy(companies.id, companies.name)
        .orderBy(desc(sql`SUM(${proBillingCycles.amountOmr})`))
        .limit(input.limit);

      return rows.map((r) => ({
        companyId: r.companyId,
        companyName: r.companyName,
        totalBilledOmr: parseFloat(r.totalBilledOmr),
        paidOmr: parseFloat(r.paidOmr),
        cycleCount: Number(r.cycleCount),
      }));
    }),

  /**
   * Work order volume by Sanad application type (last 6 months).
   */
  getWorkOrderVolume: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    const rows = await db
      .select({
        serviceType: sanadApplications.serviceType,
        cnt: count(),
      })
      .from(sanadApplications)
      .groupBy(sanadApplications.serviceType)
      .orderBy(desc(count()));

    return rows.map((r) => ({ serviceType: r.serviceType, count: Number(r.cnt) }));
  }),

  /**
   * List all platform users with their company memberships.
   */
  listUsers: adminProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const searchTerm = input?.search?.trim();
      const allUsers = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          platformRole: users.platformRole,
          isActive: users.isActive,
          loginMethod: users.loginMethod,
          createdAt: users.createdAt,
          lastSignedIn: users.lastSignedIn,
          phone: users.phone,
        })
        .from(users)
        .where(
          searchTerm
            ? or(like(users.name, `%${searchTerm}%`), like(users.email, `%${searchTerm}%`))
            : undefined
        )
        .orderBy(asc(users.id));

      const userIds = allUsers.map((u) => u.id);
      const memberships =
        userIds.length > 0
          ? await db
              .select({
                userId: companyMembers.userId,
                memberId: companyMembers.id,
                role: companyMembers.role,
                isActive: companyMembers.isActive,
                companyName: companies.name,
                companyId: companies.id,
              })
              .from(companyMembers)
              .innerJoin(companies, eq(companies.id, companyMembers.companyId))
              .where(or(...userIds.map((id) => eq(companyMembers.userId, id))))
          : [];

      const membershipMap = new Map<number, typeof memberships>();
      for (const m of memberships) {
        if (!membershipMap.has(m.userId)) membershipMap.set(m.userId, []);
        membershipMap.get(m.userId)!.push(m);
      }

      return allUsers.map((u) => ({
        ...u,
        isActive: Boolean(u.isActive),
        companies: (membershipMap.get(u.id) ?? []).map((m) => ({
          memberId: m.memberId,
          companyId: m.companyId,
          companyName: m.companyName,
          memberRole: m.role,
          isActive: Boolean(m.isActive),
        })),
      }));
    }),

  /**
   * Update a user's platformRole, system role, or active status.
   */
  updateUserRole: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        platformRole: z.enum(["client", "company_admin", "platform_admin"]).optional(),
        role: z.enum(["admin", "user"]).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const updates: Record<string, unknown> = {};
      if (input.platformRole !== undefined) updates.platformRole = input.platformRole;
      if (input.role !== undefined) updates.role = input.role;
      if (input.isActive !== undefined) updates.isActive = input.isActive ? 1 : 0;
      if (Object.keys(updates).length === 0)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nothing to update" });
      await db.update(users).set(updates).where(eq(users.id, input.userId));
      return { success: true };
    }),

  /**
   * Update a user's company membership role.
   */
  updateCompanyMemberRole: adminProcedure
    .input(
      z.object({
        memberId: z.number(),
        role: z.enum(["company_admin", "company_member", "finance_admin", "hr_admin", "reviewer", "external_auditor"]),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(companyMembers)
        .set({ role: input.role })
        .where(eq(companyMembers.id, input.memberId));
      return { success: true };
    }),
});
