import { muscatWallDateTimeToUtc } from "./attendanceMuscatTime";

/**
 * Minimum percentage of scheduled shift duration an employee must work for a checkout
 * to qualify as "completed" rather than "early_checkout".
 *
 * 80 % is the default (e.g. a 3-hour shift requires 2h 24m of work).
 * Adjust here — a future phase can push this to per-shift-template config.
 */
export const CHECKOUT_COMPLETION_THRESHOLD_PERCENT = 80;

/** Outcome of evaluating a checkout against the shift completion policy. */
export type CheckoutOutcome = "completed" | "early_checkout";

export interface CheckoutPolicyResult {
  /** Whether the shift qualifies as completed or as an early checkout. */
  outcome: CheckoutOutcome;
  /** Actual minutes from check-in to check-out. */
  workedMinutes: number;
  /** Scheduled shift length in minutes (shiftEnd - shiftStart). */
  shiftMinutes: number;
  /** workedMinutes / shiftMinutes * 100, rounded. */
  completionPercent: number;
  /**
   * How many minutes short of meeting the completion threshold the employee was.
   * 0 when outcome === "completed".
   */
  earlyMinutes: number;
}

/**
 * Determine whether a completed attendance punch (checkIn + checkOut) constitutes
 * a fully "completed" shift or an "early_checkout".
 *
 * Policy: a shift is completed when the employee worked at least
 * `CHECKOUT_COMPLETION_THRESHOLD_PERCENT`% of the scheduled duration.
 */
export function evaluateCheckoutOutcome(params: {
  checkIn: Date;
  checkOut: Date;
  /** UTC milliseconds of shift start (computed from Muscat wall time). */
  shiftStartMs: number;
  /** UTC milliseconds of shift end (computed from Muscat wall time, overnight-corrected). */
  shiftEndMs: number;
  /** Override threshold percent (defaults to CHECKOUT_COMPLETION_THRESHOLD_PERCENT). */
  thresholdPercent?: number;
}): CheckoutPolicyResult {
  const threshold = params.thresholdPercent ?? CHECKOUT_COMPLETION_THRESHOLD_PERCENT;
  const shiftMinutes = Math.max(
    0,
    Math.round((params.shiftEndMs - params.shiftStartMs) / 60_000)
  );
  const workedMinutes = Math.max(
    0,
    Math.round((params.checkOut.getTime() - params.checkIn.getTime()) / 60_000)
  );
  const completionPercent =
    shiftMinutes > 0 ? Math.round((workedMinutes / shiftMinutes) * 100) : 100;
  const requiredMinutes = Math.ceil((shiftMinutes * threshold) / 100);
  const earlyMinutes = Math.max(0, requiredMinutes - workedMinutes);
  const outcome: CheckoutOutcome = earlyMinutes === 0 ? "completed" : "early_checkout";

  return { outcome, workedMinutes, shiftMinutes, completionPercent, earlyMinutes };
}

/**
 * Convenience wrapper: accepts Muscat YYYY-MM-DD date + HH:MM shift times,
 * handles overnight shifts automatically.
 */
export function evaluateCheckoutOutcomeByShiftTimes(params: {
  checkIn: Date;
  checkOut: Date;
  businessDate: string;
  shiftStartTime: string;
  shiftEndTime: string;
  thresholdPercent?: number;
}): CheckoutPolicyResult {
  const shiftStartMs = muscatWallDateTimeToUtc(
    params.businessDate,
    `${params.shiftStartTime}:00`
  ).getTime();
  let shiftEndMs = muscatWallDateTimeToUtc(
    params.businessDate,
    `${params.shiftEndTime}:00`
  ).getTime();
  if (shiftEndMs <= shiftStartMs) shiftEndMs += 86_400_000; // overnight

  return evaluateCheckoutOutcome({
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    shiftStartMs,
    shiftEndMs,
    thresholdPercent: params.thresholdPercent,
  });
}
