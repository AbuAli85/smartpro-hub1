import { describe, it, expect } from "vitest";
import { muscatWallDateTimeToUtc } from "./attendanceMuscatTime";
import {
  assignAttendanceRecordsToShiftRows,
  attendanceOverlapShiftMinutes,
  allWorkingShiftRowsHaveClosedAttendance,
} from "./assignAttendanceRecordsToShifts";

describe("assignAttendanceRecordsToShiftRows", () => {
  const day = "2026-04-11";

  it("does not attach one long punch to both morning and evening rows", () => {
    const long = {
      id: 99,
      siteId: 1,
      checkIn: muscatWallDateTimeToUtc(day, "10:00:00"),
      checkOut: muscatWallDateTimeToUtc(day, "22:00:00"),
    };
    const recordsByEmp = new Map([[1, [long]]]);
    const shifts = [
      { scheduleId: 1, siteId: 1, employeeId: 1, shiftStartTime: "10:00", shiftEndTime: "13:00", gracePeriodMinutes: 15 },
      { scheduleId: 2, siteId: 1, employeeId: 1, shiftStartTime: "18:00", shiftEndTime: "22:00", gracePeriodMinutes: 15 },
    ];
    const m = assignAttendanceRecordsToShiftRows(shifts, recordsByEmp, day, muscatWallDateTimeToUtc(day, "23:00:00").getTime());
    expect(m.get(1)?.id).toBe(99);
    expect(m.get(2)).toBeUndefined();
  });

  it("assigns two punches to two shifts", () => {
    const a = {
      id: 1,
      siteId: 1,
      checkIn: muscatWallDateTimeToUtc(day, "10:00:00"),
      checkOut: muscatWallDateTimeToUtc(day, "13:00:00"),
    };
    const b = {
      id: 2,
      siteId: 1,
      checkIn: muscatWallDateTimeToUtc(day, "18:00:00"),
      checkOut: muscatWallDateTimeToUtc(day, "22:00:00"),
    };
    const recordsByEmp = new Map([[1, [a, b]]]);
    const shifts = [
      { scheduleId: 1, siteId: 1, employeeId: 1, shiftStartTime: "10:00", shiftEndTime: "13:00", gracePeriodMinutes: 15 },
      { scheduleId: 2, siteId: 1, employeeId: 1, shiftStartTime: "18:00", shiftEndTime: "22:00", gracePeriodMinutes: 15 },
    ];
    const m = assignAttendanceRecordsToShiftRows(shifts, recordsByEmp, day, muscatWallDateTimeToUtc(day, "23:00:00").getTime());
    expect(m.get(1)?.id).toBe(1);
    expect(m.get(2)?.id).toBe(2);
  });
});

describe("allWorkingShiftRowsHaveClosedAttendance", () => {
  const day = "2026-04-11";
  it("is false when only one of two shifts has a closed punch", () => {
    const long = {
      id: 99,
      siteId: 1,
      checkIn: muscatWallDateTimeToUtc(day, "10:00:00"),
      checkOut: muscatWallDateTimeToUtc(day, "13:00:00"),
    };
    const shifts = [
      { scheduleId: 1, siteId: 1, employeeId: 1, shiftStartTime: "10:00", shiftEndTime: "13:00", gracePeriodMinutes: 15 },
      { scheduleId: 2, siteId: 1, employeeId: 1, shiftStartTime: "18:00", shiftEndTime: "22:00", gracePeriodMinutes: 15 },
    ];
    expect(allWorkingShiftRowsHaveClosedAttendance(shifts, 1, [long], day, muscatWallDateTimeToUtc(day, "23:00:00").getTime())).toBe(false);
  });
  it("is true when each shift has its own closed punch", () => {
    const a = {
      id: 1,
      siteId: 1,
      checkIn: muscatWallDateTimeToUtc(day, "10:00:00"),
      checkOut: muscatWallDateTimeToUtc(day, "13:00:00"),
    };
    const b = {
      id: 2,
      siteId: 1,
      checkIn: muscatWallDateTimeToUtc(day, "18:00:00"),
      checkOut: muscatWallDateTimeToUtc(day, "22:00:00"),
    };
    const shifts = [
      { scheduleId: 1, siteId: 1, employeeId: 1, shiftStartTime: "10:00", shiftEndTime: "13:00", gracePeriodMinutes: 15 },
      { scheduleId: 2, siteId: 1, employeeId: 1, shiftStartTime: "18:00", shiftEndTime: "22:00", gracePeriodMinutes: 15 },
    ];
    expect(allWorkingShiftRowsHaveClosedAttendance(shifts, 1, [a, b], day, muscatWallDateTimeToUtc(day, "23:00:00").getTime())).toBe(true);
  });
});

