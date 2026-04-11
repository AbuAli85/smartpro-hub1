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
    expect(h.hasPendingManualCheckIn).toBe(false);
    expect(h.pendingManualCheckInCount).toBe(0);
    expect(h.businessDate).toBe("2026-04-05");
    expect(new Date(h.serverNowIso).getTime()).toBe(now.getTime());
    expect(h.eligibilityHeadline).toBe("Eligible to check in");
    expect(h.shiftStatusLabel).toBe("Active now");
    expect(h.checkInDenialCode).toBeNull();
    expect(h.allShiftsHaveClosedAttendance).toBe(false);
    expect(h.minutesLateAfterGrace).toBeNull();
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
    expect(h.allShiftsHaveClosedAttendance).toBe(false);
    expect(h.minutesLateAfterGrace).toBeNull();
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
    expect(h.allShiftsHaveClosedAttendance).toBe(false);
    expect(h.minutesLateAfterGrace).toBeNull();
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
    expect(h.allShiftsHaveClosedAttendance).toBe(false);
    expect(h.minutesLateAfterGrace).toBeNull();
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
    expect(h.hasPendingManualCheckIn).toBe(false);
    expect(h.pendingManualCheckInCount).toBe(0);
    expect(h.eligibilityHeadline).toBe("Attendance needs review");
    expect(h.allShiftsHaveClosedAttendance).toBe(false);
    expect(h.minutesLateAfterGrace).toBeNull();
  });

  it("surfaces pending manual check-in requests", () => {
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
      pendingManualCheckInCount: 1,
      gracePeriodMinutes: 15,
    });
    expect(h.hasPendingManualCheckIn).toBe(true);
    expect(h.pendingManualCheckInCount).toBe(1);
  });

  it("reports minutes late after grace when checked in without check-out", () => {
    const now = new Date(2026, 3, 5, 9, 30, 0);
    const h = computePortalOperationalHints({
      now,
      businessDate: "2026-04-05",
      startTime: "09:00",
      endTime: "17:00",
      isHoliday: false,
      isWorkingDay: true,
      hasSchedule: true,
      hasShift: true,
      checkIn: new Date(2026, 3, 5, 9, 20, 0),
      checkOut: null,
      pendingCorrectionCount: 0,
      gracePeriodMinutes: 15,
    });
    expect(h.minutesLateAfterGrace).toBeGreaterThan(0);
    expect(h.allShiftsHaveClosedAttendance).toBe(false);
  });

  it("after shift end, nudges check-out in banner text and eligibility while still clocked in", () => {
    const now = new Date(2026, 3, 5, 18, 30, 0);
    const h = computePortalOperationalHints({
      now,
      businessDate: "2026-04-05",
      startTime: "09:00",
      endTime: "17:00",
      isHoliday: false,
      isWorkingDay: true,
      hasSchedule: true,
      hasShift: true,
      checkIn: new Date(2026, 3, 5, 9, 0, 0),
      checkOut: null,
      pendingCorrectionCount: 0,
      gracePeriodMinutes: 15,
    });
    expect(h.resolvedShiftPhase).toBe("ended");
    expect(h.canCheckOut).toBe(true);
    expect(h.shiftDetailLine).toContain("Check out");
    expect(h.eligibilityHeadline).toContain("check out");
    expect(h.eligibilityDetail).toContain("ended");
  });
});
