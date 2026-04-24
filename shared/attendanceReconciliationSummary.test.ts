/**
 * Pure tests for the reconciliation summary builder (Phase 5).
 * No database, no tRPC, no React.
 *
 * Covers all 12 scenarios in the Phase 5 spec:
 *  1. No action items → readiness ready
 *  2. Missing checkout → blocked
 *  3. Pending correction → blocked
 *  4. Pending manual check-in → blocked
 *  5. Schedule conflict → blocked
 *  6. Unscheduled attendance → blocked
 *  7. Holiday attendance only → needs_review
 *  8. Leave attendance only → needs_review
 *  9. Mixed blockers + review items → blocked
 * 10. Capability canLock / canExport logic
 * 11. Tenant isolation (employeesAffected counts distinct employees)
 * 12. Muscat period boundary helpers
 */
import { describe, expect, it } from "vitest";
import {
  buildReconciliationSummary,
  type BuildReconciliationSummaryParams,
  type ReconciliationPeriod,
} from "./attendanceReconciliationSummary";
import { buildAttendanceActionItems } from "./attendanceActionQueue";
import type { AttendanceDayStateResult } from "./attendanceStatus";
import { ATTENDANCE_REASON } from "./attendanceStatus";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const PERIOD: ReconciliationPeriod = {
  year: 2026,
  month: 4,
  startDate: "2026-04-01",
  endDate: "2026-04-30",
  timezone: "Asia/Muscat",
};

const FULL_CAPS = { canLockAttendancePeriod: true, canExportAttendanceReports: true };
const NO_CAPS = { canLockAttendancePeriod: false, canExportAttendanceReports: false };
const EXPORT_ONLY_CAPS = { canLockAttendancePeriod: false, canExportAttendanceReports: true };
const LOCK_ONLY_CAPS = { canLockAttendancePeriod: true, canExportAttendanceReports: false };

function resolvedState(overrides: Partial<AttendanceDayStateResult>): AttendanceDayStateResult {
  return { status: "checked_out", payrollReadiness: "ready", riskLevel: "none", reasonCodes: [], ...overrides };
}

function makeItems(date: string, empId: number, stateOverrides: Partial<AttendanceDayStateResult>) {
  return buildAttendanceActionItems({
    resolvedState: resolvedState(stateOverrides),
    attendanceDate: date,
    employeeId: empId,
    employeeName: `Employee ${empId}`,
    attendanceRecordId: empId * 100,
  });
}

function baseSummaryParams(
  allItems: ReturnType<typeof makeItems>,
  caps = FULL_CAPS,
  scheduledDays?: number,
): BuildReconciliationSummaryParams {
  return { period: PERIOD, allItems, caps, scheduledDays };
}

