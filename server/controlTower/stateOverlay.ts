/**
 * server/controlTower/stateOverlay.ts
 *
 * Pure helpers for:
 *   1. Overlaying persisted item states on top of freshly-built signals.
 *   2. Filtering the active queue (remove resolved / dismissed).
 *   3. Domain-scoped action policy enforcement.
 *
 * No database I/O — all functions are synchronous and testable in isolation.
 */

import { TRPCError } from "@trpc/server";
import type { ControlTowerItem, ControlTowerAction, ControlTowerStatus } from "@shared/controlTowerTypes";
import type { ControlTowerItemState } from "./itemStateRepository";
import type { MemberRole } from "../_core/capabilities";

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
 */
export function overlayStateOnItems(
  items: ControlTowerItem[],
  stateMap: Map<string, ControlTowerItemState>,
  baseAllowedActions: ControlTowerAction[],
): ControlTowerItem[] {
  return items.map((item) => {
    const state = stateMap.get(item.id);
    if (!state) return item;

    const status = state.status as ControlTowerStatus;
    return {
      ...item,
      status,
      ownerUserId: state.ownerUserId ?? item.ownerUserId,
      allowedActions: recalculateAllowedActions(baseAllowedActions, status),
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
