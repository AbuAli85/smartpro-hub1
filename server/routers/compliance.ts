import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  employees,
  workPermits,
  payrollRuns,
  payrollLineItems,
} from "../../drizzle/schema";
import { eq, and, gte, lte, count, inArray, desc } from "drizzle-orm";
import { resolveStatsCompanyFilter } from "../_core/tenant";
import type { User } from "../../drizzle/schema";

export const complianceRouter = router({
  // ── Omanisation Stats ────────────────────────────────────────────────────────
  getOmanisationStats: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { total: 0, omani: 0, pct: 0, targetPct: 35, gap: 0, byDepartment: [] };

      const scope = await resolveStatsCompanyFilter(ctx.user as User, input.companyId);
      const conditions = [eq(employees.status, "active")];
      if (!scope.aggregateAllTenants) conditions.push(eq(employees.companyId, scope.companyId));

      const allEmployees = await db
        .select({
          id: employees.id,
          nationality: employees.nationality,
          department: employees.department,
        })
        .from(employees)
        .where(and(...conditions));

      const total = allEmployees.length;
      const omani = allEmployees.filter((e) => e.nationality?.toLowerCase() === "omani" || e.nationality?.toLowerCase() === "om").length;
      const pct = total > 0 ? Math.round((omani / total) * 100) : 0;
      const targetPct = 35; // Standard Oman Omanisation target
      const gap = Math.max(0, targetPct - pct);

      // By department
      const deptMap = new Map<string, { total: number; omani: number }>();
      for (const emp of allEmployees) {
        const dept = emp.department ?? "Unassigned";
        const entry = deptMap.get(dept) ?? { total: 0, omani: 0 };
        entry.total++;
        if (emp.nationality?.toLowerCase() === "omani" || emp.nationality?.toLowerCase() === "om") {
          entry.omani++;
        }
        deptMap.set(dept, entry);
      }

      const byDepartment = Array.from(deptMap.entries()).map(([dept, stats]) => ({
        department: dept,
        total: stats.total,
        omani: stats.omani,
        pct: stats.total > 0 ? Math.round((stats.omani / stats.total) * 100) : 0,
        meetsTarget: stats.total > 0 ? Math.round((stats.omani / stats.total) * 100) >= targetPct : false,
      }));

      return { total, omani, pct, targetPct, gap, byDepartment };
    }),

  // ── PASI Status ──────────────────────────────────────────────────────────────
  getPasiStatus: protectedProcedure
    .input(z.object({ companyId: z.number().optional(), month: z.number().optional(), year: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { employees: [], totalContribution: 0, status: "not_calculated" };

      const scope = await resolveStatsCompanyFilter(ctx.user as User, input.companyId);
      const now = new Date();
      const month = input.month ?? now.getMonth() + 1;
      const year = input.year ?? now.getFullYear();

      // Find latest payroll run for this period
      const conditions = [
        eq(payrollRuns.periodMonth, month),
        eq(payrollRuns.periodYear, year),
      ];
      if (!scope.aggregateAllTenants) conditions.push(eq(payrollRuns.companyId, scope.companyId));

      const [run] = await db
        .select()
        .from(payrollRuns)
        .where(and(...conditions))
        .orderBy(desc(payrollRuns.createdAt))
        .limit(1);

      if (!run) {
        return {
          employees: [],
          totalContribution: 0,
          status: "not_calculated",
          month,
          year,
        };
      }

      // Get line items with PASI deductions
      const lineItems = await db
        .select({
          employeeId: payrollLineItems.employeeId,
          basicSalary: payrollLineItems.basicSalary,
          pasiDeduction: payrollLineItems.pasiDeduction,
          status: payrollLineItems.status,
        })
        .from(payrollLineItems)
        .where(
          and(eq(payrollLineItems.payrollRunId, run.id), eq(payrollLineItems.companyId, run.companyId)),
        );

      const totalContribution = lineItems.reduce((s, l) => s + Number(l.pasiDeduction ?? 0), 0);

      return {
        employees: lineItems,
        totalContribution,
        status: run.status,
        month,
        year,
        runId: run.id,
      };
    }),

  // ── WPS Status ───────────────────────────────────────────────────────────────
  getWpsStatus: protectedProcedure
    .input(z.object({ companyId: z.number().optional(), month: z.number().optional(), year: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { status: "not_generated", wpsFileUrl: null, month: 0, year: 0 };

      const scope = await resolveStatsCompanyFilter(ctx.user as User, input.companyId);
      const now = new Date();
      const month = input.month ?? now.getMonth() + 1;
      const year = input.year ?? now.getFullYear();

      const conditions = [
        eq(payrollRuns.periodMonth, month),
        eq(payrollRuns.periodYear, year),
      ];
      if (!scope.aggregateAllTenants) conditions.push(eq(payrollRuns.companyId, scope.companyId));

      const [run] = await db
        .select({
          id: payrollRuns.id,
          status: payrollRuns.status,
          wpsFileUrl: payrollRuns.wpsFileUrl,
          wpsSubmittedAt: payrollRuns.wpsSubmittedAt,
          paidAt: payrollRuns.paidAt,
          totalNet: payrollRuns.totalNet,
          employeeCount: payrollRuns.employeeCount,
        })
        .from(payrollRuns)
        .where(and(...conditions))
        .orderBy(desc(payrollRuns.createdAt))
        .limit(1);

      if (!run) {
        return { status: "not_generated", wpsFileUrl: null, month, year };
      }

      let wpsStatus = "not_generated";
      if (run.wpsFileUrl) wpsStatus = "generated";
      if (run.wpsSubmittedAt) wpsStatus = "submitted";
      if (run.paidAt) wpsStatus = "paid";

      return {
        status: wpsStatus,
        wpsFileUrl: run.wpsFileUrl,
        wpsSubmittedAt: run.wpsSubmittedAt,
        paidAt: run.paidAt,
        totalNetOmr: Number(run.totalNet ?? 0),
        employeeCount: run.employeeCount,
        month,
        year,
        runId: run.id,
      };
    }),

  // ── Permit Matrix ────────────────────────────────────────────────────────────
  getPermitMatrix: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { byDepartment: [], summary: { valid: 0, expiring: 0, expired: 0, total: 0 } };

      const scope = await resolveStatsCompanyFilter(ctx.user as User, input.companyId);
      const now = new Date();
      const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const empConditions = [eq(employees.status, "active")];
      if (!scope.aggregateAllTenants) empConditions.push(eq(employees.companyId, scope.companyId));

      const allEmployees = await db
        .select({ id: employees.id, department: employees.department, firstName: employees.firstName, lastName: employees.lastName })
        .from(employees)
        .where(and(...empConditions));

      const empIds = allEmployees.map((e) => e.id);
      if (empIds.length === 0) {
        return { byDepartment: [], summary: { valid: 0, expiring: 0, expired: 0, total: 0 } };
      }

      const permitFilters = [
        eq(workPermits.permitStatus, "active"),
        inArray(workPermits.employeeId, empIds),
      ];
      if (!scope.aggregateAllTenants) permitFilters.push(eq(workPermits.companyId, scope.companyId));

      const permits = await db
        .select({
          employeeId: workPermits.employeeId,
          expiryDate: workPermits.expiryDate,
          permitStatus: workPermits.permitStatus,
        })
        .from(workPermits)
        .where(and(...permitFilters));

      const permitMap = new Map<number, { expiryDate: Date | null; status: string }>();
      for (const p of permits) {
        if (p.employeeId) permitMap.set(p.employeeId, { expiryDate: p.expiryDate, status: p.permitStatus });
      }

      // Build department matrix
      const deptMap = new Map<string, { valid: number; expiring: number; expired: number; noPermit: number }>();
      let totalValid = 0, totalExpiring = 0, totalExpired = 0;

      for (const emp of allEmployees) {
        const dept = emp.department ?? "Unassigned";
        const entry = deptMap.get(dept) ?? { valid: 0, expiring: 0, expired: 0, noPermit: 0 };
        const permit = permitMap.get(emp.id);

        if (!permit) {
          entry.noPermit++;
        } else if (!permit.expiryDate) {
          entry.valid++;
          totalValid++;
        } else if (permit.expiryDate < now) {
          entry.expired++;
          totalExpired++;
        } else if (permit.expiryDate <= in30Days) {
          entry.expiring++;
          totalExpiring++;
        } else {
          entry.valid++;
          totalValid++;
        }

        deptMap.set(dept, entry);
      }

      const byDepartment = Array.from(deptMap.entries()).map(([dept, stats]) => ({
        department: dept,
        ...stats,
        total: stats.valid + stats.expiring + stats.expired + stats.noPermit,
      }));

      return {
        byDepartment,
        summary: {
          valid: totalValid,
          expiring: totalExpiring,
          expired: totalExpired,
          total: allEmployees.length,
        },
      };
    }),

  // ── Overall Compliance Score ──────────────────────────────────────────────────
  getComplianceScore: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { score: 0, grade: "N/A", checks: [] };

      const scope = await resolveStatsCompanyFilter(ctx.user as User, input.companyId);
      const now = new Date();
      const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const checks: Array<{ id: string; name: string; status: "pass" | "warn" | "fail"; detail: string; weight: number; meta?: Record<string, number | string> }> = [];

      // 1. Omanisation check
      const empConditions = [eq(employees.status, "active")];
      if (!scope.aggregateAllTenants) empConditions.push(eq(employees.companyId, scope.companyId));
      const allEmps = await db.select({ nationality: employees.nationality }).from(employees).where(and(...empConditions));
      const total = allEmps.length;
      const omani = allEmps.filter((e) => e.nationality?.toLowerCase() === "omani" || e.nationality?.toLowerCase() === "om").length;
      const omanisationPct = total > 0 ? Math.round((omani / total) * 100) : 0;
      checks.push({
        id: "omanisation_quota",
        name: "Omanisation Quota",
        status: omanisationPct >= 35 ? "pass" : omanisationPct >= 25 ? "warn" : "fail",
        detail: `${omanisationPct}% Omani employees (target: 35%)`,
        weight: 30,
        meta: { pct: omanisationPct, target: 35 },
      });

      // 2. Work permit validity
      const expiredPermitCond = [
        eq(workPermits.permitStatus, "active"),
        lte(workPermits.expiryDate, now),
      ];
      if (!scope.aggregateAllTenants) expiredPermitCond.push(eq(workPermits.companyId, scope.companyId));
      const expiredPermits = await db
        .select({ cnt: count() })
        .from(workPermits)
        .where(and(...expiredPermitCond));
      const expiredCount = Number(expiredPermits[0]?.cnt ?? 0);
      checks.push({
        id: "work_permit_validity",
        name: "Work Permit Validity",
        status: expiredCount === 0 ? "pass" : expiredCount <= 2 ? "warn" : "fail",
        detail: expiredCount === 0 ? "All permits valid" : `${expiredCount} expired permit(s)`,
        weight: 25,
        meta: { count: expiredCount },
      });

      // 3. Expiring permits (30 days)
      const expiringPermitCond = [
        eq(workPermits.permitStatus, "active"),
        gte(workPermits.expiryDate, now),
        lte(workPermits.expiryDate, in30Days),
      ];
      if (!scope.aggregateAllTenants) expiringPermitCond.push(eq(workPermits.companyId, scope.companyId));
      const expiringPermits = await db
        .select({ cnt: count() })
        .from(workPermits)
        .where(and(...expiringPermitCond));
      const expiringCount = Number(expiringPermits[0]?.cnt ?? 0);
      checks.push({
        id: "upcoming_renewals",
        name: "Upcoming Renewals",
        status: expiringCount === 0 ? "pass" : expiringCount <= 3 ? "warn" : "fail",
        detail: expiringCount === 0 ? "No permits expiring in 30 days" : `${expiringCount} permit(s) expiring in 30 days`,
        weight: 20,
        meta: { count: expiringCount, days: 30 },
      });

      // 4. WPS compliance (current month payroll paid)
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      const payrollConditions = [
        eq(payrollRuns.periodMonth, currentMonth),
        eq(payrollRuns.periodYear, currentYear),
      ];
      if (!scope.aggregateAllTenants) payrollConditions.push(eq(payrollRuns.companyId, scope.companyId));
      const [latestRun] = await db
        .select({ status: payrollRuns.status, wpsFileUrl: payrollRuns.wpsFileUrl })
        .from(payrollRuns)
        .where(and(...payrollConditions))
        .orderBy(desc(payrollRuns.createdAt))
        .limit(1);

      const wpsVariant: string =
        latestRun?.status === "paid" ? "paid" : latestRun?.wpsFileUrl ? "file_ready" : "not_generated";
      checks.push({
        id: "wps_compliance",
        name: "WPS Compliance",
        status: latestRun?.status === "paid" ? "pass" : latestRun?.wpsFileUrl ? "warn" : "fail",
        detail: latestRun?.status === "paid" ? "Payroll paid via WPS" : latestRun?.wpsFileUrl ? "WPS file generated, pending payment" : "WPS file not generated for current month",
        weight: 25,
        meta: { variant: wpsVariant },
      });

      // Calculate overall score
      const score = checks.reduce((total, check) => {
        const points = check.status === "pass" ? check.weight : check.status === "warn" ? check.weight * 0.5 : 0;
        return total + points;
      }, 0);

      const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";

      return { score: Math.round(score), grade, checks };
    }),
});
