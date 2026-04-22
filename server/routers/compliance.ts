import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  employees,
  workPermits,
  payrollRuns,
  payrollLineItems,
  attendanceRecords,
  employeeSchedules,
  shiftTemplates,
} from "../../drizzle/schema";
import { eq, and, gte, lte, lt, count, inArray, desc, isNotNull } from "drizzle-orm";
import { resolveStatsCompanyFilter } from "../_core/tenant";
import type { User } from "../../drizzle/schema";
import { muscatCalendarYmdFromUtcInstant, muscatMonthUtcRangeExclusiveEnd } from "@shared/attendanceMuscatTime";

/** Oman Labour Law Art. 68 — maximum working hours per day (exclusive of breaks). */
const OMAN_MAX_DAILY_HOURS = 9;
const OMAN_MAX_DAILY_MINUTES = OMAN_MAX_DAILY_HOURS * 60; // 540

/** Minutes above cap that constitute an overtime day (allow 5-min buffer for clock drift). */
const OVERTIME_THRESHOLD_MINUTES = OMAN_MAX_DAILY_MINUTES + 5; // 545

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

  /**
   * Oman Labour Law overtime compliance: flags employees whose daily worked
   * duration (check-out minus check-in, minus shift break) exceeds 9 hours
   * in the requested period.
   *
   * Only closed punches are evaluated (check_out IS NOT NULL).
   * Break minutes are taken from the linked shift template where available;
   * defaults to 0 if not linked (conservative — more flags, not fewer).
   *
   * The requested `YYYY-MM` selects punches by **Muscat calendar month** on `check_in` (same window as payroll/billing).
   */
  getOvertimeFlags: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        month: z.string().regex(/^\d{4}-\d{2}$/).optional(), // YYYY-MM; defaults to current month
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { month: "", flags: [], summary: { totalViolationDays: 0, affectedEmployees: 0 } };

      const scope = await resolveStatsCompanyFilter(ctx.user as User, input.companyId);

      const now = new Date();
      const monthStr = input.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const [yStr, mStr] = monthStr.split("-");
      const year = Number(yStr);
      const month = Number(mStr);
      const { startUtc: punchWindowStartUtc, endExclusiveUtc: punchWindowEndExclusiveUtc } =
        muscatMonthUtcRangeExclusiveEnd(year, month);

      // Load closed punches for the period
      const recConds = [
        gte(attendanceRecords.checkIn, punchWindowStartUtc),
        lt(attendanceRecords.checkIn, punchWindowEndExclusiveUtc),
        isNotNull(attendanceRecords.checkOut),
      ];
      if (!scope.aggregateAllTenants) recConds.push(eq(attendanceRecords.companyId, scope.companyId));

      const records = await db
        .select({
          id: attendanceRecords.id,
          employeeId: attendanceRecords.employeeId,
          checkIn: attendanceRecords.checkIn,
          checkOut: attendanceRecords.checkOut,
          scheduleId: attendanceRecords.scheduleId,
        })
        .from(attendanceRecords)
        .where(and(...recConds));

      if (records.length === 0) {
        return { month: monthStr, flags: [], summary: { totalViolationDays: 0, affectedEmployees: 0 } };
      }

      // Batch-load shift templates to get breakMinutes
      const scheduleIds = [...new Set(records.map((r) => r.scheduleId).filter((id): id is number => id != null))];
      const schedules = scheduleIds.length
        ? await db
            .select({ id: employeeSchedules.id, shiftTemplateId: employeeSchedules.shiftTemplateId })
            .from(employeeSchedules)
            .where(inArray(employeeSchedules.id, scheduleIds))
        : [];
      const templateIds = [...new Set(schedules.map((s) => s.shiftTemplateId))];
      const shiftRows = templateIds.length
        ? await db
            .select({ id: shiftTemplates.id, breakMinutes: shiftTemplates.breakMinutes })
            .from(shiftTemplates)
            .where(inArray(shiftTemplates.id, templateIds))
        : [];
      const breakByTemplateId = new Map(shiftRows.map((s) => [s.id, s.breakMinutes ?? 0]));
      const templateByScheduleId = new Map(schedules.map((s) => [s.id, s.shiftTemplateId]));

      // Batch-load employee names
      const empIds = [...new Set(records.map((r) => r.employeeId))];
      const empConds = [inArray(employees.id, empIds)];
      if (!scope.aggregateAllTenants) empConds.push(eq(employees.companyId, scope.companyId));
      const empRows = await db
        .select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName })
        .from(employees)
        .where(and(...empConds));
      const empById = new Map(empRows.map((e) => [e.id, e]));

      // Flag days where worked minutes (gross - break) > threshold
      type OvertimeFlag = {
        employeeId: number;
        employeeName: string;
        date: string; // Muscat calendar date YYYY-MM-DD
        grossMinutes: number; // raw punch duration
        breakMinutes: number; // from shift template or 0
        netMinutes: number; // grossMinutes - breakMinutes
        overtimeMinutes: number; // net - 540
        recordId: number;
      };

      const flags: OvertimeFlag[] = [];

      for (const rec of records) {
        if (!rec.checkOut) continue;
        const gross = Math.max(
          0,
          Math.round((new Date(rec.checkOut).getTime() - new Date(rec.checkIn).getTime()) / 60000),
        );
        const templateId = rec.scheduleId != null ? templateByScheduleId.get(rec.scheduleId) : null;
        const breakMins = templateId != null ? (breakByTemplateId.get(templateId) ?? 0) : 0;
        const net = Math.max(0, gross - breakMins);

        if (net > OVERTIME_THRESHOLD_MINUTES) {
          const dateYmd = muscatCalendarYmdFromUtcInstant(new Date(rec.checkIn));
          const emp = empById.get(rec.employeeId);
          flags.push({
            employeeId: rec.employeeId,
            employeeName: emp ? `${emp.firstName} ${emp.lastName}`.trim() : `Employee #${rec.employeeId}`,
            date: dateYmd,
            grossMinutes: gross,
            breakMinutes: breakMins,
            netMinutes: net,
            overtimeMinutes: net - OMAN_MAX_DAILY_MINUTES,
            recordId: rec.id,
          });
        }
      }

      // Sort: most overtime first
      flags.sort((a, b) => b.overtimeMinutes - a.overtimeMinutes);

      const affectedEmployees = new Set(flags.map((f) => f.employeeId)).size;

      return {
        month: monthStr,
        flags,
        summary: {
          totalViolationDays: flags.length,
          affectedEmployees,
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
        weight: 25,
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
        weight: 20,
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
        weight: 20,
        meta: { variant: wpsVariant },
      });

      // 5. Daily hours cap (Oman Labour Law Art. 68 — max 9 hours/day excl. break)
      const scoreNow = new Date();
      const scoreYmd = muscatCalendarYmdFromUtcInstant(scoreNow);
      const [scoreYStr, scoreMStr] = scoreYmd.split("-");
      const scoreY = Number(scoreYStr);
      const scoreM = Number(scoreMStr);
      const { startUtc: scorePunchStartUtc, endExclusiveUtc: scorePunchEndExclusiveUtc } =
        muscatMonthUtcRangeExclusiveEnd(scoreY, scoreM);

      const currentMonthConds = [
        gte(attendanceRecords.checkIn, scorePunchStartUtc),
        lt(attendanceRecords.checkIn, scorePunchEndExclusiveUtc),
        isNotNull(attendanceRecords.checkOut),
      ];
      if (!scope.aggregateAllTenants) currentMonthConds.push(eq(attendanceRecords.companyId, scope.companyId));

      const monthlyRecords = await db
        .select({
          checkIn: attendanceRecords.checkIn,
          checkOut: attendanceRecords.checkOut,
          scheduleId: attendanceRecords.scheduleId,
        })
        .from(attendanceRecords)
        .where(and(...currentMonthConds));

      let overtimeDays = 0;
      if (monthlyRecords.length > 0) {
        const scoreScheduleIds = [
          ...new Set(monthlyRecords.map((r) => r.scheduleId).filter((id): id is number => id != null)),
        ];
        const scoreSchedules = scoreScheduleIds.length
          ? await db
              .select({ id: employeeSchedules.id, shiftTemplateId: employeeSchedules.shiftTemplateId })
              .from(employeeSchedules)
              .where(inArray(employeeSchedules.id, scoreScheduleIds))
          : [];
        const scoreTemplateIds = [...new Set(scoreSchedules.map((s) => s.shiftTemplateId))];
        const scoreShiftRows = scoreTemplateIds.length
          ? await db
              .select({ id: shiftTemplates.id, breakMinutes: shiftTemplates.breakMinutes })
              .from(shiftTemplates)
              .where(inArray(shiftTemplates.id, scoreTemplateIds))
          : [];
        const scoreBreakByTemplateId = new Map(scoreShiftRows.map((s) => [s.id, s.breakMinutes ?? 0]));
        const scoreTemplateByScheduleId = new Map(scoreSchedules.map((s) => [s.id, s.shiftTemplateId]));

        for (const r of monthlyRecords) {
          if (!r.checkOut) continue;
          const gross = Math.round(
            (new Date(r.checkOut).getTime() - new Date(r.checkIn).getTime()) / 60000,
          );
          const templateId = r.scheduleId != null ? scoreTemplateByScheduleId.get(r.scheduleId) : null;
          const breakMins = templateId != null ? (scoreBreakByTemplateId.get(templateId) ?? 0) : 0;
          const net = Math.max(0, gross - breakMins);
          if (net > OVERTIME_THRESHOLD_MINUTES) overtimeDays++;
        }
      }

      checks.push({
        id: "daily_hours_cap",
        name: "Daily Hours Cap (Art. 68)",
        status: overtimeDays === 0 ? "pass" : overtimeDays <= 3 ? "warn" : "fail",
        detail:
          overtimeDays === 0
            ? "No employees exceeded 9 hours/day this month"
            : `${overtimeDays} day(s) exceeded the 9-hour daily limit this month`,
        weight: 15,
        meta: { count: overtimeDays, threshold: OMAN_MAX_DAILY_HOURS },
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
