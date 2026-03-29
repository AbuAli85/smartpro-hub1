import { z } from "zod";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import {
  employees,
  workPermits,
  payrollRuns,
  payrollLineItems,
} from "../../drizzle/schema";
import { eq, and, gte, lte, count, sum, sql, desc } from "drizzle-orm";
import { getActiveCompanyMembership } from "../_core/membership";

async function resolveCompanyId(user: { id: number; role: string; platformRole?: string | null }): Promise<number | null> {
  if (canAccessGlobalAdminProcedures(user)) return null;
  const m = await getActiveCompanyMembership(user.id);
  return m?.companyId ?? null;
}

export const complianceRouter = router({
  // ── Omanisation Stats ────────────────────────────────────────────────────────
  getOmanisationStats: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { total: 0, omani: 0, pct: 0, targetPct: 35, gap: 0, byDepartment: [] };

      const companyId = input.companyId ?? await resolveCompanyId(ctx.user);

      const conditions = [eq(employees.status, "active")];
      if (companyId) conditions.push(eq(employees.companyId, companyId));

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

      const companyId = input.companyId ?? await resolveCompanyId(ctx.user);
      const now = new Date();
      const month = input.month ?? now.getMonth() + 1;
      const year = input.year ?? now.getFullYear();

      // Find latest payroll run for this period
      const conditions = [
        eq(payrollRuns.periodMonth, month),
        eq(payrollRuns.periodYear, year),
      ];
      if (companyId) conditions.push(eq(payrollRuns.companyId, companyId));

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
        .where(eq(payrollLineItems.payrollRunId, run.id));

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

      const companyId = input.companyId ?? await resolveCompanyId(ctx.user);
      const now = new Date();
      const month = input.month ?? now.getMonth() + 1;
      const year = input.year ?? now.getFullYear();

      const conditions = [
        eq(payrollRuns.periodMonth, month),
        eq(payrollRuns.periodYear, year),
      ];
      if (companyId) conditions.push(eq(payrollRuns.companyId, companyId));

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

      const companyId = input.companyId ?? await resolveCompanyId(ctx.user);
      const now = new Date();
      const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const empConditions = [eq(employees.status, "active")];
      if (companyId) empConditions.push(eq(employees.companyId, companyId));

      const allEmployees = await db
        .select({ id: employees.id, department: employees.department, firstName: employees.firstName, lastName: employees.lastName })
        .from(employees)
        .where(and(...empConditions));

      const empIds = allEmployees.map((e) => e.id);
      if (empIds.length === 0) {
        return { byDepartment: [], summary: { valid: 0, expiring: 0, expired: 0, total: 0 } };
      }

      // Get work permits for these employees
      const permits = await db
        .select({
          employeeId: workPermits.employeeId,
          expiryDate: workPermits.expiryDate,
          permitStatus: workPermits.permitStatus,
        })
        .from(workPermits)
        .where(eq(workPermits.permitStatus, "active"));

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

      const companyId = input.companyId ?? await resolveCompanyId(ctx.user);
      const now = new Date();
      const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const checks: Array<{ name: string; status: "pass" | "warn" | "fail"; detail: string; weight: number }> = [];

      // 1. Omanisation check
      const empConditions = [eq(employees.status, "active")];
      if (companyId) empConditions.push(eq(employees.companyId, companyId));
      const allEmps = await db.select({ nationality: employees.nationality }).from(employees).where(and(...empConditions));
      const total = allEmps.length;
      const omani = allEmps.filter((e) => e.nationality?.toLowerCase() === "omani" || e.nationality?.toLowerCase() === "om").length;
      const omanisationPct = total > 0 ? Math.round((omani / total) * 100) : 0;
      checks.push({
        name: "Omanisation Quota",
        status: omanisationPct >= 35 ? "pass" : omanisationPct >= 25 ? "warn" : "fail",
        detail: `${omanisationPct}% Omani employees (target: 35%)`,
        weight: 30,
      });

      // 2. Work permit validity
      const expiredPermits = await db
        .select({ cnt: count() })
        .from(workPermits)
        .where(and(eq(workPermits.permitStatus, "active"), lte(workPermits.expiryDate, now)));
      const expiredCount = Number(expiredPermits[0]?.cnt ?? 0);
      checks.push({
        name: "Work Permit Validity",
        status: expiredCount === 0 ? "pass" : expiredCount <= 2 ? "warn" : "fail",
        detail: expiredCount === 0 ? "All permits valid" : `${expiredCount} expired permit(s)`,
        weight: 25,
      });

      // 3. Expiring permits (30 days)
      const expiringPermits = await db
        .select({ cnt: count() })
        .from(workPermits)
        .where(and(eq(workPermits.permitStatus, "active"), gte(workPermits.expiryDate, now), lte(workPermits.expiryDate, in30Days)));
      const expiringCount = Number(expiringPermits[0]?.cnt ?? 0);
      checks.push({
        name: "Upcoming Renewals",
        status: expiringCount === 0 ? "pass" : expiringCount <= 3 ? "warn" : "fail",
        detail: expiringCount === 0 ? "No permits expiring in 30 days" : `${expiringCount} permit(s) expiring in 30 days`,
        weight: 20,
      });

      // 4. WPS compliance (current month payroll paid)
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      const payrollConditions = [
        eq(payrollRuns.periodMonth, currentMonth),
        eq(payrollRuns.periodYear, currentYear),
      ];
      if (companyId) payrollConditions.push(eq(payrollRuns.companyId, companyId));
      const [latestRun] = await db
        .select({ status: payrollRuns.status, wpsFileUrl: payrollRuns.wpsFileUrl })
        .from(payrollRuns)
        .where(and(...payrollConditions))
        .orderBy(desc(payrollRuns.createdAt))
        .limit(1);

      checks.push({
        name: "WPS Compliance",
        status: latestRun?.status === "paid" ? "pass" : latestRun?.wpsFileUrl ? "warn" : "fail",
        detail: latestRun?.status === "paid" ? "Payroll paid via WPS" : latestRun?.wpsFileUrl ? "WPS file generated, pending payment" : "WPS file not generated for current month",
        weight: 25,
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
