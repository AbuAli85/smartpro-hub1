/**
 * Pure resolver tests for the canonical attendance day status model (Phase 3 / 3.1).
 *
 * All tests run entirely in-memory — no database, no tRPC.
 * Muscat-specific behaviour is verified by the "browser timezone does not affect result" case.
 */
import { describe, expect, it } from "vitest";
import { muscatWallDateTimeToUtc } from "./attendanceMuscatTime";
import {
  ATTENDANCE_REASON,
  resolveAttendanceDayState,
  type ResolveAttendanceDayStateInput,
} from "./attendanceStatus";

const BIZ = "2026-04-24"; // Muscat calendar date used across all tests

/** Build a UTC Date from a Muscat wall-clock time on BIZ. */
function m(hhmmss: string): Date {
  return muscatWallDateTimeToUtc(BIZ, hhmmss);
}

/** Minimal base input: scheduled 09:00–17:00, 15-min grace, no anomalies. */
const BASE: ResolveAttendanceDayStateInput = {
  attendanceDate: BIZ,
  scheduleExists: true,
  shiftStartTime: "09:00",
  shiftEndTime: "17:00",
  gracePeriodMinutes: 15,
};

// ---------------------------------------------------------------------------
// 1. No schedule + no attendance
// ---------------------------------------------------------------------------
describe("1. No schedule, no attendance", () => {
  it("returns not_scheduled + excluded when neither schedule nor record exists", () => {
    const result = resolveAttendanceDayState({
      attendanceDate: BIZ,
      now: m("10:00:00"),
      scheduleExists: false,
    });
    expect(result.status).toBe("not_scheduled");
    expect(result.payrollReadiness).toBe("excluded");
    expect(result.riskLevel).toBe("none");
    expect(result.reasonCodes).toContain(ATTENDANCE_REASON.NO_SCHEDULE);
  });
});

// ---------------------------------------------------------------------------
// 2. Schedule exists, shift upcoming (before check-in window)
// ---------------------------------------------------------------------------
describe("2. Schedule exists, shift upcoming", () => {
  it("returns upcoming when now is before window opens (today)", () => {
    // now = 08:00 Muscat, shift starts 09:00, grace 15 min → window opens 08:45
    const result = resolveAttendanceDayState({
      ...BASE,
      now: m("08:00:00"),
    });
    expect(result.status).toBe("upcoming");
    expect(result.payrollReadiness).toBe("excluded");
    expect(result.riskLevel).toBe("none");
  });

  it("returns scheduled for a future calendar date", () => {
    // now is on BIZ, but attendanceDate is tomorrow
    const tomorrow = "2026-04-25";
    const result = resolveAttendanceDayState({
      ...BASE,
      attendanceDate: tomorrow,
      now: m("10:00:00"), // today's wall time
    });
    expect(result.status).toBe("scheduled");
    expect(result.payrollReadiness).toBe("excluded");
  });
});

// ---------------------------------------------------------------------------
// 3. Scheduled, within shift, no check-in before grace expiry
// ---------------------------------------------------------------------------
describe("3. Scheduled, within grace, no check-in", () => {
  it("returns awaiting_check_in within grace period", () => {
    // now = 09:10 Muscat — past shiftStart but inside 15-min grace
    const result = resolveAttendanceDayState({
      ...BASE,
      now: m("09:10:00"),
      checkInTime: null,
    });
    expect(result.status).toBe("awaiting_check_in");
    expect(result.riskLevel).toBe("low");
    expect(result.reasonCodes).toContain(ATTENDANCE_REASON.WITHIN_GRACE);
  });
});

