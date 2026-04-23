import { eq, and, desc, sql, inArray, gte, lte, or, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { getDb } from "../db";
import {
  payrollRuns,
  payrollLineItems,
  employees,
  employeeSalaryConfigs,
  salaryLoans,
  kpiAchievements,
  companies,
  attendanceSessions,
  employeeSchedules,
  companyHolidays,
} from "../../drizzle/schema";
import {
  roundOmr,
  pasiEmployeeFromGross,
  isOmaniNationality,
  hourlyRateFromBasic,
  computeOvertimePay,
} from "./payrollExecution";
import {
  buildPayrollStoredPreflightSnapshot,
  evaluatePayrollAttendanceGate,
  evaluatePayrollPreflight,
  runAttendanceReconciliation,
} from "../attendanceReconciliation";
import {
  muscatCalendarWeekdaySun0ForYmd,
  muscatDaysInCalendarMonth,
  muscatMonthUtcRangeExclusiveEnd,
} from "@shared/attendanceMuscatTime";

type PayrollDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/**
 * When `process.env.PAYROLL_EXECUTE_INJECT_FAILURE_AFTER` equals this value, `executeMonthlyPayroll` throws
 * right after the first `payroll_line_items` insert so MySQL integration tests can assert full rollback.
 */
export const PAYROLL_EXECUTE_INJECT_FAILURE_AFTER_LINE_INSERT = "line_insert" as const;

export function monthYmdRange(year: number, month: number) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${year}-${pad(month)}-01`;
  const lastDay = muscatDaysInCalendarMonth(year, month);
  const end = `${year}-${pad(month)}-${pad(lastDay)}`;
  return { start, end, lastDay };
}

function hireCalendarYmd(hire: Date | string | null | undefined): string | null {
  if (hire == null) return null;
  if (hire instanceof Date) return hire.toISOString().slice(0, 10);
  const s = String(hire);
  return s.length >= 10 ? s.slice(0, 10) : null;
}

function pickSalaryConfigForPeriod(
  configs: (typeof employeeSalaryConfigs.$inferSelect)[],
  employeeId: number,
  periodStartUtc: Date,
  periodEndExclusiveUtc: Date,
) {
  const candidates = configs.filter((c) => c.employeeId === employeeId);
  const ok = candidates.filter((c) => {
    const from = c.effectiveFrom ? new Date(c.effectiveFrom) : null;
    const to = c.effectiveTo ? new Date(c.effectiveTo) : null;
    if (!from || from >= periodEndExclusiveUtc) return false;
    if (to && to < periodStartUtc) return false;
    return true;
  });
  if (!ok.length) return null;
  ok.sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());
  return ok[0];
}

/** Expected workdays in a Muscat calendar month from schedules + holidays (weekday in Asia/Muscat). */
export function countExpectedWorkdaysInMonth(
  emp: { userId: number | null; hireDate: Date | string | null },
  schedules: (typeof employeeSchedules.$inferSelect)[],
  holidayDates: Set<string>,
  year: number,
  month: number,
): number {
  const lastDay = muscatDaysInCalendarMonth(year, month);
  const hireYmd = hireCalendarYmd(emp.hireDate ?? null);
  const monthStartStr = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEndStr = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const mine = schedules.filter(
    (s) =>
      s.employeeUserId === emp.userId &&
      s.isActive &&
      s.startDate <= monthEndStr &&
      (!s.endDate || s.endDate >= monthStartStr),
  );
  const workingDaysStr = mine.length ? mine[0].workingDays : "0,1,2,3,4";
  const wdSet = new Set(workingDaysStr.split(",").map(Number));
  let expected = 0;
  for (let d = 1; d <= lastDay; d++) {
    const ymd = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (hireYmd && ymd < hireYmd) continue;
    if (holidayDates.has(ymd)) continue;
    if (!wdSet.has(muscatCalendarWeekdaySun0ForYmd(ymd))) continue;
    expected++;
  }
  return mine.length ? expected : 22;
}

const BLOCKED_RERUN_STATUSES = new Set(["locked", "paid", "approved"]);

/**
 * Monthly payroll run — single authoritative path.
 *
 * **Transactional integrity:** The entire block below runs inside `db.transaction`. Any thrown error after
 * reconciliation passes (including mid–line-item loop) rolls back inserts/updates/deletes for this call — no
 * partial authoritative payroll, totals, or snapshot. (Verify in staging with a deliberate throw if needed.)
 */
export async function executeMonthlyPayroll(
  db: PayrollDb,
  params: {
    companyId: number;
    month: number;
    year: number;
    actorUserId: number;
    /** Set true only after HR review when `attendance.reconciliationPreflight` reports warnings (and scan is complete). */
    acknowledgeAttendanceReconciliationWarnings?: boolean;
  },
) {
  const { companyId, month, year, actorUserId, acknowledgeAttendanceReconciliationWarnings = false } = params;

  return await db.transaction(async (tx) => {
    const { start, end } = monthYmdRange(year, month);
    const { startUtc: periodStartUtc, endExclusiveUtc: periodEndExclusiveUtc } = muscatMonthUtcRangeExclusiveEnd(
      year,
      month,
    );

    const [company] = await tx.select().from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found" });
    if (company.status !== "active") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Company is inactive" });
    }

    const [existingRun] = await tx
      .select()
      .from(payrollRuns)
      .where(and(eq(payrollRuns.companyId, companyId), eq(payrollRuns.periodMonth, month), eq(payrollRuns.periodYear, year)))
      .limit(1);

    if (existingRun && BLOCKED_RERUN_STATUSES.has(existingRun.status)) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `Payroll for ${month}/${year} is ${existingRun.status} and cannot be re-executed`,
      });
    }

    const holidayRows = await tx
      .select({ d: companyHolidays.holidayDate })
      .from(companyHolidays)
      .where(and(eq(companyHolidays.companyId, companyId), gte(companyHolidays.holidayDate, start), lte(companyHolidays.holidayDate, end)));
    const holidayDates = new Set(holidayRows.map((h) => String(h.d)));

    const empList = await tx
      .select()
      .from(employees)
      .where(
        and(
          eq(employees.companyId, companyId),
          eq(employees.status, "active"),
          or(isNull(employees.hireDate), lte(employees.hireDate, periodStartUtc)),
        ),
      );

    if (!empList.length) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "No active employees in company" });
    }

    const attendanceReconReport = await runAttendanceReconciliation(tx as never, {
      companyId,
      fromYmd: start,
      toYmd: end,
    });
    const attendancePreflight = evaluatePayrollPreflight(attendanceReconReport.mismatches);
    const attendanceGate = evaluatePayrollAttendanceGate(
      attendancePreflight,
      acknowledgeAttendanceReconciliationWarnings,
      attendanceReconReport,
    );
    if (!attendanceGate.allow) {
      throw new TRPCError({ code: "BAD_REQUEST", message: attendanceGate.message });
    }

    const attendancePreflightSnapshotJson = buildPayrollStoredPreflightSnapshot(
      attendanceReconReport,
      attendancePreflight,
      {
        actorUserId,
        warningsAcknowledged:
          attendancePreflight.decision === "warnings" && Boolean(acknowledgeAttendanceReconciliationWarnings),
      },
    );

    const userIds = empList.map((e) => e.userId).filter((u): u is number => u != null);
    const schedules =
      userIds.length > 0
        ? await tx
            .select()
            .from(employeeSchedules)
            .where(and(eq(employeeSchedules.companyId, companyId), inArray(employeeSchedules.employeeUserId, userIds)))
        : [];

    let sumExpected = 0;
    let sumRecorded = 0;
    const empIds = empList.map((e) => e.id);
    const attAgg = await tx
      .select({
        employeeId: attendanceSessions.employeeId,
        c: sql<string>`COUNT(DISTINCT ${attendanceSessions.businessDate})`,
      })
      .from(attendanceSessions)
      .where(
        and(
          eq(attendanceSessions.companyId, companyId),
          eq(attendanceSessions.status, "closed"),
          gte(attendanceSessions.businessDate, start),
          lte(attendanceSessions.businessDate, end),
          inArray(attendanceSessions.employeeId, empIds),
        ),
      )
      .groupBy(attendanceSessions.employeeId);
    const recordedDaysByEmp = new Map<number, number>();
    for (const r of attAgg) {
      recordedDaysByEmp.set(r.employeeId, Number(r.c ?? 0));
    }

    for (const emp of empList) {
      const expected = countExpectedWorkdaysInMonth(emp, schedules, holidayDates, year, month);
      sumExpected += expected;
      sumRecorded += recordedDaysByEmp.get(emp.id) ?? 0;
    }

    if (sumExpected > 0 && sumRecorded / sumExpected < 0.5) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Attendance data is incomplete: ${((sumRecorded / sumExpected) * 100).toFixed(0)}% of expected workdays recorded (minimum 50%)`,
      });
    }

    const salaryConfigs = await tx
      .select()
      .from(employeeSalaryConfigs)
      .where(eq(employeeSalaryConfigs.companyId, companyId))
      .orderBy(desc(employeeSalaryConfigs.effectiveFrom));

    let activeLoans = await tx
      .select()
      .from(salaryLoans)
      .where(and(eq(salaryLoans.companyId, companyId), eq(salaryLoans.status, "active")));

    const kpiCommissionRows = await tx
      .select({
        employeeUserId: kpiAchievements.employeeUserId,
        totalCommission: sql<string>`SUM(${kpiAchievements.commissionEarned})`,
      })
      .from(kpiAchievements)
      .where(and(eq(kpiAchievements.companyId, companyId), eq(kpiAchievements.periodYear, year), eq(kpiAchievements.periodMonth, month)))
      .groupBy(kpiAchievements.employeeUserId);
    const commissionByUserId = new Map(kpiCommissionRows.map((r) => [r.employeeUserId, roundOmr(Number(r.totalCommission ?? 0))]));

    const sessionRows = await tx
      .select()
      .from(attendanceSessions)
      .where(
        and(
          eq(attendanceSessions.companyId, companyId),
          eq(attendanceSessions.status, "closed"),
          gte(attendanceSessions.businessDate, start),
          lte(attendanceSessions.businessDate, end),
          sql`${attendanceSessions.checkOutAt} IS NOT NULL`,
          inArray(attendanceSessions.employeeId, empIds),
        ),
      );

    const sessionsByEmployee = new Map<number, typeof sessionRows>();
    for (const s of sessionRows) {
      const arr = sessionsByEmployee.get(s.employeeId) ?? [];
      arr.push(s);
      sessionsByEmployee.set(s.employeeId, arr);
    }

    let runId: number;
    if (existingRun) {
      runId = existingRun.id;
      const oldLines = await tx.select().from(payrollLineItems).where(eq(payrollLineItems.payrollRunId, runId));
      for (const line of oldLines) {
        const ld = roundOmr(Number(line.loanDeduction ?? 0));
        if (ld <= 0) continue;
        const loan = activeLoans.find((l) => l.employeeId === line.employeeId);
        if (loan) {
          const newBal = roundOmr(Number(loan.balanceRemaining) + ld);
          await tx
            .update(salaryLoans)
            .set({ balanceRemaining: String(newBal), status: "active" })
            .where(eq(salaryLoans.id, loan.id));
        }
      }
      await tx.delete(payrollLineItems).where(eq(payrollLineItems.payrollRunId, runId));
      activeLoans = await tx
        .select()
        .from(salaryLoans)
        .where(and(eq(salaryLoans.companyId, companyId), eq(salaryLoans.status, "active")));
    } else {
      const [runResult] = await tx.insert(payrollRuns).values({
        companyId,
        periodMonth: month,
        periodYear: year,
        status: "pending_execution",
        employeeCount: empList.length,
        notes: null,
        createdByUserId: actorUserId,
        previewOnly: false,
      });
      runId = (runResult as { insertId: number }).insertId;
    }

    const warnings: Array<{ employeeId: number; message: string }> = [];
    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    let injectedFailureAfterFirstPayrollLine = false;

    const today = new Date();
    const horizon90 = new Date(today.getTime() + 90 * 86400000);

    for (const emp of empList) {
      const cfg = pickSalaryConfigForPeriod(salaryConfigs, emp.id, periodStartUtc, periodEndExclusiveUtc);
      const basic = cfg ? Number(cfg.basicSalary) : Number(emp.salary ?? 0);
      const housing = cfg ? Number(cfg.housingAllowance) : 0;
      const transport = cfg ? Number(cfg.transportAllowance) : 0;
      const otherAllowances = cfg ? Number(cfg.otherAllowances) : 0;
      const commissionPay = emp.userId != null ? (commissionByUserId.get(emp.userId) ?? 0) : 0;

      const hourly = hourlyRateFromBasic(basic);
      const empSessions = (sessionsByEmployee.get(emp.id) ?? []).map((s) => ({
        checkIn: new Date(s.checkInAt!),
        checkOut: s.checkOutAt ? new Date(s.checkOutAt) : null,
      }));
      const overtimePay = computeOvertimePay(empSessions, hourly);

      const grossBeforePasi = roundOmr(basic + housing + transport + otherAllowances + overtimePay + commissionPay);
      const isOmani = isOmaniNationality(emp.nationality);
      const pasi = pasiEmployeeFromGross(grossBeforePasi, isOmani);

      const incomeTaxRate = cfg ? Number(cfg.incomeTaxRate ?? 0) : 0;
      const incomeTax = incomeTaxRate > 0 ? roundOmr((grossBeforePasi * incomeTaxRate) / 100) : 0;

      const empLoan = activeLoans.find((l) => l.employeeId === emp.id);
      const loanDeduction = empLoan ? Math.min(Number(empLoan.monthlyDeduction), Number(empLoan.balanceRemaining)) : 0;

      const dailyRate = basic / 26;
      const expectedDays = countExpectedWorkdaysInMonth(emp, schedules, holidayDates, year, month);
      const presentDays = recordedDaysByEmp.get(emp.id) ?? 0;
      const rawAbsent = Math.max(0, expectedDays - presentDays);
      const absenceDeduction = roundOmr(rawAbsent * dailyRate);

      const otherDeductions = 0;
      const grossSalary = grossBeforePasi;
      const totalDed = roundOmr(pasi + incomeTax + loanDeduction + absenceDeduction + otherDeductions);
      const net = roundOmr(grossSalary - totalDed);

      totalGross += grossSalary;
      totalDeductions += totalDed;
      totalNet += net;

      if (emp.workPermitExpiryDate) {
        const d = new Date(emp.workPermitExpiryDate);
        if (d <= horizon90) {
          warnings.push({
            employeeId: emp.id,
            message: `Work permit expires ${String(emp.workPermitExpiryDate).slice(0, 10)}`,
          });
        }
      }
      if (emp.visaExpiryDate) {
        const d = new Date(emp.visaExpiryDate);
        if (d <= horizon90) {
          warnings.push({
            employeeId: emp.id,
            message: `Visa expires ${String(emp.visaExpiryDate).slice(0, 10)}`,
          });
        }
      }
      if (presentDays === 0) {
        warnings.push({ employeeId: emp.id, message: "No attendance records this month" });
      }

      await tx.insert(payrollLineItems).values({
        payrollRunId: runId,
        companyId,
        employeeId: emp.id,
        basicSalary: String(roundOmr(basic)),
        housingAllowance: String(roundOmr(housing)),
        transportAllowance: String(roundOmr(transport)),
        otherAllowances: String(roundOmr(otherAllowances)),
        overtimePay: String(roundOmr(overtimePay)),
        commissionPay: String(roundOmr(commissionPay)),
        grossSalary: String(grossSalary),
        pasiDeduction: String(pasi),
        incomeTax: String(incomeTax),
        loanDeduction: String(roundOmr(loanDeduction)),
        absenceDeduction: String(absenceDeduction),
        otherDeductions: String(otherDeductions),
        totalDeductions: String(totalDed),
        netSalary: String(net),
        bankAccount: emp.bankAccountNumber ?? undefined,
        bankName: emp.bankName ?? undefined,
      });

      if (
        process.env.PAYROLL_EXECUTE_INJECT_FAILURE_AFTER === PAYROLL_EXECUTE_INJECT_FAILURE_AFTER_LINE_INSERT &&
        !injectedFailureAfterFirstPayrollLine
      ) {
        injectedFailureAfterFirstPayrollLine = true;
        throw new Error("integration: injected failure after first payroll line insert");
      }

      if (empLoan && loanDeduction > 0) {
        const newBalance = Math.max(0, roundOmr(Number(empLoan.balanceRemaining) - loanDeduction));
        await tx
          .update(salaryLoans)
          .set({ balanceRemaining: String(newBalance), status: newBalance <= 0 ? "completed" : "active" })
          .where(eq(salaryLoans.id, empLoan.id));
        empLoan.balanceRemaining = String(newBalance);
        empLoan.status = newBalance <= 0 ? "completed" : "active";
      }
    }

    await tx
      .update(payrollRuns)
      .set({
        status: "pending_execution",
        employeeCount: empList.length,
        totalGross: String(roundOmr(totalGross)),
        totalDeductions: String(roundOmr(totalDeductions)),
        totalNet: String(roundOmr(totalNet)),
        createdByUserId: actorUserId,
        attendancePreflightSnapshot: attendancePreflightSnapshotJson,
        previewOnly: false,
      })
      .where(eq(payrollRuns.id, runId));

    const [finalRun] = await tx.select().from(payrollRuns).where(eq(payrollRuns.id, runId)).limit(1);

    return {
      payrollRunId: runId,
      totalAmount: roundOmr(totalNet),
      employeeCount: empList.length,
      warnings,
      status: "pending_execution" as const,
      createdAt: (finalRun?.createdAt ?? new Date()).toISOString(),
      attendancePreflight: {
        decision: attendancePreflight.decision,
        blockingCount: attendanceReconReport.blockingCount,
        warningCount: attendanceReconReport.warningCount,
        recordsScanMayBeIncomplete: attendanceReconReport.recordsScanMayBeIncomplete,
        recordsLoadCap: attendanceReconReport.recordsLoadCap,
        warningsAcknowledged:
          attendancePreflight.decision === "warnings" && Boolean(acknowledgeAttendanceReconciliationWarnings),
      },
    };
  });
}
