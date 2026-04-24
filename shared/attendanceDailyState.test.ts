/**
 * Pure unit tests for the Phase 9A daily attendance state builder.
 *
 * No database, no tRPC, no React.
 * All time values are expressed as Muscat wall-clock strings ("HH:MM:SS") and
 * converted to UTC via muscatWallDateTimeToUtc — the same helper used in
 * production resolvers.
 *
 * Canonical date: BIZ = "2026-04-24" (Friday, DOW 5)
 * Shift window used across most tests: 09:00–17:00, 15-min grace.
 */
import { describe, expect, it } from "vitest";
import { muscatWallDateTimeToUtc } from "./attendanceMuscatTime";
import {
  buildDailyAttendanceState,
  type DailyAttendanceStateInput,
  type ResolvedScheduleEntry,
} from "./attendanceDailyState";
import { ATTENDANCE_REASON } from "./attendanceStatus";

const BIZ = "2026-04-24";
const CID = 1;
const EID = 42;

/** Build a UTC Date from a Muscat wall-clock time string on BIZ. */
function m(hhmmss: string): Date {
  return muscatWallDateTimeToUtc(BIZ, hhmmss);
}

/** A healthy schedule entry (scheduled, shift + site both resolved). */
const GOOD_SCHEDULE: ResolvedScheduleEntry = {
  id: 10,
  shiftTemplateId: 5,
  siteId: 3,
  shiftStartTime: "09:00",
  shiftEndTime: "17:00",
  gracePeriodMinutes: 15,
  siteExists: true,
};

/** Minimal base input shared by most tests. */
const BASE: DailyAttendanceStateInput = {
  companyId: CID,
  employeeId: EID,
  employeeName: "Ahmed Al-Balushi",
  attendanceDate: BIZ,
  activeSchedules: [GOOD_SCHEDULE],
  checkInAt: null,
  checkOutAt: null,
  hasOpenSession: false,
  hasOfficialRecord: false,
  isHoliday: false,
  isOnLeave: false,
  hasPendingCorrection: false,
  hasPendingManualCheckin: false,
  employeeActive: true,
};

