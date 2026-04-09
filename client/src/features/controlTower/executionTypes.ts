import type { ActionQueueItem } from "./actionQueueTypes";
import type { PriorityItem } from "./priorityTypes";

/**
 * Accountability / execution surface — derived in the client only.
 */
export interface ActionExecutionMeta {
  /** Resolved label for display (from queue or null). */
  ownerLabel: string | null;
  assigned: boolean;
  assignedToSelf: boolean;
  ageDays: number | null;
  agingLevel: "fresh" | "aging" | "stale" | null;
  overdue: boolean;
  lastUpdatedAt: string | null;
  /** High-severity / critical priority but no owner. */
  needsOwner: boolean;
  /** Long-running open items (stale aging). */
  stuck: boolean;
}

export type ActionQueueItemView = ActionQueueItem & {
  execution: ActionExecutionMeta;
};

export type PriorityItemView = PriorityItem & {
  execution: ActionExecutionMeta;
};
