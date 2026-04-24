/**
 * Pure tests for the attendance action queue builder (Phase 4).
 * No database, no tRPC, no React.
 */
import { describe, expect, it } from "vitest";
import {
  buildAttendanceActionItems,
  hasPayrollBlockingItems,
  type BuildAttendanceActionItemsParams,
} from "./attendanceActionQueue";
import type { AttendanceDayStateResult } from "./attendanceStatus";
import { ATTENDANCE_REASON } from "./attendanceStatus";

const DATE = "2026-04-24";
const EMP_ID = 42;
const EMP_NAME = "Ali Hassan";
const REC_ID = 100;
const SCH_ID = 7;

/** Helper: construct a fully-resolved state. */
function state(overrides: Partial<AttendanceDayStateResult>): AttendanceDayStateResult {
  return {
    status: "checked_out",
    payrollReadiness: "ready",
    riskLevel: "none",
    reasonCodes: [],
    ...overrides,
  };
}

/** Helper: standard params wrapper. */
function params(overrides: Partial<BuildAttendanceActionItemsParams>): BuildAttendanceActionItemsParams {
  return {
    resolvedState: state({}),
    attendanceDate: DATE,
    employeeId: EMP_ID,
    employeeName: EMP_NAME,
    attendanceRecordId: REC_ID,
    scheduleId: SCH_ID,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Missing checkout → high, payroll-blocking
// ---------------------------------------------------------------------------
describe("1. missing checkout", () => {
  it("creates one high payroll-blocking item", () => {
    const items = buildAttendanceActionItems(
      params({
        resolvedState: state({
          status: "checked_in_on_time",
          payrollReadiness: "blocked_missing_checkout",
          riskLevel: "high",
          reasonCodes: [ATTENDANCE_REASON.CHECKED_IN_ON_TIME, ATTENDANCE_REASON.MISSING_CHECKOUT],
        }),
      }),
    );
    expect(items).toHaveLength(1);
    const [item] = items;
    expect(item.category).toBe("missing_checkout");
    expect(item.severity).toBe("high");
    expect(item.isPayrollBlocking).toBe(true);
    expect(item.ctaHref).toBe("today");
  });
});

// ---------------------------------------------------------------------------
// 2. Pending correction → high, payroll-blocking
// ---------------------------------------------------------------------------
describe("2. pending correction", () => {
  it("creates one high payroll-blocking item", () => {
    const items = buildAttendanceActionItems(
      params({
        resolvedState: state({
          status: "checked_out",
          payrollReadiness: "blocked_pending_correction",
          riskLevel: "none",
          reasonCodes: [ATTENDANCE_REASON.CORRECTION_PENDING],
        }),
      }),
    );
    expect(items).toHaveLength(1);
    const [item] = items;
    expect(item.category).toBe("pending_correction");
    expect(item.severity).toBe("high");
    expect(item.isPayrollBlocking).toBe(true);
    expect(item.ctaHref).toBe("corrections");
  });
});

// ---------------------------------------------------------------------------
// 3. Pending manual check-in → high, payroll-blocking
// ---------------------------------------------------------------------------
describe("3. pending manual check-in", () => {
  it("creates one high payroll-blocking item", () => {
    const items = buildAttendanceActionItems(
      params({
        resolvedState: state({
          status: "absent_pending",
          payrollReadiness: "blocked_pending_manual_checkin",
          riskLevel: "critical",
          reasonCodes: [ATTENDANCE_REASON.SHIFT_ENDED_NO_CHECKIN, ATTENDANCE_REASON.MANUAL_CHECKIN_PENDING],
        }),
      }),
    );
    expect(items).toHaveLength(1);
    const [item] = items;
    expect(item.category).toBe("pending_manual_checkin");
    expect(item.severity).toBe("high");
    expect(item.isPayrollBlocking).toBe(true);
    expect(item.ctaHref).toBe("manual");
  });

  it("does NOT also add absent_pending item when manual check-in is already included", () => {
    const items = buildAttendanceActionItems(
      params({
        resolvedState: state({
          status: "absent_pending",
          payrollReadiness: "blocked_pending_manual_checkin",
          riskLevel: "critical",
          reasonCodes: [ATTENDANCE_REASON.SHIFT_ENDED_NO_CHECKIN, ATTENDANCE_REASON.MANUAL_CHECKIN_PENDING],
        }),
      }),
    );
    const categories = items.map((i) => i.category);
    expect(categories).not.toContain("absent_pending");
  });
});

// ---------------------------------------------------------------------------
// 4. Schedule conflict → critical, payroll-blocking
// ---------------------------------------------------------------------------
describe("4. schedule conflict", () => {
  it("creates one critical payroll-blocking item", () => {
    const items = buildAttendanceActionItems(
      params({
        resolvedState: state({
          status: "checked_in_on_time",
          payrollReadiness: "blocked_schedule_conflict",
          riskLevel: "high",
          reasonCodes: [ATTENDANCE_REASON.SCHEDULE_CONFLICT],
        }),
      }),
    );
    expect(items).toHaveLength(1);
    const [item] = items;
    expect(item.category).toBe("schedule_conflict");
    expect(item.severity).toBe("critical");
    expect(item.isPayrollBlocking).toBe(true);
    expect(item.ctaHref).toBe("today");
  });
});

// ---------------------------------------------------------------------------
// 5. Attendance on holiday → medium, not payroll-blocking
// ---------------------------------------------------------------------------
describe("5. attendance on holiday", () => {
  it("creates one medium review item that is NOT payroll-blocking", () => {
    const items = buildAttendanceActionItems(
      params({
        resolvedState: state({
          status: "holiday",
          payrollReadiness: "needs_review",
          riskLevel: "medium",
          reasonCodes: [ATTENDANCE_REASON.HOLIDAY, ATTENDANCE_REASON.ATTENDANCE_ON_HOLIDAY],
        }),
      }),
    );
    expect(items.some((i) => i.category === "holiday_attendance")).toBe(true);
    const item = items.find((i) => i.category === "holiday_attendance")!;
    expect(item.severity).toBe("medium");
    expect(item.isPayrollBlocking).toBe(false);
    expect(item.ctaHref).toBe("records");
  });
});

// ---------------------------------------------------------------------------
// 6. Attendance during leave → medium, not payroll-blocking
// ---------------------------------------------------------------------------
describe("6. attendance during leave", () => {
  it("creates one medium review item that is NOT payroll-blocking", () => {
    const items = buildAttendanceActionItems(
      params({
        resolvedState: state({
          status: "leave",
          payrollReadiness: "needs_review",
          riskLevel: "medium",
          reasonCodes: [ATTENDANCE_REASON.LEAVE, ATTENDANCE_REASON.ATTENDANCE_DURING_LEAVE],
        }),
      }),
    );
    expect(items.some((i) => i.category === "leave_attendance")).toBe(true);
    const item = items.find((i) => i.category === "leave_attendance")!;
    expect(item.severity).toBe("medium");
    expect(item.isPayrollBlocking).toBe(false);
    expect(item.ctaHref).toBe("records");
  });
});

// ---------------------------------------------------------------------------
// 7. late_no_arrival → high, not payroll-blocking
// ---------------------------------------------------------------------------
describe("7. late_no_arrival", () => {
  it("creates one high item that is NOT payroll-blocking", () => {
    const items = buildAttendanceActionItems(
      params({
        resolvedState: state({
          status: "late_no_arrival",
          payrollReadiness: "ready",
          riskLevel: "high",
          reasonCodes: [ATTENDANCE_REASON.PAST_GRACE_NO_CHECKIN],
        }),
      }),
    );
    expect(items).toHaveLength(1);
    const [item] = items;
    expect(item.category).toBe("late_no_arrival");
    expect(item.severity).toBe("high");
    expect(item.isPayrollBlocking).toBe(false);
    expect(item.ctaHref).toBe("today");
  });
});

// ---------------------------------------------------------------------------
// 8. absent_pending (no manual) → high, not payroll-blocking
// ---------------------------------------------------------------------------
describe("8. absent_pending without manual request", () => {
  it("creates one absent_pending item", () => {
    const items = buildAttendanceActionItems(
      params({
        resolvedState: state({
          status: "absent_pending",
          payrollReadiness: "needs_review",
          riskLevel: "critical",
          reasonCodes: [ATTENDANCE_REASON.SHIFT_ENDED_NO_CHECKIN],
        }),
      }),
    );
    expect(items).toHaveLength(1);
    const [item] = items;
    expect(item.category).toBe("absent_pending");
    expect(item.severity).toBe("high");
    expect(item.isPayrollBlocking).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 9. unscheduled_attendance → high, payroll-blocking
// ---------------------------------------------------------------------------
describe("9. unscheduled_attendance", () => {
  it("creates one high payroll-blocking item", () => {
    const items = buildAttendanceActionItems(
      params({
        resolvedState: state({
          status: "unscheduled_attendance",
          payrollReadiness: "needs_review",
          riskLevel: "high",
          reasonCodes: [ATTENDANCE_REASON.NO_SCHEDULE, ATTENDANCE_REASON.UNSCHEDULED_ATTENDANCE],
        }),
      }),
    );
    expect(items).toHaveLength(1);
    const [item] = items;
    expect(item.category).toBe("unscheduled_attendance");
    expect(item.severity).toBe("high");
    expect(item.isPayrollBlocking).toBe(true);
    expect(item.ctaHref).toBe("records");
  });
});

// ---------------------------------------------------------------------------
// 10. not_scheduled → no items
// ---------------------------------------------------------------------------
describe("10. not_scheduled produces no items", () => {
  it("returns empty array", () => {
    const items = buildAttendanceActionItems(
      params({
        resolvedState: state({
          status: "not_scheduled",
          payrollReadiness: "excluded",
          riskLevel: "none",
          reasonCodes: [ATTENDANCE_REASON.NO_SCHEDULE],
        }),
      }),
    );
    expect(items).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 11. ready/checked_out → no items
// ---------------------------------------------------------------------------
describe("11. ready/checked_out produces no items", () => {
  it("returns empty array for ready checked-out shift", () => {
    const items = buildAttendanceActionItems(
      params({
        resolvedState: state({
          status: "checked_out",
          payrollReadiness: "ready",
          riskLevel: "none",
          reasonCodes: [ATTENDANCE_REASON.CHECKED_OUT, ATTENDANCE_REASON.CHECKED_IN_ON_TIME],
        }),
      }),
    );
    expect(items).toHaveLength(0);
  });

  it("returns empty array for upcoming shift", () => {
    const items = buildAttendanceActionItems(
      params({
        resolvedState: state({
          status: "upcoming",
          payrollReadiness: "excluded",
          riskLevel: "none",
          reasonCodes: [ATTENDANCE_REASON.SHIFT_UPCOMING],
        }),
      }),
    );
    expect(items).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 12. Multiple reason codes → deterministic priority/order
// ---------------------------------------------------------------------------
describe("12. Multiple reason codes produce deterministic order", () => {
  it("schedule_conflict comes before missing_checkout in the output", () => {
    // If somehow both were present (e.g., schedule conflict + open session),
    // critical should precede high.
    const items = buildAttendanceActionItems(
      params({
        resolvedState: state({
          status: "checked_in_on_time",
          payrollReadiness: "blocked_schedule_conflict",
          riskLevel: "high",
          reasonCodes: [ATTENDANCE_REASON.SCHEDULE_CONFLICT, ATTENDANCE_REASON.CHECKED_IN_ON_TIME],
        }),
      }),
    );
    // Only one payroll-blocking category is produced per payrollReadiness value
    expect(items[0]?.category).toBe("schedule_conflict");
  });

  it("holiday_attendance and leave_attendance are sorted deterministically", () => {
    // Both ATTENDANCE_ON_HOLIDAY and ATTENDANCE_DURING_LEAVE in reasonCodes
    const items = buildAttendanceActionItems(
      params({
        resolvedState: state({
          status: "holiday",
          payrollReadiness: "needs_review",
          riskLevel: "medium",
          reasonCodes: [
            ATTENDANCE_REASON.HOLIDAY,
            ATTENDANCE_REASON.ATTENDANCE_ON_HOLIDAY,
            ATTENDANCE_REASON.LEAVE,
            ATTENDANCE_REASON.ATTENDANCE_DURING_LEAVE,
          ],
        }),
      }),
    );
    expect(items).toHaveLength(2);
    // Both are "medium" severity — sorted alphabetically by category
    const categories = items.map((i) => i.category);
    // "holiday_attendance" < "leave_attendance" alphabetically
    expect(categories).toEqual(["holiday_attendance", "leave_attendance"]);
  });

  it("hasPayrollBlockingItems returns true when any item blocks payroll", () => {
    const items = buildAttendanceActionItems(
      params({
        resolvedState: state({
          status: "checked_in_on_time",
          payrollReadiness: "blocked_missing_checkout",
          riskLevel: "high",
          reasonCodes: [ATTENDANCE_REASON.MISSING_CHECKOUT],
        }),
      }),
    );
    expect(hasPayrollBlockingItems(items)).toBe(true);
  });

  it("hasPayrollBlockingItems returns false for review-only items", () => {
    const items = buildAttendanceActionItems(
      params({
        resolvedState: state({
          status: "late_no_arrival",
          payrollReadiness: "ready",
          riskLevel: "high",
          reasonCodes: [ATTENDANCE_REASON.PAST_GRACE_NO_CHECKIN],
        }),
      }),
    );
    expect(hasPayrollBlockingItems(items)).toBe(false);
  });

  it("item IDs are deterministic and include date + employee context", () => {
    const items = buildAttendanceActionItems(
      params({
        resolvedState: state({
          status: "late_no_arrival",
          payrollReadiness: "ready",
          riskLevel: "high",
          reasonCodes: [ATTENDANCE_REASON.PAST_GRACE_NO_CHECKIN],
        }),
      }),
    );
    expect(items[0]?.id).toContain(DATE);
    expect(items[0]?.id).toContain(String(EMP_ID));
  });
});