describe("assignAttendanceRecordsToShiftRows — open session preference", () => {
  const day = "2026-04-11";

  it("prefers an open session over an earlier closed early-checkout for the same shift", () => {
    // Scenario: employee checked in at 19:14, early checkout at 19:31 (early_checkout),
    // then checked in again at 20:13 (still open). The shift is 19:00–22:00.
    // The open session (20:13) should be assigned to the shift, not the closed record (19:14).
    const earlyCheckout = {
      id: 1,
      siteId: 1,
      checkIn: muscatWallDateTimeToUtc(day, "19:14:00"),
      checkOut: muscatWallDateTimeToUtc(day, "19:31:00"),
    };
    const openSession = {
      id: 2,
      siteId: 1,
      checkIn: muscatWallDateTimeToUtc(day, "20:13:00"),
      checkOut: null,
    };
    const shifts = [
      { scheduleId: 10, siteId: 1, employeeId: 1, shiftStartTime: "19:00", shiftEndTime: "22:00", gracePeriodMinutes: 15 },
    ];
    const nowMs = muscatWallDateTimeToUtc(day, "20:30:00").getTime();
    const m = assignAttendanceRecordsToShiftRows(shifts, new Map([[1, [earlyCheckout, openSession]]]), day, nowMs);
    // Open session must win — shift status should reflect "checked_in" not "early_checkout"
    expect(m.get(10)?.id).toBe(2);
    expect(m.get(10)?.checkOut).toBeNull();
  });

  it("still picks the closed record when there is no open session", () => {
    const closed = {
      id: 5,
      siteId: 1,
      checkIn: muscatWallDateTimeToUtc(day, "19:14:00"),
      checkOut: muscatWallDateTimeToUtc(day, "19:31:00"),
    };
    const shifts = [
      { scheduleId: 10, siteId: 1, employeeId: 1, shiftStartTime: "19:00", shiftEndTime: "22:00", gracePeriodMinutes: 15 },
    ];
    const nowMs = muscatWallDateTimeToUtc(day, "21:00:00").getTime();
    const m = assignAttendanceRecordsToShiftRows(shifts, new Map([[1, [closed]]]), day, nowMs);
    expect(m.get(10)?.id).toBe(5);
    expect(m.get(10)?.checkOut).not.toBeNull();
  });

  it("for multi-shift: open session for shift 1 does not prevent closed punch from being assigned to shift 2", () => {
    // Shift 1 (10:00–13:00) has an open session, shift 2 (18:00–22:00) has a closed punch.
    const openShift1 = {
      id: 1,
      siteId: 1,
      checkIn: muscatWallDateTimeToUtc(day, "10:05:00"),
      checkOut: null,
    };
    const closedShift2 = {
      id: 2,
      siteId: 1,
      checkIn: muscatWallDateTimeToUtc(day, "18:10:00"),
      checkOut: muscatWallDateTimeToUtc(day, "22:00:00"),
    };
    const shifts = [
      { scheduleId: 1, siteId: 1, employeeId: 1, shiftStartTime: "10:00", shiftEndTime: "13:00", gracePeriodMinutes: 15 },
      { scheduleId: 2, siteId: 1, employeeId: 1, shiftStartTime: "18:00", shiftEndTime: "22:00", gracePeriodMinutes: 15 },
    ];
    const nowMs = muscatWallDateTimeToUtc(day, "22:30:00").getTime();
    const m = assignAttendanceRecordsToShiftRows(shifts, new Map([[1, [openShift1, closedShift2]]]), day, nowMs);
    expect(m.get(1)?.id).toBe(1);
    expect(m.get(2)?.id).toBe(2);
  });

  it("allWorkingShiftRowsHaveClosedAttendance returns false when the active record is an open session", () => {
    // After open-session preference fix, the open session is assigned to the shift.
    // allWorkingShiftRowsHaveClosedAttendance must return false (shift is NOT closed).
    const earlyCheckout = {
      id: 1,
      siteId: 1,
      checkIn: muscatWallDateTimeToUtc(day, "19:14:00"),
      checkOut: muscatWallDateTimeToUtc(day, "19:31:00"),
    };
    const openSession = {
      id: 2,
      siteId: 1,
      checkIn: muscatWallDateTimeToUtc(day, "20:13:00"),
      checkOut: null,
    };
    const shifts = [
      { scheduleId: 10, siteId: 1, employeeId: 1, shiftStartTime: "19:00", shiftEndTime: "22:00", gracePeriodMinutes: 15 },
    ];
    const nowMs = muscatWallDateTimeToUtc(day, "20:30:00").getTime();
    // Should be false because the assigned record (the open session) has no checkOut.
    expect(allWorkingShiftRowsHaveClosedAttendance(shifts, 1, [earlyCheckout, openSession], day, nowMs)).toBe(false);
  });
});

describe("attendanceOverlapShiftMinutes", () => {
  it("caps displayed span to shift window for a long session", () => {
    const day = "2026-04-11";
    const cin = muscatWallDateTimeToUtc(day, "10:00:00");
    const cout = muscatWallDateTimeToUtc(day, "22:00:00");
    const now = cout.getTime();
    const morning = attendanceOverlapShiftMinutes(cin, cout, day, "10:00", "13:00", now);
    const evening = attendanceOverlapShiftMinutes(cin, cout, day, "18:00", "22:00", now);
    expect(morning).toBe(180);
    expect(evening).toBe(240);
  });
});
