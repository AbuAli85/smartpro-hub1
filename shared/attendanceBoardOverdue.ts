import { muscatWallDateTimeToUtc } from "./attendanceMuscatTime";

/** Muscat wall end for this shift on `ymd` (overnight: end after midnight). Matches scheduling.getTodayBoard. */
export function muscatShiftWallEndMs(ymd: string, startHhmm: string, endHhmm: string): number {
  const ss = muscatWallDateTimeToUtc(ymd, `${startHhmm}:00`).getTime();
  let se = muscatWallDateTimeToUtc(ymd, `${endHhmm}:00`).getTime();
  if (se <= ss) se += 86_400_000;
  return se;
}

/**
 * Scheduled row: check-in exists, segment checkout still missing, shift wall end has passed (Muscat).
 * Aligns with HR “open check-outs past shift end” exception strip.
 */
export function countOverdueOpenCheckoutsOnBoard(
  rows: Array<{
    checkInAt: string | Date | null;
    checkOutAt: string | Date | null;
    expectedStart: string;
    expectedEnd: string;
  }>,
  businessDateYmd: string,
  nowMs: number
): number {
  return rows.filter((row) => {
    if (!row.checkInAt || row.checkOutAt) return false;
    const endMs = muscatShiftWallEndMs(businessDateYmd, row.expectedStart, row.expectedEnd);
    return nowMs > endMs;
  }).length;
}
