import type { ActionQueueItemExecutionView } from "./escalationTypes";
import type { SnapshotItemRef } from "./outcomeTypes";
import type { ControlTowerSnapshot } from "./trendTypes";

export type BuildSnapshotOptions = {
  now?: Date;
  /** From `buildPriorityItems` length — not inferred from queue rows alone. */
  prioritiesCount?: number;
};

/**
 * Aggregates existing execution + escalation signals only (no duplicate business rules).
 */
export function buildSnapshotFromItems(
  items: ActionQueueItemExecutionView[],
  options?: BuildSnapshotOptions,
): ControlTowerSnapshot {
  const now = options?.now ?? new Date();
  const prioritiesCount = options?.prioritiesCount ?? 0;

  let escalatedCount = 0;
  let attentionCount = 0;
  let breachedCount = 0;
  let unassignedHighCount = 0;
  let stuckCount = 0;

  const itemRefs: SnapshotItemRef[] = [];

  for (const i of items) {
    const { escalation: e, execution: x } = i;
    if (e.escalationLevel === "escalated") escalatedCount += 1;
    if (e.escalationLevel === "attention") attentionCount += 1;
    if (e.slaState === "breached") breachedCount += 1;
    if (x.needsOwner) unassignedHighCount += 1;
    if (x.stuck) stuckCount += 1;
    itemRefs.push({
      id: i.id,
      escalationLevel: e.escalationLevel,
      slaState: e.slaState,
      assigned: x.assigned,
      needsOwner: x.needsOwner,
    });
  }

  return {
    timestamp: now.toISOString(),
    totalItems: items.length,
    escalatedCount,
    attentionCount,
    breachedCount,
    unassignedHighCount,
    stuckCount,
    prioritiesCount,
    itemRefs,
  };
}