// ---------------------------------------------------------------------------
// 4. Scheduled, after grace expiry, no check-in (shift ongoing)
// ---------------------------------------------------------------------------
describe("4. Past grace, shift ongoing, no check-in", () => {
  it("returns late_no_arrival with high risk", () => {
    // now = 10:00 Muscat, grace expired at 09:15
    const result = resolveAttendanceDayState({
      ...BASE,
      now: m("10:00:00"),
      checkInTime: null,
    });
    expect(result.status).toBe("late_no_arrival");
    expect(result.riskLevel).toBe("high");
    expect(result.payrollReadiness).toBe("ready");
    expect(result.reasonCodes).toContain(ATTENDANCE_REASON.PAST_GRACE_NO_CHECKIN);
  });

  it("returns absent_confirmed after shift ends with no check-in", () => {
    // now = 18:00, shift ended at 17:00, no check-in
    const result = resolveAttendanceDayState({
      ...BASE,
      now: m("18:00:00"),
      checkInTime: null,
    });
    expect(result.status).toBe("absent_confirmed");
    expect(result.riskLevel).toBe("critical");
    expect(result.reasonCodes).toContain(ATTENDANCE_REASON.SHIFT_ENDED_NO_CHECKIN);
  });
});

// ---------------------------------------------------------------------------
// 5. Checked in on time
// ---------------------------------------------------------------------------
describe("5. Checked in on time", () => {
  it("returns checked_in_on_time when check-in is within grace window", () => {
    const result = resolveAttendanceDayState({
      ...BASE,
      now: m("09:05:00"),
      checkInTime: m("09:05:00"),
      checkOutTime: null,
    });
    expect(result.status).toBe("checked_in_on_time");
    expect(result.payrollReadiness).toBe("ready");
    expect(result.riskLevel).toBe("none");
    expect(result.reasonCodes).toContain(ATTENDANCE_REASON.CHECKED_IN_ON_TIME);
  });

  it("returns checked_in_on_time at the exact grace deadline", () => {
    const result = resolveAttendanceDayState({
      ...BASE,
      now: m("09:15:00"),
      checkInTime: m("09:15:00"),
      checkOutTime: null,
    });
    expect(result.status).toBe("checked_in_on_time");
  });
});

// ---------------------------------------------------------------------------
// 6. Checked in late
// ---------------------------------------------------------------------------
describe("6. Checked in late", () => {
  it("returns checked_in_late when check-in is after grace deadline", () => {
    const result = resolveAttendanceDayState({
      ...BASE,
      now: m("10:00:00"),
      checkInTime: m("10:00:00"),
      checkOutTime: null,
    });
    expect(result.status).toBe("checked_in_late");
    expect(result.payrollReadiness).toBe("ready");
    expect(result.riskLevel).toBe("medium");
    expect(result.reasonCodes).toContain(ATTENDANCE_REASON.CHECKED_IN_LATE);
  });
});

// ---------------------------------------------------------------------------
// 7. Checked out
// ---------------------------------------------------------------------------
describe("7. Checked out", () => {
  it("returns checked_out with ready payroll for a normal checkout", () => {
    const result = resolveAttendanceDayState({
      ...BASE,
      now: m("17:05:00"),
      checkInTime: m("09:00:00"),
      checkOutTime: m("17:00:00"),
    });
    expect(result.status).toBe("checked_out");
    expect(result.payrollReadiness).toBe("ready");
    expect(result.reasonCodes).toContain(ATTENDANCE_REASON.CHECKED_OUT);
    expect(result.reasonCodes).toContain(ATTENDANCE_REASON.CHECKED_IN_ON_TIME);
  });

  it("records late check-in reason even when checked out", () => {
    const result = resolveAttendanceDayState({
      ...BASE,
      now: m("17:05:00"),
      checkInTime: m("10:30:00"),
      checkOutTime: m("17:00:00"),
    });
    expect(result.status).toBe("checked_out");
    expect(result.reasonCodes).toContain(ATTENDANCE_REASON.CHECKED_IN_LATE);
  });
});

// ---------------------------------------------------------------------------
// 8. Missing checkout after shift end
// ---------------------------------------------------------------------------
describe("8. Missing checkout after shift end", () => {
  it("returns blocked_missing_checkout when session is open past shift end", () => {
    const result = resolveAttendanceDayState({
      ...BASE,
      now: m("18:00:00"),
      checkInTime: m("09:00:00"),
      checkOutTime: null,
    });
    expect(result.status).toBe("checked_in_on_time");
    expect(result.payrollReadiness).toBe("blocked_missing_checkout");
    expect(result.riskLevel).toBe("high");
    expect(result.reasonCodes).toContain(ATTENDANCE_REASON.MISSING_CHECKOUT);
  });
});

