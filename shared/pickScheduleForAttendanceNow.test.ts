import { describe, it, expect } from "vitest";
import { muscatWallDateTimeToUtc } from "./attendanceMuscatTime";
import { pickScheduleRowForNow, type SchedulePickRow, type ShiftTimes } from "./pickScheduleForAttendanceNow";

function shift(start: string, end: string, grace = 15): ShiftTimes {
  return { startTime: start, endTime: end, gracePeriodMinutes: grace };
}

/** `now` on 2026-06-01 in Asia/Muscat wall clock (CI may run in UTC). */
function june1(h: number, min = 0): Date {
  return muscatWallDateTimeToUtc(
    "2026-06-01",
    `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`,
  );
}

describe("pickScheduleRowForNow", () => {
  const mondayDow = 1;
  const businessDate = "2026-06-01"; // Monday

  it("returns null for empty rows", () => {
    expect(
      pickScheduleRowForNow({
        now: june1(9, 0),
        businessDate,
        dow: mondayDow,
        isHoliday: false,
        scheduleRows: [],
        getShift: () => shift("09:00", "17:00"),
      })
    ).toBeNull();
  });

  it("picks the only working-day row", () => {
    const rows: SchedulePickRow[] = [
      { id: 1, siteId: 10, shiftTemplateId: 100, workingDays: "1,2,3,4,5" },
    ];
    const shifts = new Map<number, ShiftTimes>([[100, shift("09:00", "17:00")]]);
    const r = pickScheduleRowForNow({
      now: june1(10, 0),
      businessDate,
      dow: mondayDow,
      isHoliday: false,
      scheduleRows: rows,
      getShift: (id) => shifts.get(id),
    });
    expect(r?.id).toBe(1);
  });

  it("before first shift opens, picks earliest shift", () => {
    const rows: SchedulePickRow[] = [
      { id: 2, siteId: 20, shiftTemplateId: 2, workingDays: "1" }, // evening 17-22
      { id: 1, siteId: 10, shiftTemplateId: 1, workingDays: "1" }, // morning 09-12
    ];
    const shifts = new Map<number, ShiftTimes>([
      [1, shift("09:00", "12:00")],
      [2, shift("17:00", "22:00")],
    ]);
    const r = pickScheduleRowForNow({
      now: june1(7, 0),
      businessDate,
      dow: mondayDow,
      isHoliday: false,
      scheduleRows: rows,
      getShift: (id) => shifts.get(id),
    });
    expect(r?.id).toBe(1);
  });

  it("during morning window, picks morning shift", () => {
    const rows: SchedulePickRow[] = [
      { id: 2, siteId: 20, shiftTemplateId: 2, workingDays: "1" },
      { id: 1, siteId: 10, shiftTemplateId: 1, workingDays: "1" },
    ];
    const shifts = new Map<number, ShiftTimes>([
      [1, shift("09:00", "12:00")],
      [2, shift("17:00", "22:00")],
    ]);
    const r = pickScheduleRowForNow({
      now: june1(10, 0),
      businessDate,
      dow: mondayDow,
      isHoliday: false,
      scheduleRows: rows,
      getShift: (id) => shifts.get(id),
    });
    expect(r?.id).toBe(1);
  });

  it("during evening window, picks evening shift", () => {
    const rows: SchedulePickRow[] = [
      { id: 2, siteId: 20, shiftTemplateId: 2, workingDays: "1" },
      { id: 1, siteId: 10, shiftTemplateId: 1, workingDays: "1" },
    ];
    const shifts = new Map<number, ShiftTimes>([
      [1, shift("09:00", "12:00")],
      [2, shift("17:00", "22:00")],
    ]);
    const r = pickScheduleRowForNow({
      now: june1(18, 0),
      businessDate,
      dow: mondayDow,
      isHoliday: false,
      scheduleRows: rows,
      getShift: (id) => shifts.get(id),
    });
    expect(r?.id).toBe(2);
  });

  it("after last shift end, picks last shift (late check-in context)", () => {
    const rows: SchedulePickRow[] = [
      { id: 2, siteId: 20, shiftTemplateId: 2, workingDays: "1" },
      { id: 1, siteId: 10, shiftTemplateId: 1, workingDays: "1" },
    ];
    const shifts = new Map<number, ShiftTimes>([
      [1, shift("09:00", "12:00")],
      [2, shift("17:00", "22:00")],
    ]);
    const r = pickScheduleRowForNow({
      now: june1(23, 0),
      businessDate,
      dow: mondayDow,
      isHoliday: false,
      scheduleRows: rows,
      getShift: (id) => shifts.get(id),
    });
    expect(r?.id).toBe(2);
  });

  it("in gap between shifts, picks next shift", () => {
    const rows: SchedulePickRow[] = [
      { id: 1, siteId: 10, shiftTemplateId: 1, workingDays: "1" },
      { id: 2, siteId: 20, shiftTemplateId: 2, workingDays: "1" },
    ];
    const shifts = new Map<number, ShiftTimes>([
      [1, shift("09:00", "12:00")],
      [2, shift("17:00", "22:00")],
    ]);
    const r = pickScheduleRowForNow({
      now: june1(14, 0),
      businessDate,
      dow: mondayDow,
      isHoliday: false,
      scheduleRows: rows,
      getShift: (id) => shifts.get(id),
    });
    expect(r?.id).toBe(2);
  });

  it("on holiday uses stable first id row", () => {
    const rows: SchedulePickRow[] = [
      { id: 5, siteId: 1, shiftTemplateId: 1, workingDays: "1" },
      { id: 3, siteId: 2, shiftTemplateId: 2, workingDays: "1" },
    ];
    const shifts = new Map<number, ShiftTimes>([
      [1, shift("09:00", "17:00")],
      [2, shift("09:00", "17:00")],
    ]);
    const r = pickScheduleRowForNow({
      now: june1(12, 0),
      businessDate,
      dow: mondayDow,
      isHoliday: true,
      scheduleRows: rows,
      getShift: (id) => shifts.get(id),
    });
    expect(r?.id).toBe(3);
  });
});
