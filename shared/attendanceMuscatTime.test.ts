import { describe, expect, it } from "vitest";
import {
  muscatCalendarWeekdaySun0ForYmd,
  muscatCalendarYmdFromUtcInstant,
  muscatCalendarYmdNow,
  muscatDayUtcRangeExclusiveEnd,
  muscatDaysInCalendarMonth,
  muscatMinutesSinceMidnight,
  muscatMonthUtcRangeExclusiveEnd,
  muscatWallDateTimeToUtc,
} from "./attendanceMuscatTime";

describe("muscatDayUtcRangeExclusiveEnd", () => {
  it("uses Muscat midnight for the calendar date (not UTC midnight of the same string)", () => {
    const { startUtc, endExclusiveUtc } = muscatDayUtcRangeExclusiveEnd("2026-04-23");
    expect(startUtc.toISOString()).toBe("2026-04-22T20:00:00.000Z");
    expect(endExclusiveUtc.toISOString()).toBe("2026-04-23T20:00:00.000Z");
  });

  it("excludes end boundary for range queries", () => {
    const { startUtc, endExclusiveUtc } = muscatDayUtcRangeExclusiveEnd("2026-04-23");
    expect(endExclusiveUtc.toISOString()).toBe("2026-04-23T20:00:00.000Z");
    const justBeforeEnd = new Date(endExclusiveUtc.getTime() - 1);
    expect(justBeforeEnd.getTime() >= startUtc.getTime()).toBe(true);
    expect(justBeforeEnd.getTime() < endExclusiveUtc.getTime()).toBe(true);
  });
});

describe("muscatMonthUtcRangeExclusiveEnd", () => {
  it("covers full Muscat month April 2026", () => {
    const { startUtc, endExclusiveUtc } = muscatMonthUtcRangeExclusiveEnd(2026, 4);
    expect(startUtc.toISOString()).toBe("2026-03-31T20:00:00.000Z");
    expect(endExclusiveUtc.toISOString()).toBe("2026-04-30T20:00:00.000Z");
  });

  it("rolls December into January", () => {
    const { startUtc, endExclusiveUtc } = muscatMonthUtcRangeExclusiveEnd(2026, 12);
    expect(muscatCalendarYmdFromUtcInstant(startUtc)).toBe("2026-12-01");
    // 2027-01-01 00:00 Muscat == 2026-12-31 20:00 UTC
    expect(endExclusiveUtc.toISOString()).toBe("2026-12-31T20:00:00.000Z");
  });
});

describe("muscatDaysInCalendarMonth", () => {
  it("returns 30 for April and 31 for March", () => {
    expect(muscatDaysInCalendarMonth(2026, 4)).toBe(30);
    expect(muscatDaysInCalendarMonth(2026, 3)).toBe(31);
  });

  it("returns 28 for February 2026", () => {
    expect(muscatDaysInCalendarMonth(2026, 2)).toBe(28);
  });
});

describe("muscatCalendarWeekdaySun0ForYmd", () => {
  it("matches Thursday for 2026-04-23 (Muscat noon anchor)", () => {
    expect(muscatCalendarWeekdaySun0ForYmd("2026-04-23")).toBe(4);
  });
});

describe("muscatMinutesSinceMidnight", () => {
  it("matches wall time in Muscat for a known instant", () => {
    const d = muscatWallDateTimeToUtc("2026-04-23", "09:30:00");
    expect(muscatMinutesSinceMidnight(d)).toBe(9 * 60 + 30);
  });

  it("early Muscat morning on calendar day vs UTC", () => {
    const d = new Date("2026-04-22T21:30:00.000Z");
    expect(muscatCalendarYmdFromUtcInstant(d)).toBe("2026-04-23");
    expect(muscatMinutesSinceMidnight(d)).toBe(90);
  });
});

describe("muscatCalendarYmdNow", () => {
  it("advances to the next Muscat day once UTC passes 20:00 (Muscat midnight)", () => {
    // 20:00 UTC = 00:00 Muscat next day
    expect(muscatCalendarYmdNow(new Date("2026-04-23T20:00:00.000Z"))).toBe("2026-04-24");
  });

  it("stays on same Muscat day for UTC one second before Muscat midnight", () => {
    // 19:59:59 UTC = 23:59:59 Muscat — still 2026-04-23
    expect(muscatCalendarYmdNow(new Date("2026-04-23T19:59:59.000Z"))).toBe("2026-04-23");
  });

  it("late UTC night (23:30) maps to early morning of next Muscat day", () => {
    // 2026-04-23T23:30Z = 2026-04-24 03:30 Muscat
    expect(muscatCalendarYmdNow(new Date("2026-04-23T23:30:00.000Z"))).toBe("2026-04-24");
  });

  it("returns YYYY-MM-DD format", () => {
    const result = muscatCalendarYmdNow(new Date("2026-04-24T08:00:00.000Z"));
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
