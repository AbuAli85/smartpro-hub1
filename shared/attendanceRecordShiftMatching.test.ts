/**
 * Tests for the shift-matching and completion-status logic used in
 * `getMyAttendanceRecords`. The server computes these values before sending
 * records to the client, so we test the underlying helpers here.
 *
 * Goals covered:
 *  - early_checkout is correctly derived for a short punch
 *  - completed is derived for a full punch
 *  - checked_out is the neutral fallback when no shift is matched
 *  - shared helpers contain no mojibake / encoding-corruption characters
 */

import { describe, expect, it } from "vitest";
import { evaluateCheckoutOutcomeByShiftTimes } from "./attendanceCheckoutPolicy";
import { muscatWallDateTimeToUtc } from "./attendanceMuscatTime";
import { buildEmployeeTodayAttendanceStatus } from "./employeeTodayAttendanceStatus";
import { SHIFT_STATUS_LABEL } from "./employeeDayShiftStatus";

const BD = "2026-04-11";
function utcAt(hhmm: string): Date {
  return muscatWallDateTimeToUtc(BD, `${hhmm}:00`);
}

// ─── shift-matching simulation (mirrors the server logic) ────────────────────

function computeCompletionStatus(
  checkIn: Date,
  checkOut: Date | null,
  shift: { shiftStart: string; shiftEnd: string } | null,
): "in_progress" | "completed" | "early_checkout" | "checked_out" {
  if (!checkOut) return "in_progress";
  if (!shift) return "checked_out";
  return evaluateCheckoutOutcomeByShiftTimes({
    checkIn,
    checkOut,
    businessDate: BD,
    shiftStartTime: shift.shiftStart,
    shiftEndTime: shift.shiftEnd,
  }).outcome;
}

describe("attendance record completion status derivation", () => {
  const eveningShift = { shiftStart: "19:00", shiftEnd: "22:00" };

  it("in_progress when no checkout", () => {
    expect(computeCompletionStatus(utcAt("19:14"), null, eveningShift)).toBe("in_progress");
  });

  it("early_checkout for 17-minute punch (the real production bug scenario)", () => {
    expect(
      computeCompletionStatus(utcAt("19:14"), utcAt("19:31"), eveningShift),
    ).toBe("early_checkout");
  });

  it("completed for a full 3-hour punch", () => {
    expect(
      computeCompletionStatus(utcAt("19:00"), utcAt("22:05"), eveningShift),
    ).toBe("completed");
  });

  it("completed for punch meeting 80% threshold (144 min of 180)", () => {
    const checkOut = new Date(utcAt("19:00").getTime() + 144 * 60_000);
    expect(
      computeCompletionStatus(utcAt("19:00"), checkOut, eveningShift),
    ).toBe("completed");
  });

  it("early_checkout for punch 1 min below threshold (143 min of 180)", () => {
    const checkOut = new Date(utcAt("19:00").getTime() + 143 * 60_000);
    expect(
      computeCompletionStatus(utcAt("19:00"), checkOut, eveningShift),
    ).toBe("early_checkout");
  });

  it("checked_out (neutral) when no shift could be matched", () => {
    expect(computeCompletionStatus(utcAt("19:14"), utcAt("19:31"), null)).toBe("checked_out");
  });
});

// ─── shift label display ──────────────────────────────────────────────────────

describe("SHIFT_STATUS_LABEL has clean labels for checkout statuses", () => {
  const MOJIBAKE_PATTERN = /[\u00C2][\u00B7]|[\u00E2][\u20AC]/;

  it("completed label has no mojibake", () => {
    expect(SHIFT_STATUS_LABEL.completed.label).not.toMatch(MOJIBAKE_PATTERN);
    expect(SHIFT_STATUS_LABEL.completed.label).toBeTruthy();
  });

  it("early_checkout label has no mojibake", () => {
    expect(SHIFT_STATUS_LABEL.early_checkout.label).not.toMatch(MOJIBAKE_PATTERN);
    expect(SHIFT_STATUS_LABEL.early_checkout.label).toBeTruthy();
  });

  it("checked_out label has no mojibake", () => {
    expect(SHIFT_STATUS_LABEL.checked_out.label).not.toMatch(MOJIBAKE_PATTERN);
  });

  it("missed label has no mojibake", () => {
    expect(SHIFT_STATUS_LABEL.missed.label).not.toMatch(MOJIBAKE_PATTERN);
  });
});

// ─── today status block — clean strings ─────────────────────────────────────

describe("buildEmployeeTodayAttendanceStatus returns clean strings", () => {
  const MOJIBAKE_PATTERN = /[\u00C2][\u00B7]|[\u00E2][\u20AC]/;

  const baseHints = {
    businessDate: "2026-04-11",
    eligibilityHeadline: "Eligible",
    eligibilityDetail: "Within window",
    hasPendingCorrection: false,
    pendingCorrectionCount: 0,
    hasPendingManualCheckIn: false,
    pendingManualCheckInCount: 0,
    allShiftsHaveClosedAttendance: false,
  };

  it("checked-in status has no mojibake", () => {
    const r = buildEmployeeTodayAttendanceStatus({
      hints: baseHints,
      hintsReady: true,
      attendanceInconsistent: false,
      checkIn: new Date(2026, 3, 11, 19, 14),
      checkOut: null,
      isHoliday: false,
      hasSchedule: true,
      isWorkingDay: true,
    });
    expect(r.primaryLine).not.toMatch(MOJIBAKE_PATTERN);
  });

  it("day complete status has no mojibake", () => {
    const r = buildEmployeeTodayAttendanceStatus({
      hints: { ...baseHints, allShiftsHaveClosedAttendance: true },
      hintsReady: true,
      attendanceInconsistent: false,
      checkIn: new Date(2026, 3, 11, 19, 0),
      checkOut: new Date(2026, 3, 11, 22, 5),
      isHoliday: false,
      hasSchedule: true,
      isWorkingDay: true,
    });
    expect(r.primaryLine).not.toMatch(MOJIBAKE_PATTERN);
    if (r.secondaryLine) expect(r.secondaryLine).not.toMatch(MOJIBAKE_PATTERN);
  });

  it("early checkout status message has no mojibake", () => {
    const r = buildEmployeeTodayAttendanceStatus({
      hints: { ...baseHints, allShiftsHaveClosedAttendance: false },
      hintsReady: true,
      attendanceInconsistent: false,
      checkIn: new Date(2026, 3, 11, 19, 14),
      checkOut: new Date(2026, 3, 11, 19, 31),
      isHoliday: false,
      hasSchedule: true,
      isWorkingDay: true,
    });
    expect(r.primaryLine).not.toMatch(MOJIBAKE_PATTERN);
  });
});
