/**
 * Command Center section visibility + ordered rendering helpers (Phase 2.5 + 3).
 * Presentation-only — pairs with `getCommandCenterSectionOrder` in `employeeCommandCenterState`.
 */
import type { CommandCenterSectionKey, EmployeePortalPriorityProfile } from "./employeePortalPriorityProfile";
import type { CommandCenterStateContext } from "./employeeCommandCenterState";
import { getCommandCenterSectionOrder } from "./employeeCommandCenterState";

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
