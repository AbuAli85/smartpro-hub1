import { describe, expect, it } from "vitest";
import { buildEmployeeTodayAttendanceStatus } from "./employeeTodayAttendanceStatus";

const baseHints = {
  businessDate: "2026-04-11",
  eligibilityHeadline: "Eligible to check in",
  eligibilityDetail: "Within window.",
  hasPendingCorrection: false,
  pendingCorrectionCount: 0,
  hasPendingManualCheckIn: false,
  pendingManualCheckInCount: 0,
  allShiftsHaveClosedAttendance: false,
};

describe("buildEmployeeTodayAttendanceStatus", () => {
  it("shows loading when hints not ready", () => {
    const r = buildEmployeeTodayAttendanceStatus({
      hints: null,
      hintsReady: false,
      attendanceInconsistent: false,
      checkIn: null,
      checkOut: null,
      isHoliday: false,
      hasSchedule: true,
      isWorkingDay: true,
    });
    expect(r.primaryLine).toContain("Loading");
  });

  it("ready but no hints payload", () => {
    const r = buildEmployeeTodayAttendanceStatus({
      hints: null,
      hintsReady: true,
      attendanceInconsistent: false,
      checkIn: null,
      checkOut: null,
      isHoliday: false,
      hasSchedule: true,
      isWorkingDay: true,
    });
    expect(r.primaryLine).toContain("unavailable");
  });

  it("checked in, not out", () => {
    const cin = new Date(2026, 3, 11, 8, 3, 0);
    const r = buildEmployeeTodayAttendanceStatus({
      hints: { ...baseHints },
      hintsReady: true,
      attendanceInconsistent: false,
      checkIn: cin,
      checkOut: null,
      isHoliday: false,
      hasSchedule: true,
      isWorkingDay: true,
    });
    expect(r.primaryLine).toMatch(/Checked in at/);
    expect(r.primaryLine).toMatch(/Not checked out/);
  });

  it("day complete when both punches and all shifts closed", () => {
    const cin = new Date(2026, 3, 11, 8, 0, 0);
    const cout = new Date(2026, 3, 11, 17, 6, 0);
    const r = buildEmployeeTodayAttendanceStatus({
      hints: { ...baseHints, allShiftsHaveClosedAttendance: true },
      hintsReady: true,
      attendanceInconsistent: false,
      checkIn: cin,
      checkOut: cout,
      isHoliday: false,
      hasSchedule: true,
      isWorkingDay: true,
    });
    expect(r.primaryLine).toMatch(/Day complete/);
    expect(r.primaryLine).toMatch(/Checked out at/);
  });

  it("needs HR when manual pending", () => {
    const r = buildEmployeeTodayAttendanceStatus({
      hints: {
        ...baseHints,
        hasPendingManualCheckIn: true,
        pendingManualCheckInCount: 1,
      },
      hintsReady: true,
      attendanceInconsistent: false,
      checkIn: null,
      checkOut: null,
      isHoliday: false,
      hasSchedule: true,
      isWorkingDay: true,
    });
    expect(r.primaryLine).toBe("Needs HR review");
    expect(r.secondaryLine).toMatch(/Manual attendance request pending/);
  });
});
