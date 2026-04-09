import type { ActionQueueItem } from "./actionQueueTypes";
import type { ActionExecutionMeta } from "./executionTypes";
import type { PriorityLevel } from "./priorityTypes";
import type { SlaState } from "./escalationTypes";
import { diffCalendarDaysMuscat } from "./timeLabels";

type DueProx = "today" | "tomorrow" | "future" | "past" | "none";

function dueCalendarProximity(item: ActionQueueItem, now: Date): DueProx {
  if (!item.dueAt) return "none";
  const due = new Date(item.dueAt);
  if (Number.isNaN(due.getTime())) return "none";
  const diff = diffCalendarDaysMuscat(due, now);
  if (diff < 0) return "past";
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  return "future";
}

function hasTimingSignal(execution: ActionExecutionMeta, item: ActionQueueItem): boolean {
  return item.dueAt != null || execution.ageDays != null || execution.agingLevel != null;
}

/**
 * SLA classification from execution meta + priority band. Conservative when dates are missing.
 */
export function getSlaState(
  item: ActionQueueItem,
  execution: ActionExecutionMeta,
  priorityLevel: PriorityLevel,
  now: Date = new Date(),
): SlaState {
  if (execution.overdue) return "breached";

  const strongBand =
    priorityLevel === "critical" || priorityLevel === "important" || item.severity === "high";
  if (strongBand && execution.agingLevel === "stale") return "breached";

  if (item.severity === "high" && !execution.assigned && execution.ageDays != null && execution.ageDays >= 2) {
    return "breached";
  }

  const prox = dueCalendarProximity(item, now);
  if (prox === "today" || prox === "tomorrow") return "nearing_sla";

  if (
    execution.agingLevel === "aging" &&
    (priorityLevel === "critical" || priorityLevel === "important" || item.severity === "high")
  ) {
    return "nearing_sla";
  }

  if (item.severity === "medium" && execution.agingLevel === "aging") return "nearing_sla";

  if (!hasTimingSignal(execution, item)) return "unknown";

  if (execution.agingLevel === "fresh" || execution.agingLevel === null) {
    if (prox === "future" || prox === "none") return "within_sla";
  }

  if (execution.agingLevel === "aging" && priorityLevel === "watch" && item.severity === "low") {
    return "within_sla";
  }

  if (execution.agingLevel === "stale") {
    return "breached";
  }

  return "within_sla";
}

export function getSlaReason(
  item: ActionQueueItem,
  execution: ActionExecutionMeta,
  priorityLevel: PriorityLevel,
  now: Date = new Date(),
): string | null {
  const state = getSlaState(item, execution, priorityLevel, now);
  if (state === "breached") {
    if (execution.overdue) return "Past due date and still open";
    if (item.severity === "high" && !execution.assigned && execution.ageDays != null && execution.ageDays >= 2) {
      return "High-severity item unassigned beyond threshold";
    }
    if (execution.agingLevel === "stale") return "Item has been open beyond the stale window";
    return "SLA expectations appear breached";
  }
  if (state === "nearing_sla") {
    const prox = dueCalendarProximity(item, now);
    if (prox === "today" || prox === "tomorrow") return "Due date is imminent";
    if (execution.agingLevel === "aging") return "Aging item is nearing SLA";
    return "Approaching time expectations";
  }
  if (state === "within_sla") return "Within expected timing";
  return null;
}
