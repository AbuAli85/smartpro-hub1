import type { ShiftPhase } from "./employeePortalShift";
import { getShiftInstantBounds, getShiftOperationalState } from "./employeePortalShift";

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
}

function formatHm(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
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
  /** Minutes before shift start that check-in opens; same field as shift template default (often used as early window). */
  gracePeriodMinutes?: number;
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

  let eligibilityHeadline = "Attendance";
  let eligibilityDetail = "Your attendance status will appear here.";
  let checkInOpensAt: string | null = null;

  if (inconsistent) {
    eligibilityHeadline = "Attendance needs review";
    eligibilityDetail =
      "A check-out exists without a check-in. Open Correction so HR can fix the record.";
  } else if (hasIn && hasOut) {
    eligibilityHeadline = "Attendance complete";
    eligibilityDetail = "Check-in and check-out are recorded for today.";
  } else if (hasIn && !hasOut) {
    eligibilityHeadline = "Checked in";
    eligibilityDetail = "You can check out when you finish your shift.";
  } else if (params.isHoliday && params.hasSchedule) {
    eligibilityHeadline = "Holiday";
    eligibilityDetail = "No attendance is required today.";
  } else if (!params.hasSchedule) {
    eligibilityHeadline = "No schedule assigned";
    eligibilityDetail = "Contact HR if you expected a shift today.";
  } else if (!params.hasShift) {
    eligibilityHeadline = "Shift not configured";
    eligibilityDetail = "Your schedule exists but shift times are missing. Contact HR.";
  } else if (!params.isWorkingDay) {
    eligibilityHeadline = "Day off";
    eligibilityDetail = "You are not scheduled to work today.";
  } else if (params.startTime && params.endTime) {
    const { shiftStart, shiftEnd } = getShiftInstantBounds(params.startTime, params.endTime, params.now);
    const openMs = shiftStart.getTime() - grace * 60_000;
    const t = params.now.getTime();
    const openDate = new Date(openMs);
    checkInOpensAt = formatHm(openDate);

    if (t < openMs) {
      eligibilityHeadline = "Not eligible yet";
      eligibilityDetail = `Check-in opens at ${checkInOpensAt} (${grace} min before your ${params.startTime} start).`;
    } else if (t > shiftEnd.getTime()) {
      eligibilityHeadline = "Check-in closed";
      eligibilityDetail =
        "Your shift window has ended. If you worked, submit a correction request for HR to review.";
    } else {
      eligibilityHeadline = "Eligible to check in";
      eligibilityDetail = `Within the check-in window (from ${checkInOpensAt} until shift ends at ${params.endTime}).`;
    }
  }

  const baseCanCheckIn =
    params.hasSchedule &&
    params.hasShift &&
    params.isWorkingDay &&
    !params.isHoliday &&
    !hasIn &&
    !inconsistent;

  let withinCheckInWindow = true;
  if (baseCanCheckIn && params.startTime && params.endTime) {
    const { shiftStart, shiftEnd } = getShiftInstantBounds(params.startTime, params.endTime, params.now);
    const openMs = shiftStart.getTime() - grace * 60_000;
    const t = params.now.getTime();
    withinCheckInWindow = t >= openMs && t <= shiftEnd.getTime();
  }

  const canCheckIn = baseCanCheckIn && withinCheckInWindow;

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
  };
}
