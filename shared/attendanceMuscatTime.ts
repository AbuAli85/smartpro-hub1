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

/** Muscat calendar date for an instant (`YYYY-MM-DD`), same basis as the client `fmtDate`. */
export function muscatCalendarYmdFromUtcInstant(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Muscat" });
}

/** Today’s Muscat calendar date (`YYYY-MM-DD`). */
export function muscatCalendarYmdNow(now: Date = new Date()): string {
  return muscatCalendarYmdFromUtcInstant(now);
}

/**
 * Muscat weekday for `now`: `0` = Sunday … `6` = Saturday (matches JS `Date#getDay` and typical `workingDays` CSV).
 */
export function muscatCalendarWeekdaySun0(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Muscat",
    weekday: "short",
  }).formatToParts(now);
  const w = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[w] ?? 0;
}

/**
 * UTC instants spanning one Muscat calendar day `ymd` (inclusive start, exclusive end).
 * Use with `checkIn >= startUtc && checkIn < endExclusiveUtc` so punches stay aligned to Muscat “today”.
 */
export function muscatDayUtcRangeExclusiveEnd(ymd: string): { startUtc: Date; endExclusiveUtc: Date } {
  const startUtc = muscatWallDateTimeToUtc(ymd, "00:00:00");
  const endExclusiveUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  return { startUtc, endExclusiveUtc };
}

/**
 * UTC range [startUtc, endExclusiveUtc) covering every instant whose Muscat calendar date
 * falls in the given Gregorian `year` / `month` (1–12).
 */
export function muscatMonthUtcRangeExclusiveEnd(
  year: number,
  month: number,
): { startUtc: Date; endExclusiveUtc: Date } {
  const mm = String(month).padStart(2, "0");
  const startYmd = `${year}-${mm}-01`;
  const startUtc = muscatWallDateTimeToUtc(startYmd, "00:00:00");
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMm = String(nextMonth).padStart(2, "0");
  const endExclusiveUtc = muscatWallDateTimeToUtc(`${nextYear}-${nextMm}-01`, "00:00:00");
  return { startUtc, endExclusiveUtc };
}

/**
 * Minutes since local midnight in Asia/Muscat for this UTC instant (0–1439).
 * Use for late-arrival comparison against shift template HH:MM (same wall calendar context).
 */
export function muscatMinutesSinceMidnight(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Muscat",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const m = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  return h * 60 + m;
}
