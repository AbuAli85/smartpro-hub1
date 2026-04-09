import type { ActionQueueItem } from "./actionQueueTypes";
import type { PriorityItem } from "./priorityTypes";

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

export function priorityActionIdsFromItems(priorityItems: PriorityItem[]): Set<string> {
  return new Set(priorityItems.map((p) => p.actionId));
}

/**
 * Remaining queue rows after Today’s Priorities — same truth as the page, no duplicate rows.
 */
export function queueItemsAfterPriorities(actionItems: ActionQueueItem[], priorityIds: Set<string>): ActionQueueItem[] {
  return actionItems.filter((a) => !priorityIds.has(a.id));
}
