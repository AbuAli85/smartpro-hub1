import type { ActionQueueItem } from "./actionQueueTypes";
import type { ActionQueueItemView } from "./executionTypes";
import type { ActionQueueItemExecutionView } from "./escalationTypes";

/** Canonical section order for CEO scan hierarchy (documentation + tests). */
export const CONTROL_TOWER_SECTION_ORDER = [
  "executive_header",
  "priorities",
  "risk_strip",
  "action_queue",
  "kpi_snapshot",
  "support_context",
] as const;

export type ControlTowerSectionId = (typeof CONTROL_TOWER_SECTION_ORDER)[number];

export function priorityActionIdsFromItems(priorityItems: Array<{ actionId: string }>): Set<string> {
  return new Set(priorityItems.map((p) => p.actionId));
}

/**
 * Remaining queue rows after Today’s Priorities — same truth as the page, no duplicate rows.
 */
export function queueItemsAfterPriorities<T extends ActionQueueItem | ActionQueueItemView | ActionQueueItemExecutionView>(
  actionItems: T[],
  priorityIds: Set<string>,
): T[] {
  return actionItems.filter((a) => !priorityIds.has(a.id));
}
