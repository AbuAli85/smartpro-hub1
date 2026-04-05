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

// ─── Expiry Status Utilities ─────────────────────────────────────────────────

export type ExpiryStatus = "expired" | "expiring-soon" | "valid" | "none";

/**
 * Returns the expiry status of a date.
 * - "expired"      : date is in the past
 * - "expiring-soon": date is within `warnDays` days (default 30)
 * - "valid"        : date is more than `warnDays` away
 * - "none"         : no date provided
 */
export function expiryStatus(
  d: Date | string | number | null | undefined,
  warnDays = 30
): ExpiryStatus {
  if (!d) return "none";
  const date = new Date(d as any);
  if (isNaN(date.getTime())) return "none";
  const now = new Date();
  const msLeft = date.getTime() - now.getTime();
  if (msLeft < 0) return "expired";
  const daysLeft = msLeft / (1000 * 60 * 60 * 24);
  if (daysLeft <= warnDays) return "expiring-soon";
  return "valid";
}

/**
 * Returns the number of days until expiry (negative if already expired).
 * Returns null if no date provided.
 */
export function daysUntilExpiry(
  d: Date | string | number | null | undefined
): number | null {
  if (!d) return null;
  const date = new Date(d as any);
  if (isNaN(date.getTime())) return null;
  const now = new Date();
  return Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/** Tailwind classes for each expiry status (border) */
export const EXPIRY_BORDER: Record<ExpiryStatus, string> = {
  expired: "border-red-500 ring-1 ring-red-400",
  "expiring-soon": "border-amber-400 ring-1 ring-amber-300",
  valid: "border-emerald-400 ring-1 ring-emerald-300",
  none: "",
};

/** Tailwind text/bg classes for each expiry status (badge) */
export const EXPIRY_BADGE: Record<ExpiryStatus, string> = {
  expired: "bg-red-100 text-red-700 border border-red-300",
  "expiring-soon": "bg-amber-100 text-amber-700 border border-amber-300",
  valid: "bg-emerald-100 text-emerald-700 border border-emerald-300",
  none: "bg-gray-100 text-gray-400 border border-gray-200",
};

/** Human-readable label for expiry status */
export function expiryLabel(
  d: Date | string | number | null | undefined,
  warnDays = 30
): string {
  const status = expiryStatus(d, warnDays);
  if (status === "none") return "—";
  const days = daysUntilExpiry(d);
  if (days === null) return "—";
  if (status === "expired") {
    const abs = Math.abs(days);
    return abs === 0 ? "Expired today" : `Expired ${abs}d ago`;
  }
  if (status === "expiring-soon") return `Expires in ${days}d`;
  return `Valid (${days}d left)`;
}

/**
 * Convert a stored date value to the HTML date-input value format (YYYY-MM-DD).
 * This is required because <input type="date"> always needs YYYY-MM-DD internally,
 * but the *placeholder* shown to the user will be controlled by the browser locale.
 * We set the browser locale to en-GB via the `lang` attribute on <html> so the
 * browser renders the placeholder as DD/MM/YYYY automatically.
 */
export function toDateInputValue(d: Date | string | number | null | undefined): string {
  if (!d) return "";
  const date = new Date(d as any);
  if (isNaN(date.getTime())) return "";
  // Return YYYY-MM-DD in local time (not UTC) so the displayed date matches
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
