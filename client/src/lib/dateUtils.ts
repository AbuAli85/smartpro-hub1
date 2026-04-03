/**
 * SmartPRO Date/Time Utilities
 * All dates display in DD/MM/YYYY format.
 * All times display in Muscat timezone (Asia/Muscat, UTC+4).
 */

const MUSCAT_TZ = "Asia/Muscat";

/** Format a date value as DD/MM/YYYY */
export function fmtDate(d: Date | string | number | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d as any);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: MUSCAT_TZ,
  });
}

/** Format a date value as DD MMM YYYY (e.g. 03 Apr 2026) */
export function fmtDateLong(d: Date | string | number | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d as any);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: MUSCAT_TZ,
  });
}

/** Format a datetime as DD/MM/YYYY HH:mm (24h, Muscat time) */
export function fmtDateTime(d: Date | string | number | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d as any);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: MUSCAT_TZ,
  });
}

/** Format time only as HH:mm (24h, Muscat time) */
export function fmtTime(d: Date | string | number | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d as any);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: MUSCAT_TZ,
  });
}

/** Get current date/time in Muscat timezone as a formatted string */
export function nowMuscat(): string {
  return fmtDateTime(new Date());
}

/** Format a date as "DD MMM YYYY, HH:mm" for display in tables/cards */
export function fmtDateTimeShort(d: Date | string | number | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d as any);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: MUSCAT_TZ,
  });
}