// ---------------------------------------------------------------------------
// 1. No action items → ready
// ---------------------------------------------------------------------------
describe("1. no action items → ready", () => {
  it("returns readinessStatus=ready with zero totals", () => {
    const summary = buildReconciliationSummary(baseSummaryParams([]));
    expect(summary.readinessStatus).toBe("ready");
    expect(summary.blockers).toHaveLength(0);
    expect(summary.reviewItems).toHaveLength(0);
    expect(summary.totals.payrollBlockingItems).toBe(0);
    expect(summary.totals.reviewItems).toBe(0);
    expect(summary.totals.employeesAffected).toBe(0);
  });

  it("reasonCodes is empty array", () => {
    const summary = buildReconciliationSummary(baseSummaryParams([]));
    expect(summary.reasonCodes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. Missing checkout → blocked
// ---------------------------------------------------------------------------
describe("2. missing checkout → blocked", () => {
  const items = makeItems("2026-04-10", 1, {
    status: "checked_in_on_time",
    payrollReadiness: "blocked_missing_checkout",
    riskLevel: "high",
    reasonCodes: [ATTENDANCE_REASON.MISSING_CHECKOUT],
  });

  it("readinessStatus is blocked", () => {
    const s = buildReconciliationSummary(baseSummaryParams(items));
    expect(s.readinessStatus).toBe("blocked");
  });

  it("item appears in blockers, not reviewItems", () => {
    const s = buildReconciliationSummary(baseSummaryParams(items));
    expect(s.blockers).toHaveLength(1);
    expect(s.reviewItems).toHaveLength(0);
    expect(s.blockers[0]!.category).toBe("missing_checkout");
  });

  it("totals.missingCheckouts = 1, payrollBlockingItems = 1", () => {
    const s = buildReconciliationSummary(baseSummaryParams(items));
    expect(s.totals.missingCheckouts).toBe(1);
    expect(s.totals.payrollBlockingItems).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 3. Pending correction → blocked
// ---------------------------------------------------------------------------
describe("3. pending correction → blocked", () => {
  const items = makeItems("2026-04-11", 2, {
    status: "checked_out",
    payrollReadiness: "blocked_pending_correction",
    reasonCodes: [ATTENDANCE_REASON.CORRECTION_PENDING],
  });

  it("readinessStatus is blocked", () => {
    expect(buildReconciliationSummary(baseSummaryParams(items)).readinessStatus).toBe("blocked");
  });

  it("totals.pendingCorrections = 1", () => {
    expect(buildReconciliationSummary(baseSummaryParams(items)).totals.pendingCorrections).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 4. Pending manual check-in → blocked
// ---------------------------------------------------------------------------
describe("4. pending manual check-in → blocked", () => {
  const items = makeItems("2026-04-12", 3, {
    status: "absent_pending",
    payrollReadiness: "blocked_pending_manual_checkin",
    riskLevel: "critical",
    reasonCodes: [ATTENDANCE_REASON.MANUAL_CHECKIN_PENDING],
  });

  it("readinessStatus is blocked", () => {
    expect(buildReconciliationSummary(baseSummaryParams(items)).readinessStatus).toBe("blocked");
  });

  it("totals.pendingManualCheckins = 1", () => {
    expect(buildReconciliationSummary(baseSummaryParams(items)).totals.pendingManualCheckins).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 5. Schedule conflict → blocked
// ---------------------------------------------------------------------------
describe("5. schedule conflict → blocked", () => {
  const items = makeItems("2026-04-13", 4, {
    status: "checked_in_on_time",
    payrollReadiness: "blocked_schedule_conflict",
    riskLevel: "high",
    reasonCodes: [ATTENDANCE_REASON.SCHEDULE_CONFLICT],
  });

  it("readinessStatus is blocked", () => {
    expect(buildReconciliationSummary(baseSummaryParams(items)).readinessStatus).toBe("blocked");
  });

  it("totals.scheduleConflicts = 1", () => {
    expect(buildReconciliationSummary(baseSummaryParams(items)).totals.scheduleConflicts).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 6. Unscheduled attendance → blocked (isPayrollBlocking=true per queue rules)
// ---------------------------------------------------------------------------
describe("6. unscheduled attendance → blocked", () => {
  const items = makeItems("2026-04-14", 5, {
    status: "unscheduled_attendance",
    payrollReadiness: "needs_review",
    riskLevel: "high",
    reasonCodes: [ATTENDANCE_REASON.NO_SCHEDULE, ATTENDANCE_REASON.UNSCHEDULED_ATTENDANCE],
  });

  it("readinessStatus is blocked (unscheduled is payroll-blocking)", () => {
    expect(buildReconciliationSummary(baseSummaryParams(items)).readinessStatus).toBe("blocked");
  });

  it("totals.unscheduledAttendance = 1", () => {
    expect(buildReconciliationSummary(baseSummaryParams(items)).totals.unscheduledAttendance).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 7. Holiday attendance only → needs_review
// ---------------------------------------------------------------------------
describe("7. holiday attendance only → needs_review", () => {
  const items = makeItems("2026-04-15", 6, {
    status: "holiday",
    payrollReadiness: "needs_review",
    riskLevel: "medium",
    reasonCodes: [ATTENDANCE_REASON.HOLIDAY, ATTENDANCE_REASON.ATTENDANCE_ON_HOLIDAY],
  });

  it("readinessStatus is needs_review", () => {
    expect(buildReconciliationSummary(baseSummaryParams(items)).readinessStatus).toBe("needs_review");
  });

  it("item appears in reviewItems, not blockers", () => {
    const s = buildReconciliationSummary(baseSummaryParams(items));
    expect(s.reviewItems).toHaveLength(1);
    expect(s.blockers).toHaveLength(0);
    expect(s.reviewItems[0]!.category).toBe("holiday_attendance");
  });

  it("totals.holidayAttendance = 1, excludedDays = 1", () => {
    const s = buildReconciliationSummary(baseSummaryParams(items));
    expect(s.totals.holidayAttendance).toBe(1);
    expect(s.totals.excludedDays).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 8. Leave attendance only → needs_review
// ---------------------------------------------------------------------------
describe("8. leave attendance only → needs_review", () => {
  const items = makeItems("2026-04-16", 7, {
    status: "leave",
    payrollReadiness: "needs_review",
    riskLevel: "medium",
    reasonCodes: [ATTENDANCE_REASON.LEAVE, ATTENDANCE_REASON.ATTENDANCE_DURING_LEAVE],
  });

  it("readinessStatus is needs_review", () => {
    expect(buildReconciliationSummary(baseSummaryParams(items)).readinessStatus).toBe("needs_review");
  });

  it("totals.leaveAttendance = 1, excludedDays = 1", () => {
    const s = buildReconciliationSummary(baseSummaryParams(items));
    expect(s.totals.leaveAttendance).toBe(1);
    expect(s.totals.excludedDays).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 9. Mixed blockers + review items → blocked
// ---------------------------------------------------------------------------
describe("9. mixed blockers + review items → blocked", () => {
  const blockingItems = makeItems("2026-04-17", 8, {
    status: "checked_in_on_time",
    payrollReadiness: "blocked_missing_checkout",
    riskLevel: "high",
    reasonCodes: [ATTENDANCE_REASON.MISSING_CHECKOUT],
  });
  const reviewOnlyItems = makeItems("2026-04-17", 9, {
    status: "holiday",
    payrollReadiness: "needs_review",
    riskLevel: "medium",
    reasonCodes: [ATTENDANCE_REASON.HOLIDAY, ATTENDANCE_REASON.ATTENDANCE_ON_HOLIDAY],
  });
  const allItems = [...blockingItems, ...reviewOnlyItems];

  it("readinessStatus is blocked even with review items present", () => {
    expect(buildReconciliationSummary(baseSummaryParams(allItems)).readinessStatus).toBe("blocked");
  });

  it("blockers and reviewItems are separated correctly", () => {
    const s = buildReconciliationSummary(baseSummaryParams(allItems));
    expect(s.blockers).toHaveLength(1);
    expect(s.reviewItems).toHaveLength(1);
    expect(s.blockers[0]!.category).toBe("missing_checkout");
    expect(s.reviewItems[0]!.category).toBe("holiday_attendance");
  });

  it("totals reflect both categories", () => {
    const s = buildReconciliationSummary(baseSummaryParams(allItems));
    expect(s.totals.payrollBlockingItems).toBe(1);
    expect(s.totals.reviewItems).toBe(1);
    expect(s.totals.missingCheckouts).toBe(1);
    expect(s.totals.holidayAttendance).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 10. Capability canLock / canExport logic
// ---------------------------------------------------------------------------
describe("10. capability gates", () => {
  it("canLock=true and canExportToPayroll=true when ready + full caps", () => {
    const s = buildReconciliationSummary(baseSummaryParams([], FULL_CAPS));
    expect(s.canLock).toBe(true);
    expect(s.canExportToPayroll).toBe(true);
  });

  it("canLock=false and canExportToPayroll=false when ready but no caps", () => {
    const s = buildReconciliationSummary(baseSummaryParams([], NO_CAPS));
    expect(s.canLock).toBe(false);
    expect(s.canExportToPayroll).toBe(false);
  });

  it("canLock=false when ready + export only", () => {
    const s = buildReconciliationSummary(baseSummaryParams([], EXPORT_ONLY_CAPS));
    expect(s.canLock).toBe(false);
    expect(s.canExportToPayroll).toBe(true);
  });

  it("canExportToPayroll=false when ready + lock only", () => {
    const s = buildReconciliationSummary(baseSummaryParams([], LOCK_ONLY_CAPS));
    expect(s.canLock).toBe(true);
    expect(s.canExportToPayroll).toBe(false);
  });

  it("canLock=false when blocked even with full caps", () => {
    const items = makeItems("2026-04-18", 10, {
      payrollReadiness: "blocked_missing_checkout",
      reasonCodes: [ATTENDANCE_REASON.MISSING_CHECKOUT],
    });
    const s = buildReconciliationSummary(baseSummaryParams(items, FULL_CAPS));
    expect(s.canLock).toBe(false);
    expect(s.canExportToPayroll).toBe(false);
  });

  it("canLock=false when needs_review even with full caps", () => {
    const items = makeItems("2026-04-19", 11, {
      status: "holiday",
      payrollReadiness: "needs_review",
      riskLevel: "medium",
      reasonCodes: [ATTENDANCE_REASON.HOLIDAY, ATTENDANCE_REASON.ATTENDANCE_ON_HOLIDAY],
    });
    const s = buildReconciliationSummary(baseSummaryParams(items, FULL_CAPS));
    expect(s.canLock).toBe(false);
    expect(s.canExportToPayroll).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 11. Tenant isolation (employeesAffected counts distinct employees)
// ---------------------------------------------------------------------------
describe("11. tenant isolation — distinct employees counted", () => {
  it("two items for the same employee count as 1 affected", () => {
    const itemsA = makeItems("2026-04-20", 42, {
      payrollReadiness: "blocked_missing_checkout",
      reasonCodes: [ATTENDANCE_REASON.MISSING_CHECKOUT],
    });
    const itemsB = makeItems("2026-04-21", 42, {
      payrollReadiness: "blocked_missing_checkout",
      reasonCodes: [ATTENDANCE_REASON.MISSING_CHECKOUT],
    });
    const s = buildReconciliationSummary(baseSummaryParams([...itemsA, ...itemsB], FULL_CAPS));
    expect(s.totals.employeesAffected).toBe(1);
    expect(s.totals.missingCheckouts).toBe(2);
  });

  it("items for two different employees count as 2 affected", () => {
    const itemsA = makeItems("2026-04-20", 10, {
      payrollReadiness: "blocked_missing_checkout",
      reasonCodes: [ATTENDANCE_REASON.MISSING_CHECKOUT],
    });
    const itemsB = makeItems("2026-04-20", 11, {
      payrollReadiness: "blocked_missing_checkout",
      reasonCodes: [ATTENDANCE_REASON.MISSING_CHECKOUT],
    });
    const s = buildReconciliationSummary(baseSummaryParams([...itemsA, ...itemsB], FULL_CAPS));
    expect(s.totals.employeesAffected).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 12. Muscat period boundary (period shape and readyDays calculation)
// ---------------------------------------------------------------------------
describe("12. Muscat period boundary and readyDays", () => {
  it("period carries Asia/Muscat timezone", () => {
    const s = buildReconciliationSummary(baseSummaryParams([], FULL_CAPS));
    expect(s.period.timezone).toBe("Asia/Muscat");
    expect(s.period.startDate).toBe("2026-04-01");
    expect(s.period.endDate).toBe("2026-04-30");
  });

  it("readyDays = scheduledDays - affected employee-days", () => {
    const items = makeItems("2026-04-22", 20, {
      payrollReadiness: "blocked_missing_checkout",
      reasonCodes: [ATTENDANCE_REASON.MISSING_CHECKOUT],
    });
    const s = buildReconciliationSummary({ ...baseSummaryParams(items, FULL_CAPS), scheduledDays: 10 });
    // 1 affected employee-day, 10 scheduled → 9 ready
    expect(s.totals.readyDays).toBe(9);
    expect(s.totals.scheduledDays).toBe(10);
  });

  it("readyDays is never negative", () => {
    const items = [
      ...makeItems("2026-04-23", 30, { payrollReadiness: "blocked_missing_checkout", reasonCodes: [ATTENDANCE_REASON.MISSING_CHECKOUT] }),
      ...makeItems("2026-04-24", 31, { payrollReadiness: "blocked_missing_checkout", reasonCodes: [ATTENDANCE_REASON.MISSING_CHECKOUT] }),
      ...makeItems("2026-04-25", 32, { payrollReadiness: "blocked_missing_checkout", reasonCodes: [ATTENDANCE_REASON.MISSING_CHECKOUT] }),
    ];
    const s = buildReconciliationSummary({ ...baseSummaryParams(items, FULL_CAPS), scheduledDays: 2 });
    // 3 affected days > 2 scheduled — should floor at 0
    expect(s.totals.readyDays).toBeGreaterThanOrEqual(0);
  });

  it("reasonCodes are deduplicated and sorted", () => {
    const items = [
      ...makeItems("2026-04-26", 40, {
        payrollReadiness: "blocked_missing_checkout",
        reasonCodes: [ATTENDANCE_REASON.MISSING_CHECKOUT, ATTENDANCE_REASON.CHECKED_IN_ON_TIME],
      }),
      ...makeItems("2026-04-26", 41, {
        payrollReadiness: "blocked_missing_checkout",
        reasonCodes: [ATTENDANCE_REASON.MISSING_CHECKOUT],
      }),
    ];
    const s = buildReconciliationSummary(baseSummaryParams(items, FULL_CAPS));
    expect(s.reasonCodes).toEqual([...new Set(s.reasonCodes)].sort());
    expect(s.reasonCodes).toContain(ATTENDANCE_REASON.MISSING_CHECKOUT);
  });
});
