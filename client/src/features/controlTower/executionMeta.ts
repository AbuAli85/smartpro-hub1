import type { ActionQueueItem } from "./actionQueueTypes";
import type { ActionExecutionMeta, ActionQueueItemView } from "./executionTypes";
import { getAgeInDays, getAgingLevel, isOverdue, isStuck } from "./aging";
import { getOwnerLabel, isAssigned, isAssignedToSelf, type CurrentUserLike } from "./ownership";
import { getPriorityLevelForItem } from "./priorityEngine";

export function buildExecutionMeta(item: ActionQueueItem, currentUser: CurrentUserLike, now: Date = new Date()): ActionExecutionMeta {
  const assigned = isAssigned(item);
  const ownerLabel = getOwnerLabel(item, currentUser);
  const assignedToSelf = isAssignedToSelf(item, currentUser);
  const ageDays = getAgeInDays(item, now);
  const agingLevel = getAgingLevel(ageDays);
  const overdue = isOverdue(item, now);
  const lastUpdatedAt = item.updatedAt ?? null;

  const level = getPriorityLevelForItem(item);
  const needsOwner =
    !assigned && (item.severity === "high" || level === "critical");

  const stuck = isStuck(item, now);

  return {
    ownerLabel,
    assigned,
    assignedToSelf,
    ageDays,
    agingLevel,
    overdue,
    lastUpdatedAt,
    needsOwner,
    stuck,
  };
}

export function attachExecutionToQueueItems(items: ActionQueueItem[], currentUser: CurrentUserLike): ActionQueueItemView[] {
  return items.map((item) => ({
    ...item,
    execution: buildExecutionMeta(item, currentUser),
  }));
}
