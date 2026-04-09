import type { ActionQueueItem } from "./actionQueueTypes";
import type { ActionExecutionMeta } from "./executionTypes";
import type { PriorityLevel } from "./priorityTypes";
import type { EscalationMeta } from "./escalationTypes";
import { getSlaState } from "./sla";

/**
 * Single derivation point for escalation semantics (no UI duplication).
 * Caller supplies `priorityLevel` to avoid importing priority engine here (cycle-safe).
 */
export function buildEscalationMeta(
  item: ActionQueueItem,
  execution: ActionExecutionMeta,
  priorityLevel: PriorityLevel,
  now: Date = new Date(),
): EscalationMeta {
  const slaState = getSlaState(item, execution, priorityLevel, now);

  let escalationLevel: EscalationMeta["escalationLevel"] = "normal";
  let escalationReason: string | null = null;

  const criticalUnassigned = priorityLevel === "critical" && !execution.assigned;
  const stuckStrong = execution.stuck && (item.severity === "high" || priorityLevel === "critical");
  const blockingAged =
    item.blocking &&
    ((execution.ageDays != null && execution.ageDays >= 5) || execution.agingLevel === "stale");

  if (
    slaState === "breached" ||
    criticalUnassigned ||
    stuckStrong ||
    blockingAged
  ) {
    escalationLevel = "escalated";
    if (slaState === "breached" && execution.overdue) escalationReason = "Overdue and still unresolved";
    else if (criticalUnassigned) escalationReason = "Critical item has no owner";
    else if (stuckStrong) escalationReason = "Blocking or high-impact item appears stuck";
    else if (blockingAged) escalationReason = "Blocking issue has aged beyond threshold";
    else if (slaState === "breached") escalationReason = "SLA appears breached";
    else escalationReason = "Escalated for executive attention";
  } else if (
    slaState === "nearing_sla" ||
    (priorityLevel === "important" && !execution.assigned) ||
    (execution.agingLevel === "aging" && (priorityLevel === "critical" || priorityLevel === "important"))
  ) {
    escalationLevel = "attention";
    if (slaState === "nearing_sla") escalationReason = "Aging item is nearing SLA";
    else if (priorityLevel === "important" && !execution.assigned) escalationReason = "Important item has no owner";
    else escalationReason = "Needs follow-up soon";
  }

  const followThroughRequired =
    escalationLevel === "escalated" || (escalationLevel === "attention" && item.href.length > 0);

  return {
    slaState,
    escalationLevel,
    followThroughRequired,
    escalationReason,
  };
}
