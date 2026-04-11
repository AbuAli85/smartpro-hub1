import { describe, it, expect } from "vitest";
import { buildEmployeeDayShiftStatuses } from "./employeeDayShiftStatus";
import { muscatWallDateTimeToUtc } from "./attendanceMuscatTime";

const BD = "2025-06-10"; // a Tuesday
const EMP = 42;

function msAt(hhmm: string): number {
  return muscatWallDateTimeToUtc(BD, `${hhmm}:00`).getTime();
}

const MORNING = {
  scheduleId: 1,
  shiftName: "Morning",
  shiftStart: "09:00",
  shiftEnd: "13:00",
  siteId: 10,
  siteName: "HQ",
  siteToken: "tok-morning",
  gracePeriodMinutes: 15,
};

const EVENING = {
  scheduleId: 2,
  shiftName: "Evening",
  shiftStart: "17:00",
  shiftEnd: "21:00",
  siteId: 10,
  siteName: "HQ",
  siteToken: "tok-evening",
  gracePeriodMinutes: 15,
};

describe("buildEmployeeDayShiftStatuses — single shift", () => {
  it("upcoming before window opens", () => {
    const nowMs = msAt("08:00"); // before 08:45 (09:00 - 15m grace)
    const [s] = buildEmployeeDayShiftStatuses({
      shifts: [MORNING],
      records: [],
      businessDate: BD,
      nowMs,
      employeeId: EMP,
    });
    expect(s.status).toBe("upcoming");
    expect(s.canCheckIn).toBe(false);
    expect(s.canCheckOut).toBe(false);
  });

  it("window_open inside grace buffer", () => {
    const nowMs = msAt("08:50"); // 08:45 opens (09:00 - 15m)
    const [s] = buildEmployeeDayShiftStatuses({
      shifts: [MORNING],
      records: [],
      businessDate: BD,
      nowMs,
      employeeId: EMP,
    });
    expect(s.status).toBe("window_open");
    expect(s.canCheckIn).toBe(true);
  });

  it("checked_in with open session", () => {
    const nowMs = msAt("10:00");
    const checkIn = new Date(msAt("09:05"));
    const [s] = buildEmployeeDayShiftStatuses({
      shifts: [MORNING],
      records: [{ id: 101, siteId: 10, checkIn, checkOut: null }],
      businessDate: BD,
      nowMs,
      employeeId: EMP,
    });
    expect(s.status).toBe("checked_in");
    expect(s.canCheckIn).toBe(false);
    expect(s.canCheckOut).toBe(true);
    expect(s.checkIn).toEqual(checkIn);
    expect(s.checkOut).toBeNull();
    expect(s.attendanceRecordId).toBe(101);
  });

  it("checked_out when full punch recorded", () => {
    const nowMs = msAt("14:00");
    const checkIn = new Date(msAt("09:05"));
    const checkOut = new Date(msAt("13:10"));
    const [s] = buildEmployeeDayShiftStatuses({
      shifts: [MORNING],
      records: [{ id: 101, siteId: 10, checkIn, checkOut }],
      businessDate: BD,
      nowMs,
      employeeId: EMP,
    });
    expect(s.status).toBe("checked_out");
    expect(s.canCheckIn).toBe(false);
    expect(s.canCheckOut).toBe(false);
    expect(s.durationMinutes).toBeGreaterThan(0);
  });

  it("missed when shift ended with no record", () => {
    const nowMs = msAt("15:00"); // shift ended at 13:00
    const [s] = buildEmployeeDayShiftStatuses({
      shifts: [MORNING],
      records: [],
      businessDate: BD,
      nowMs,
      employeeId: EMP,
    });
    expect(s.status).toBe("missed");
    expect(s.canCheckIn).toBe(false);
  });
});

