import type { ActionQueueItem } from "./actionQueueTypes";
import { diffCalendarDaysMuscat } from "./timeLabels";

/**
 * Anchor date for age, per policy: dueAt → createdAt → updatedAt.
 */
function anchorDate(item: ActionQueueItem): Date | null {
  const raw = item.dueAt ?? item.createdAt ?? item.updatedAt;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Whole calendar days the item has been in its current state (Muscat calendar).
 * Future-only anchors yield 0 (treated as fresh). Unknown dates → null.
 */
export function getAgeInDays(item: ActionQueueItem, now: Date = new Date()): number | null {
  const anchor = anchorDate(item);
  if (!anchor) return null;
  const delta = diffCalendarDaysMuscat(anchor, now);
  if (delta > 0) return 0;
  return -delta;
}

export function getAgingLevel(days: number | null): "fresh" | "aging" | "stale" | null {
  if (days === null) return null;
  if (days <= 1) return "fresh";
  if (days <= 5) return "aging";
  return "stale";
}

export function isOverdue(item: ActionQueueItem, now: Date = new Date()): boolean {
  if (!item.dueAt) return false;
  const due = new Date(item.dueAt);
  if (Number.isNaN(due.getTime())) return false;
  return diffCalendarDaysMuscat(due, now) < 0;
}

/** Actionable item open long enough to be considered delayed. */
export function isStuck(item: ActionQueueItem, now: Date = new Date()): boolean {
  return getAgingLevel(getAgeInDays(item, now)) === "stale";
}
