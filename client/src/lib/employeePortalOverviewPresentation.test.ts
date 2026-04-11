import { describe, expect, it } from "vitest";
import {
  getAttendanceTodayStripPresentation,
  getOverviewShiftCardPresentation,
  getQuickActionsPresentation,
  type ServerEligibilityHints,
} from "./employeePortalOverviewPresentation";

const fixed = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min, 0, 0);

function elHints(
  x: Pick<ServerEligibilityHints, "canCheckIn" | "canCheckOut" | "canRequestCorrection"> &
    Partial<Omit<ServerEligibilityHints, "canCheckIn" | "canCheckOut" | "canRequestCorrection">>
): ServerEligibilityHints {
  return {
    eligibilityHeadline: "Eligible to check in",
    eligibilityDetail: "Within the check-in window.",
    shiftStatusLabel: "Active now",
    shiftDetailLine: null,
    checkInDenialCode: null,
    hasPendingCorrection: false,
    checkInOpensAt: null,
    allShiftsHaveClosedAttendance: false,
    minutesLateAfterGrace: null,
    resolvedShiftPhase: null,
    ...x,
  };
}

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
    expect(r.primaryCtaLabel).toBe("Go to attendance");
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
    expect(r.primaryCtaLabel).toBe("Review shift");
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
    expect(r.primaryCtaLabel).toBe("Check out now");
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
    expect(r.primaryCtaLabel).toBe("Check out now");
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
    expect(r.primaryCtaLabel).toBe("Fix attendance");
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
    expect(r.primaryCtaLabel).toBe("Go to attendance");
    expect(r.correctionPendingNote).toContain("Correction pending");
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
    expect(r.primaryCtaLabel).toBe("Go to attendance");
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
    expect(r.primaryCtaLabel).toBe("Go to attendance");
    expect(r.warningTone).toBe("red");
  });

  it("Ended, fully checked out → Go to attendance", () => {
    const r = getOverviewShiftCardPresentation({
      startTime: "09:00",
      endTime: "17:00",
      now: fixed(2026, 4, 5, 18),
      attendanceLoading: false,
      checkIn: fixed(2026, 4, 5, 9),
      checkOut: fixed(2026, 4, 5, 17),
    });
    expect(r.primaryCtaLabel).toBe("Go to attendance");
    expect(r.showMissedEndedWarning).toBe(false);
  });

  it("server hints: canCheckIn false overrides heuristic Check in now", () => {
    const r = getOverviewShiftCardPresentation({
      startTime: "09:00",
      endTime: "17:00",
      now: fixed(2026, 4, 5, 12),
      attendanceLoading: false,
      serverHintsReady: true,
      serverHints: elHints({ canCheckIn: false, canCheckOut: false, canRequestCorrection: true }),
    });
    expect(r.primaryCtaLabel).toBe("Go to attendance");
  });

  it("server hints: canRequestCorrection false overrides Fix attendance CTA", () => {
    const r = getOverviewShiftCardPresentation({
      startTime: "09:00",
      endTime: "17:00",
      now: fixed(2026, 4, 5, 18),
      attendanceLoading: false,
      checkIn: null,
      checkOut: null,
      pendingCorrectionCount: 0,
      serverHintsReady: true,
      serverHints: elHints({ canCheckIn: false, canCheckOut: false, canRequestCorrection: false }),
    });
    expect(r.primaryCtaLabel).toBe("Go to attendance");
  });

  it("server hints: canCheckOut true forces Check out now when checked in", () => {
    const t = fixed(2026, 4, 5, 12);
    const r = getOverviewShiftCardPresentation({
      startTime: "09:00",
      endTime: "17:00",
      now: t,
      attendanceLoading: false,
      checkIn: fixed(2026, 4, 5, 9),
      checkOut: null,
      serverHintsReady: true,
      serverHints: elHints({ canCheckIn: false, canCheckOut: true, canRequestCorrection: true }),
    });
    expect(r.primaryCtaLabel).toBe("Check out now");
  });

  it("server hints: canCheckIn true after shift end still shows Check in now", () => {
    const r = getOverviewShiftCardPresentation({
      startTime: "09:00",
      endTime: "17:00",
      now: fixed(2026, 4, 5, 18),
      attendanceLoading: false,
      checkIn: null,
      checkOut: null,
      pendingCorrectionCount: 0,
      serverHintsReady: true,
      serverHints: elHints({ canCheckIn: true, canCheckOut: false, canRequestCorrection: true }),
    });
    expect(r.primaryCtaLabel).toBe("Check in now");
  });

  it("server hints ignored when not ready (client heuristic only)", () => {
    const r = getOverviewShiftCardPresentation({
      startTime: "09:00",
      endTime: "17:00",
      now: fixed(2026, 4, 5, 12),
      attendanceLoading: false,
      serverHintsReady: false,
      serverHints: elHints({ canCheckIn: false, canCheckOut: false, canRequestCorrection: false }),
    });
    expect(r.primaryCtaLabel).toBe("Check in now");
  });

  it("attendance loading keeps Go to attendance even if server would allow check-in", () => {
    const r = getOverviewShiftCardPresentation({
      startTime: "09:00",
      endTime: "17:00",
      now: fixed(2026, 4, 5, 12),
      attendanceLoading: true,
      serverHintsReady: true,
      serverHints: elHints({ canCheckIn: true, canCheckOut: false, canRequestCorrection: true }),
    });
    expect(r.primaryCtaLabel).toBe("Go to attendance");
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
      serverHints: elHints({
        canCheckIn: false,
        canCheckOut: false,
        canRequestCorrection: true,
        eligibilityHeadline: "Not eligible yet",
        eligibilityDetail: "Check-in opens at 08:45 (15 min before your 09:00 start).",
      }),
    });
    expect(r.showCheckIn).toBe(false);
    expect(r.notCheckedInHeadline).toBe("Not eligible yet");
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
      serverHints: elHints({ canCheckIn: true, canCheckOut: false, canRequestCorrection: false }),
    });
    expect(r.showCorrectionButton).toBe(false);
  });

  it("server hints: second-shift check-in still shows eligibility copy when myToday shows a prior punch", () => {
    const r = getAttendanceTodayStripPresentation({
      hasSchedule: true,
      isWorkingDay: true,
      hasShift: true,
      checkIn: fixed(2026, 4, 5, 9, 0),
      checkOut: fixed(2026, 4, 5, 13, 0),
      shiftStartTime: "18:00",
      shiftEndTime: "22:00",
      serverHintsReady: true,
      serverHints: elHints({
        canCheckIn: true,
        canCheckOut: false,
        canRequestCorrection: true,
        allShiftsHaveClosedAttendance: false,
        eligibilityHeadline: "Eligible to check in",
        eligibilityDetail: "Within the check-in window for your next shift.",
      }),
    });
    expect(r.showCheckIn).toBe(true);
    expect(r.notCheckedInHeadline).toBe("Eligible to check in");
    expect(r.notCheckedInSubline).toContain("next shift");
    expect(r.betweenShiftsPendingNext).toBe(true);
    expect(r.usePositiveCardStyle).toBe(false);
  });

  it("server hints: single closed block when all shifts done stays green-style", () => {
    const r = getAttendanceTodayStripPresentation({
      hasSchedule: true,
      isWorkingDay: true,
      hasShift: true,
      checkIn: fixed(2026, 4, 5, 9, 0),
      checkOut: fixed(2026, 4, 5, 17, 0),
      shiftStartTime: "09:00",
      shiftEndTime: "17:00",
      serverHintsReady: true,
      serverHints: elHints({
        canCheckIn: false,
        canCheckOut: false,
        canRequestCorrection: true,
        allShiftsHaveClosedAttendance: true,
        eligibilityHeadline: "Attendance complete",
        eligibilityDetail: "Recorded.",
      }),
    });
    expect(r.betweenShiftsPendingNext).toBe(false);
    expect(r.usePositiveCardStyle).toBe(true);
  });
});

describe("getQuickActionsPresentation", () => {
  it("returns three visible semantic actions in stable order", () => {
    const a = getQuickActionsPresentation();
    expect(a.map((x) => x.id)).toEqual(["request_leave", "log_work", "open_documents"]);
    expect(a.every((x) => x.visible)).toBe(true);
  });
});