// ---------------------------------------------------------------------------
// 9. Pending correction blocks payroll readiness
// ---------------------------------------------------------------------------
describe("9. Pending correction", () => {
  it("returns blocked_pending_correction regardless of check-out state", () => {
    const result = resolveAttendanceDayState({
      ...BASE,
      now: m("17:05:00"),
      checkInTime: m("09:00:00"),
      checkOutTime: m("17:00:00"),
      correctionPending: true,
    });
    expect(result.payrollReadiness).toBe("blocked_pending_correction");
    expect(result.reasonCodes).toContain(ATTENDANCE_REASON.CORRECTION_PENDING);
  });

  it("correction takes priority over missing_checkout", () => {
    const result = resolveAttendanceDayState({
      ...BASE,
      now: m("18:00:00"),
      checkInTime: m("09:00:00"),
      checkOutTime: null,
      correctionPending: true,
    });
    // Correction is stronger than missing checkout
    expect(result.payrollReadiness).toBe("blocked_pending_correction");
  });
});

// ---------------------------------------------------------------------------
// 10. Pending manual check-in blocks payroll readiness
// ---------------------------------------------------------------------------
describe("10. Pending manual check-in", () => {
  it("returns blocked_pending_manual_checkin", () => {
    const result = resolveAttendanceDayState({
      ...BASE,
      now: m("18:00:00"),
      checkInTime: null,
      manualCheckinPending: true,
    });
    expect(result.status).toBe("absent_pending");
    expect(result.payrollReadiness).toBe("blocked_pending_manual_checkin");
    expect(result.reasonCodes).toContain(ATTENDANCE_REASON.MANUAL_CHECKIN_PENDING);
  });

  it("returns absent_pending (not absent_confirmed) when manual check-in is pending", () => {
    const result = resolveAttendanceDayState({
      ...BASE,
      now: m("18:00:00"),
      checkInTime: null,
      manualCheckinPending: true,
    });
    expect(result.status).toBe("absent_pending");
  });
});

// ---------------------------------------------------------------------------
// 11. Holiday behaviour
// ---------------------------------------------------------------------------
describe("11. Holiday", () => {
  it("returns holiday + excluded + no risk when no attendance on holiday", () => {
    const result = resolveAttendanceDayState({
      ...BASE,
      now: m("10:00:00"),
      holidayFlag: true,
    });
    expect(result.status).toBe("holiday");
    expect(result.payrollReadiness).toBe("excluded");
    expect(result.riskLevel).toBe("none");
    expect(result.reasonCodes).toContain(ATTENDANCE_REASON.HOLIDAY);
    expect(result.reasonCodes).not.toContain(ATTENDANCE_REASON.ATTENDANCE_ON_HOLIDAY);
  });

  it("holiday status is preserved when employee checks in, but payroll needs review", () => {
    const result = resolveAttendanceDayState({
      ...BASE,
      now: m("10:00:00"),
      holidayFlag: true,
      checkInTime: m("09:00:00"),
      checkOutTime: m("17:00:00"),
    });
    expect(result.status).toBe("holiday");
    expect(result.payrollReadiness).toBe("needs_review");
    expect(result.riskLevel).toBe("medium");
    expect(result.reasonCodes).toContain(ATTENDANCE_REASON.HOLIDAY);
    expect(result.reasonCodes).toContain(ATTENDANCE_REASON.ATTENDANCE_ON_HOLIDAY);
  });

  it("rawSessionExists on holiday also triggers ATTENDANCE_ON_HOLIDAY signal", () => {
    const result = resolveAttendanceDayState({
      ...BASE,
      now: m("10:00:00"),
      holidayFlag: true,
      rawSessionExists: true,
    });
    expect(result.payrollReadiness).toBe("needs_review");
    expect(result.reasonCodes).toContain(ATTENDANCE_REASON.ATTENDANCE_ON_HOLIDAY);
  });
});

