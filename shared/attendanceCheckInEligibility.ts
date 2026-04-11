import { muscatWallDateTimeToUtc } from "./attendanceMuscatTime";

/**
 * Machine-readable reasons for self-service check-in denial (API + logs).
 * Aligned with `attendance.checkIn` enforcement and portal hints.
 *
 * Policy note: `gracePeriodMinutes` on shift templates currently drives **early check-in open**
 * (same as employee portal). Plan to split `earlyCheckInMinutes` vs `lateGraceMinutes` when HR
 * policy UI supports both; until then keep them in sync in one field intentionally.
 */
export const CheckInEligibilityReasonCode = {
  OK: null as null,
  /** No employee schedule row for this company / date context */
  NO_SHIFT_ASSIGNED: "NO_SHIFT_ASSIGNED",
  /** Company holiday */
  HOLIDAY_NO_ATTENDANCE: "HOLIDAY_NO_ATTENDANCE",
  /** Scheduled but not a working day (or holiday) */
  NOT_WORKING_DAY: "NOT_WORKING_DAY",
  /** Schedule exists but template times missing */
  SHIFT_TIMES_MISSING: "SHIFT_TIMES_MISSING",
  /** Same-day record has check-out without check-in (integrity) */
  ATTENDANCE_DATA_INCONSISTENT: "ATTENDANCE_DATA_INCONSISTENT",
  /** Active open attendance for the day */
  ALREADY_CHECKED_IN: "ALREADY_CHECKED_IN",
  /** Check-in and check-out already recorded */
  DAY_ALREADY_RECORDED: "DAY_ALREADY_RECORDED",
  /** Before shiftStart - earlyCheckMinutes (gracePeriodMinutes in schema today) */
  CHECK_IN_TOO_EARLY: "CHECK_IN_TOO_EARLY",
  /** After scheduled shift end */
  CHECK_IN_WINDOW_CLOSED: "CHECK_IN_WINDOW_CLOSED",
  /** QR site is not the site on today’s schedule */
  WRONG_CHECK_IN_SITE: "WRONG_CHECK_IN_SITE",
  /** Geo-fence enabled but browser did not send coordinates */
  LOCATION_REQUIRED_FOR_SITE: "LOCATION_REQUIRED_FOR_SITE",
  /** Coordinates outside site radius */
  SITE_GEOFENCE_VIOLATION: "SITE_GEOFENCE_VIOLATION",
  /** Site enforceHours — outside operating window */
  SITE_OPERATING_HOURS_CLOSED: "SITE_OPERATING_HOURS_CLOSED",
} as const;

export type CheckInEligibilityReasonCodeType =
  (typeof CheckInEligibilityReasonCode)[keyof typeof CheckInEligibilityReasonCode];

/** Non-null denial / policy codes (excludes OK sentinel). */
export type CheckInDenialReasonCode = Exclude<CheckInEligibilityReasonCodeType, null>;

/** All machine codes the portal / check-in API may emit — use in tests and client exhaustiveness checks. */
export const ALL_CHECK_IN_DENIAL_REASON_CODES: CheckInDenialReasonCode[] = (
  Object.values(CheckInEligibilityReasonCode).filter((v): v is CheckInDenialReasonCode => v != null)
);

function formatHm(utcMs: number): string {
  return new Date(utcMs).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Muscat",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export interface SelfServiceCheckInEvaluation {
  canCheckIn: boolean;
  reasonCode: CheckInDenialReasonCode;
  /** Human-readable; use after stripping code prefix if using formatCheckInRejection */
  message: string;
  checkInOpensAt: string | null;
}

export interface SelfServiceCheckInEvaluationOk {
  canCheckIn: true;
  reasonCode: null;
  message: string;
  checkInOpensAt: string | null;
}

export type SelfServiceCheckInEvaluationResult = SelfServiceCheckInEvaluationOk | SelfServiceCheckInEvaluation;

/**
 * Single source of truth for whether a self-service check-in may proceed (schedule + time window + site).
 * Geo / operating hours are enforced separately in attendance.checkIn (site policy).
 */
