import type { ActionQueueItem } from "./actionQueueTypes";
import type { ActionQueueItemView } from "./executionTypes";
import { buildEscalationMeta } from "./escalation";
import type { ActionQueueItemExecutionView, PriorityItemExecutionView } from "./escalationTypes";
import { getRecommendedAction, getWhyThisMatters } from "./actionExplanations";
import { getActionShortSummary } from "./actionLabels";
import { getDueLabel } from "./timeLabels";
import type { PriorityLevel } from "./priorityTypes";

const LEVEL_RANK: Record<PriorityLevel, number> = { critical: 0, important: 1, watch: 2 };

/**
 * Single classifier for priority band — used by Control Tower and notification compression.
 */
export function getPriorityLevelForItem(item: ActionQueueItem): PriorityLevel {
  const { kind, blocking, severity } = item;

  if (kind === "permit_expired" || kind === "government_case_overdue" || kind === "compliance_failure") {
    return "critical";
  }
  if (kind === "payroll_blocker" && blocking) return "critical";
  if (kind === "document_expiry" && blocking) return "critical";

  if (
    kind === "contract_signature_pending" ||
    kind === "leave_approval_pending" ||
    kind === "permit_expiring" ||
    kind === "attendance_exception" ||
    kind === "task_overdue"
  ) {
    return "important";
  }
  if (kind === "document_expiry" && !blocking) return "important";
  if (kind === "payroll_blocker" && !blocking) return "important";

  if (kind === "generic_attention") return "watch";
  if (severity === "low") return "watch";

  if (severity === "high") return "critical";
  return "important";
}

function toPriorityItem(item: ActionQueueItemView | ActionQueueItemExecutionView, seq: number, now: Date): PriorityItemExecutionView {
  const priorityLevel = getPriorityLevelForItem(item);
  const escalation =
    "escalation" in item && item.escalation
      ? item.escalation
      : buildEscalationMeta(item, item.execution, priorityLevel, now);
  return {
    id: `priority-${item.id}-${seq}`,
    actionId: item.id,
    title: item.title,
    summary: getActionShortSummary(item),
    whyThisMatters: getWhyThisMatters(item),
    recommendedAction: getRecommendedAction(item),
    priorityLevel,
    blocking: item.blocking,
    href: item.href,
    ctaLabel: item.ctaLabel,
    dueLabel: getDueLabel(item, now),
    ownerLabel: item.ownerLabel ?? null,
    source: item.source,
    kind: item.kind,
    execution: item.execution,
    escalation,
  };
}

export type BuildPriorityItemsOptions = {
  max?: number;
  /** For deterministic SLA / due labels in tests */
  now?: Date;
};

/**
 * Ranks normalized queue rows (already grouped, deduped, role-ordered) into top priorities.
 * Fills with watch-level items only when fewer than `max` critical+important rows exist.
 */
export function buildPriorityItems(
  actionQueueItems: Array<ActionQueueItemView | ActionQueueItemExecutionView>,
  _role?: string | null,
  options?: BuildPriorityItemsOptions,
): PriorityItemExecutionView[] {
  const max = options?.max ?? 3;
  const now = options?.now ?? new Date();
  if (actionQueueItems.length === 0 || max <= 0) return [];

  const annotated = actionQueueItems.map((item, index) => ({
    item,
    index,
    level: getPriorityLevelForItem(item),
  }));

  annotated.sort((a, b) => {
    const rd = LEVEL_RANK[a.level] - LEVEL_RANK[b.level];
    if (rd !== 0) return rd;
    return a.index - b.index;
  });

  const strong = annotated.filter((a) => a.level !== "watch");
  const watch = annotated.filter((a) => a.level === "watch");

  let picked: typeof annotated;
  if (strong.length >= max) {
    picked = strong.slice(0, max);
  } else {
    picked = [...strong, ...watch.slice(0, max - strong.length)];
  }

  return picked.map((p, i) => toPriorityItem(p.item, i, now));
}

/** Items that count as “critical/high” for bell compression (must stay in sync with UX copy). */
export function countUrgentItemsForBell(items: ActionQueueItem[] | ActionQueueItemView[] | ActionQueueItemExecutionView[]): number {
  return items.filter((i) => {
    const lvl = getPriorityLevelForItem(i);
    return lvl === "critical" || i.severity === "high";
  }).length;
}

export const BELL_URGENT_COMPRESSION_THRESHOLD = 5;

export function shouldCompressBellActionList(items: ActionQueueItem[] | ActionQueueItemView[] | ActionQueueItemExecutionView[]): boolean {
  return countUrgentItemsForBell(items) > BELL_URGENT_COMPRESSION_THRESHOLD;
}

export function countEscalatedItemsForBell(items: ActionQueueItemExecutionView[]): number {
  return items.filter((i) => i.escalation.escalationLevel === "escalated").length;
}