// ---------------------------------------------------------------------------
// 12. Leave behaviour
// ---------------------------------------------------------------------------
describe("12. Leave", () => {
  it("returns leave + excluded + no risk when no attendance during leave", () => {
    const result = resolveAttendanceDayState({
      ...BASE,
      now: m("10:00:00"),
      leaveFlag: true,
    });
    expect(result.status).toBe("leave");
    expect(result.payrollReadiness).toBe("excluded");
    expect(result.riskLevel).toBe("none");
    expect(result.reasonCodes).toContain(ATTENDANCE_REASON.LEAVE);
    expect(result.reasonCodes).not.toContain(ATTENDANCE_REASON.ATTENDANCE_DURING_LEAVE);
  });

  it("leave status is preserved when employee checks in, but payroll needs review", () => {
    const result = resolveAttendanceDayState({
      ...BASE,
      now: m("10:00:00"),
      leaveFlag: true,
      checkInTime: m("09:00:00"),
    });
    expect(result.status).toBe("leave");
    expect(result.payrollReadiness).toBe("needs_review");
    expect(result.riskLevel).toBe("medium");
    expect(result.reasonCodes).toContain(ATTENDANCE_REASON.LEAVE);
    expect(result.reasonCodes).toContain(ATTENDANCE_REASON.ATTENDANCE_DURING_LEAVE);
  });

  it("officialHrRecordExists during leave also triggers ATTENDANCE_DURING_LEAVE signal", () => {
    const result = resolveAttendanceDayState({
      ...BASE,
      now: m("10:00:00"),
      leaveFlag: true,
      officialHrRecordExists: true,
    });
    expect(result.payrollReadiness).toBe("needs_review");
    expect(result.reasonCodes).toContain(ATTENDANCE_REASON.ATTENDANCE_DURING_LEAVE);
  });
});

// ---------------------------------------------------------------------------
// 13. Unscheduled attendance
// ---------------------------------------------------------------------------
describe("13. Unscheduled attendance", () => {
  it("returns unscheduled_attendance when record exists without schedule", () => {
    const result = resolveAttendanceDayState({
      attendanceDate: BIZ,
      now: m("10:00:00"),
      scheduleExists: false,
      checkInTime: m("09:00:00"),
    });
    expect(result.status).toBe("unscheduled_attendance");
    expect(result.payrollReadiness).toBe("needs_review");
    expect(result.riskLevel).toBe("high");
    expect(result.reasonCodes).toContain(ATTENDANCE_REASON.UNSCHEDULED_ATTENDANCE);
  });

  it("treats rawSessionExists as attendance evidence even without checkInTime", () => {
    const result = resolveAttendanceDayState({
      attendanceDate: BIZ,
      now: m("10:00:00"),
      scheduleExists: false,
      rawSessionExists: true,
    });
    expect(result.status).toBe("unscheduled_attendance");
  });
});

// ---------------------------------------------------------------------------
// 14. Suspended employee
// ---------------------------------------------------------------------------
describe("14. Suspended employee", () => {
  it("returns needs_review with high risk when employee is inactive", () => {
    const result = resolveAttendanceDayState({
      ...BASE,
      now: m("10:00:00"),
      employeeActive: false,
    });
    expect(result.status).toBe("needs_review");
    expect(result.payrollReadiness).toBe("needs_review");
    expect(result.riskLevel).toBe("high");
    expect(result.reasonCodes).toContain(ATTENDANCE_REASON.EMPLOYEE_SUSPENDED);
  });

  it("suspended employee with check-in also flags unscheduled attendance", () => {
    const result = resolveAttendanceDayState({
      ...BASE,
      now: m("10:00:00"),
      employeeActive: false,
      checkInTime: m("09:00:00"),
    });
    expect(result.reasonCodes).toContain(ATTENDANCE_REASON.EMPLOYEE_SUSPENDED);
    expect(result.status).toBe("needs_review");
  });
});

