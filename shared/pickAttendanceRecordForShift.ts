import { muscatWallDateTimeToUtc } from "./attendanceMuscatTime";

export type AttendanceRecordLike = {
  id: number;
  siteId: number | null;
  checkIn: Date;
  checkOut: Date | null;
};

/** Drop instant / inverted clock rows (bad imports or corrupt saves). Open sessions are kept. */
export function isPositiveDurationAttendanceRecord(r: AttendanceRecordLike): boolean {
  if (r.checkOut == null) return true;
  return r.checkOut.getTime() > r.checkIn.getTime();
}

function overlapMs(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/** Shift window in UTC ms on the business calendar day, padded for overlap matching. */
export function shiftAttendanceWindowUtcMs(
  businessDate: string,
  shiftStartTime: string,
  shiftEndTime: string,
  gracePeriodMinutes: number,
  opts?: { padBeforeMinutes?: number; padAfterMinutes?: number }
): { startMs: number; endMs: number } {
  const padB = opts?.padBeforeMinutes ?? gracePeriodMinutes + 120;
  const padA = opts?.padAfterMinutes ?? gracePeriodMinutes + 360;
  const baseStart = muscatWallDateTimeToUtc(businessDate, `${shiftStartTime}:00`).getTime();
  const baseEnd = muscatWallDateTimeToUtc(businessDate, `${shiftEndTime}:00`).getTime();
  let startMs = baseStart - padB * 60_000;
  let endMs = baseEnd + padA * 60_000;
  if (endMs <= startMs) {
    endMs += 86_400_000;
  }
  return { startMs, endMs };
}

/**
 * Pick the clock record that best belongs to this schedule row (same employee, same day).
 * Avoids reusing one punch across multiple shifts when each shift is a separate board row.
 */
export function pickAttendanceRecordForShift<T extends AttendanceRecordLike>(
  records: T[],
  scheduleSiteId: number,
  businessDate: string,
  shiftStartTime: string,
  shiftEndTime: string,
  gracePeriodMinutes: number,
  nowMs: number = Date.now()
): T | undefined {
  const valid = records.filter(isPositiveDurationAttendanceRecord);
  if (!valid.length) return undefined;

  const siteCandidates = valid.filter((r) => r.siteId == null || r.siteId === scheduleSiteId);
  const pool = siteCandidates.length ? siteCandidates : valid;

  const { startMs, endMs } = shiftAttendanceWindowUtcMs(
    businessDate,
    shiftStartTime,
    shiftEndTime,
    gracePeriodMinutes
  );

  let best: T | undefined;
  let bestOverlap = 0;
  for (const r of pool) {
    const rStart = r.checkIn.getTime();
    const rEnd = r.checkOut ? r.checkOut.getTime() : nowMs;
    const ov = overlapMs(rStart, rEnd, startMs, endMs);
    if (ov > bestOverlap) {
      bestOverlap = ov;
      best = r;
    }
  }

  return bestOverlap > 0 ? best : undefined;
}
