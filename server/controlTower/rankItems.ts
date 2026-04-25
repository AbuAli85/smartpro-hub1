/**
 * server/controlTower/rankItems.ts
 *
 * Deterministic priority engine for Control Tower items.
 *
 * Sort order (stable, descending urgency):
 *  1. Severity: critical → high → medium → low
 *  2. Overdue (dueAt < now) before non-overdue
 *  3. Due soon (dueAt within 7 days) before no due date
 *  4. Status: open → in_progress → acknowledged → dismissed → resolved
 *  5. Older createdAt first (surface longest-standing issues at top)
 */

import type { ControlTowerItem, ControlTowerSeverity, ControlTowerStatus } from "@shared/controlTowerTypes";

const SEV_RANK: Record<ControlTowerSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const STATUS_RANK: Record<ControlTowerStatus, number> = {
  open: 0,
  in_progress: 1,
  acknowledged: 2,
  dismissed: 3,
  resolved: 4,
};

const SOON_MS = 7 * 24 * 60 * 60 * 1000;

export function rankItems(items: ControlTowerItem[], now: Date = new Date()): ControlTowerItem[] {
  const nowMs = now.getTime();
  const soonMs = nowMs + SOON_MS;

  return [...items].sort((a, b) => {
    const sevDiff = SEV_RANK[a.severity] - SEV_RANK[b.severity];
    if (sevDiff !== 0) return sevDiff;

    const aOverdue = a.dueAt != null && a.dueAt.getTime() < nowMs;
    const bOverdue = b.dueAt != null && b.dueAt.getTime() < nowMs;
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;

    const aSoon = a.dueAt != null && a.dueAt.getTime() <= soonMs;
    const bSoon = b.dueAt != null && b.dueAt.getTime() <= soonMs;
    if (aSoon !== bSoon) return aSoon ? -1 : 1;

    const statusDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (statusDiff !== 0) return statusDiff;

    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

/** Returns the top N items after ranking. */
export function topRankedItems(
  items: ControlTowerItem[],
  limit: number,
  now: Date = new Date(),
): ControlTowerItem[] {
  return rankItems(items, now).slice(0, limit);
}
