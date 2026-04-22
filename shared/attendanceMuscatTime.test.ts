import { describe, expect, it } from "vitest";
import {
  muscatCalendarYmdFromUtcInstant,
  muscatDayUtcRangeExclusiveEnd,
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
