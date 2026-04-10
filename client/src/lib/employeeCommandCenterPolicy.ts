/**
 * SmartPRO Employee OS — Command Center **classification policy** (Phase 3.5).
 *
 * ## Layer definitions (presentation contract)
 *
 * **Blocker** — Must be resolved soon; affects payroll, compliance, legal standing, shift closure,
 * or core operability. Rendered in the Blockers region only (from `buildEmployeeBlockers`).
 * Top Actions that duplicate a blocker CTA are suppressed via `suppressedActionKeysFromBlockers`.
 *
 * **Top action** — Actionable next step with a clear CTA and meaningful urgency, but **not** a blocker.
 * Comes from the action-center model after blocker suppression. Not mixed into Heads-up chips.
 *
 * **Heads-up** — Contextual attention (tasks due, training, compliance strip, expiring-doc shortcut).
 * Informs soon; not the primary action queue. Wording must differ from blocker titles when the same
 * underlying signal exists (e.g. docs: blocker card vs Heads-up “Documents (n)” link).
 *
 * **Utility** — Reference / secondary tools (leave strip, news, pay strip, glance). Must not compete
 * with operational surfaces; emphasis `muted` when blocked or urgent-non-blocked.
 *
 * Orchestration order and emphasis are derived in `employeeCommandCenterState` + `employeeCommandCenterOrchestration`;
 * this module holds **pure emphasis + reason helpers** so rules stay explicit and testable.
 */

import type { CommandCenterSectionKey } from "./employeePortalPriorityProfile";
import type { CommandCenterOrchestrationMeta, CommandCenterStateContext } from "./employeeCommandCenterState";

export type CommandCenterSectionEmphasis = "primary" | "secondary" | "muted";

/** Policy flags that influenced the current orchestration (traceability / tests). */
export type CommandCenterOrchestrationReason =
  | "baseline_profile"
  | "blocked_mode"
  | "active_shift"
  | "idle_execution" /** no tasks + no pending requests (ordering lift) */
  | "idle_day" /** calendar idle from state */
  | "urgent_actions"
  | "many_pending_requests";

export function collectOrchestrationReasons(
  state: CommandCenterStateContext,
  meta: CommandCenterOrchestrationMeta,
  profileIsApprover: boolean,
  pendingRequestCount: number,
): CommandCenterOrchestrationReason[] {
  const reasons: CommandCenterOrchestrationReason[] = ["baseline_profile"];
  if (meta.isBlocked) reasons.push("blocked_mode");
  if (state.isActiveShift) reasons.push("active_shift");
  if (state.isIdleDay) reasons.push("idle_day");
  if (!state.hasAnyTasks && !state.hasPendingRequests) reasons.push("idle_execution");
  if (state.hasUrgentTopActions && !state.hasBlockers) reasons.push("urgent_actions");
  if (profileIsApprover && pendingRequestCount >= 3) reasons.push("many_pending_requests");
  return reasons;
}

export type SectionEmphasisInput = {
  state: CommandCenterStateContext;
  meta: CommandCenterOrchestrationMeta;
  /** Blockers region is actually shown */
  hasBlockersVisible: boolean;
  /** Heads-up row is shown */
  hasHeadsUpVisible: boolean;
};

/**
 * Per-section visual band — use with layout classes; prefer this over ad hoc opacity only.
 */
export function computeSectionEmphasis(key: CommandCenterSectionKey, input: SectionEmphasisInput): CommandCenterSectionEmphasis {
  const { state, meta, hasBlockersVisible, hasHeadsUpVisible } = input;
  const blocked = meta.isBlocked;
  const urgentNonBlocked = state.hasUrgentTopActions && !state.hasBlockers;

  switch (key) {
    case "command_header":
      return blocked ? "muted" : "secondary";
    case "today_status":
      return "primary";
    case "blockers":
      return hasBlockersVisible ? "primary" : "muted";
    case "top_actions":
      if (blocked) return "secondary";
      return urgentNonBlocked ? "primary" : "secondary";
    case "heads_up":
      if (!hasHeadsUpVisible) return "muted";
      if (blocked) return "secondary";
      return urgentNonBlocked ? "primary" : "secondary";
    case "work_summary":
    case "requests_summary":
      if (blocked) return "secondary";
      return urgentNonBlocked ? "secondary" : "secondary";
    case "hr_month":
    case "pay_and_files":
    case "at_a_glance":
      if (blocked || urgentNonBlocked) return "muted";
      return "secondary";
    case "recent_activity":
      if (blocked || urgentNonBlocked) return "muted";
      return "secondary";
    case "secondary_tools":
      if (blocked || urgentNonBlocked) return "muted";
      return "secondary";
    default:
      return "secondary";
  }
}

export function emphasisSectionClassName(e: CommandCenterSectionEmphasis): string {
  if (e === "primary") return "";
  if (e === "secondary") return "opacity-[0.96]";
  return "opacity-[0.78] saturate-[0.95]";
}
