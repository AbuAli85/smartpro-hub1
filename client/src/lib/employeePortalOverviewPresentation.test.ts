import { describe, expect, it } from "vitest";
import {
  getAttendanceTodayStripPresentation,
  getOverviewShiftCardPresentation,
  getQuickActionsPresentation,
} from "./employeePortalOverviewPresentation";

const fixed = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min, 0, 0);

describe("getOverviewShiftCardPresentation", () => {
  it("1. No shift times → no operational phase, safe CTA", () => {
    const r = getOverviewShiftCardPresentation({
      startTime: null,
      endTime: null,
      now: fixed(2026, 4, 5, 12),
      attendanceLoading: false,
    });
    expect(r.operational).toBeNull();
    expect(r.phase).toBeNull();
    expect(r.primaryCtaLabel).toBe("Open attendance");
    expect(r.showMissedActiveWarning).toBe(false);
    expect(r.showMissedEndedWarning).toBe(false);
  });

  it("2. Upcoming shift, not checked in", () => {
    const r = getOverviewShiftCardPresentation({
      startTime: "14:00",
      endTime: "18:00",
      now: fixed(2026, 4, 5, 12),
      attendanceLoading: false,
    });
    expect(r.phase).toBe("upcoming");
    expect(r.primaryCtaLabel).toBe("Prepare");
    expect(r.showSecondaryLogWork).toBe(false);
  });

  it("3. Active shift, not checked in", () => {
    const r = getOverviewShiftCardPresentation({
      startTime: "09:00",
      endTime: "17:00",
      now: fixed(2026, 4, 5, 12),
      attendanceLoading: false,
    });
    expect(r.phase).toBe("active");
    expect(r.primaryCtaLabel).toBe("Check in now");
    expect(r.showMissedActiveWarning).toBe(true);
    expect(r.warningTone).toBe("amber");
  });

  it("4. Active shift, checked in, not checked out", () => {
    const r = getOverviewShiftCardPresentation({
      startTime: "09:00",
      endTime: "17:00",
      now: fixed(2026, 4, 5, 12),
      attendanceLoading: false,
      checkIn: fixed(2026, 4, 5, 9, 5),
      checkOut: null,
    });
    expect(r.primaryCtaLabel).toBe("Check out");
    expect(r.showMissedActiveWarning).toBe(false);
  });

  it("5. Ended shift, open attendance (checked in, not out)", () => {
    const r = getOverviewShiftCardPresentation({
      startTime: "09:00",
      endTime: "17:00",
      now: fixed(2026, 4, 5, 18),
      attendanceLoading: false,
      checkIn: fixed(2026, 4, 5, 9),
      checkOut: null,
    });
    expect(r.phase).toBe("ended");
    expect(r.primaryCtaLabel).toBe("Check out");
    expect(r.showSecondaryLogWork).toBe(true);
  });

  it("6. Ended shift, no attendance record", () => {
    const r = getOverviewShiftCardPresentation({
      startTime: "09:00",
      endTime: "17:00",
      now: fixed(2026, 4, 5, 18),
      attendanceLoading: false,
      checkIn: null,
      checkOut: null,
      pendingCorrectionCount: 0,
    });
    expect(r.primaryCtaLabel).toBe("Request correction");
    expect(r.showMissedEndedWarning).toBe(true);
    expect(r.warningTone).toBe("red");
  });

  it("7. Ended shift, correction already requested", () => {
    const r = getOverviewShiftCardPresentation({
      startTime: "09:00",
      endTime: "17:00",
      now: fixed(2026, 4, 5, 18),
      attendanceLoading: false,
      checkIn: null,
      checkOut: null,
      pendingCorrectionCount: 1,
    });
    expect(r.primaryCtaLabel).toBe("Open attendance");
    expect(r.correctionPendingNote).toContain("pending correction");
  });

  it("8. Overnight shift approximation (evening in window)", () => {
    const r = getOverviewShiftCardPresentation({
      startTime: "22:00",
      endTime: "06:00",
      now: fixed(2026, 4, 5, 23, 30),
      attendanceLoading: false,
    });
    expect(r.phase).toBe("active");
    expect(r.primaryCtaLabel).toBe("Check in now");
  });

  it("9. Loading attendance suppresses missed warnings and avoids false check-in CTA", () => {
    const r = getOverviewShiftCardPresentation({
      startTime: "09:00",
      endTime: "17:00",
      now: fixed(2026, 4, 5, 12),
      attendanceLoading: true,
    });
    expect(r.phase).toBe("active");
    expect(r.showMissedActiveWarning).toBe(false);
    expect(r.showMissedEndedWarning).toBe(false);
    expect(r.primaryCtaLabel).toBe("Open attendance");
  });

  it("10. Inconsistent record (check-out without check-in)", () => {
    const r = getOverviewShiftCardPresentation({
      startTime: "09:00",
      endTime: "17:00",
      now: fixed(2026, 4, 5, 12),
      attendanceLoading: false,
      checkIn: null,
      checkOut: fixed(2026, 4, 5, 17),
    });
    expect(r.attendanceInconsistent).toBe(true);
    expect(r.primaryCtaLabel).toBe("Open attendance");
    expect(r.warningTone).toBe("red");
  });

  it("Ended, fully checked out → Open attendance", () => {
    const r = getOverviewShiftCardPresentation({
      startTime: "09:00",
      endTime: "17:00",
      now: fixed(2026, 4, 5, 18),
      attendanceLoading: false,
      checkIn: fixed(2026, 4, 5, 9),
      checkOut: fixed(2026, 4, 5, 17),
    });
    expect(r.primaryCtaLabel).toBe("Open attendance");
    expect(r.showMissedEndedWarning).toBe(false);
  });

  it("server hints: canCheckIn false overrides heuristic Check in now", () => {
    const r = getOverviewShiftCardPresentation({
      startTime: "09:00",
      endTime: "17:00",
      now: fixed(2026, 4, 5, 12),
      attendanceLoading: false,
      serverHintsReady: true,
      serverHints: { canCheckIn: false, canCheckOut: false, canRequestCorrection: true },
    });
    expect(r.primaryCtaLabel).toBe("Open attendance");
  });

  it("server hints: canRequestCorrection false overrides Request correction", () => {
    const r = getOverviewShiftCardPresentation({
      startTime: "09:00",
      endTime: "17:00",
      now: fixed(2026, 4, 5, 18),
      attendanceLoading: false,
      checkIn: null,
      checkOut: null,
      pendingCorrectionCount: 0,
      serverHintsReady: true,
      serverHints: { canCheckIn: false, canCheckOut: false, canRequestCorrection: false },
    });
    expect(r.primaryCtaLabel).toBe("Open attendance");
  });

  it("server hints: canCheckOut true forces Check out when checked in", () => {
    const t = fixed(2026, 4, 5, 12);
    const r = getOverviewShiftCardPresentation({
      startTime: "09:00",
      endTime: "17:00",
      now: t,
      attendanceLoading: false,
      checkIn: fixed(2026, 4, 5, 9),
      checkOut: null,
      serverHintsReady: true,
      serverHints: { canCheckIn: false, canCheckOut: true, canRequestCorrection: true },
    });
    expect(r.primaryCtaLabel).toBe("Check out");
  });

  it("server hints ignored when not ready (client heuristic only)", () => {
    const r = getOverviewShiftCardPresentation({
      startTime: "09:00",
      endTime: "17:00",
      now: fixed(2026, 4, 5, 12),
      attendanceLoading: false,
      serverHintsReady: false,
      serverHints: { canCheckIn: false, canCheckOut: false, canRequestCorrection: false },
    });
    expect(r.primaryCtaLabel).toBe("Check in now");
  });

  it("attendance loading keeps Open attendance even if server would allow check-in", () => {
    const r = getOverviewShiftCardPresentation({
      startTime: "09:00",
      endTime: "17:00",
      now: fixed(2026, 4, 5, 12),
      attendanceLoading: true,
      serverHintsReady: true,
      serverHints: { canCheckIn: true, canCheckOut: false, canRequestCorrection: true },
    });
    expect(r.primaryCtaLabel).toBe("Open attendance");
  });
});

