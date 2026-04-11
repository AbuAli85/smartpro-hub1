import { getShiftInstantBounds } from "./employeePortalShift";
import { evaluateCheckoutOutcome } from "./attendanceCheckoutPolicy";

/**
 * Admin "today board" row status — phase-based, avoids marking Absent before shift ends.
 */
export type AdminBoardRowStatus =
  | "holiday"
  | "completed"
  | "early_checkout"
  | "checked_out"      // Legacy fallback (shift time context unavailable)
  | "checked_in_on_time"
  | "checked_in_late"
  | "upcoming"
  | "not_checked_in"
  | "late_no_checkin"
  | "absent";

export function computeAdminBoardRowStatus(params: {
  now: Date;
  /** Calendar date for this row (YYYY-MM-DD), same as schedule / attendance day */
  businessDate: string;
  holiday: boolean;
  shiftStartTime: string;
  shiftEndTime: string;
  gracePeriodMinutes: number;
  record: { checkIn: Date; checkOut: Date | null } | null;
}): AdminBoardRowStatus {
  if (params.holiday) return "holiday";

  const [yy, mm, dd] = params.businessDate.split("-").map((x) => parseInt(x, 10));
  if (!yy || !mm || !dd) return "absent";
  const dayAnchor = new Date(yy, mm - 1, dd, 12, 0, 0, 0);

  const { shiftStart, shiftEnd } = getShiftInstantBounds(
    params.shiftStartTime,
    params.shiftEndTime,
    dayAnchor
  );
  const graceMs = params.gracePeriodMinutes * 60_000;
  const nowMs = params.now.getTime();

  if (params.record) {
    const { checkIn, checkOut } = params.record;
    if (checkOut) {
      // Apply the same completion policy used on the employee portal.
      const policy = evaluateCheckoutOutcome({
        checkIn,
        checkOut,
        shiftStartMs: shiftStart.getTime(),
        shiftEndMs: shiftEnd.getTime(),
      });
      return policy.outcome; // "completed" | "early_checkout"
    }
    const deadline = shiftStart.getTime() + graceMs;
    return checkIn.getTime() <= deadline ? "checked_in_on_time" : "checked_in_late";
  }

  if (nowMs < shiftStart.getTime()) return "upcoming";
  if (nowMs > shiftEnd.getTime()) return "absent";
  if (nowMs <= shiftStart.getTime() + graceMs) return "not_checked_in";
  return "late_no_checkin";
}

/** Minutes after (shiftStart + grace) for a check-in; 0 if on time. */
export function arrivalDelayMinutesAfterGrace(
  checkIn: Date,
  shiftStart: Date,
  gracePeriodMinutes: number
): number {
  const deadline = shiftStart.getTime() + gracePeriodMinutes * 60_000;
  return Math.max(0, Math.round((checkIn.getTime() - deadline) / 60000));
}

/** Minutes current time is past (shiftStart + grace) when employee has not checked in. */
export function minutesPastExpectedCheckIn(
  now: Date,
  shiftStart: Date,
  gracePeriodMinutes: number
): number {
  const deadline = shiftStart.getTime() + gracePeriodMinutes * 60_000;
  return Math.max(0, Math.round((now.getTime() - deadline) / 60000));
}
