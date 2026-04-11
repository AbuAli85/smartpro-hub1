/**
 * Attendance wall times follow the product UI (see client `dateUtils`: Asia/Muscat).
 * Server must interpret correction / manual timestamps in that zone, not the host OS zone.
 *
 * Asia/Muscat has no DST (UTC+4 year-round).
 */
const MUSCAT_UTC_OFFSET_MS = 4 * 60 * 60 * 1000;

/**
 * Convert a calendar date + wall time in Muscat to the absolute UTC instant stored in the DB.
 * @param dateYmd `YYYY-MM-DD`
 * @param hhmmss `HH:MM` or `HH:MM:SS`
 */
export function muscatWallDateTimeToUtc(dateYmd: string, hhmmss: string): Date {
  const [y, mo, d] = dateYmd.split("-").map((x) => parseInt(x, 10));
  if (!y || !mo || !d) throw new Error(`Invalid Muscat calendar date: ${dateYmd}`);
  const [sh, sm, ssPart] = hhmmss.split(":");
  const h = parseInt(sh ?? "0", 10);
  const mi = parseInt(sm ?? "0", 10);
  const se = parseInt((ssPart ?? "0").replace(/\D/g, "") || "0", 10);
  return new Date(Date.UTC(y, mo - 1, d, h, mi, se, 0) - MUSCAT_UTC_OFFSET_MS);
}
