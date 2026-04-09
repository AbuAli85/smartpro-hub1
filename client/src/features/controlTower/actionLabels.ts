import type { ActionQueueItem } from "./actionQueueTypes";
import type { PriorityLevel } from "./priorityTypes";

export function getPriorityBadgeLabel(level: PriorityLevel): string {
  switch (level) {
    case "critical":
      return "Critical";
    case "important":
      return "Important";
    case "watch":
      return "Watch";
    default:
      return "Priority";
  }
}

/** One-line summary for priority cards — avoids vague “needs attention”. */
export function getActionShortSummary(item: ActionQueueItem): string {
  if (item.count != null && item.count > 1) {
    return item.title;
  }
  return item.title;
}

/** Prefer queue `ctaLabel` (already plural-aware from the pipeline). */
export function getPluralAwareCtaLabel(item: ActionQueueItem): string {
  return item.ctaLabel;
}
