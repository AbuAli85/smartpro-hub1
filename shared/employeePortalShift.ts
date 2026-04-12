/**
 * Shared shift clock helpers for employee portal — used by client UI and server hints.
 * Wall times are interpreted in Asia/Muscat (same as {@link evaluateSelfServiceCheckInEligibility}),
 * not the host OS timezone — CI and servers may run in UTC.
 */

import { muscatCalendarYmdFromUtcInstant, muscatWallDateTimeToUtc } from "./attendanceMuscatTime";

export type ShiftPhase = "upcoming" | "active" | "ended";

export interface ShiftOperationalState {
  phase: ShiftPhase;
  statusLabel: string;
  statusDotClass: string;
  detailLine: string | null;
}

/** Format milliseconds as "2h 15m" or "45m" */
export function formatCountdownMs(ms: number): string {
  if (ms <= 0) return "0m";
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

function muscatShiftBoundsMs(
  businessDateYmd: string,
  startTime: string,
  endTime: string
): { startMs: number; endMs: number } {
  let shiftStartMs = muscatWallDateTimeToUtc(businessDateYmd, `${startTime}:00`).getTime();
  let shiftEndMs = muscatWallDateTimeToUtc(businessDateYmd, `${endTime}:00`).getTime();
  if (shiftEndMs <= shiftStartMs) shiftEndMs += 86_400_000;
  return { startMs: shiftStartMs, endMs: shiftEndMs };
}

/**
 * Compare Muscat wall-clock shift times to `now` for a calendar row.
 * Handles overnight shifts when end <= start on the clock.
 *
 * @param businessDateYmd When set, shift bounds use this `YYYY-MM-DD` (same as attendance day).
 *   Otherwise uses the Muscat calendar date of `now`.
 *
 * Limitation: early morning after an overnight shift before today’s parsed start time
 * is treated as **upcoming** — authoritative business date / shift assignment belongs on the server.
 */
export function getShiftOperationalState(
  startTime: string,
  endTime: string,
  now: Date = new Date(),
  businessDateYmd?: string
): ShiftOperationalState {
  const ymd = businessDateYmd ?? muscatCalendarYmdFromUtcInstant(now);
  const { startMs, endMs } = muscatShiftBoundsMs(ymd, startTime, endTime);
  const t = now.getTime();
  if (t < startMs) {
    return {
      phase: "upcoming",
      statusLabel: "Upcoming",
      statusDotClass: "bg-amber-500",
      detailLine: `Starts in ${formatCountdownMs(startMs - t)}`,
    };
  }
  if (t <= endMs) {
    return {
      phase: "active",
      statusLabel: "Active now",
      statusDotClass: "bg-emerald-500",
      detailLine: `Ends in ${formatCountdownMs(endMs - t)}`,
    };
  }
  return {
    phase: "ended",
    statusLabel: "Ended",
    statusDotClass: "bg-slate-400",
    detailLine: null,
  };
}

/**
 * Muscat wall-clock shift start/end as UTC `Date` instants for `businessDateYmd`.
 * With overnight shifts, `shiftEnd` is the next calendar day in Muscat (same rules as {@link getShiftOperationalState}).
 *
 * @param businessDateYmd When set, uses this `YYYY-MM-DD`; otherwise the Muscat calendar date of `now`.
 */
export function getShiftInstantBounds(
  startTime: string,
  endTime: string,
  now: Date = new Date(),
  businessDateYmd?: string
): { shiftStart: Date; shiftEnd: Date } {
  const ymd = businessDateYmd ?? muscatCalendarYmdFromUtcInstant(now);
  const { startMs, endMs } = muscatShiftBoundsMs(ymd, startTime, endTime);
  return { shiftStart: new Date(startMs), shiftEnd: new Date(endMs) };
}
