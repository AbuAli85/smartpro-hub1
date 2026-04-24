import { describe, expect, it } from "vitest";
import {
  formatAttendanceDateDisplay,
  formatAttendanceDateTimeDisplay,
  formatAttendanceMonthDisplay,
  parseAttendanceYmdSafely,
} from "./dateUtils";
import { muscatCalendarYmdNow } from "@shared/attendanceMuscatTime";

// ---------------------------------------------------------------------------
// formatAttendanceDateDisplay
// ---------------------------------------------------------------------------

describe("formatAttendanceDateDisplay", () => {
  it("formats YYYY-MM-DD as '24 Apr 2026' in English (en-GB)", () => {
    expect(formatAttendanceDateDisplay("2026-04-24")).toBe("24 Apr 2026");
  });

  it("formats the first of a month correctly", () => {
    expect(formatAttendanceDateDisplay("2026-01-01")).toBe("1 Jan 2026");
  });

  it("returns the raw input for an invalid string", () => {
    expect(formatAttendanceDateDisplay("not-a-date")).toBe("not-a-date");
  });

  it("returns the raw input when parts are missing", () => {
    expect(formatAttendanceDateDisplay("2026-04")).toBe("2026-04");
  });

  it("produces a non-empty string in Arabic locale without US mm/dd/yyyy ordering", () => {
    const result = formatAttendanceDateDisplay("2026-04-24", "ar");
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toMatch(/^\d{1,2}\/\d{1,2}\/\d{4}$/);
  });

  it("does not shift the Muscat date when UTC is behind by 4 hours", () => {
    // 2026-04-24 is the calendar date — UTC noon anchor keeps it stable
    expect(formatAttendanceDateDisplay("2026-04-24")).toContain("24");
    expect(formatAttendanceDateDisplay("2026-04-24")).toContain("Apr");
    expect(formatAttendanceDateDisplay("2026-04-24")).toContain("2026");
  });
});

// ---------------------------------------------------------------------------
// formatAttendanceDateTimeDisplay
// ---------------------------------------------------------------------------

describe("formatAttendanceDateTimeDisplay", () => {
  it("returns '—' for null", () => {
    expect(formatAttendanceDateTimeDisplay(null)).toBe("—");
  });

  it("returns '—' for undefined", () => {
    expect(formatAttendanceDateTimeDisplay(undefined)).toBe("—");
  });

  it("formats a UTC instant into Muscat wall time with expected components", () => {
    // 2026-04-24T04:30:00Z = 08:30 Asia/Muscat
    const utc = new Date("2026-04-24T04:30:00.000Z");
    const result = formatAttendanceDateTimeDisplay(utc);
    expect(result).toContain("24");
    expect(result).toContain("Apr");
    expect(result).toContain("2026");
    expect(result).toContain("08:30");
  });

  it("uses a custom timezone when supplied", () => {
    // 2026-04-24T04:30:00Z = 05:30 Asia/Karachi (UTC+5)
    const utc = new Date("2026-04-24T04:30:00.000Z");
    const result = formatAttendanceDateTimeDisplay(utc, "en", "Asia/Karachi");
    expect(result).toContain("09:30");
  });
});

// ---------------------------------------------------------------------------
// formatAttendanceMonthDisplay
// ---------------------------------------------------------------------------

describe("formatAttendanceMonthDisplay", () => {
  it("formats year + month as 'April 2026' in English", () => {
    expect(formatAttendanceMonthDisplay(2026, 4)).toBe("April 2026");
  });

  it("formats December correctly", () => {
    expect(formatAttendanceMonthDisplay(2026, 12)).toBe("December 2026");
  });

  it("formats January correctly", () => {
    expect(formatAttendanceMonthDisplay(2026, 1)).toBe("January 2026");
  });

  it("produces a non-empty string in Arabic locale", () => {
    const result = formatAttendanceMonthDisplay(2026, 4, "ar");
    expect(result.length).toBeGreaterThan(0);
  });

  it("period label for reconciliation matches stable format with year and month", () => {
    const label = formatAttendanceMonthDisplay(2026, 4);
    expect(label).toContain("April");
    expect(label).toContain("2026");
  });
});

// ---------------------------------------------------------------------------
// parseAttendanceYmdSafely
// ---------------------------------------------------------------------------

describe("parseAttendanceYmdSafely", () => {
  it("returns null for null", () => {
    expect(parseAttendanceYmdSafely(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(parseAttendanceYmdSafely(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseAttendanceYmdSafely("")).toBeNull();
  });

  it("returns null for a non-date string", () => {
    expect(parseAttendanceYmdSafely("not-a-date")).toBeNull();
  });

  it("returns a Date at Muscat noon (08:00 UTC) for a valid YYYY-MM-DD", () => {
    const result = parseAttendanceYmdSafely("2026-04-24");
    expect(result).not.toBeNull();
    expect(result!.toISOString()).toBe("2026-04-24T08:00:00.000Z");
  });

  it("formats correctly in Muscat timezone via Intl", () => {
    const result = parseAttendanceYmdSafely("2026-04-24")!;
    const formatted = new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      timeZone: "Asia/Muscat",
    }).format(result);
    expect(formatted).toBe("Fri");
  });
});

// ---------------------------------------------------------------------------
// muscatCalendarYmdNow — UTC late-night boundary
// ---------------------------------------------------------------------------

describe("muscatCalendarYmdNow UTC late-night boundary", () => {
  it("advances the calendar date when UTC is past 20:00 (Muscat midnight)", () => {
    // 2026-04-23T23:30:00Z = 2026-04-24 03:30 Muscat — must be 24th
    const utcLateNight = new Date("2026-04-23T23:30:00.000Z");
    expect(muscatCalendarYmdNow(utcLateNight)).toBe("2026-04-24");
  });

  it("stays on the same Muscat date when UTC is before 20:00", () => {
    // 2026-04-23T19:30:00Z = 2026-04-23 23:30 Muscat — still the 23rd
    const utcBeforeMidnight = new Date("2026-04-23T19:30:00.000Z");
    expect(muscatCalendarYmdNow(utcBeforeMidnight)).toBe("2026-04-23");
  });

  it("does NOT drift to Muscat +1 day due to browser UTC as UTC 20:00 is Muscat midnight", () => {
    // 2026-04-23T20:00:00Z = exactly 2026-04-24 00:00 Muscat
    const muscatMidnight = new Date("2026-04-23T20:00:00.000Z");
    expect(muscatCalendarYmdNow(muscatMidnight)).toBe("2026-04-24");
  });

  it("does not produce a US-style date format", () => {
    const result = muscatCalendarYmdNow(new Date("2026-04-24T08:00:00.000Z"));
    // Must be YYYY-MM-DD
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
