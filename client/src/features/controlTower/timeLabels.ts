import type { ActionQueueItem } from "./actionQueueTypes";

const MUSCAT_TZ = "Asia/Muscat";

/** Calendar date key YYYY-MM-DD in Muscat (matches app-facing dates). */
export function dayKeyInMuscat(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MUSCAT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function parseDayKeyUtc(key: string): number {
  const [y, m, day] = key.split("-").map((x) => Number(x));
  return Date.UTC(y, m - 1, day);
}

/** Whole calendar days: first date minus second, in Muscat calendar-day units (negative if first is before second). */
export function diffCalendarDaysMuscat(a: Date, b: Date): number {
  const dk = dayKeyInMuscat(a);
  const nk = dayKeyInMuscat(b);
  return Math.round((parseDayKeyUtc(dk) - parseDayKeyUtc(nk)) / 86_400_000);
}

/**
 * Human due label — conservative when `dueAt` is missing (no implied precision).
 */
export function getDueLabel(item: ActionQueueItem, now: Date = new Date()): string | null {
  if (!item.dueAt) return null;
  const due = new Date(item.dueAt);
  if (Number.isNaN(due.getTime())) return null;

  const diff = diffCalendarDaysMuscat(due, now); // due vs now: negative => overdue
  if (diff < 0) return "Overdue";
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  if (diff >= 2 && diff <= 7) return `Due in ${diff} days`;
  return "Upcoming";
}

/**
 * Same as `getDueLabel` but returns a stable string for UI when no date exists.
 */
export function getDueLabelOrNone(item: ActionQueueItem, now?: Date): string {
  return getDueLabel(item, now) ?? "No deadline";
}
