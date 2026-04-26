/**
 * server/controlTower/stateOverlay.ts
 *
 * Pure helpers for:
 *   1. Overlaying persisted item states on top of freshly-built signals.
 *   2. Filtering the active queue (remove resolved / dismissed).
 *   3. Domain-scoped action policy enforcement.
 *   4. Re-emergence: auto-reopening suppressed items when the source stays active.
 *
 * No database I/O — all functions are synchronous and testable in isolation.
 *
 * Re-emergence rules (applied in overlayStateOnItems):
 *   resolved  → re-opens immediately if the item appears in the current signal
 *               batch (meaning the source that was "fixed" is active again).
 *   dismissed → re-opens after REEMERGENCE_WINDOW_MS if the source is still
 *               active, giving operators a deliberate grace period.
 */

import { TRPCError } from "@trpc/server";
import type { ControlTowerItem, ControlTowerAction, ControlTowerStatus } from "@shared/controlTowerTypes";
import type { ControlTowerItemState } from "./itemStateRepository";
import type { MemberRole } from "../_core/capabilities";

/**
 * How long after dismissal (with source still active on each refresh) before
 * the item automatically re-emerges as "open".
 * 7 days — enough for operators to take action before the signal resurfaces.
 */
export const REEMERGENCE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Allowed-action recalculation ─────────────────────────────────────────────

/**
 * Narrows the base action list based on the item's current persisted status.
 *
 *  open          → no change (all capabilities apply)
 *  acknowledged  → remove acknowledge (already done)
 *  in_progress   → remove acknowledge (already moving)
 *  resolved      → view_detail only
 *  dismissed     → view_detail only
 */
export function recalculateAllowedActions(
  base: ControlTowerAction[],
  status: ControlTowerStatus,
): ControlTowerAction[] {
  if (status === "resolved" || status === "dismissed") return ["view_detail"];
  if (status === "acknowledged" || status === "in_progress") {
    return base.filter((a) => a !== "acknowledge");
  }
  return base;
}

// ─── State overlay ────────────────────────────────────────────────────────────

/**
 * Merges persisted state records into freshly-generated signals.
 *
 * For each item whose key appears in stateMap:
 *   - status and ownerUserId are replaced with the persisted values.
 *   - allowedActions are recalculated from `baseAllowedActions` + new status.
 *
 * Items not in stateMap are returned unchanged (status stays "open").
 *
 * Re-emergence (when `now` is supplied):
 *   An item appearing in the current builder batch means its source is active.
 *   - resolved items  → re-opened immediately (source fixed → came back → new issue)
 *   - dismissed items → re-opened after REEMERGENCE_WINDOW_MS (grace period for
 *     deliberate dismissals; source must remain active throughout the window)
 */
export function overlayStateOnItems(
  items: ControlTowerItem[],
  stateMap: Map<string, ControlTowerItemState>,
  baseAllowedActions: ControlTowerAction[],
  now?: Date,
): ControlTowerItem[] {
  return items.map((item) => {
    const state = stateMap.get(item.id);
    if (!state) return item;

    const status = state.status as ControlTowerStatus;

    // Re-emergence check: item is in the current signal batch → source is active.
    if (now && (status === "resolved" || status === "dismissed")) {
      const suppressedAt = status === "resolved" ? state.resolvedAt : state.dismissedAt;
      const shouldReopen =
        status === "resolved" ||
        (status === "dismissed" &&
          suppressedAt != null &&
          now.getTime() - suppressedAt.getTime() > REEMERGENCE_WINDOW_MS);

      if (shouldReopen) {
        return {
          ...item,
          status: "open" as ControlTowerStatus,
          ownerUserId: null,
          allowedActions: recalculateAllowedActions(baseAllowedActions, "open"),
        };
      }
    }

    return {
      ...item,
      status,
      ownerUserId: state.ownerUserId ?? item.ownerUserId,
      allowedActions: recalculateAllowedActions(baseAllowedActions, status),
    };
  });
}

/**
 * Strips `resolve` from the allowedActions of scoped aggregate signals.
 *
 * Scoped signals (id contains ":scoped") represent aggregate conditions over a
 * set of employees (e.g. "3 work permits expiring — department: Engineering").
 * The source-confirmed resolution check cannot reliably identify which specific
 * records to clear, so resolve is not a safe action.  Dismiss remains allowed.
 */
export function stripResolveFromScopedItems(items: ControlTowerItem[]): ControlTowerItem[] {
  return items.map((item) => {
    if (!item.id.includes(":scoped")) return item;
    return {
      ...item,
      allowedActions: item.allowedActions.filter((a) => a !== "resolve"),
    };
  });
}

/**
 * Removes resolved and dismissed items from the active queue.
 *
 * Resolved/dismissed items remain in the state table for history but must not
 * clutter the operator's active queue.  If the underlying source condition
 * re-appears after a manual resolve/dismiss, the builder will generate a fresh
 * signal whose key may differ (e.g. a new draft payroll run for a later month),
 * or the state overlay will expose the item again once it transitions back to open.
 */
export function filterActiveItems(items: ControlTowerItem[]): ControlTowerItem[] {
  return items.filter(
    (item) => item.status !== "resolved" && item.status !== "dismissed",
  );
}

// ─── Domain action policy ─────────────────────────────────────────────────────

/** Domains each non-admin role is allowed to manage. */
const DOMAIN_POLICY: Partial<Record<MemberRole, Set<string>>> = {
  hr_admin: new Set(["hr", "documents", "compliance"]),
  finance_admin: new Set(["finance", "payroll"]),
};

/**
 * Throws FORBIDDEN if the caller's role cannot perform `action` in `domain`.
 *
 * Rule:
 *  - company_admin (and platform ops, proxied as company_admin): any domain.
 *  - hr_admin: hr, documents, compliance.
 *  - finance_admin: finance, payroll.
 *  - All other roles cannot manage CT items (caller must have already passed
 *    requireCanManageControlTower before reaching this check).
 */
export function assertDomainActionAllowed(
  role: MemberRole,
  domain: string,
  action: string,
): void {
  if (role === "company_admin") return; // unrestricted

  const allowed = DOMAIN_POLICY[role];
  if (!allowed) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Your role (${role}) cannot perform Control Tower mutations.`,
    });
  }
  if (!allowed.has(domain)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Your role (${role}) cannot ${action} items in the "${domain}" domain.`,
    });
  }
}

/**
 * Throws FORBIDDEN if a reviewer or external_auditor tries to mutate state.
 * Call this before any mutation to catch read-only roles early.
 */
export function assertNotReadOnly(role: MemberRole): void {
  if (role === "reviewer" || role === "external_auditor") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Read-only roles cannot modify Control Tower item state.",
    });
  }
}