export function evaluateSelfServiceCheckInEligibility(params: {
  now: Date;
  businessDate: string;
  startTime: string | null | undefined;
  endTime: string | null | undefined;
  gracePeriodMinutes: number;
  isHoliday: boolean;
  isWorkingDay: boolean;
  hasSchedule: boolean;
  hasShift: boolean;
  checkIn: Date | null;
  checkOut: Date | null;
  /**
   * When false, a closed punch today does not block another check-in (e.g. second shift same day).
   * When true or omitted with both punches present, {@link CheckInEligibilityReasonCode.DAY_ALREADY_RECORDED} applies.
   */
  allShiftsHaveClosedAttendance?: boolean;
  /** From today’s schedule row; null if unknown */
  assignedSiteId: number | null;
  /**
   * When set (API check-in), must match assignedSiteId when an assignment exists.
   * Omit for portal hints (no site context).
   */
  scannedSiteId?: number;
}): SelfServiceCheckInEvaluationResult {
  const grace = params.gracePeriodMinutes ?? 15;
  const hasIn = !!params.checkIn;
  const hasOut = !!params.checkOut;
  const inconsistent = !hasIn && hasOut;

  const fail = (
    code: CheckInDenialReasonCode,
    message: string,
    checkInOpensAt: string | null = null
  ): SelfServiceCheckInEvaluation => ({
    canCheckIn: false,
    reasonCode: code,
    message,
    checkInOpensAt,
  });

  if (inconsistent) {
    return fail(
      CheckInEligibilityReasonCode.ATTENDANCE_DATA_INCONSISTENT,
      "A check-out exists without a check-in. Contact HR or use Correction before checking in again."
    );
  }
  if (hasIn && !hasOut) {
    return fail(
      CheckInEligibilityReasonCode.ALREADY_CHECKED_IN,
      "You are already checked in. Check out before starting a new session."
    );
  }
  if (hasIn && hasOut && (params.allShiftsHaveClosedAttendance ?? true)) {
    return fail(
      CheckInEligibilityReasonCode.DAY_ALREADY_RECORDED,
      "Check-in and check-out are already recorded for today."
    );
  }

  if (params.isHoliday && params.hasSchedule) {
    return fail(
      CheckInEligibilityReasonCode.HOLIDAY_NO_ATTENDANCE,
      "Today is a company holiday — attendance is not required."
    );
  }
  if (!params.hasSchedule) {
    return fail(
      CheckInEligibilityReasonCode.NO_SHIFT_ASSIGNED,
      "You have no active schedule assigned. Contact HR."
    );
  }
  if (!params.hasShift || !params.startTime || !params.endTime) {
    return fail(
      CheckInEligibilityReasonCode.SHIFT_TIMES_MISSING,
      "Your schedule has no shift times configured. Contact HR."
    );
  }
  if (!params.isWorkingDay) {
    return fail(
      CheckInEligibilityReasonCode.NOT_WORKING_DAY,
      "You are not scheduled to work today."
    );
  }

  const scanned = params.scannedSiteId;
  if (scanned != null && params.assignedSiteId != null && scanned !== params.assignedSiteId) {
    return fail(
      CheckInEligibilityReasonCode.WRONG_CHECK_IN_SITE,
      "This QR code is not for your assigned attendance site today. Use the site on your schedule or contact HR."
    );
  }

  // Interpret shift wall times as Asia/Muscat (UTC+4, no DST) — independent of server OS timezone.
  const shiftStartMs = muscatWallDateTimeToUtc(params.businessDate, `${params.startTime}:00`).getTime();
  let shiftEndMs = muscatWallDateTimeToUtc(params.businessDate, `${params.endTime}:00`).getTime();
  if (shiftEndMs <= shiftStartMs) shiftEndMs += 86_400_000; // overnight shift spans midnight
  const openMs = shiftStartMs - grace * 60_000;
  const t = params.now.getTime();
  const checkInOpensAt = formatHm(openMs);

  if (t < openMs) {
    return fail(
      CheckInEligibilityReasonCode.CHECK_IN_TOO_EARLY,
      `Check-in opens at ${checkInOpensAt} (${grace} min before your ${params.startTime} start).`,
      checkInOpensAt
    );
  }
  if (t > shiftEndMs) {
    return fail(
      CheckInEligibilityReasonCode.CHECK_IN_WINDOW_CLOSED,
      `Check-in is closed — your shift ended at ${params.endTime}. Submit a correction request if you worked.`,
      checkInOpensAt
    );
  }

  return {
    canCheckIn: true,
    reasonCode: null,
    message: `Within check-in window (from ${checkInOpensAt} until shift ends at ${params.endTime}).`,
    checkInOpensAt,
  };
}

/** Wire format for TRPC errors: machine code + human message (split on first |). */
export function formatCheckInRejection(code: CheckInDenialReasonCode, humanMessage: string): string {
  return `${code}|${humanMessage}`;
}

export function parseCheckInRejectionMessage(fullMessage: string): { code: string; humanMessage: string } {
  const i = fullMessage.indexOf("|");
  if (i <= 0) return { code: "UNKNOWN", humanMessage: fullMessage };
  return { code: fullMessage.slice(0, i), humanMessage: fullMessage.slice(i + 1) };
}
