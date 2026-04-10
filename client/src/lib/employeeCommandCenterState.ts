/**
 * Phase 3 — state-aware Command Center orchestration (order + emphasis inputs).
 * Presentation-only; pairs with `getBaseCommandCenterSectionOrder`.
 */
import type { CommandCenterSectionKey, EmployeePortalPriorityProfile } from "./employeePortalPriorityProfile";
import { getBaseCommandCenterSectionOrder } from "./employeePortalPriorityProfile";

export type CommandCenterStateContext = {
  hasBlockers: boolean;
  hasUrgentTopActions: boolean;
  hasAnyTasks: boolean;
  hasPendingRequests: boolean;
  isIdleDay: boolean;
  isActiveShift: boolean;
};

export type CommandCenterOrchestrationMeta = {
  /** True when blockers exist — layout/emphasis treats page as blocked. */
  isBlocked: boolean;
  /** Approver + heavy request queue (adaptive boost). */
  manyPendingRequests: boolean;
};

export function buildCommandCenterStateContext(input: {
  blockerCount: number;
  focusItems: { severity: string }[];
  taskOpenCount: number;
  pendingRequestCount: number;
  shiftPhase: "upcoming" | "active" | "ended" | null;
  isHoliday: boolean;
  isWorkingDay: boolean | undefined;
  hasShift: boolean;
}): CommandCenterStateContext {
  const hasUrgentTopActions = input.focusItems.some((f) => f.severity === "critical" || f.severity === "warning");
  /** Calendar-quiet day (holiday, no shift, or non-working day) — for state signals, not the only driver of Case 2 ordering. */
  const isIdleDay = input.isHoliday || !input.hasShift || input.isWorkingDay === false;
  return {
    hasBlockers: input.blockerCount > 0,
    hasUrgentTopActions,
    hasAnyTasks: input.taskOpenCount > 0,
    hasPendingRequests: input.pendingRequestCount > 0,
    isIdleDay,
    isActiveShift: input.shiftPhase === "active",
  };
}

export function buildCommandCenterOrchestrationMeta(input: {
  blockerCount: number;
  pendingRequestCount: number;
}): CommandCenterOrchestrationMeta {
  return {
    isBlocked: input.blockerCount > 0,
    manyPendingRequests: input.pendingRequestCount >= 3,
  };
}

function removeKey(arr: CommandCenterSectionKey[], key: CommandCenterSectionKey): CommandCenterSectionKey[] {
  return arr.filter((k) => k !== key);
}

/**
 * Remove `key` then insert it at `targetIndex` in the **resulting** array (0-based).
 * If `key` was before `targetIndex` in the original list, the insertion index is shifted down by one.
 */
export function moveSectionToIndex(
  order: CommandCenterSectionKey[],
  key: CommandCenterSectionKey,
  targetIndex: number,
): CommandCenterSectionKey[] {
  const orig = order.indexOf(key);
  const rest = removeKey(order, key);
  let pos = targetIndex;
  if (orig !== -1 && orig < targetIndex) pos -= 1;
  pos = Math.max(0, Math.min(pos, rest.length));
  return [...rest.slice(0, pos), key, ...rest.slice(pos)];
}

/** Move `key` to immediately after `afterKey` (if afterKey missing, unchanged). */
export function moveSectionAfter(
  order: CommandCenterSectionKey[],
  key: CommandCenterSectionKey,
  afterKey: CommandCenterSectionKey,
): CommandCenterSectionKey[] {
  const j = order.indexOf(afterKey);
  if (j === -1) return [...order];
  return moveSectionToIndex(order, key, j + 1);
}

/** Move `key` to end of list. */
export function moveSectionToEnd(order: CommandCenterSectionKey[], key: CommandCenterSectionKey): CommandCenterSectionKey[] {
  if (!order.includes(key)) return [...order];
  const rest = removeKey(order, key);
  return [...rest, key];
}

/**
 * Apply profile + real-time state to baseline section order.
 * Later rules run after earlier ones; blockers demotion runs last so it wins when combined.
 */
export function adaptCommandCenterSectionOrder(
  base: CommandCenterSectionKey[],
  profile: EmployeePortalPriorityProfile,
  state: CommandCenterStateContext,
  pendingRequestCount: number,
): CommandCenterSectionKey[] {
  let order = [...base];

  // Case 4 — approver + many pending: requests_summary right after today_status (index 2)
  if (profile === "approver" && pendingRequestCount >= 3) {
    order = moveSectionToIndex(order, "requests_summary", 2);
  }

  // Case 3 — active shift: pull work_summary right after top_actions
  if (state.isActiveShift) {
    order = moveSectionAfter(order, "work_summary", "top_actions");
  }

  // Case 2 — no tasks + no requests: lift at_a_glance and secondary_tools (execution-quiet day)
  if (!state.hasAnyTasks && !state.hasPendingRequests) {
    const topIdx = order.indexOf("top_actions");
    if (topIdx !== -1) {
      order = moveSectionToIndex(order, "at_a_glance", topIdx + 1);
    }
    const payIdx = order.indexOf("pay_and_files");
    if (payIdx !== -1) {
      order = moveSectionToIndex(order, "secondary_tools", Math.max(0, payIdx - 1));
    }
  }

  // Case 5 — urgent top actions, no blockers: surface heads-up next to hero; demote history / utilities
  if (state.hasUrgentTopActions && !state.hasBlockers) {
    order = moveSectionAfter(order, "heads_up", "today_status");
    order = moveSectionToEnd(order, "recent_activity");
    order = moveSectionToEnd(order, "secondary_tools");
  }

  // Case 1 — blockers: demote recent_activity and secondary_tools to the tail (wins over Case 5)
  if (state.hasBlockers) {
    order = moveSectionToEnd(order, "recent_activity");
    order = moveSectionToEnd(order, "secondary_tools");
  }

  return order;
}

/** Full section order for a profile and live state (Phase 3 entry point). */
export function getCommandCenterSectionOrder(
  profile: EmployeePortalPriorityProfile,
  state: CommandCenterStateContext,
  pendingRequestCount = 0,
): CommandCenterSectionKey[] {
  const base = getBaseCommandCenterSectionOrder(profile);
  return adaptCommandCenterSectionOrder(base, profile, state, pendingRequestCount);
}

/** Optional weight view for debugging / future UI — lower = earlier. */
export function getCommandCenterSectionWeights(
  profile: EmployeePortalPriorityProfile,
  state: CommandCenterStateContext,
  pendingRequestCount = 0,
): Record<CommandCenterSectionKey, number> {
  const order = getCommandCenterSectionOrder(profile, state, pendingRequestCount);
  const out = {} as Record<CommandCenterSectionKey, number>;
  order.forEach((k, i) => {
    out[k] = i * 1000;
  });
  return out;
}
