import type { ActionExecutionMeta } from "./executionTypes";
import type { EscalationMeta } from "./escalationTypes";

/** Stronger than generic attention — tied to escalation / aging signals. */
export function needsFollowThrough(escalation: EscalationMeta): boolean {
  return escalation.followThroughRequired;
}

/**
 * Short label for follow-through cue (null when none).
 */
export function getFollowThroughLabel(escalation: EscalationMeta, execution: ActionExecutionMeta): string | null {
  if (!escalation.followThroughRequired) return null;
  if (escalation.escalationLevel === "escalated") {
    if (escalation.slaState === "breached" || execution.overdue) return "Needs immediate review";
    return "Follow-up required";
  }
  if (escalation.escalationLevel === "attention") {
    if (execution.assigned && (execution.agingLevel === "aging" || execution.agingLevel === "stale")) {
      return "Review progress";
    }
    return "Follow-up required";
  }
  return null;
}