// ---------------------------------------------------------------------------
// 1. Scheduled employee, before shift window → no punch
// ---------------------------------------------------------------------------
describe("1. scheduled employee, no punch before shift window", () => {
  it("returns upcoming status and excluded payroll when now is before check-in window opens", () => {
    const state = buildDailyAttendanceState({ ...BASE, now: m("08:00:00") });
    expect(state.scheduleState).toBe("scheduled");
    expect(state.canonicalStatus).toBe("upcoming");
    expect(state.payrollReadiness).toBe("excluded");
    expect(state.riskLevel).toBe("none");
    expect(state.actionItems).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Scheduled employee, checked in on time
// ---------------------------------------------------------------------------
describe("2. scheduled employee, checked in on time", () => {
  it("returns checked_in_on_time + ready payroll when check-in is within grace", () => {
    const state = buildDailyAttendanceState({
      ...BASE,
      now: m("09:10:00"),
      checkInAt: m("09:05:00"), // within 15-min grace
    });
    expect(state.scheduleState).toBe("scheduled");
    expect(state.canonicalStatus).toBe("checked_in_on_time");
    expect(state.payrollReadiness).toBe("ready");
    expect(state.riskLevel).toBe("none");
    expect(state.reasonCodes).toContain(ATTENDANCE_REASON.CHECKED_IN_ON_TIME);
    expect(state.actionItems).toHaveLength(0);
    expect(state.checkInAt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 3. Scheduled employee, checked in late
// ---------------------------------------------------------------------------
describe("3. scheduled employee, checked in late", () => {
  it("returns checked_in_late + ready payroll when check-in is after grace window", () => {
    const state = buildDailyAttendanceState({
      ...BASE,
      now: m("10:00:00"),
      checkInAt: m("09:30:00"), // 30 min after shift start, grace = 15 min
    });
    expect(state.canonicalStatus).toBe("checked_in_late");
    expect(state.payrollReadiness).toBe("ready");
    expect(state.riskLevel).toBe("medium");
    expect(state.reasonCodes).toContain(ATTENDANCE_REASON.CHECKED_IN_LATE);
    expect(state.actionItems).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Scheduled employee, checked in + checked out
// ---------------------------------------------------------------------------
describe("4. scheduled employee, checked in and checked out", () => {
  it("returns checked_out + ready payroll when both timestamps exist", () => {
    const state = buildDailyAttendanceState({
      ...BASE,
      now: m("17:30:00"),
      checkInAt: m("09:00:00"),
      checkOutAt: m("17:00:00"),
    });
    expect(state.canonicalStatus).toBe("checked_out");
    expect(state.payrollReadiness).toBe("ready");
    expect(state.riskLevel).toBe("none");
    expect(state.checkOutAt).toBeDefined();
    expect(state.actionItems).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Open session past shift end → missing checkout action item
// ---------------------------------------------------------------------------
describe("5. open session past shift end → missing checkout", () => {
  it("returns blocked_missing_checkout with a missing_checkout action item", () => {
    const state = buildDailyAttendanceState({
      ...BASE,
      now: m("18:00:00"),     // after 17:00 shift end
      checkInAt: m("09:00:00"),
      checkOutAt: null,       // session still open
      hasOpenSession: true,
    });
    expect(state.payrollReadiness).toBe("blocked_missing_checkout");
    expect(state.reasonCodes).toContain(ATTENDANCE_REASON.MISSING_CHECKOUT);
    expect(state.actionItems).toHaveLength(1);
    expect(state.actionItems[0].category).toBe("missing_checkout");
    expect(state.actionItems[0].isPayrollBlocking).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. No schedule + no evidence → not_scheduled
// ---------------------------------------------------------------------------
describe("6. no schedule + no evidence → not_scheduled", () => {
  it("returns not_scheduled + excluded when no schedules and no attendance exist", () => {
    const state = buildDailyAttendanceState({
      ...BASE,
      now: m("10:00:00"),
      activeSchedules: [],
    });
    expect(state.scheduleState).toBe("not_scheduled");
    expect(state.canonicalStatus).toBe("not_scheduled");
    expect(state.payrollReadiness).toBe("excluded");
    expect(state.riskLevel).toBe("none");
    expect(state.actionItems).toHaveLength(0);
    expect(state.scheduleId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 7. No schedule + attendance evidence → unscheduled_attendance (payroll-blocking)
// ---------------------------------------------------------------------------
describe("7. no schedule + attendance evidence → unscheduled_attendance", () => {
  it("returns unscheduled_attendance + needs_review + blocking action item", () => {
    const state = buildDailyAttendanceState({
      ...BASE,
      now: m("10:00:00"),
      activeSchedules: [],
      checkInAt: m("09:00:00"),
      hasOpenSession: true,
    });
    expect(state.scheduleState).toBe("not_scheduled");
    expect(state.canonicalStatus).toBe("unscheduled_attendance");
    expect(state.payrollReadiness).toBe("needs_review");
    expect(state.riskLevel).toBe("high");
    expect(state.actionItems).toHaveLength(1);
    expect(state.actionItems[0].category).toBe("unscheduled_attendance");
    expect(state.actionItems[0].isPayrollBlocking).toBe(true);
    expect(state.reasonCodes).toContain(ATTENDANCE_REASON.UNSCHEDULED_ATTENDANCE);
  });
});

// ---------------------------------------------------------------------------
// 8. Multiple active schedules → conflict (payroll-blocking)
// ---------------------------------------------------------------------------
describe("8. multiple active schedules → conflict", () => {
  it("returns conflict scheduleState + blocked_schedule_conflict + schedule_conflict action item", () => {
    const secondSchedule: ResolvedScheduleEntry = {
      ...GOOD_SCHEDULE,
      id: 11,
      shiftTemplateId: 6,
      shiftStartTime: "14:00",
      shiftEndTime: "22:00",
    };
    const state = buildDailyAttendanceState({
      ...BASE,
      now: m("09:05:00"),
      activeSchedules: [GOOD_SCHEDULE, secondSchedule],
    });
    expect(state.scheduleState).toBe("conflict");
    expect(state.payrollReadiness).toBe("blocked_schedule_conflict");
    expect(state.actionItems).toHaveLength(1);
    expect(state.actionItems[0].category).toBe("schedule_conflict");
    expect(state.actionItems[0].isPayrollBlocking).toBe(true);
    expect(state.reasonCodes).toContain(ATTENDANCE_REASON.SCHEDULE_CONFLICT);
  });
});

// ---------------------------------------------------------------------------
// 9. Holiday without attendance → excluded, no action items
// ---------------------------------------------------------------------------
describe("9. holiday without attendance → excluded", () => {
  it("returns holiday status + excluded payroll + no action items", () => {
    const state = buildDailyAttendanceState({
      ...BASE,
      now: m("10:00:00"),
      isHoliday: true,
    });
    expect(state.isHoliday).toBe(true);
    expect(state.canonicalStatus).toBe("holiday");
    expect(state.payrollReadiness).toBe("excluded");
    expect(state.riskLevel).toBe("none");
    expect(state.actionItems).toHaveLength(0);
    expect(state.reasonCodes).toContain(ATTENDANCE_REASON.HOLIDAY);
    expect(state.reasonCodes).not.toContain(ATTENDANCE_REASON.ATTENDANCE_ON_HOLIDAY);
  });
});

// ---------------------------------------------------------------------------
// 10. Holiday WITH attendance → review action
// ---------------------------------------------------------------------------
describe("10. holiday with attendance → review action", () => {
  it("returns holiday status + needs_review + holiday_attendance action item", () => {
    const state = buildDailyAttendanceState({
      ...BASE,
      now: m("10:00:00"),
      isHoliday: true,
      checkInAt: m("09:00:00"),
    });
    expect(state.canonicalStatus).toBe("holiday");
    expect(state.payrollReadiness).toBe("needs_review");
    expect(state.riskLevel).toBe("medium");
    expect(state.reasonCodes).toContain(ATTENDANCE_REASON.ATTENDANCE_ON_HOLIDAY);
    expect(state.actionItems).toHaveLength(1);
    expect(state.actionItems[0].category).toBe("holiday_attendance");
    expect(state.actionItems[0].isPayrollBlocking).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 11. Leave without attendance → excluded, no action items
// ---------------------------------------------------------------------------
describe("11. leave without attendance → excluded", () => {
  it("returns leave status + excluded payroll + no action items", () => {
    const state = buildDailyAttendanceState({
      ...BASE,
      now: m("10:00:00"),
      isOnLeave: true,
    });
    expect(state.isOnLeave).toBe(true);
    expect(state.canonicalStatus).toBe("leave");
    expect(state.payrollReadiness).toBe("excluded");
    expect(state.riskLevel).toBe("none");
    expect(state.actionItems).toHaveLength(0);
    expect(state.reasonCodes).toContain(ATTENDANCE_REASON.LEAVE);
  });
});

// ---------------------------------------------------------------------------
// 12. Leave WITH attendance → review action
// ---------------------------------------------------------------------------
describe("12. leave with attendance → review action", () => {
  it("returns leave status + needs_review + leave_attendance action item", () => {
    const state = buildDailyAttendanceState({
      ...BASE,
      now: m("10:00:00"),
      isOnLeave: true,
      checkInAt: m("09:00:00"),
    });
    expect(state.canonicalStatus).toBe("leave");
    expect(state.payrollReadiness).toBe("needs_review");
    expect(state.reasonCodes).toContain(ATTENDANCE_REASON.ATTENDANCE_DURING_LEAVE);
    expect(state.actionItems).toHaveLength(1);
    expect(state.actionItems[0].category).toBe("leave_attendance");
    expect(state.actionItems[0].isPayrollBlocking).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 13. Pending correction → blocked_pending_correction
// ---------------------------------------------------------------------------
describe("13. pending correction → blocked", () => {
  it("returns blocked_pending_correction + pending_correction action item", () => {
    const state = buildDailyAttendanceState({
      ...BASE,
      now: m("17:30:00"),
      checkInAt: m("09:00:00"),
      checkOutAt: m("17:00:00"),
      hasPendingCorrection: true,
    });
    expect(state.payrollReadiness).toBe("blocked_pending_correction");
    expect(state.reasonCodes).toContain(ATTENDANCE_REASON.CORRECTION_PENDING);
    expect(state.hasPendingCorrection).toBe(true);
    expect(state.actionItems).toHaveLength(1);
    expect(state.actionItems[0].category).toBe("pending_correction");
    expect(state.actionItems[0].isPayrollBlocking).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 14. Pending manual check-in request → blocked_pending_manual_checkin
// ---------------------------------------------------------------------------
describe("14. pending manual check-in → blocked", () => {
  it("returns blocked_pending_manual_checkin + pending_manual_checkin action item", () => {
    const state = buildDailyAttendanceState({
      ...BASE,
      now: m("18:00:00"), // shift ended, no check-in, but manual request pending
      checkInAt: null,
      hasPendingManualCheckin: true,
    });
    expect(state.payrollReadiness).toBe("blocked_pending_manual_checkin");
    expect(state.hasPendingManualCheckin).toBe(true);
    expect(state.canonicalStatus).toBe("absent_pending");
    expect(state.actionItems).toHaveLength(1);
    expect(state.actionItems[0].category).toBe("pending_manual_checkin");
    expect(state.actionItems[0].isPayrollBlocking).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 15. Inactive employee with attendance evidence → needs_review + high risk
// ---------------------------------------------------------------------------
describe("15. inactive/suspended employee with attendance", () => {
  it("returns inactive_employee scheduleState + needs_review + high risk + manual_review action", () => {
    const state = buildDailyAttendanceState({
      ...BASE,
      now: m("10:00:00"),
      employeeActive: false,
      checkInAt: m("09:00:00"),
      hasOpenSession: true,
    });
    expect(state.scheduleState).toBe("inactive_employee");
    expect(state.canonicalStatus).toBe("needs_review");
    expect(state.payrollReadiness).toBe("needs_review");
    expect(state.riskLevel).toBe("high");
    expect(state.reasonCodes).toContain(ATTENDANCE_REASON.EMPLOYEE_SUSPENDED);
    expect(state.actionItems).toHaveLength(1);
    expect(state.actionItems[0].category).toBe("manual_review");
  });
});

// ---------------------------------------------------------------------------
// 16. Muscat boundary — date must not drift across timezone
// ---------------------------------------------------------------------------
describe("16. Muscat boundary date does not drift", () => {
  it("correctly resolves for a shift starting at 00:30 Muscat (UTC 20:30 previous day)", () => {
    // Overnight shift: 23:00–07:00 next day
    const nightSchedule: ResolvedScheduleEntry = {
      id: 20,
      shiftTemplateId: 9,
      siteId: 3,
      shiftStartTime: "23:00",
      shiftEndTime: "07:00",
      gracePeriodMinutes: 15,
      siteExists: true,
    };
    // now = 23:10 Muscat on BIZ (shift started at 23:00, within grace)
    const nowMst = muscatWallDateTimeToUtc(BIZ, "23:10:00");
    const state = buildDailyAttendanceState({
      ...BASE,
      now: nowMst,
      attendanceDate: BIZ,
      activeSchedules: [nightSchedule],
    });
    // Should see shift as active/awaiting, not "future" — depends on exact nowMs
    expect(["awaiting_check_in", "checked_in_on_time"]).toContain(state.canonicalStatus);
    expect(state.scheduleState).toBe("scheduled");
    // Payroll should not be "excluded" (upcoming or future)
    expect(state.payrollReadiness).not.toBe("excluded");
  });

  it("company-day for 00:30 UTC+4 is still the same date as Muscat midnight", () => {
    // 00:30 Muscat = 20:30 UTC previous day — the Muscat date is still BIZ
    const muscatMidnight = muscatWallDateTimeToUtc(BIZ, "00:30:00");
    // Building state for BIZ from UTC instant that would be "yesterday" in UTC
    const state = buildDailyAttendanceState({
      ...BASE,
      now: muscatMidnight,
      attendanceDate: BIZ,
      activeSchedules: [GOOD_SCHEDULE], // 09:00 start
    });
    // At 00:30 Muscat, shift hasn't started yet → upcoming
    expect(state.canonicalStatus).toBe("upcoming");
    expect(state.scheduleState).toBe("scheduled");
  });
});
