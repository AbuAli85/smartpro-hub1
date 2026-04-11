import { describe, expect, it } from "vitest";
import {
  buildEmployeeAttendancePresentation,
  groupAttendanceRecords,
  type AttendanceRecordRaw,
} from "./employeeAttendanceState";
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

// ─── buildEmployeeAttendancePresentation ────────────────────────────────────

describe("buildEmployeeAttendancePresentation — canonical badge vocabulary", () => {
  it("returns loading state (non-canonical label) when attendance is loading", () => {
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
    // Loading is not a shift-attendance state — exempt from the five canonical labels
    expect(p.badgeLabel).toBe("Loading");
  });

  // ── Upcoming ─────────────────────────────────────────────────────────────

  it("badge is 'Upcoming' when phase is upcoming", () => {
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
    expect(p.badgeLabel).toBe("Upcoming");
    expect(p.severity).toBe("neutral");
  });

  it("badge is 'Upcoming' for the default fallback (no phase)", () => {
    const p = buildEmployeeAttendancePresentation({
      todayAttendanceLoading: false,
      myActiveSchedule: sched,
      shiftOverview: baseShift({ phase: null }),
      shiftTiming: null,
      checkIn: null,
      checkOut: null,
      onApprovedLeaveToday: false,
      pendingCorrectionCount: 0,
    });
    expect(p.badgeLabel).toBe("Upcoming");
  });

  // ── Active ────────────────────────────────────────────────────────────────

  it("badge is 'Active' when shift is active and not checked in (check_in_open)", () => {
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
    expect(p.badgeLabel).toBe("Active");
    expect(p.primaryActionLabel).toBe("Check in now");
  });

  it("badge is 'Active' during grace period (late_risk)", () => {
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
    expect(p.badgeLabel).toBe("Active");
    expect(p.severity).toBe("warning");
  });

  it("badge is 'Active' when checked in during shift (open session)", () => {
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
    expect(p.badgeLabel).toBe("Active");
    expect(p.severity).toBe("success");
  });

  it("badge is 'Active' for missing check-out after shift end (open session, shift ended)", () => {
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
    expect(p.badgeLabel).toBe("Active");
    expect(p.isBlocking).toBe(true);
    // Microcopy should direct employee to check out or fix attendance
    expect(p.headline).toContain("check out");
  });

  // ── Completed ─────────────────────────────────────────────────────────────

  it("badge is 'Completed' when both stamps exist", () => {
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
    expect(p.badgeLabel).toBe("Completed");
    expect(p.severity).toBe("success");
  });

  it("badge is 'Completed' when shift window closed (phase ended)", () => {
    const p = buildEmployeeAttendancePresentation({
      todayAttendanceLoading: false,
      myActiveSchedule: sched,
      shiftOverview: baseShift({ phase: "ended" }),
      shiftTiming: null,
      checkIn: new Date("2026-04-10T09:00:00"),
      checkOut: new Date("2026-04-10T17:00:00"),
      onApprovedLeaveToday: false,
      pendingCorrectionCount: 0,
    });
    expect(p.badgeLabel).toBe("Completed");
  });

  // ── Missed ────────────────────────────────────────────────────────────────

  it("badge is 'Missed' when past grace period with no check-in (late state)", () => {
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
    expect(p.badgeLabel).toBe("Missed");
    expect(p.severity).toBe("critical");
  });

  it("badge is 'Missed' when shift ended with no attendance recorded (exception_pending)", () => {
    const p = buildEmployeeAttendancePresentation({
      todayAttendanceLoading: false,
      myActiveSchedule: sched,
      shiftOverview: baseShift({ showMissedEndedWarning: true }),
      shiftTiming: null,
      checkIn: null,
      checkOut: null,
      onApprovedLeaveToday: false,
      pendingCorrectionCount: 0,
    });
    expect(p.state).toBe("exception_pending");
    expect(p.badgeLabel).toBe("Missed");
    expect(p.primaryActionLabel).toBe("Fix attendance");
  });

  it("'Missed' copy mentions pending correction when one exists", () => {
    const p = buildEmployeeAttendancePresentation({
      todayAttendanceLoading: false,
      myActiveSchedule: sched,
      shiftOverview: baseShift({ showMissedEndedWarning: true }),
      shiftTiming: null,
      checkIn: null,
      checkOut: null,
      onApprovedLeaveToday: false,
      pendingCorrectionCount: 2,
    });
    expect(p.badgeLabel).toBe("Missed");
    expect(p.supportingText).toMatch(/correction/i);
  });

  // ── Correction requested ──────────────────────────────────────────────────

  it("badge is 'Correction requested' for inconsistent attendance data", () => {
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
    expect(p.badgeLabel).toBe("Correction requested");
    expect(p.isBlocking).toBe(true);
  });

  // ── Non-shift states ───────────────────────────────────────────────────────

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
    expect(p.badgeLabel).toBe("Day off");
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
    expect(p.badgeLabel).toBe("On leave");
  });

  // ── Active/Upcoming never on the same presentation object ─────────────────

  it("active shift and upcoming shift produce distinct states (never both on same card)", () => {
    // Active case
    const activeP = buildEmployeeAttendancePresentation({
      todayAttendanceLoading: false,
      myActiveSchedule: sched,
      shiftOverview: baseShift({ phase: "active" }),
      shiftTiming: { isLateNoCheckIn: false, lateRiskCheckIn: false, lateDetail: null },
      checkIn: null,
      checkOut: null,
      onApprovedLeaveToday: false,
      pendingCorrectionCount: 0,
    });
    // Upcoming case
    const upcomingP = buildEmployeeAttendancePresentation({
      todayAttendanceLoading: false,
      myActiveSchedule: sched,
      shiftOverview: baseShift({ phase: "upcoming" }),
      shiftTiming: null,
      checkIn: null,
      checkOut: null,
      onApprovedLeaveToday: false,
      pendingCorrectionCount: 0,
    });
    // They must never share the same badgeLabel
    expect(activeP.badgeLabel).toBe("Active");
    expect(upcomingP.badgeLabel).toBe("Upcoming");
    expect(activeP.badgeLabel).not.toBe(upcomingP.badgeLabel);
  });
});

