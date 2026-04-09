import type { ActionQueueItem } from "./actionQueueTypes";

const MUSCAT_TZ = "Asia/Muscat";

/** Calendar date key YYYY-MM-DD in Muscat (matches app-facing dates). */
function dayKeyInMuscat(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MUSCAT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function parseDayKeyUtc(key: string): number {
  const [y, m, day] = key.split("-").map((x) => Number(x));
  return Date.UTC(y, m - 1, day);
}

/** Whole calendar days from `now` to due date in Muscat (negative = overdue). */
function diffCalendarDaysMuscat(due: Date, now: Date): number {
  const dk = dayKeyInMuscat(due);
  const nk = dayKeyInMuscat(now);
  return Math.round((parseDayKeyUtc(dk) - parseDayKeyUtc(nk)) / 86_400_000);
}

/**
 * Human due label — conservative when `dueAt` is missing (no implied precision).
 */
export function getDueLabel(item: ActionQueueItem, now: Date = new Date()): string | null {
  if (!item.dueAt) return null;
  const due = new Date(item.dueAt);
  if (Number.isNaN(due.getTime())) return null;

  const diff = diffCalendarDaysMuscat(due, now);
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
