import type { ActionQueueItem, ActionQueueStatus } from "./actionQueueTypes";

/**
 * Derives UI-safe queue semantics — never returns `all_clear` when sources failed.
 */
/** Call when loading has finished for queue sources, or combine with `isLoading` in UI. */
export function computeActionQueueStatus(args: {
  queueError: boolean;
  pulseError: boolean;
  items: ActionQueueItem[];
}): ActionQueueStatus {
  if (args.queueError && args.pulseError) return "error";
  if (args.queueError || args.pulseError) return "partial";

  const hasUrgent = args.items.some(
    (i) => i.blocking || i.severity === "high" || i.severity === "medium",
  );
  if (args.items.length === 0) return "all_clear";
  if (!hasUrgent) return "no_urgent_blockers";
  return "ready";
}

export function queueStatusHeadline(status: ActionQueueStatus): string {
  switch (status) {
    case "all_clear":
      return "All clear";
    case "no_urgent_blockers":
      return "No urgent blockers";
    case "partial":
      return "Partial queue data";
    case "error":
      return "Unable to load action queue";
    default:
      return "Action queue";
  }
}

export function queueStatusDescription(status: ActionQueueStatus): string {
  switch (status) {
    case "all_clear":
      return "No high- or medium-priority items are waiting on you right now.";
    case "no_urgent_blockers":
      return "Nothing blocking or urgent — lower-priority items may still be listed.";
    case "partial":
      return "Some sources failed to load; the list may be incomplete.";
    case "error":
      return "We could not load the decision queue reliably. Retry or open modules directly.";
    default:
      return "Prioritised by role, severity, and due dates.";
  }
}