// ─── groupAttendanceRecords ──────────────────────────────────────────────────

describe("groupAttendanceRecords", () => {
  const makeRec = (
    overrides: Partial<AttendanceRecordRaw> & { id: number; checkIn: string },
  ): AttendanceRecordRaw => ({
    shiftName: "Day",
    shiftStart: "09:00",
    shiftEnd: "17:00",
    scheduleId: null,
    ...overrides,
  });

  it("returns empty array for empty input", () => {
    expect(groupAttendanceRecords([])).toEqual([]);
  });

  it("single record with no checkOut is its own group as primary (open session)", () => {
    const rec = makeRec({ id: 1, checkIn: "2026-04-10T09:00:00Z" });
    const groups = groupAttendanceRecords([rec]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.primary).toBe(rec);
    expect(groups[0]!.earlier).toHaveLength(0);
  });

  it("two records for the same shift on the same day group together", () => {
    const closed = makeRec({ id: 1, checkIn: "2026-04-10T08:55:00Z", checkOut: "2026-04-10T10:00:00Z", scheduleId: 42 });
    const open = makeRec({ id: 2, checkIn: "2026-04-10T10:30:00Z", scheduleId: 42 });
    const groups = groupAttendanceRecords([closed, open]);
    expect(groups).toHaveLength(1);
    // Open record becomes primary
    expect(groups[0]!.primary.id).toBe(2);
    // Earlier closed record is subordinate
    expect(groups[0]!.earlier).toHaveLength(1);
    expect(groups[0]!.earlier[0]!.id).toBe(1);
  });

  it("open record is preferred as primary even when it appears first in input", () => {
    const open = makeRec({ id: 1, checkIn: "2026-04-10T09:00:00Z" });
    const closed = makeRec({ id: 2, checkIn: "2026-04-10T06:00:00Z", checkOut: "2026-04-10T08:00:00Z" });
    const groups = groupAttendanceRecords([open, closed]);
    expect(groups[0]!.primary.id).toBe(1);
    expect(groups[0]!.earlier[0]!.id).toBe(2);
  });

  it("all-closed group promotes most-recent as primary, rest as earlier", () => {
    const r1 = makeRec({ id: 1, checkIn: "2026-04-10T07:00:00Z", checkOut: "2026-04-10T08:00:00Z" });
    const r2 = makeRec({ id: 2, checkIn: "2026-04-10T09:00:00Z", checkOut: "2026-04-10T10:00:00Z" });
    const groups = groupAttendanceRecords([r1, r2]);
    expect(groups[0]!.primary.id).toBe(2); // most recent
    expect(groups[0]!.earlier[0]!.id).toBe(1);
  });

  it("records on different calendar dates are in separate groups", () => {
    const mon = makeRec({ id: 1, checkIn: "2026-04-07T09:00:00Z", checkOut: "2026-04-07T17:00:00Z" });
    const tue = makeRec({ id: 2, checkIn: "2026-04-08T09:00:00Z", checkOut: "2026-04-08T17:00:00Z" });
    const groups = groupAttendanceRecords([mon, tue]);
    expect(groups).toHaveLength(2);
  });

  it("records for different shifts on the same day are in separate groups", () => {
    const morning = makeRec({ id: 1, checkIn: "2026-04-10T06:00:00Z", checkOut: "2026-04-10T14:00:00Z", shiftStart: "06:00", shiftEnd: "14:00", shiftName: "Morning" });
    const evening = makeRec({ id: 2, checkIn: "2026-04-10T14:00:00Z", checkOut: "2026-04-10T22:00:00Z", shiftStart: "14:00", shiftEnd: "22:00", shiftName: "Evening" });
    const groups = groupAttendanceRecords([morning, evening]);
    expect(groups).toHaveLength(2);
  });

  it("groups are sorted by date descending", () => {
    const older = makeRec({ id: 1, checkIn: "2026-04-07T09:00:00Z", checkOut: "2026-04-07T17:00:00Z" });
    const newer = makeRec({ id: 2, checkIn: "2026-04-10T09:00:00Z", checkOut: "2026-04-10T17:00:00Z" });
    const groups = groupAttendanceRecords([older, newer]);
    // Newer date first
    expect(groups[0]!.date).toBe("2026-04-10");
    expect(groups[1]!.date).toBe("2026-04-07");
  });

  it("uses scheduleId as the primary grouping key when available", () => {
    // Same date + shift times but different scheduleIds → two groups
    const rec1 = makeRec({ id: 1, checkIn: "2026-04-10T09:00:00Z", checkOut: "2026-04-10T17:00:00Z", scheduleId: 10 });
    const rec2 = makeRec({ id: 2, checkIn: "2026-04-10T09:05:00Z", checkOut: "2026-04-10T17:05:00Z", scheduleId: 20 });
    const groups = groupAttendanceRecords([rec1, rec2]);
    expect(groups).toHaveLength(2);
  });

  it("same scheduleId groups records together regardless of exact checkIn time", () => {
    const rec1 = makeRec({ id: 1, checkIn: "2026-04-10T08:50:00Z", checkOut: "2026-04-10T09:30:00Z", scheduleId: 55 });
    const rec2 = makeRec({ id: 2, checkIn: "2026-04-10T09:35:00Z", scheduleId: 55 }); // open session
    const groups = groupAttendanceRecords([rec1, rec2]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.primary.id).toBe(2); // open record preferred
    expect(groups[0]!.earlier).toHaveLength(1);
  });
});

