import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  isNotNull,
  isNull,
  like,
  lte,
  notInArray,
  or,
  sql,
  sum,
} from "drizzle-orm";
import { escapeLike } from "@shared/objectUtils";
import { z } from "zod";
import { getDb, replaceGlobalPlatformRolesForUser } from "../db";
import {
  auditLogs,
  companies,
  companyMembers,
  officerCompanyAssignments,
  officerPayouts,
  omaniProOfficers,
  proBillingCycles,
  sanadApplications,
  sanadOffices,
  users,
  platformUserRoles,
} from "../../drizzle/schema";
import { adminProcedure, platformOperatorReadProcedure, router } from "../_core/trpc";
import { getAccessShadowSnapshot } from "../_core/accessShadow";
import { runNavIntegrityChecks } from "../navIntegrityChecks";
import { mapMemberRoleToPlatformRole } from "../../shared/rbac";
import {
  PLATFORM_STAFF_ROLES,
  BUSINESS_USER_ROLES,
  deriveAccountType,
  deriveEffectiveAccess,
  deriveScope,
  deriveEdgeCaseWarning,
  deriveBestMemberRole,
} from "../../shared/roleHelpers";
import { PLATFORM_ROLE_VALUES } from "../../shared/platformRoles";
import { GLOBAL_PLATFORM_ROLE_SLUGS } from "../../shared/identityAuthority";
import { fetchAdminUserDetail, queryAdminUsersList } from "../adminUsersViewModel";

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
   * Sanad centre payment summary.
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
   * EBITDA approximation.
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
   * Work order volume by Sanad application type.
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
            ? or(like(users.name, `%${escapeLike(searchTerm)}%`), like(users.email, `%${escapeLike(searchTerm)}%`))
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
        platformRole: z.enum(PLATFORM_ROLE_VALUES as unknown as [string, ...string[]]).optional(),
        role: z.enum(["admin", "user"]).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const updates: Record<string, unknown> = {};
      if (input.platformRole !== undefined) updates.platformRole = input.platformRole;
      if (input.role !== undefined) updates.role = input.role;
      if (input.isActive !== undefined) updates.isActive = input.isActive ? 1 : 0;
      if (Object.keys(updates).length === 0)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nothing to update" });
      // Fetch old values for audit
      const [oldUser] = await db.select({ platformRole: users.platformRole, isActive: users.isActive }).from(users).where(eq(users.id, input.userId));

      if (input.platformRole !== undefined) {
        if (GLOBAL_PLATFORM_ROLE_SLUGS.has(input.platformRole)) {
          await replaceGlobalPlatformRolesForUser(input.userId, [input.platformRole], ctx.user.id);
        } else {
          await replaceGlobalPlatformRolesForUser(input.userId, [], ctx.user.id);
        }
      }

      await db.update(users).set(updates).where(eq(users.id, input.userId));
      // Audit log
      await db.insert(auditLogs).values({
        userId: ctx.user.id,
        action: "update_platform_role",
        entityType: "user",
        entityId: input.userId,
        oldValues: oldUser ?? {},
        newValues: updates,
      });
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
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [existing] = await db
        .select({ role: companyMembers.role, userId: companyMembers.userId, companyId: companyMembers.companyId })
        .from(companyMembers)
        .where(eq(companyMembers.id, input.memberId));
      await db.update(companyMembers).set({ role: input.role }).where(eq(companyMembers.id, input.memberId));
      if (existing) {
        await db.insert(auditLogs).values({
          userId: ctx.user.id,
          companyId: existing.companyId,
          action: "update_membership_role",
          entityType: "company_member",
          entityId: input.memberId,
          oldValues: { role: existing.role },
          newValues: { role: input.role },
        });
      }
      return { success: true };
    }),

  // ─── Role Audit & Management ────────────────────────────────────────────────

  /**
   * Full role audit report: every user with platformRole, company memberships,
   * and a hasMismatch flag when platformRole doesn't match the best membership role.
   */
  getRoleAuditReport: platformOperatorReadProcedure
    .input(z.object({
      search: z.string().optional(),
      filterMismatches: z.boolean().optional(),
      filterPlatformRole: z.string().optional(),
      filterCompanyId: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { users: [], stats: { total: 0, mismatches: 0, admins: 0, suspended: 0 } };

      const searchTerm = input?.search?.trim();
      const allUsers = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          platformRole: users.platformRole,
          role: users.role,
          isActive: users.isActive,
          loginMethod: users.loginMethod,
          createdAt: users.createdAt,
          lastSignedIn: users.lastSignedIn,
        })
        .from(users)
        .where(
          searchTerm
            ? or(like(users.name, `%${escapeLike(searchTerm)}%`), like(users.email, `%${escapeLike(searchTerm)}%`))
            : undefined
        )
        .orderBy(asc(users.id));

      const userIds = allUsers.map((u) => u.id);
      const memberships = userIds.length > 0
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

      // All derivation logic is centralized in shared/roleHelpers.ts — do not duplicate inline.

      let result = allUsers.map((u) => {
        const userMemberships = (membershipMap.get(u.id) ?? []).map((m) => ({
          memberId: m.memberId,
          companyId: m.companyId,
          companyName: m.companyName,
          memberRole: m.role ?? "company_member",
          isActive: Boolean(m.isActive),
        }));

        const activeMemberRoles = userMemberships.filter((m) => m.isActive).map((m) => m.memberRole);
        const bestMemberRole = deriveBestMemberRole(activeMemberRoles);

        const expectedPlatformRole = bestMemberRole ? mapMemberRoleToPlatformRole(bestMemberRole) : "client";
        const currentPlatformRole = u.platformRole ?? "client";
        const hasMismatch = activeMemberRoles.length > 0 && currentPlatformRole !== expectedPlatformRole;
        const accountType = deriveAccountType(u.platformRole);
        const effectiveAccess = deriveEffectiveAccess(u.platformRole, bestMemberRole, activeMemberRoles);
        const activeMembershipsForScope = userMemberships.filter((m) => m.isActive);
        const scope = deriveScope(accountType, activeMembershipsForScope, u.platformRole);
        const edgeCaseWarning = deriveEdgeCaseWarning(u.platformRole, activeMemberRoles);

        return {
          ...u,
          isActive: Boolean(u.isActive),
          companies: userMemberships,
          bestMemberRole,
          expectedPlatformRole,
          hasMismatch,
          accountType,
          effectiveAccess,
          scope,
          edgeCaseWarning,
        };
      });

      // Apply filters
      if (input?.filterMismatches) result = result.filter((u) => u.hasMismatch);
      if (input?.filterPlatformRole) result = result.filter((u) => u.platformRole === input.filterPlatformRole);
      if (input?.filterCompanyId) result = result.filter((u) => u.companies.some((c) => c.companyId === input.filterCompanyId));

       const stats = {
        total: allUsers.length,
        mismatches: allUsers.reduce((acc, u) => {
          const userMemberships = membershipMap.get(u.id) ?? [];
          const activeMemberRoles = userMemberships.filter((m) => Boolean(m.isActive)).map((m) => m.role ?? "company_member");
          if (activeMemberRoles.length === 0) return acc;
          const bestRole = deriveBestMemberRole(activeMemberRoles);
          if (!bestRole) return acc;
          const expected = mapMemberRoleToPlatformRole(bestRole);
          return acc + (u.platformRole !== expected ? 1 : 0);
        }, 0),
        admins: allUsers.filter((u) => u.platformRole === "company_admin" || u.platformRole === "platform_admin").length,
        suspended: allUsers.filter((u) => !u.isActive).length,
        platformStaff: allUsers.filter((u) => PLATFORM_STAFF_ROLES.has(u.platformRole ?? "")).length,
        businessUsers: allUsers.filter((u) => BUSINESS_USER_ROLES.has(u.platformRole ?? "")).length,
        customers: allUsers.filter((u) => (u.platformRole ?? "") === "client").length,
        auditors: allUsers.filter((u) => (u.platformRole ?? "") === "external_auditor").length,
        needsReview: allUsers.filter((u) => deriveAccountType(u.platformRole) === "needs_review").length,
      };
      return { users: result, stats };
    }),

  /**
   * Fix a single user's platformRole to match their best active membership role.
   */
  fixRoleMismatch: adminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [user] = await db.select({ id: users.id, platformRole: users.platformRole }).from(users).where(eq(users.id, input.userId));
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      const ROLE_ORDER = ["company_admin", "hr_admin", "finance_admin", "reviewer", "company_member", "external_auditor", "client"];
      const activeMemberships = await db
        .select({ role: companyMembers.role })
        .from(companyMembers)
        .where(and(eq(companyMembers.userId, input.userId), eq(companyMembers.isActive, true)));

      const bestRole = activeMemberships.length > 0
        ? [...activeMemberships.map((m) => m.role ?? "company_member")].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b))[0]
        : null;

      const newPlatformRole = bestRole ? mapMemberRoleToPlatformRole(bestRole) : "client";
      const oldPlatformRole = user.platformRole;

      await db.update(users).set({ platformRole: newPlatformRole }).where(eq(users.id, input.userId));

      await db.insert(auditLogs).values({
        userId: ctx.user.id,
        action: "fix_role_mismatch",
        entityType: "user",
        entityId: input.userId,
        oldValues: { platformRole: oldPlatformRole },
        newValues: { platformRole: newPlatformRole },
      });

      return { success: true, oldPlatformRole, newPlatformRole };
    }),

  /**
   * Fix ALL detected role mismatches in one operation.
   */
  bulkFixMismatches: adminProcedure
    .mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const ROLE_ORDER = ["company_admin", "hr_admin", "finance_admin", "reviewer", "company_member", "external_auditor", "client"];

      const allUsers = await db.select({ id: users.id, platformRole: users.platformRole }).from(users);
      const allMemberships = await db
        .select({ userId: companyMembers.userId, role: companyMembers.role })
        .from(companyMembers)
        .where(eq(companyMembers.isActive, true));

      const membershipMap = new Map<number, string[]>();
      for (const m of allMemberships) {
        if (!membershipMap.has(m.userId)) membershipMap.set(m.userId, []);
        membershipMap.get(m.userId)!.push(m.role ?? "company_member");
      }

      let fixedCount = 0;
      for (const u of allUsers) {
        const roles = membershipMap.get(u.id) ?? [];
        if (roles.length === 0) continue;
        const bestRole = [...roles].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b))[0];
        const expectedPlatformRole = mapMemberRoleToPlatformRole(bestRole);
        if (u.platformRole !== expectedPlatformRole) {
          await db.update(users).set({ platformRole: expectedPlatformRole }).where(eq(users.id, u.id));
          await db.insert(auditLogs).values({
            userId: ctx.user.id,
            action: "bulk_fix_role_mismatch",
            entityType: "user",
            entityId: u.id,
            oldValues: { platformRole: u.platformRole },
            newValues: { platformRole: expectedPlatformRole },
          });
          fixedCount++;
        }
      }

      return { success: true, fixedCount };
    }),

  /**
   * Add a user to a company with a specified role.
   */
  addUserToCompany: adminProcedure
    .input(z.object({
      userId: z.number(),
      companyId: z.number(),
      role: z.enum(["company_admin", "company_member", "finance_admin", "hr_admin", "reviewer", "external_auditor"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [existing] = await db
        .select({ id: companyMembers.id, isActive: companyMembers.isActive })
        .from(companyMembers)
        .where(and(eq(companyMembers.userId, input.userId), eq(companyMembers.companyId, input.companyId)));

      if (existing) {
        await db.update(companyMembers).set({ isActive: true, role: input.role }).where(eq(companyMembers.id, existing.id));
      } else {
        await db.insert(companyMembers).values({
          userId: input.userId,
          companyId: input.companyId,
          role: input.role,
          isActive: true,
          invitedBy: ctx.user.id,
        });
      }

      // Auto-promote platformRole if currently just a client
      const newPlatformRole = mapMemberRoleToPlatformRole(input.role);
      const [currentUser] = await db.select({ platformRole: users.platformRole }).from(users).where(eq(users.id, input.userId));
      if (currentUser && currentUser.platformRole === "client") {
        await db.update(users).set({ platformRole: newPlatformRole }).where(eq(users.id, input.userId));
      }

      await db.insert(auditLogs).values({
        userId: ctx.user.id,
        companyId: input.companyId,
        action: "add_user_to_company",
        entityType: "company_member",
        entityId: input.userId,
        newValues: { role: input.role, companyId: input.companyId },
      });

      return { success: true };
    }),

  /**
   * Remove a user from a company (deactivate membership).
   */
  removeUserFromCompany: adminProcedure
    .input(z.object({ memberId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [existing] = await db
        .select({ userId: companyMembers.userId, companyId: companyMembers.companyId, role: companyMembers.role })
        .from(companyMembers)
        .where(eq(companyMembers.id, input.memberId));

      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Membership not found" });

      await db.update(companyMembers).set({ isActive: false }).where(eq(companyMembers.id, input.memberId));

      await db.insert(auditLogs).values({
        userId: ctx.user.id,
        companyId: existing.companyId,
        action: "remove_user_from_company",
        entityType: "company_member",
        entityId: input.memberId,
        oldValues: { role: existing.role, userId: existing.userId },
        newValues: { isActive: false },
      });

      return { success: true };
    }),

  /**
   * Get recent role change audit logs.
   */
  getRoleAuditLogs: platformOperatorReadProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20), userId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const roleActions = ["update_membership_role", "fix_role_mismatch", "bulk_fix_role_mismatch", "add_user_to_company", "remove_user_from_company", "update_platform_role"];

      const rows = await db
        .select({
          id: auditLogs.id,
          actorId: auditLogs.userId,
          actorName: users.name,
          actorEmail: users.email,
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          entityId: auditLogs.entityId,
          oldValues: auditLogs.oldValues,
          newValues: auditLogs.newValues,
          createdAt: auditLogs.createdAt,
          companyId: auditLogs.companyId,
        })
        .from(auditLogs)
        .leftJoin(users, eq(users.id, auditLogs.userId))
        .where(
          and(
            or(...roleActions.map((a) => eq(auditLogs.action, a))),
            input?.userId ? eq(auditLogs.entityId, input.userId) : undefined
          )
        )
        .orderBy(desc(auditLogs.createdAt))
        .limit(input?.limit ?? 20);

      return rows;
    }),

  /**
   * Run platform navigation integrity checks and return a structured report.
   * Validates nav metadata (duplicate hrefs, label key drift, missing intents)
   * and hub breadcrumb coverage (all key child pages use correct trail helpers).
   */
  runNavIntegrityChecks: adminProcedure.query(() => {
    return runNavIntegrityChecks();
  }),

  /**
   * List all companies (for dropdowns in role management).
   */
  listCompanies: platformOperatorReadProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select({ id: companies.id, name: companies.name }).from(companies).orderBy(asc(companies.name));
  }),

  /** In-memory snapshot of shadow mismatch aggregates (global admin only). */
  getAccessShadowSnapshot: adminProcedure.query(() => getAccessShadowSnapshot()),

  /**
   * Operational identity health: duplicate normalized emails, privileged users without 2FA, accounts without memberships.
   */
  getIdentityHealthReport: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      return {
        duplicateEmailGroups: [] as { emailNormalized: string; userIds: number[] }[],
        privilegedWithout2fa: [] as { userId: number; email: string | null; platformRoles: string[] }[],
        activeWithoutMembership: [] as { userId: number; email: string | null }[],
      };
    }

    const dupRows = await db
      .select({
        emailNormalized: users.emailNormalized,
        c: count(users.id),
      })
      .from(users)
      .where(and(isNotNull(users.emailNormalized), notInArray(users.accountStatus, ["merged", "archived"])))
      .groupBy(users.emailNormalized)
      .having(gt(count(users.id), 1));

    const duplicateEmailGroups: { emailNormalized: string; userIds: number[] }[] = [];
    for (const d of dupRows) {
      if (!d.emailNormalized) continue;
      const ids = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.emailNormalized, d.emailNormalized),
            notInArray(users.accountStatus, ["merged", "archived"]),
          ),
        )
        .orderBy(asc(users.id));
      duplicateEmailGroups.push({
        emailNormalized: d.emailNormalized,
        userIds: ids.map((r) => r.id),
      });
    }

    const allUsers = await db
      .select({
        id: users.id,
        email: users.email,
        twoFactorEnabled: users.twoFactorEnabled,
      })
      .from(users)
      .where(notInArray(users.accountStatus, ["merged", "archived"]));

    const platformByUser = new Map<number, string[]>();
    const pur = await db
      .select({ userId: platformUserRoles.userId, role: platformUserRoles.role })
      .from(platformUserRoles)
      .where(isNull(platformUserRoles.revokedAt));
    for (const row of pur) {
      if (!platformByUser.has(row.userId)) platformByUser.set(row.userId, []);
      platformByUser.get(row.userId)!.push(row.role);
    }

    const privilegedWithout2fa: { userId: number; email: string | null; platformRoles: string[] }[] = [];
    for (const u of allUsers) {
      const pr = platformByUser.get(u.id) ?? [];
      const needs2fa = pr.some((p) => p === "super_admin" || p === "platform_admin");
      if (needs2fa && !u.twoFactorEnabled) {
        privilegedWithout2fa.push({ userId: u.id, email: u.email, platformRoles: pr });
      }
    }

    const memberUserIds = await db
      .select({ userId: companyMembers.userId })
      .from(companyMembers)
      .where(eq(companyMembers.isActive, true));

    const mset = new Set(memberUserIds.map((m) => m.userId));
    const activeWithoutMembership: { userId: number; email: string | null }[] = [];
    for (const u of allUsers) {
      if (!mset.has(u.id)) {
        activeWithoutMembership.push({ userId: u.id, email: u.email });
      }
    }

    return { duplicateEmailGroups, privilegedWithout2fa, activeWithoutMembership };
  }),

  /**
   * Admin identity & access console — paginated list with server-side filters (view model).
   */
  adminUsersList: adminProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          accountStatuses: z.array(z.enum(["active", "invited", "suspended", "merged", "archived"])).optional(),
          globalPlatformRole: z.string().optional(),
          membershipRole: z.string().optional(),
          authProvider: z.string().optional(),
          twoFactor: z.enum(["any", "enabled", "missing"]).optional(),
          identityQuickFilter: z
            .enum(["any", "duplicate", "no_memberships", "merged_inactive", "privileged_no_2fa"])
            .optional(),
          createdAfter: z.coerce.date().optional(),
          createdBefore: z.coerce.date().optional(),
          staleAfterDays: z.number().min(0).optional(),
          securityQuickFilter: z.enum(["any", "needs_attention"]).optional(),
          limit: z.number().min(1).max(200).default(50),
          offset: z.number().min(0).default(0),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const i = input ?? {};
      return queryAdminUsersList(db, {
        search: i.search,
        accountStatuses: i.accountStatuses,
        globalPlatformRole: i.globalPlatformRole,
        membershipRole: i.membershipRole,
        authProvider: i.authProvider,
        twoFactor: i.twoFactor ?? "any",
        identityQuickFilter:
          i.identityQuickFilter === undefined || i.identityQuickFilter === "any" ? "any" : i.identityQuickFilter,
        createdAfter: i.createdAfter,
        createdBefore: i.createdBefore,
        staleAfterDays: i.staleAfterDays,
        securityQuickFilter:
          i.securityQuickFilter === undefined || i.securityQuickFilter === "any" ? "any" : "needs_attention",
        limit: i.limit ?? 50,
        offset: i.offset ?? 0,
      });
    }),

  /**
   * Full user detail for admin identity console (drawer/page).
   */
  adminUserDetail: adminProcedure.input(z.object({ userId: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const detail = await fetchAdminUserDetail(db, input.userId);
    if (!detail) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    return detail;
  }),
});
