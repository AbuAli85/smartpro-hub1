/**
 * Command Center section visibility + ordered rendering helpers (Phase 2.5 + 3 + 3.5).
 * Presentation-only — pairs with `getCommandCenterSectionOrder` in `employeeCommandCenterState`.
 */
import type { CommandCenterSectionKey, EmployeePortalPriorityProfile } from "./employeePortalPriorityProfile";
import type { CommandCenterOrchestrationMeta, CommandCenterStateContext } from "./employeeCommandCenterState";
import { getCommandCenterSectionOrder } from "./employeeCommandCenterState";
import {
  collectOrchestrationReasons,
  computeSectionEmphasis,
  type CommandCenterOrchestrationReason,
  type CommandCenterSectionEmphasis,
} from "./employeeCommandCenterPolicy";

export type CommandCenterVisibility = {
  hasBlockers: boolean;
  hasTopActions: boolean;
  hasHeadsUp: boolean;
  hasRecentActivity: boolean;
  /** When blockers exist, recent activity is dropped from the queue (collapsed / de-emphasized). */
  collapseRecentForBlockers: boolean;
};

export function shouldRenderCommandCenterSection(key: CommandCenterSectionKey, v: CommandCenterVisibility): boolean {
  switch (key) {
    case "blockers":
      return v.hasBlockers;
    case "top_actions":
      return v.hasTopActions;
    case "heads_up":
      return v.hasHeadsUp;
    case "recent_activity":
      return v.hasRecentActivity && !v.collapseRecentForBlockers;
    default:
      return true;
  }
}

export function getOrderedVisibleCommandCenterSections(
  profile: EmployeePortalPriorityProfile,
  v: CommandCenterVisibility,
  state: CommandCenterStateContext,
  pendingRequestCount: number,
): CommandCenterSectionKey[] {
  return getCommandCenterSectionOrder(profile, state, pendingRequestCount).filter((k) => shouldRenderCommandCenterSection(k, v));
}

/** True when both appear and blockers comes first (invariant for all profiles). */
export function blockersBeforeTopActionsWhenBothVisible(order: CommandCenterSectionKey[]): boolean {
  const bi = order.indexOf("blockers");
  const ti = order.indexOf("top_actions");
  if (bi === -1 || ti === -1) return true;
  return bi < ti;
}

/** Debug / test trace: final order, visibility, emphasis, and which policy reasons fired. */
export type CommandCenterOrchestrationSummary = {
  finalOrder: CommandCenterSectionKey[];
  visibleOrder: CommandCenterSectionKey[];
  hiddenSections: CommandCenterSectionKey[];
  emphasisBySection: Partial<Record<CommandCenterSectionKey, CommandCenterSectionEmphasis>>;
  reasons: CommandCenterOrchestrationReason[];
};

export function buildCommandCenterOrchestrationSummary(input: {
  profile: EmployeePortalPriorityProfile;
  state: CommandCenterStateContext;
  meta: CommandCenterOrchestrationMeta;
  pendingRequestCount: number;
  v: CommandCenterVisibility;
}): CommandCenterOrchestrationSummary {
  const finalOrder = getCommandCenterSectionOrder(input.profile, input.state, input.pendingRequestCount);
  const visibleOrder = finalOrder.filter((k) => shouldRenderCommandCenterSection(k, input.v));
  const hiddenSections = finalOrder.filter((k) => !shouldRenderCommandCenterSection(k, input.v));
  const emphasisBySection: Partial<Record<CommandCenterSectionKey, CommandCenterSectionEmphasis>> = {};
  for (const k of visibleOrder) {
    emphasisBySection[k] = computeSectionEmphasis(k, {
      state: input.state,
      meta: input.meta,
      hasBlockersVisible: input.v.hasBlockers,
      hasHeadsUpVisible: input.v.hasHeadsUp,
    });
  }
  const reasons = collectOrchestrationReasons(
    input.state,
    input.meta,
    input.profile === "approver",
    input.pendingRequestCount,
  );
  return { finalOrder, visibleOrder, hiddenSections, emphasisBySection, reasons };
}
