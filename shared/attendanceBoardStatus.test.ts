import { describe, expect, it } from "vitest";
import { muscatWallDateTimeToUtc } from "./attendanceMuscatTime";
import { computeAdminBoardRowStatus } from "./attendanceBoardStatus";

/** Wall-clock instant on `biz` in Asia/Muscat (CI may run in UTC). */
function muscatOnBiz(biz: string, hhmmss: string): Date {
  return muscatWallDateTimeToUtc(biz, hhmmss);
}

describe("computeAdminBoardRowStatus", () => {
  const biz = "2026-04-05";

  it("returns holiday when company holiday flag is set", () => {
    const st = computeAdminBoardRowStatus({
      now: muscatOnBiz(biz, "10:00:00"),
      businessDate: biz,
      holiday: true,
      shiftStartTime: "09:00",
      shiftEndTime: "17:00",
      gracePeriodMinutes: 15,
      record: null,
    });
    expect(st).toBe("holiday");
  });

  it("upcoming before shift start (no record)", () => {
    const st = computeAdminBoardRowStatus({
      now: muscatOnBiz(biz, "08:00:00"),
      businessDate: biz,
      holiday: false,
      shiftStartTime: "09:00",
      shiftEndTime: "17:00",
      gracePeriodMinutes: 15,
      record: null,
    });
    expect(st).toBe("upcoming");
  });

  it("not_checked_in after start but within grace window (no record)", () => {
    const st = computeAdminBoardRowStatus({
      now: muscatOnBiz(biz, "09:10:00"),
      businessDate: biz,
      holiday: false,
      shiftStartTime: "09:00",
      shiftEndTime: "17:00",
      gracePeriodMinutes: 15,
      record: null,
    });
    expect(st).toBe("not_checked_in");
  });

  it("late_no_checkin after grace, before shift end (no record)", () => {
    const st = computeAdminBoardRowStatus({
      now: muscatOnBiz(biz, "10:00:00"),
      businessDate: biz,
      holiday: false,
      shiftStartTime: "09:00",
      shiftEndTime: "17:00",
      gracePeriodMinutes: 15,
      record: null,
    });
    expect(st).toBe("late_no_checkin");
  });

  it("absent only after shift end (no record)", () => {
    const st = computeAdminBoardRowStatus({
      now: muscatOnBiz(biz, "18:00:00"),
      businessDate: biz,
      holiday: false,
      shiftStartTime: "09:00",
      shiftEndTime: "17:00",
      gracePeriodMinutes: 15,
      record: null,
    });
    expect(st).toBe("absent");
  });

  it("checked_in_on_time when within grace of shift start", () => {
    const st = computeAdminBoardRowStatus({
      now: muscatOnBiz(biz, "09:05:00"),
      businessDate: biz,
      holiday: false,
      shiftStartTime: "09:00",
      shiftEndTime: "17:00",
      gracePeriodMinutes: 15,
      record: { checkIn: muscatOnBiz(biz, "09:05:00"), checkOut: null },
    });
    expect(st).toBe("checked_in_on_time");
  });

  it("completed when employee works full shift (meets 80% threshold)", () => {
    // 09:00–17:00 = 480 min; 09:00–17:00 = full → completed
    const st = computeAdminBoardRowStatus({
      now: muscatOnBiz(biz, "18:00:00"),
      businessDate: biz,
      holiday: false,
      shiftStartTime: "09:00",
      shiftEndTime: "17:00",
      gracePeriodMinutes: 15,
      record: {
        checkIn: muscatOnBiz(biz, "09:00:00"),
        checkOut: muscatOnBiz(biz, "17:00:00"),
      },
    });
    expect(st).toBe("completed");
  });

  it("early_checkout when employee works only a fraction of shift", () => {
    // 09:00–17:00 = 480 min; only 30 min worked → early_checkout
    const st = computeAdminBoardRowStatus({
      now: muscatOnBiz(biz, "18:00:00"),
      businessDate: biz,
      holiday: false,
      shiftStartTime: "09:00",
      shiftEndTime: "17:00",
      gracePeriodMinutes: 15,
      record: {
        checkIn: muscatOnBiz(biz, "09:00:00"),
        checkOut: muscatOnBiz(biz, "09:30:00"),
      },
    });
    expect(st).toBe("early_checkout");
  });

  it("early_checkout for the observed 19:14–19:31 scenario (16 min on 3h shift)", () => {
    // Shift 19:00–22:00 = 180 min; 80% = 144 min; 17 min worked → early_checkout
    const st = computeAdminBoardRowStatus({
      now: muscatOnBiz(biz, "22:00:00"),
      businessDate: biz,
      holiday: false,
      shiftStartTime: "19:00",
      shiftEndTime: "22:00",
      gracePeriodMinutes: 15,
      record: {
        checkIn: muscatOnBiz(biz, "19:14:00"),
        checkOut: muscatOnBiz(biz, "19:31:00"),
      },
    });
    expect(st).toBe("early_checkout");
  });
});

