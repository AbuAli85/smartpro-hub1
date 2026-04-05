import { describe, expect, it } from "vitest";
import { computePortalOperationalHints } from "./employeePortalOperationalHints";

describe("computePortalOperationalHints", () => {
  it("exposes flags and phase from shift + attendance (mid-shift day)", () => {
    const now = new Date(2026, 3, 5, 12, 0, 0);
    const h = computePortalOperationalHints({
      now,
      businessDate: "2026-04-05",
      startTime: "09:00",
      endTime: "17:00",
      isHoliday: false,
      isWorkingDay: true,
      hasSchedule: true,
      hasShift: true,
      checkIn: null,
      checkOut: null,
      pendingCorrectionCount: 0,
      gracePeriodMinutes: 15,
    });
    expect(h.resolvedShiftPhase).toBe("active");
    expect(h.canCheckIn).toBe(true);
    expect(h.canCheckOut).toBe(false);
    expect(h.canRequestCorrection).toBe(true);
    expect(h.hasPendingCorrection).toBe(false);
    expect(h.pendingCorrectionCount).toBe(0);
    expect(h.businessDate).toBe("2026-04-05");
    expect(new Date(h.serverNowIso).getTime()).toBe(now.getTime());
    expect(h.eligibilityHeadline).toBe("Eligible to check in");
    expect(h.shiftStatusLabel).toBe("Active now");
    expect(h.checkInDenialCode).toBeNull();
  });

  it("blocks check-in before early-open window (grace before start)", () => {
    const now = new Date(2026, 3, 5, 12, 0, 0); // noon
    const h = computePortalOperationalHints({
      now,
      businessDate: "2026-04-05",
      startTime: "15:00",
      endTime: "22:00",
      isHoliday: false,
      isWorkingDay: true,
      hasSchedule: true,
      hasShift: true,
      checkIn: null,
      checkOut: null,
      pendingCorrectionCount: 0,
      gracePeriodMinutes: 15,
    });
    expect(h.resolvedShiftPhase).toBe("upcoming");
    expect(h.canCheckIn).toBe(false);
    expect(h.eligibilityHeadline).toBe("Not eligible yet");
    expect(h.checkInOpensAt).toBe("14:45");
    expect(h.eligibilityDetail).toContain("14:45");
    expect(h.checkInDenialCode).toBe("CHECK_IN_TOO_EARLY");
  });

  it("allows check-in inside early-open window before nominal start", () => {
    const now = new Date(2026, 3, 5, 14, 50, 0);
    const h = computePortalOperationalHints({
      now,
      businessDate: "2026-04-05",
      startTime: "15:00",
      endTime: "22:00",
      isHoliday: false,
      isWorkingDay: true,
      hasSchedule: true,
      hasShift: true,
      checkIn: null,
      checkOut: null,
      pendingCorrectionCount: 0,
      gracePeriodMinutes: 15,
    });
    expect(h.canCheckIn).toBe(true);
    expect(h.eligibilityHeadline).toBe("Eligible to check in");
  });

  it("closes check-in after shift end when still not checked in", () => {
    const now = new Date(2026, 3, 5, 23, 0, 0);
    const h = computePortalOperationalHints({
      now,
      businessDate: "2026-04-05",
      startTime: "15:00",
      endTime: "22:00",
      isHoliday: false,
      isWorkingDay: true,
      hasSchedule: true,
      hasShift: true,
      checkIn: null,
      checkOut: null,
      pendingCorrectionCount: 0,
      gracePeriodMinutes: 15,
    });
    expect(h.resolvedShiftPhase).toBe("ended");
    expect(h.canCheckIn).toBe(false);
    expect(h.eligibilityHeadline).toBe("Check-in closed");
  });

  it("detects pending correction and blocks check-in when inconsistent", () => {
    const now = new Date(2026, 3, 5, 12, 0, 0);
    const h = computePortalOperationalHints({
      now,
      businessDate: "2026-04-05",
      startTime: "09:00",
      endTime: "17:00",
      isHoliday: false,
      isWorkingDay: true,
      hasSchedule: true,
      hasShift: true,
      checkIn: null,
      checkOut: now,
      pendingCorrectionCount: 2,
      gracePeriodMinutes: 15,
    });
    expect(h.canCheckIn).toBe(false);
    expect(h.canCheckOut).toBe(false);
    expect(h.hasPendingCorrection).toBe(true);
    expect(h.pendingCorrectionCount).toBe(2);
    expect(h.eligibilityHeadline).toBe("Attendance needs review");
  });
});
