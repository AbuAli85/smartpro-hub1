import type { ControlTowerOutcomeSummary, SnapshotItemRef } from "./outcomeTypes";
import type { ControlTowerSnapshot } from "./trendTypes";

function isEscalated(ref: SnapshotItemRef): boolean {
  return ref.escalationLevel === "escalated";
}

function isBreached(ref: SnapshotItemRef): boolean {
  return ref.slaState === "breached";
}

function isOwnershipGap(ref: SnapshotItemRef): boolean {
  return ref.needsOwner === true;
}

function toRefMap(refs: SnapshotItemRef[]): Map<string, SnapshotItemRef> {
  const m = new Map<string, SnapshotItemRef>();
  for (const r of refs) {
    if (typeof r.id === "string" && r.id) m.set(r.id, r);
  }
  return m;
}

/**
 * `true` when the previous snapshot includes an `itemRefs` array (possibly empty) for id-level diffing.
 * Older stored snapshots without `itemRefs` cannot support outcomes — callers should show zeros / hide copy.
 */
export function hasOutcomeBaseline(previous: ControlTowerSnapshot | null | undefined): boolean {
  return previous != null && Array.isArray(previous.itemRefs);
}

/**
 * Deterministic outcome diff between two snapshots. If `previous` lacks `itemRefs`, returns all zeros.
 */
export function buildOutcomeSummary(
  current: ControlTowerSnapshot,
  previous: ControlTowerSnapshot | null,
): ControlTowerOutcomeSummary {
  const result: ControlTowerOutcomeSummary = {
    newItemsCount: 0,
    resolvedItemsCount: 0,
    escalationsClearedCount: 0,
    escalationsAddedCount: 0,
    breachesRecoveredCount: 0,
    breachesAddedCount: 0,
    ownershipGapsClosedCount: 0,
    ownershipGapsAddedCount: 0,
  };

  if (!previous || !Array.isArray(previous.itemRefs)) return result;

  const prevMap = toRefMap(previous.itemRefs);
  const currRefs = current.itemRefs ?? [];
  const currMap = toRefMap(currRefs);

  const prevIds = new Set(prevMap.keys());
  const currIds = new Set(currMap.keys());

  for (const id of currIds) {
    if (!prevIds.has(id)) result.newItemsCount += 1;
  }
  for (const id of prevIds) {
    if (!currIds.has(id)) result.resolvedItemsCount += 1;
  }

  for (const id of prevIds) {
    const p = prevMap.get(id)!;
    const c = currMap.get(id);
    if (c) {
      if (isEscalated(p) && !isEscalated(c)) result.escalationsClearedCount += 1;
      if (!isEscalated(p) && isEscalated(c)) result.escalationsAddedCount += 1;
      if (isBreached(p) && !isBreached(c)) result.breachesRecoveredCount += 1;
      if (!isBreached(p) && isBreached(c)) result.breachesAddedCount += 1;
      if (isOwnershipGap(p) && !isOwnershipGap(c)) result.ownershipGapsClosedCount += 1;
      if (!isOwnershipGap(p) && isOwnershipGap(c)) result.ownershipGapsAddedCount += 1;
    } else {
      if (isEscalated(p)) result.escalationsClearedCount += 1;
      if (isBreached(p)) result.breachesRecoveredCount += 1;
      if (isOwnershipGap(p)) result.ownershipGapsClosedCount += 1;
    }
  }

  for (const id of currIds) {
    if (prevIds.has(id)) continue;
    const c = currMap.get(id)!;
    if (isEscalated(c)) result.escalationsAddedCount += 1;
    if (isBreached(c)) result.breachesAddedCount += 1;
    if (isOwnershipGap(c)) result.ownershipGapsAddedCount += 1;
  }

  return result;
}

/** Ordered phrases for executive copy (priority for `buildOutcomeSummaryLine`). */
export function getOutcomeSignals(summary: ControlTowerOutcomeSummary): string[] {
  const out: string[] = [];
  if (summary.breachesRecoveredCount > 0) {
    out.push(
      summary.breachesRecoveredCount === 1 ? "1 breach recovered" : `${summary.breachesRecoveredCount} breaches recovered`,
    );
  }
  if (summary.breachesAddedCount > 0) {
    out.push(
      summary.breachesAddedCount === 1 ? "1 new breach" : `${summary.breachesAddedCount} new breaches`,
    );
  }
  if (summary.escalationsClearedCount > 0) {
    out.push(
      summary.escalationsClearedCount === 1
        ? "1 escalation cleared"
        : `${summary.escalationsClearedCount} escalations cleared`,
    );
  }
  if (summary.escalationsAddedCount > 0) {
    out.push(
      summary.escalationsAddedCount === 1
        ? "1 new escalation"
        : `${summary.escalationsAddedCount} new escalations`,
    );
  }
  if (summary.ownershipGapsClosedCount > 0) {
    out.push(
      summary.ownershipGapsClosedCount === 1
        ? "1 ownership gap closed"
        : `${summary.ownershipGapsClosedCount} ownership gaps closed`,
    );
  }
  if (summary.ownershipGapsAddedCount > 0) {
    out.push(
      summary.ownershipGapsAddedCount === 1
        ? "1 ownership gap added"
        : `${summary.ownershipGapsAddedCount} ownership gaps added`,
    );
  }
  if (summary.resolvedItemsCount > 0) {
    out.push(
      summary.resolvedItemsCount === 1 ? "1 item resolved" : `${summary.resolvedItemsCount} items resolved`,
    );
  }
  if (summary.newItemsCount > 0) {
    out.push(summary.newItemsCount === 1 ? "1 new issue detected" : `${summary.newItemsCount} new issues detected`);
  }
  return out;
}

/**
 * Short executive line (max 3 clauses). Empty when nothing material to report.
 */
export function buildOutcomeSummaryLine(summary: ControlTowerOutcomeSummary): string | null {
  const signals = getOutcomeSignals(summary);
  if (signals.length === 0) return null;
  return signals.slice(0, 3).join(" · ");
}

export function buildPrioritiesSectionOutcomeHint(
  summary: ControlTowerOutcomeSummary,
  comparable: boolean,
  previousPriorityCount: number | null,
  currentPriorityCount: number,
): string | null {
  if (!comparable) return null;
  const parts: string[] = [];
  if (summary.breachesRecoveredCount > 0) {
    parts.push(
      summary.breachesRecoveredCount === 1
        ? "1 breach recovered since last check"
        : `${summary.breachesRecoveredCount} breaches recovered since last check`,
    );
  }
  if (parts.length === 0 && summary.escalationsClearedCount > 0) {
    parts.push(
      summary.escalationsClearedCount === 1
        ? "1 escalation cleared since last check"
        : `${summary.escalationsClearedCount} escalations cleared since last check`,
    );
  }
  if (previousPriorityCount != null) {
    const d = currentPriorityCount - previousPriorityCount;
    if (d !== 0 && parts.length < 2) {
      parts.push(d < 0 ? "Fewer top priorities than last check" : "More top priorities than last check");
    }
  }
  return parts[0] ?? null;
}

export function buildQueueSectionOutcomeHint(summary: ControlTowerOutcomeSummary, comparable: boolean): string | null {
  if (!comparable) return null;
  const { resolvedItemsCount: cleared, newItemsCount: added } = summary;
  if (cleared > 0 && added > 0) return `${cleared} cleared · ${added} new since last snapshot`;
  if (cleared > 0) return `${cleared} item${cleared === 1 ? "" : "s"} cleared since last check`;
  if (added > 0) return `${added} new queue item${added === 1 ? "" : "s"} since last snapshot`;
  return null;
}