describe("getAttendanceTodayStripPresentation", () => {
  it("hides check-in/out when inconsistent", () => {
    const r = getAttendanceTodayStripPresentation({
      hasSchedule: true,
      isWorkingDay: true,
      hasShift: true,
      checkIn: null,
      checkOut: new Date(),
      shiftStartTime: "09:00",
      shiftEndTime: "17:00",
    });
    expect(r.showCheckIn).toBe(false);
    expect(r.showCheckOut).toBe(false);
    expect(r.attendanceInconsistent).toBe(true);
    expect(r.usePositiveCardStyle).toBe(false);
  });

  it("working day: show check-in when eligible", () => {
    const r = getAttendanceTodayStripPresentation({
      hasSchedule: true,
      isWorkingDay: true,
      hasShift: true,
      checkIn: null,
      checkOut: null,
      shiftStartTime: "09:00",
    });
    expect(r.showCheckIn).toBe(true);
    expect(r.notCheckedInHeadline).toBe("Not checked in yet");
  });

  it("day off copy", () => {
    const r = getAttendanceTodayStripPresentation({
      hasSchedule: true,
      isWorkingDay: false,
      hasShift: true,
      checkIn: null,
      checkOut: null,
      shiftStartTime: "09:00",
      shiftEndTime: "17:00",
      workingDayNames: "Mon, Tue, Wed, Thu, Fri",
    });
    expect(r.showCheckIn).toBe(false);
    expect(r.notCheckedInHeadline).toBe("Day Off");
    expect(r.notCheckedInSubline).toContain("Mon, Tue");
  });

  it("server hints: canCheckIn false hides check-in even on working day", () => {
    const r = getAttendanceTodayStripPresentation({
      hasSchedule: true,
      isWorkingDay: true,
      hasShift: true,
      checkIn: null,
      checkOut: null,
      shiftStartTime: "09:00",
      serverHintsReady: true,
      serverHints: { canCheckIn: false, canCheckOut: false, canRequestCorrection: true },
    });
    expect(r.showCheckIn).toBe(false);
  });

  it("client path: attendanceLoading hides check-in", () => {
    const r = getAttendanceTodayStripPresentation({
      hasSchedule: true,
      isWorkingDay: true,
      hasShift: true,
      checkIn: null,
      checkOut: null,
      shiftStartTime: "09:00",
      attendanceLoading: true,
      serverHintsReady: false,
    });
    expect(r.showCheckIn).toBe(false);
  });

  it("server hints: canRequestCorrection false hides correction button", () => {
    const r = getAttendanceTodayStripPresentation({
      hasSchedule: true,
      isWorkingDay: true,
      hasShift: true,
      checkIn: null,
      checkOut: null,
      serverHintsReady: true,
      serverHints: { canCheckIn: true, canCheckOut: false, canRequestCorrection: false },
    });
    expect(r.showCorrectionButton).toBe(false);
  });
});

describe("getQuickActionsPresentation", () => {
  it("returns three visible semantic actions in stable order", () => {
    const a = getQuickActionsPresentation();
    expect(a.map((x) => x.id)).toEqual(["request_leave", "log_work", "open_documents"]);
    expect(a.every((x) => x.visible)).toBe(true);
  });
});
