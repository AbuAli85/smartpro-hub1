import { describe, expect, it } from "vitest";
import { buildEmployeeAttendancePresentation } from "./employeeAttendanceState";
import type { OverviewShiftCardPresentation } from "./employeePortalOverviewPresentation";

const baseShift = (over: Partial<OverviewShiftCardPresentation> = {}): OverviewShiftCardPresentation => ({
  operational: null,
  phase: null,
  primaryCtaLabel: "Go to attendance",
  showSecondaryLogWork: false,
  showMissedActiveWarning: false,
  showMissedEndedWarning: false,
  attendancePending: false,
  attendanceInconsistent: false,
  correctionPendingNote: null,
  warningTone: "none",
  ...over,
});

const sched = {
  schedule: {},
  shift: { startTime: "09:00", endTime: "17:00", name: "Day" },
  hasSchedule: true,
  isWorkingDay: true,
};

describe("buildEmployeeAttendancePresentation", () => {
  it("returns loading when attendance is loading", () => {
    const p = buildEmployeeAttendancePresentation({
      todayAttendanceLoading: true,
      myActiveSchedule: sched,
      shiftOverview: baseShift(),
      shiftTiming: null,
      checkIn: null,
      checkOut: null,
      onApprovedLeaveToday: false,
      pendingCorrectionCount: 0,
    });
    expect(p.state).toBe("loading");
  });

  it("models before_shift when phase is upcoming", () => {
    const p = buildEmployeeAttendancePresentation({
      todayAttendanceLoading: false,
      myActiveSchedule: sched,
      shiftOverview: baseShift({ phase: "upcoming" }),
      shiftTiming: null,
      checkIn: null,
      checkOut: null,
      onApprovedLeaveToday: false,
      pendingCorrectionCount: 0,
    });
    expect(p.state).toBe("before_shift");
    expect(p.severity).toBe("neutral");
  });

  it("models check_in_open when shift active and not checked in", () => {
    const p = buildEmployeeAttendancePresentation({
      todayAttendanceLoading: false,
      myActiveSchedule: sched,
      shiftOverview: baseShift({ phase: "active" }),
      shiftTiming: { isLateNoCheckIn: false, lateRiskCheckIn: false, lateDetail: null },
      checkIn: null,
      checkOut: null,
      onApprovedLeaveToday: false,
      pendingCorrectionCount: 0,
    });
    expect(p.state).toBe("check_in_open");
    expect(p.primaryActionLabel).toBe("Check in now");
  });

  it("models late_risk inside grace", () => {
    const p = buildEmployeeAttendancePresentation({
      todayAttendanceLoading: false,
      myActiveSchedule: sched,
      shiftOverview: baseShift({ phase: "active" }),
      shiftTiming: { isLateNoCheckIn: false, lateRiskCheckIn: true, lateDetail: "Grace until 09:15" },
      checkIn: null,
      checkOut: null,
      onApprovedLeaveToday: false,
      pendingCorrectionCount: 0,
    });
    expect(p.state).toBe("late_risk");
    expect(p.severity).toBe("warning");
  });

  it("models late past grace", () => {
    const p = buildEmployeeAttendancePresentation({
      todayAttendanceLoading: false,
      myActiveSchedule: sched,
      shiftOverview: baseShift({ phase: "active" }),
      shiftTiming: { isLateNoCheckIn: true, lateRiskCheckIn: false, lateDetail: "Started 09:00" },
      checkIn: null,
      checkOut: null,
      onApprovedLeaveToday: false,
      pendingCorrectionCount: 0,
    });
    expect(p.state).toBe("late");
    expect(p.severity).toBe("critical");
  });

  it("models checked_in during shift", () => {
    const p = buildEmployeeAttendancePresentation({
      todayAttendanceLoading: false,
      myActiveSchedule: sched,
      shiftOverview: baseShift({ phase: "active", primaryCtaLabel: "Check out now" }),
      shiftTiming: null,
      checkIn: new Date("2026-04-10T10:00:00"),
      checkOut: null,
      onApprovedLeaveToday: false,
      pendingCorrectionCount: 0,
    });
    expect(p.state).toBe("checked_in");
    expect(p.severity).toBe("success");
  });

  it("models missing_check_out after shift end", () => {
    const p = buildEmployeeAttendancePresentation({
      todayAttendanceLoading: false,
      myActiveSchedule: sched,
      shiftOverview: baseShift({ phase: "ended" }),
      shiftTiming: null,
      checkIn: new Date("2026-04-10T09:00:00"),
      checkOut: null,
      onApprovedLeaveToday: false,
      pendingCorrectionCount: 0,
    });
    expect(p.state).toBe("missing_check_out");
    expect(p.isBlocking).toBe(true);
  });

  it("models completed when both stamps exist", () => {
    const p = buildEmployeeAttendancePresentation({
      todayAttendanceLoading: false,
      myActiveSchedule: sched,
      shiftOverview: baseShift({ phase: "active" }),
      shiftTiming: null,
      checkIn: new Date("2026-04-10T09:00:00"),
      checkOut: new Date("2026-04-10T17:00:00"),
      onApprovedLeaveToday: false,
      pendingCorrectionCount: 0,
    });
    expect(p.state).toBe("completed");
    expect(p.severity).toBe("success");
  });

  it("models day_off when not a working day", () => {
    const p = buildEmployeeAttendancePresentation({
      todayAttendanceLoading: false,
      myActiveSchedule: { ...sched, isWorkingDay: false },
      shiftOverview: baseShift(),
      shiftTiming: null,
      checkIn: null,
      checkOut: null,
      onApprovedLeaveToday: false,
      pendingCorrectionCount: 0,
    });
    expect(p.state).toBe("day_off");
  });

  it("models leave when approved leave covers today", () => {
    const p = buildEmployeeAttendancePresentation({
      todayAttendanceLoading: false,
      myActiveSchedule: sched,
      shiftOverview: baseShift(),
      shiftTiming: null,
      checkIn: null,
      checkOut: null,
      onApprovedLeaveToday: true,
      pendingCorrectionCount: 0,
    });
    expect(p.state).toBe("leave");
  });

  it("models exception_pending for inconsistent attendance", () => {
    const p = buildEmployeeAttendancePresentation({
      todayAttendanceLoading: false,
      myActiveSchedule: sched,
      shiftOverview: baseShift({ attendanceInconsistent: true }),
      shiftTiming: null,
      checkIn: null,
      checkOut: null,
      onApprovedLeaveToday: false,
      pendingCorrectionCount: 0,
    });
    expect(p.state).toBe("exception_pending");
    expect(p.primaryActionLabel).toBe("Fix attendance");
  });
});
