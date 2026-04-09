import { getPriorityLevelForItem } from "./priorityEngine";
import { buildEscalationMeta } from "./escalation";
import type { ActionQueueItemView } from "./executionTypes";
import type { ActionQueueItemExecutionView } from "./escalationTypes";

export function attachEscalationMeta(item: ActionQueueItemView, now: Date = new Date()): ActionQueueItemExecutionView {
  const level = getPriorityLevelForItem(item);
  return {
    ...item,
    escalation: buildEscalationMeta(item, item.execution, level, now),
  };
}

export function attachEscalationToQueueItems(items: ActionQueueItemView[], now: Date = new Date()): ActionQueueItemExecutionView[] {
  return items.map((item) => attachEscalationMeta(item, now));
}

export type EscalationSummaryCounts = {
  escalated: number;
  nearingSla: number;
  followThrough: number;
};

export function summarizeEscalationFromItems(items: ActionQueueItemExecutionView[]): EscalationSummaryCounts {
  let escalated = 0;
  let nearingSla = 0;
  let followThrough = 0;
  for (const i of items) {
    if (i.escalation.escalationLevel === "escalated") escalated += 1;
    if (i.escalation.slaState === "nearing_sla" && i.escalation.escalationLevel !== "escalated") nearingSla += 1;
    if (i.escalation.followThroughRequired) followThrough += 1;
  }
  return { escalated, nearingSla, followThrough };
}

export function formatEscalationSummaryLine(counts: EscalationSummaryCounts): string | null {
  const parts: string[] = [];
  if (counts.escalated > 0) parts.push(`${counts.escalated} escalated ${counts.escalated === 1 ? "item" : "items"}`);
  if (counts.nearingSla > 0) parts.push(`${counts.nearingSla} nearing SLA`);
  if (counts.followThrough > 0) parts.push(`${counts.followThrough} follow-up${counts.followThrough === 1 ? "" : "s"} required`);
  if (parts.length === 0) return null;
  return parts.join(" · ");
}
