import { describe, it, expect } from "vitest";
import {
  evaluateCheckoutOutcome,
  evaluateCheckoutOutcomeByShiftTimes,
  CHECKOUT_COMPLETION_THRESHOLD_PERCENT,
} from "./attendanceCheckoutPolicy";
import { muscatWallDateTimeToUtc } from "./attendanceMuscatTime";

const BD = "2026-04-11"; // Friday — Muscat calendar date

function msAt(hhmm: string): number {
  return muscatWallDateTimeToUtc(BD, `${hhmm}:00`).getTime();
}

describe("evaluateCheckoutOutcome — direct ms params", () => {
  // Shift 09:00–17:00 = 480 min; 80% = 384 min required (checkout at 15:24)
  const shiftStartMs = msAt("09:00");
  const shiftEndMs = msAt("17:00");

  it("returns completed when employee works full shift", () => {
    const result = evaluateCheckoutOutcome({
      checkIn: new Date(msAt("09:05")),
      checkOut: new Date(msAt("17:05")),
      shiftStartMs,
      shiftEndMs,
    });
    expect(result.outcome).toBe("completed");
    expect(result.earlyMinutes).toBe(0);
    expect(result.completionPercent).toBeGreaterThanOrEqual(100);
  });

  it("returns completed when worker meets 80% threshold exactly", () => {
    // 384 min worked = 80% of 480; checkout at 09:00 + 384 min = 15:24
    const checkIn = new Date(msAt("09:00"));
    const checkOut = new Date(checkIn.getTime() + 384 * 60_000);
    const result = evaluateCheckoutOutcome({ checkIn, checkOut, shiftStartMs, shiftEndMs });
    expect(result.outcome).toBe("completed");
    expect(result.earlyMinutes).toBe(0);
  });

  it("returns early_checkout for 16-minute checkout (real bug scenario)", () => {
    // Shift 19:00–22:00 = 180 min; 80% = 144 min; 17 min << 144 min
    const sMs = msAt("19:00");
    let eMs = msAt("22:00");
    const result = evaluateCheckoutOutcome({
      checkIn: new Date(msAt("19:14")),
      checkOut: new Date(msAt("19:31")),
      shiftStartMs: sMs,
      shiftEndMs: eMs,
    });
    expect(result.outcome).toBe("early_checkout");
    expect(result.workedMinutes).toBe(17);
    expect(result.shiftMinutes).toBe(180);
    expect(result.earlyMinutes).toBeGreaterThan(0);
    expect(result.completionPercent).toBeLessThan(CHECKOUT_COMPLETION_THRESHOLD_PERCENT);
  });

  it("returns early_checkout when 1 min under threshold", () => {
    const checkIn = new Date(msAt("09:00"));
    const checkOut = new Date(checkIn.getTime() + 383 * 60_000); // 1 min short
    const result = evaluateCheckoutOutcome({ checkIn, checkOut, shiftStartMs, shiftEndMs });
    expect(result.outcome).toBe("early_checkout");
    expect(result.earlyMinutes).toBe(1);
  });

  it("respects custom threshold override", () => {
    // 50% threshold: 240 min needed from 480 min shift
    const checkIn = new Date(msAt("09:00"));
    const checkOut = new Date(checkIn.getTime() + 240 * 60_000);
    const result = evaluateCheckoutOutcome({
      checkIn,
      checkOut,
      shiftStartMs,
      shiftEndMs,
      thresholdPercent: 50,
    });
    expect(result.outcome).toBe("completed");
  });

  it("earlyMinutes is 0 for completed outcome", () => {
    const checkIn = new Date(msAt("09:00"));
    const checkOut = new Date(msAt("17:00"));
    const result = evaluateCheckoutOutcome({ checkIn, checkOut, shiftStartMs, shiftEndMs });
    expect(result.earlyMinutes).toBe(0);
  });
});

describe("evaluateCheckoutOutcomeByShiftTimes — wall-time wrapper", () => {
  it("handles standard day shift correctly", () => {
    const result = evaluateCheckoutOutcomeByShiftTimes({
      checkIn: new Date(msAt("09:10")),
      checkOut: new Date(msAt("17:05")),
      businessDate: BD,
      shiftStartTime: "09:00",
      shiftEndTime: "17:00",
    });
    expect(result.outcome).toBe("completed");
  });

  it("detects early checkout for short afternoon punch", () => {
    // 3-hour shift 14:00–17:00; employee works only 30 min
    const result = evaluateCheckoutOutcomeByShiftTimes({
      checkIn: new Date(msAt("14:00")),
      checkOut: new Date(msAt("14:30")),
      businessDate: BD,
      shiftStartTime: "14:00",
      shiftEndTime: "17:00",
    });
    expect(result.outcome).toBe("early_checkout");
    expect(result.shiftMinutes).toBe(180);
    expect(result.workedMinutes).toBe(30);
  });

  it("handles overnight shift (23:00–07:00) without crash", () => {
    const result = evaluateCheckoutOutcomeByShiftTimes({
      checkIn: new Date(msAt("23:00")),
      checkOut: new Date(msAt("23:30")), // only 30 min of an 8-hour shift
      businessDate: BD,
      shiftStartTime: "23:00",
      shiftEndTime: "07:00",
    });
    expect(result.outcome).toBe("early_checkout");
    expect(result.shiftMinutes).toBe(480); // 8 hours
    expect(result.workedMinutes).toBe(30);
  });
});

describe("CHECKOUT_COMPLETION_THRESHOLD_PERCENT constant", () => {
  it("is 80 (the agreed business default)", () => {
    expect(CHECKOUT_COMPLETION_THRESHOLD_PERCENT).toBe(80);
  });
});