describe("buildEmployeeDayShiftStatuses — two shifts", () => {
  it("morning done, evening upcoming", () => {
    const nowMs = msAt("14:00");
    const checkIn = new Date(msAt("09:05"));
    const checkOut = new Date(msAt("13:10"));
    const [morning, evening] = buildEmployeeDayShiftStatuses({
      shifts: [MORNING, EVENING],
      records: [{ id: 101, siteId: 10, checkIn, checkOut }],
      businessDate: BD,
      nowMs,
      employeeId: EMP,
    });
    expect(morning.status).toBe("checked_out");
    expect(evening.status).toBe("upcoming");
    // No open session so evening canCheckIn depends on window
    expect(evening.canCheckIn).toBe(false); // not in evening window yet
  });

  it("morning done, evening window open — canCheckIn for evening", () => {
    const nowMs = msAt("16:50"); // 17:00 - 15m grace = 16:45 → window open
    const checkIn = new Date(msAt("09:05"));
    const checkOut = new Date(msAt("13:10"));
    const [morning, evening] = buildEmployeeDayShiftStatuses({
      shifts: [MORNING, EVENING],
      records: [{ id: 101, siteId: 10, checkIn, checkOut }],
      businessDate: BD,
      nowMs,
      employeeId: EMP,
    });
    expect(morning.status).toBe("checked_out");
    expect(evening.status).toBe("window_open");
    expect(evening.canCheckIn).toBe(true); // no open session, window open
  });

  it("morning open session blocks evening canCheckIn", () => {
    const nowMs = msAt("16:50");
    const checkIn = new Date(msAt("09:05"));
    const [morning, evening] = buildEmployeeDayShiftStatuses({
      shifts: [MORNING, EVENING],
      records: [{ id: 101, siteId: 10, checkIn, checkOut: null }],
      businessDate: BD,
      nowMs,
      employeeId: EMP,
    });
    expect(morning.status).toBe("checked_in");
    expect(morning.canCheckOut).toBe(true);
    expect(evening.canCheckIn).toBe(false); // open session blocks
  });

  it("morning missed, evening checked_in", () => {
    const nowMs = msAt("19:00");
    const checkIn = new Date(msAt("17:03"));
    const [morning, evening] = buildEmployeeDayShiftStatuses({
      shifts: [MORNING, EVENING],
      records: [{ id: 201, siteId: 10, checkIn, checkOut: null }],
      businessDate: BD,
      nowMs,
      employeeId: EMP,
    });
    expect(morning.status).toBe("missed");
    expect(evening.status).toBe("checked_in");
    expect(evening.attendanceRecordId).toBe(201);
  });

  it("returns entries in input order", () => {
    const nowMs = msAt("08:00");
    const result = buildEmployeeDayShiftStatuses({
      shifts: [MORNING, EVENING],
      records: [],
      businessDate: BD,
      nowMs,
      employeeId: EMP,
    });
    expect(result[0].scheduleId).toBe(MORNING.scheduleId);
    expect(result[1].scheduleId).toBe(EVENING.scheduleId);
  });

  it("empty records → both missed if shifts ended", () => {
    const nowMs = msAt("22:00");
    const [morning, evening] = buildEmployeeDayShiftStatuses({
      shifts: [MORNING, EVENING],
      records: [],
      businessDate: BD,
      nowMs,
      employeeId: EMP,
    });
    expect(morning.status).toBe("missed");
    expect(evening.status).toBe("missed");
  });
});

describe("buildEmployeeDayShiftStatuses — edge cases", () => {
  it("returns empty array when no shifts", () => {
    const result = buildEmployeeDayShiftStatuses({
      shifts: [],
      records: [],
      businessDate: BD,
      nowMs: msAt("10:00"),
      employeeId: EMP,
    });
    expect(result).toHaveLength(0);
  });

  it("durationMinutes is null for missed shift", () => {
    const nowMs = msAt("15:00");
    const [s] = buildEmployeeDayShiftStatuses({
      shifts: [MORNING],
      records: [],
      businessDate: BD,
      nowMs,
      employeeId: EMP,
    });
    expect(s.durationMinutes).toBeNull();
  });

  it("durationMinutes is positive when punch covers shift window", () => {
    const nowMs = msAt("14:00");
    const checkIn = new Date(msAt("09:00"));
    const checkOut = new Date(msAt("13:00"));
    const [s] = buildEmployeeDayShiftStatuses({
      shifts: [MORNING],
      records: [{ id: 1, siteId: 10, checkIn, checkOut }],
      businessDate: BD,
      nowMs,
      employeeId: EMP,
    });
    expect(s.durationMinutes).toBeGreaterThan(0);
  });
});
