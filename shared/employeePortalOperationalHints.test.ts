import { describe, expect, it } from "vitest";
import { computePortalOperationalHints } from "./employeePortalOperationalHints";

describe("computePortalOperationalHints", () => {
  it("exposes flags and phase from shift + attendance", () => {
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
    });
    expect(h.resolvedShiftPhase).toBe("active");
    expect(h.canCheckIn).toBe(true);
    expect(h.canCheckOut).toBe(false);
    expect(h.canRequestCorrection).toBe(true);
    expect(h.hasPendingCorrection).toBe(false);
    expect(h.pendingCorrectionCount).toBe(0);
    expect(h.businessDate).toBe("2026-04-05");
    expect(new Date(h.serverNowIso).getTime()).toBe(now.getTime());
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
    });
    expect(h.canCheckIn).toBe(false);
    expect(h.canCheckOut).toBe(false);
    expect(h.hasPendingCorrection).toBe(true);
    expect(h.pendingCorrectionCount).toBe(2);
  });
});
