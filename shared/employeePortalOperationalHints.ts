import type { ShiftPhase } from "./employeePortalShift";
import { getShiftOperationalState } from "./employeePortalShift";
import {
  evaluateSelfServiceCheckInEligibility,
  CheckInEligibilityReasonCode,
  type SelfServiceCheckInEvaluationResult,
} from "./attendanceCheckInEligibility";

/**
 * Thin operational hints for employee portal presentation — not HR policy.
 * Optional fields may grow; clients merge with local defaults when absent.
 */
export interface PortalOperationalHints {
  /**
   * Calendar date used for schedule/holiday row matching (YYYY-MM-DD).
   * Matches `scheduling.getMyActiveSchedule` (`toISOString().slice(0, 10)` on the server).
   * Attendance “today” still uses local midnight in `attendance.myToday` — timezone edge cases may diverge until a single business timezone is modeled.
   */
  businessDate: string;
  /** ISO instant the server used for phase / countdown alignment. */
  serverNowIso: string;
  resolvedShiftPhase: ShiftPhase | null;
  canCheckIn: boolean;
  canCheckOut: boolean;
  canRequestCorrection: boolean;
  hasPendingCorrection: boolean;
  pendingCorrectionCount: number;
  /** Short label for today’s shift timing row (e.g. "Active now") when shift times exist. */
  shiftStatusLabel: string | null;
  /** Secondary line (e.g. countdown) from shift state; null when not applicable. */
  shiftDetailLine: string | null;
  /**
   * Authoritative one-line status for check-in/out eligibility (employee-facing).
   * Populated whenever hints are returned (including “day off” / “holiday”).
   */
  eligibilityHeadline: string;
  /** Human-readable reason; pairs with eligibilityHeadline. */
  eligibilityDetail: string;
  /** Earliest wall time check-in is allowed (HH:MM, 24h), if shift-bound; null otherwise. */
  checkInOpensAt: string | null;
  /** When check-in is denied by policy, matches attendance.checkIn enforcement. */
  checkInDenialCode: string | null;
}

function portalEligibilityFromEvaluation(
  r: SelfServiceCheckInEvaluationResult
): { headline: string; detail: string; checkInOpensAt: string | null } {
  if (r.canCheckIn) {
    return { headline: "Eligible to check in", detail: r.message, checkInOpensAt: r.checkInOpensAt };
  }
  switch (r.reasonCode) {
    case CheckInEligibilityReasonCode.CHECK_IN_TOO_EARLY:
      return { headline: "Not eligible yet", detail: r.message, checkInOpensAt: r.checkInOpensAt };
    case CheckInEligibilityReasonCode.CHECK_IN_WINDOW_CLOSED:
      return { headline: "Check-in closed", detail: r.message, checkInOpensAt: r.checkInOpensAt };
    case CheckInEligibilityReasonCode.HOLIDAY_NO_ATTENDANCE:
      return { headline: "Holiday", detail: r.message, checkInOpensAt: null };
    case CheckInEligibilityReasonCode.NO_SHIFT_ASSIGNED:
      return { headline: "No schedule assigned", detail: r.message, checkInOpensAt: null };
    case CheckInEligibilityReasonCode.SHIFT_TIMES_MISSING:
      return { headline: "Shift not configured", detail: r.message, checkInOpensAt: null };
    case CheckInEligibilityReasonCode.NOT_WORKING_DAY:
      return { headline: "Day off", detail: r.message, checkInOpensAt: null };
    case CheckInEligibilityReasonCode.ATTENDANCE_DATA_INCONSISTENT:
      return { headline: "Attendance needs review", detail: r.message, checkInOpensAt: null };
    case CheckInEligibilityReasonCode.ALREADY_CHECKED_IN:
      return { headline: "Checked in", detail: r.message, checkInOpensAt: null };
    case CheckInEligibilityReasonCode.DAY_ALREADY_RECORDED:
      return { headline: "Attendance complete", detail: r.message, checkInOpensAt: null };
    case CheckInEligibilityReasonCode.WRONG_CHECK_IN_SITE:
      return { headline: "Wrong site", detail: r.message, checkInOpensAt: null };
    default:
      return { headline: "Cannot check in", detail: r.message, checkInOpensAt: r.checkInOpensAt };
  }
}

export function computePortalOperationalHints(params: {
  now: Date;
  businessDate: string;
  startTime: string | null | undefined;
  endTime: string | null | undefined;
  isHoliday: boolean;
  isWorkingDay: boolean;
  hasSchedule: boolean;
  hasShift: boolean;
  checkIn: Date | null;
  checkOut: Date | null;
  pendingCorrectionCount: number;
  /** Minutes before shift start that check-in opens (temporary: same DB field as late grace target). */
  gracePeriodMinutes?: number;
  /** Today’s scheduled site id when known; portal omits scanned site so WRONG_SITE is not evaluated. */
  assignedSiteId?: number | null;
}): PortalOperationalHints {
  const serverNowIso = params.now.toISOString();
  const grace = params.gracePeriodMinutes ?? 15;

  const operational =
    params.startTime && params.endTime
      ? getShiftOperationalState(params.startTime, params.endTime, params.now)
      : null;
  const resolvedShiftPhase = operational?.phase ?? null;
  const shiftStatusLabel = operational?.statusLabel ?? null;
  const shiftDetailLine = operational?.detailLine ?? null;

  const hasIn = !!params.checkIn;
  const hasOut = !!params.checkOut;
  const inconsistent = !hasIn && hasOut;

  const gate = evaluateSelfServiceCheckInEligibility({
    now: params.now,
    businessDate: params.businessDate,
    startTime: params.startTime,
    endTime: params.endTime,
    gracePeriodMinutes: grace,
    isHoliday: params.isHoliday,
    isWorkingDay: params.isWorkingDay,
    hasSchedule: params.hasSchedule,
    hasShift: params.hasShift,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    assignedSiteId: params.assignedSiteId ?? null,
  });

  let eligibilityHeadline: string;
  let eligibilityDetail: string;
  let checkInOpensAt: string | null;

  if (inconsistent) {
    eligibilityHeadline = "Attendance needs review";
    eligibilityDetail =
      "A check-out exists without a check-in. Open Correction so HR can fix the record.";
    checkInOpensAt = gate.checkInOpensAt;
  } else if (hasIn && !hasOut) {
    eligibilityHeadline = "Checked in";
    eligibilityDetail = "You can check out when you finish your shift.";
    checkInOpensAt = gate.checkInOpensAt;
  } else if (hasIn && hasOut) {
    eligibilityHeadline = "Attendance complete";
    eligibilityDetail = "Check-in and check-out are recorded for today.";
    checkInOpensAt = gate.checkInOpensAt;
  } else {
    const pe = portalEligibilityFromEvaluation(gate);
    eligibilityHeadline = pe.headline;
    eligibilityDetail = pe.detail;
    checkInOpensAt = pe.checkInOpensAt;
  }

  const canCheckIn = gate.canCheckIn;
  const canCheckOut = hasIn && !hasOut && !inconsistent;

  return {
    businessDate: params.businessDate,
    serverNowIso,
    resolvedShiftPhase,
    canCheckIn,
    canCheckOut,
    canRequestCorrection: true,
    hasPendingCorrection: params.pendingCorrectionCount > 0,
    pendingCorrectionCount: params.pendingCorrectionCount,
    shiftStatusLabel,
    shiftDetailLine,
    eligibilityHeadline,
    eligibilityDetail,
    checkInOpensAt,
    checkInDenialCode: !gate.canCheckIn ? gate.reasonCode : null,
  };
}