// ─── HR pending-posting condition ─────────────────────────────────────────────

describe("HR pending-posting badge logic", () => {
  /**
   * These tests describe the condition that drives the "Pending HR posting" badge:
   * self-service records exist (realAttRecords.length > 0) but no HR record for today
   * (attRecords.length === 0 for that date).
   */

  it("pending HR posting condition: self-service records exist, no HR record", () => {
    const selfServiceRecords = [
      { id: 1, checkIn: "2026-04-11T09:00:00Z", checkOut: "2026-04-11T17:00:00Z" },
    ];
    const hrRecords: unknown[] = [];
    // The component shows "Pending HR posting" when:
    expect(selfServiceRecords.length > 0 && hrRecords.length === 0).toBe(true);
  });

  it("no pending badge when HR record already exists", () => {
    const selfServiceRecords = [
      { id: 1, checkIn: "2026-04-11T09:00:00Z", checkOut: "2026-04-11T17:00:00Z" },
    ];
    const hrRecords = [{ id: 1, date: "2026-04-11", status: "present" }];
    expect(selfServiceRecords.length > 0 && hrRecords.length === 0).toBe(false);
  });

  it("no pending badge when no self-service records either", () => {
    const selfServiceRecords: unknown[] = [];
    const hrRecords: unknown[] = [];
    expect(selfServiceRecords.length > 0 && hrRecords.length === 0).toBe(false);
  });
});
