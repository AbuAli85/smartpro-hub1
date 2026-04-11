import { describe, it, expect } from "vitest";
import { muscatWallDateTimeToUtc } from "./attendanceMuscatTime";
import {
  assignAttendanceRecordsToShiftRows,
  attendanceOverlapShiftMinutes,
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