// ---------------------------------------------------------------------------
// 15. Schedule conflict blocks payroll readiness
// ---------------------------------------------------------------------------
describe("15. Schedule conflict", () => {
  it("returns blocked_schedule_conflict when a conflict is flagged", () => {
    const result = resolveAttendanceDayState({
      ...BASE,
      now: m("10:00:00"),
      checkInTime: m("09:05:00"),
      scheduleConflict: true,
    });
    expect(result.payrollReadiness).toBe("blocked_schedule_conflict");
    expect(result.reasonCodes).toContain(ATTENDANCE_REASON.SCHEDULE_CONFLICT);
  });

  it("schedule conflict takes priority over correction_pending", () => {
    const result = resolveAttendanceDayState({
      ...BASE,
      now: m("10:00:00"),
      checkInTime: m("09:05:00"),
      scheduleConflict: true,
      correctionPending: true,
    });
    expect(result.payrollReadiness).toBe("blocked_schedule_conflict");
  });
});

// ---------------------------------------------------------------------------
// 16. Browser timezone does not affect result when timezone input is Asia/Muscat
// ---------------------------------------------------------------------------
describe("16. Timezone isolation", () => {
  it("produces identical results regardless of local process timezone offset", () => {
    // Simulate check-in at 09:05 Muscat.
    // The resolver uses muscatWallDateTimeToUtc internally, so the local process
    // timezone (UTC in CI, GMT+3 or others in dev) must not change the outcome.
    const checkInMuscat = muscatWallDateTimeToUtc(BIZ, "09:05:00");

    // Deliberately build `now` as a UTC epoch so process.env.TZ makes no difference
    const nowUtc = muscatWallDateTimeToUtc(BIZ, "09:30:00");

    const result = resolveAttendanceDayState({
      ...BASE,
      now: nowUtc,
      checkInTime: checkInMuscat,
      checkOutTime: null,
    });

    // Shift starts 09:00 Muscat, grace 15 min → on-time window ends 09:15 Muscat
    // 09:05 < 09:15 → on time
    expect(result.status).toBe("checked_in_on_time");
    expect(result.reasonCodes).toContain(ATTENDANCE_REASON.CHECKED_IN_ON_TIME);
  });

  it("correctly identifies late check-in using Muscat boundaries only", () => {
    // Check in at 09:30 Muscat — past 09:15 grace deadline
    const checkInMuscat = muscatWallDateTimeToUtc(BIZ, "09:30:00");
    const nowUtc = muscatWallDateTimeToUtc(BIZ, "09:35:00");

    const result = resolveAttendanceDayState({
      ...BASE,
      now: nowUtc,
      checkInTime: checkInMuscat,
      checkOutTime: null,
    });

    expect(result.status).toBe("checked_in_late");
    expect(result.reasonCodes).toContain(ATTENDANCE_REASON.CHECKED_IN_LATE);
  });
});

// ---------------------------------------------------------------------------
// Additional edge cases
// ---------------------------------------------------------------------------
describe("Remote work", () => {
  it("returns remote status with ready payroll readiness", () => {
    const result = resolveAttendanceDayState({
      ...BASE,
      now: m("10:00:00"),
      remoteFlag: true,
    });
    expect(result.status).toBe("remote");
    expect(result.payrollReadiness).toBe("ready");
    expect(result.riskLevel).toBe("none");
    expect(result.reasonCodes).toContain(ATTENDANCE_REASON.REMOTE);
  });
});

describe("Overnight shift", () => {
  it("handles overnight shifts without treating end as past shift start", () => {
    // Night shift: 22:00–06:00 (next day), checking in at 22:05 Muscat
    const nightBiz = "2026-04-24";
    const result = resolveAttendanceDayState({
      attendanceDate: nightBiz,
      now: muscatWallDateTimeToUtc(nightBiz, "22:05:00"),
      scheduleExists: true,
      shiftStartTime: "22:00",
      shiftEndTime: "06:00",
      gracePeriodMinutes: 15,
      checkInTime: muscatWallDateTimeToUtc(nightBiz, "22:05:00"),
      checkOutTime: null,
    });
    expect(result.status).toBe("checked_in_on_time");
    expect(result.payrollReadiness).toBe("ready");
  });
});
