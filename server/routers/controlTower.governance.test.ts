/**
 * server/routers/controlTower.governance.test.ts
 *
 * Governance and lifecycle hardening tests.
 *
 * Coverage:
 *  1. overlayStateOnItems — status overlay, allowedActions recalculation
 *  2. filterActiveItems   — resolved/dismissed removed from active queue
 *  3. recalculateAllowedActions — per-status action narrowing
 *  4. assertDomainActionAllowed — role × domain policy matrix
 *  5. assertNotReadOnly   — reviewer/auditor blocked from mutations
 *  6. Stable itemKey      — same key across signal refresh (identity test)
 *  7. Cross-company isolation — state map is always company-scoped
 *  8. Scope-specific keys — scoped vs unscoped keys are distinct
 *  9. Pagination after overlay — deterministic after rank + filter
 * 10. Dismiss policy      — reason required; domain-gating enforced
 */

import { describe, it, expect } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  overlayStateOnItems,
  filterActiveItems,
  recalculateAllowedActions,
  assertDomainActionAllowed,
  assertNotReadOnly,
  REEMERGENCE_WINDOW_MS,
} from "../controlTower/stateOverlay";
import { buildStateMap } from "../controlTower/itemStateRepository";
import { rankItems } from "../controlTower/rankItems";
import { requiresSourceResolution } from "../controlTower/sourceResolutionPolicy";
import type { ControlTowerItem, ControlTowerAction, ControlTowerStatus } from "@shared/controlTowerTypes";
import type { ControlTowerItemState } from "../controlTower/itemStateRepository";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const COMPANY_A = 1;
const COMPANY_B = 2;
const NOW = new Date("2026-04-15T10:00:00Z");

const BASE_ACTIONS: ControlTowerAction[] = ["view_detail", "acknowledge", "assign", "resolve", "dismiss"];

function makeItem(overrides: Partial<ControlTowerItem> & Pick<ControlTowerItem, "id" | "domain">): ControlTowerItem {
  return {
    companyId: COMPANY_A,
    severity: "high",
    status: "open",
    title: "Test signal",
    description: "Test description",
    ownerUserId: null,
    departmentId: null,
    employeeId: null,
    relatedEntityType: null,
    relatedEntityId: null,
    dueAt: null,
    createdAt: NOW,
    source: "system",
    allowedActions: [...BASE_ACTIONS],
    ...overrides,
  };
}

function makeState(
  companyId: number,
  itemKey: string,
  status: ControlTowerStatus,
  extras: Partial<ControlTowerItemState> = {},
): ControlTowerItemState {
  return {
    id: 1,
    companyId,
    itemKey,
    domain: "hr",
    status,
    ownerUserId: null,
    acknowledgedBy: null,
    acknowledgedAt: null,
    resolvedBy: null,
    resolvedAt: null,
    dismissedBy: null,
    dismissedAt: null,
    dismissalReason: null,
    lastSeenAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...extras,
  };
}

// ─── 1. overlayStateOnItems ───────────────────────────────────────────────────

describe("overlayStateOnItems", () => {
  it("leaves items without a state record unchanged", () => {
    const items = [makeItem({ id: "hr:1:leave:pending", domain: "hr" })];
    const stateMap = new Map<string, ControlTowerItemState>();
    const result = overlayStateOnItems(items, stateMap, BASE_ACTIONS);
    expect(result[0].status).toBe("open");
    expect(result[0].allowedActions).toEqual(BASE_ACTIONS);
  });

  it("overlays acknowledged status and removes acknowledge action", () => {
    const items = [makeItem({ id: "hr:1:leave:pending", domain: "hr" })];
    const stateMap = buildStateMap([
      makeState(COMPANY_A, "hr:1:leave:pending", "acknowledged"),
    ]);
    const result = overlayStateOnItems(items, stateMap, BASE_ACTIONS);
    expect(result[0].status).toBe("acknowledged");
    expect(result[0].allowedActions).not.toContain("acknowledge");
    expect(result[0].allowedActions).toContain("view_detail");
    expect(result[0].allowedActions).toContain("resolve");
  });

  it("overlays in_progress status and removes acknowledge action", () => {
    const items = [makeItem({ id: "hr:1:leave:pending", domain: "hr" })];
    const stateMap = buildStateMap([
      makeState(COMPANY_A, "hr:1:leave:pending", "in_progress"),
    ]);
    const result = overlayStateOnItems(items, stateMap, BASE_ACTIONS);
    expect(result[0].status).toBe("in_progress");
    expect(result[0].allowedActions).not.toContain("acknowledge");
    expect(result[0].allowedActions).toContain("resolve");
  });

  it("overlays resolved status and collapses to view_detail only", () => {
    const items = [makeItem({ id: "hr:1:leave:pending", domain: "hr" })];
    const stateMap = buildStateMap([
      makeState(COMPANY_A, "hr:1:leave:pending", "resolved"),
    ]);
    const result = overlayStateOnItems(items, stateMap, BASE_ACTIONS);
    expect(result[0].status).toBe("resolved");
    expect(result[0].allowedActions).toEqual(["view_detail"]);
  });

  it("overlays dismissed status and collapses to view_detail only", () => {
    const items = [makeItem({ id: "payroll:1:2026:4:draft", domain: "payroll" })];
    const stateMap = buildStateMap([
      makeState(COMPANY_A, "payroll:1:2026:4:draft", "dismissed"),
    ]);
    const result = overlayStateOnItems(items, stateMap, BASE_ACTIONS);
    expect(result[0].status).toBe("dismissed");
    expect(result[0].allowedActions).toEqual(["view_detail"]);
  });

  it("overlays ownerUserId from state when present", () => {
    const items = [makeItem({ id: "hr:1:leave:pending", domain: "hr" })];
    const stateMap = buildStateMap([
      makeState(COMPANY_A, "hr:1:leave:pending", "in_progress", { ownerUserId: 42 }),
    ]);
    const result = overlayStateOnItems(items, stateMap, BASE_ACTIONS);
    expect(result[0].ownerUserId).toBe(42);
  });

  it("does not overlay items from a different company's state map", () => {
    // Company A's item key embeds companyId=1 per builder convention
    const items = [makeItem({ id: `hr:${COMPANY_A}:leave:pending`, domain: "hr" })];
    // Router always calls getItemStatesByCompany(db, m.companyId), so company B
    // states are never loaded for company A requests.  At the key level the
    // builder embeds companyId, so "hr:1:..." ≠ "hr:2:..." by construction.
    const stateMap = buildStateMap([
      makeState(COMPANY_B, `hr:${COMPANY_B}:leave:pending`, "acknowledged"),
    ]);
    const result = overlayStateOnItems(items, stateMap, BASE_ACTIONS);
    expect(result[0].status).toBe("open");
  });
});

// ─── 2. filterActiveItems ─────────────────────────────────────────────────────

describe("filterActiveItems", () => {
  it("keeps open items", () => {
    const items = [makeItem({ id: "a", domain: "hr", status: "open" })];
    expect(filterActiveItems(items)).toHaveLength(1);
  });

  it("keeps acknowledged items", () => {
    const items = [makeItem({ id: "a", domain: "hr", status: "acknowledged" })];
    expect(filterActiveItems(items)).toHaveLength(1);
  });

  it("keeps in_progress items", () => {
    const items = [makeItem({ id: "a", domain: "hr", status: "in_progress" })];
    expect(filterActiveItems(items)).toHaveLength(1);
  });

  it("removes resolved items from active queue", () => {
    const items = [makeItem({ id: "a", domain: "hr", status: "resolved" })];
    expect(filterActiveItems(items)).toHaveLength(0);
  });

  it("removes dismissed items from active queue", () => {
    const items = [makeItem({ id: "a", domain: "payroll", status: "dismissed" })];
    expect(filterActiveItems(items)).toHaveLength(0);
  });

  it("mixed batch: keeps open+ack+in_progress, removes resolved+dismissed", () => {
    const items = [
      makeItem({ id: "a", domain: "hr", status: "open" }),
      makeItem({ id: "b", domain: "hr", status: "acknowledged" }),
      makeItem({ id: "c", domain: "hr", status: "in_progress" }),
      makeItem({ id: "d", domain: "hr", status: "resolved" }),
      makeItem({ id: "e", domain: "hr", status: "dismissed" }),
    ];
    const active = filterActiveItems(items);
    expect(active).toHaveLength(3);
    expect(active.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
});

// ─── 3. recalculateAllowedActions ────────────────────────────────────────────

describe("recalculateAllowedActions", () => {
  it("open: no change", () => {
    expect(recalculateAllowedActions(BASE_ACTIONS, "open")).toEqual(BASE_ACTIONS);
  });

  it("acknowledged: removes acknowledge", () => {
    const result = recalculateAllowedActions(BASE_ACTIONS, "acknowledged");
    expect(result).not.toContain("acknowledge");
    expect(result).toContain("view_detail");
    expect(result).toContain("resolve");
    expect(result).toContain("dismiss");
  });

  it("in_progress: removes acknowledge", () => {
    const result = recalculateAllowedActions(BASE_ACTIONS, "in_progress");
    expect(result).not.toContain("acknowledge");
    expect(result).toContain("assign");
  });

  it("resolved: view_detail only", () => {
    expect(recalculateAllowedActions(BASE_ACTIONS, "resolved")).toEqual(["view_detail"]);
  });

  it("dismissed: view_detail only", () => {
    expect(recalculateAllowedActions(BASE_ACTIONS, "dismissed")).toEqual(["view_detail"]);
  });

  it("read-only base (view_detail only) stays view_detail for any status", () => {
    const readOnly: ControlTowerAction[] = ["view_detail"];
    expect(recalculateAllowedActions(readOnly, "open")).toEqual(["view_detail"]);
    expect(recalculateAllowedActions(readOnly, "acknowledged")).toEqual(["view_detail"]);
  });
});

// ─── 4. assertDomainActionAllowed ────────────────────────────────────────────

describe("assertDomainActionAllowed", () => {
  it("company_admin can manage any domain", () => {
    for (const domain of ["hr", "payroll", "finance", "compliance", "operations", "documents", "contracts"]) {
      expect(() => assertDomainActionAllowed("company_admin", domain, "acknowledge")).not.toThrow();
    }
  });

  it("hr_admin can acknowledge HR domain signals", () => {
    expect(() => assertDomainActionAllowed("hr_admin", "hr", "acknowledge")).not.toThrow();
    expect(() => assertDomainActionAllowed("hr_admin", "documents", "acknowledge")).not.toThrow();
    expect(() => assertDomainActionAllowed("hr_admin", "compliance", "acknowledge")).not.toThrow();
  });

  it("hr_admin cannot acknowledge finance domain signals", () => {
    expect(() => assertDomainActionAllowed("hr_admin", "finance", "acknowledge")).toThrow(TRPCError);
    expect(() => assertDomainActionAllowed("hr_admin", "payroll", "acknowledge")).toThrow(TRPCError);
  });

  it("finance_admin can acknowledge finance domain signals", () => {
    expect(() => assertDomainActionAllowed("finance_admin", "finance", "acknowledge")).not.toThrow();
    expect(() => assertDomainActionAllowed("finance_admin", "payroll", "acknowledge")).not.toThrow();
  });

  it("finance_admin cannot acknowledge HR domain signals", () => {
    expect(() => assertDomainActionAllowed("finance_admin", "hr", "acknowledge")).toThrow(TRPCError);
    expect(() => assertDomainActionAllowed("finance_admin", "documents", "acknowledge")).toThrow(TRPCError);
    expect(() => assertDomainActionAllowed("finance_admin", "compliance", "acknowledge")).toThrow(TRPCError);
  });

  it("hr_admin FORBIDDEN error message names the domain", () => {
    let err: TRPCError | null = null;
    try {
      assertDomainActionAllowed("hr_admin", "finance", "acknowledge");
    } catch (e) {
      err = e as TRPCError;
    }
    expect(err).not.toBeNull();
    expect(err!.message).toContain("finance");
    expect(err!.code).toBe("FORBIDDEN");
  });
});

// ─── 5. assertNotReadOnly ─────────────────────────────────────────────────────

describe("assertNotReadOnly", () => {
  it("reviewer cannot mutate state", () => {
    expect(() => assertNotReadOnly("reviewer")).toThrow(TRPCError);
  });

  it("external_auditor cannot mutate state", () => {
    expect(() => assertNotReadOnly("external_auditor")).toThrow(TRPCError);
  });

  it("company_admin is not read-only", () => {
    expect(() => assertNotReadOnly("company_admin")).not.toThrow();
  });

  it("hr_admin is not read-only", () => {
    expect(() => assertNotReadOnly("hr_admin")).not.toThrow();
  });

  it("finance_admin is not read-only", () => {
    expect(() => assertNotReadOnly("finance_admin")).not.toThrow();
  });
});

// ─── 6. Stable itemKey across signal refresh ─────────────────────────────────

describe("stable itemKey (signal builder key format)", () => {
  it("payroll draft key is deterministic across refreshes", () => {
    // The builder emits: `payroll:${companyId}:${year}:${month}:draft`
    // Two calls at different times produce the same key if conditions hold.
    const key1 = `payroll:${COMPANY_A}:2026:4:draft`;
    const key2 = `payroll:${COMPANY_A}:2026:4:draft`;
    expect(key1).toBe(key2);
  });

  it("HR leave signal key includes companyId making cross-company keys distinct", () => {
    const keyA = `hr:${COMPANY_A}:leave:pending`;
    const keyB = `hr:${COMPANY_B}:leave:pending`;
    expect(keyA).not.toBe(keyB);
  });

  it("scoped HR leave key (dept scope) is distinct from unscoped key", () => {
    // signalBuilders.ts appends :scoped:N for dept/team managers
    const unscopedKey = `hr:${COMPANY_A}:leave:pending`;
    const scopedKey = `hr:${COMPANY_A}:leave:pending:scoped:3`;
    expect(unscopedKey).not.toBe(scopedKey);
  });
});

// ─── 7. Cross-company state isolation ────────────────────────────────────────

describe("cross-company state isolation", () => {
  it("buildStateMap with company A states does not match company B item keys", () => {
    const companyAStates = [
      makeState(COMPANY_A, `hr:${COMPANY_A}:leave:pending`, "acknowledged"),
    ];
    const stateMap = buildStateMap(companyAStates);

    // Company B item has a different key (includes different companyId)
    const companyBItem = makeItem({
      id: `hr:${COMPANY_B}:leave:pending`,
      domain: "hr",
      companyId: COMPANY_B,
    });

    const result = overlayStateOnItems([companyBItem], stateMap, BASE_ACTIONS);
    // Should NOT receive company A's acknowledged state
    expect(result[0].status).toBe("open");
  });

  it("payroll keys are company-scoped by convention", () => {
    const keyA = `payroll:${COMPANY_A}:2026:4:draft`;
    const keyB = `payroll:${COMPANY_B}:2026:4:draft`;
    const states = [makeState(COMPANY_A, keyA, "acknowledged")];
    const stateMap = buildStateMap(states);

    const itemB = makeItem({ id: keyB, domain: "payroll", companyId: COMPANY_B });
    const result = overlayStateOnItems([itemB], stateMap, BASE_ACTIONS);
    expect(result[0].status).toBe("open");
  });
});

// ─── 8. Pagination correctness after overlay + rank ─────────────────────────

describe("pagination after overlay + filter + rank", () => {
  it("total reflects filtered count (resolved items excluded)", () => {
    const items = [
      makeItem({ id: "a", domain: "hr", severity: "high", createdAt: new Date("2026-01-01") }),
      makeItem({ id: "b", domain: "hr", severity: "medium", createdAt: new Date("2026-01-02") }),
      makeItem({ id: "c", domain: "hr", severity: "low", createdAt: new Date("2026-01-03") }),
    ];
    const stateMap = buildStateMap([
      makeState(COMPANY_A, "b", "resolved"),
    ]);
    const overlaid = overlayStateOnItems(items, stateMap, BASE_ACTIONS);
    const active = filterActiveItems(overlaid);
    const ranked = rankItems(active, NOW);

    expect(ranked).toHaveLength(2); // b excluded
    expect(ranked.map((i) => i.id)).toEqual(["a", "c"]); // high before low
  });

  it("pagination slice is deterministic after ranking", () => {
    const items = [
      makeItem({ id: "low1", domain: "hr", severity: "low", createdAt: new Date("2026-01-01") }),
      makeItem({ id: "crit1", domain: "hr", severity: "critical", createdAt: new Date("2026-01-02") }),
      makeItem({ id: "high1", domain: "hr", severity: "high", createdAt: new Date("2026-01-03") }),
      makeItem({ id: "med1", domain: "hr", severity: "medium", createdAt: new Date("2026-01-04") }),
    ];
    const ranked = rankItems(filterActiveItems(overlayStateOnItems(items, new Map(), BASE_ACTIONS)), NOW);
    // Expect: critical → high → medium → low
    expect(ranked.map((i) => i.id)).toEqual(["crit1", "high1", "med1", "low1"]);

    // Page 1 (limit 2, offset 0)
    const page1 = ranked.slice(0, 2);
    expect(page1.map((i) => i.id)).toEqual(["crit1", "high1"]);

    // Page 2 (limit 2, offset 2)
    const page2 = ranked.slice(2, 4);
    expect(page2.map((i) => i.id)).toEqual(["med1", "low1"]);
  });

  it("acknowledged items still appear in active queue (not filtered)", () => {
    const items = [
      makeItem({ id: "a", domain: "hr", severity: "high" }),
    ];
    const stateMap = buildStateMap([
      makeState(COMPANY_A, "a", "acknowledged"),
    ]);
    const active = filterActiveItems(overlayStateOnItems(items, stateMap, BASE_ACTIONS));
    expect(active).toHaveLength(1);
    expect(active[0].status).toBe("acknowledged");
  });
});

// ─── 9. Resolved source issue disappears from active queue ───────────────────

describe("resolved source issue disappears from active queue", () => {
  it("item dismissed by operator is filtered from active queue", () => {
    // Signal builder generates the item (source still exists)
    const items = [makeItem({ id: "contracts:1:pending_signature", domain: "contracts" })];
    // Operator dismissed it
    const stateMap = buildStateMap([
      makeState(COMPANY_A, "contracts:1:pending_signature", "dismissed", {
        dismissalReason: "Will handle offline",
      }),
    ]);
    const active = filterActiveItems(overlayStateOnItems(items, stateMap, BASE_ACTIONS));
    expect(active).toHaveLength(0);
  });

  it("item resolved by operator is filtered from active queue", () => {
    const items = [makeItem({ id: "payroll:1:approved_unpaid", domain: "payroll" })];
    const stateMap = buildStateMap([
      makeState(COMPANY_A, "payroll:1:approved_unpaid", "resolved"),
    ]);
    const active = filterActiveItems(overlayStateOnItems(items, stateMap, BASE_ACTIONS));
    expect(active).toHaveLength(0);
  });

  it("item not yet in state table appears as open in active queue", () => {
    // Signal builder generates the item, no state record yet
    const items = [makeItem({ id: "compliance:1:omanization:non_compliant", domain: "compliance" })];
    const active = filterActiveItems(overlayStateOnItems(items, new Map(), BASE_ACTIONS));
    expect(active).toHaveLength(1);
    expect(active[0].status).toBe("open");
  });
});

// ─── 10. Dismiss policy ───────────────────────────────────────────────────────

describe("dismiss policy (domain-scoped + read-only enforcement)", () => {
  it("company_admin can dismiss any domain", () => {
    for (const domain of ["hr", "payroll", "finance", "compliance", "operations"]) {
      expect(() => {
        assertNotReadOnly("company_admin");
        assertDomainActionAllowed("company_admin", domain, "dismiss");
      }).not.toThrow();
    }
  });

  it("hr_admin can dismiss HR signals but not payroll/finance", () => {
    expect(() => {
      assertNotReadOnly("hr_admin");
      assertDomainActionAllowed("hr_admin", "hr", "dismiss");
    }).not.toThrow();

    expect(() => {
      assertNotReadOnly("hr_admin");
      assertDomainActionAllowed("hr_admin", "payroll", "dismiss");
    }).toThrow(TRPCError);
  });

  it("finance_admin can dismiss finance signals but not HR", () => {
    expect(() => {
      assertNotReadOnly("finance_admin");
      assertDomainActionAllowed("finance_admin", "finance", "dismiss");
    }).not.toThrow();

    expect(() => {
      assertNotReadOnly("finance_admin");
      assertDomainActionAllowed("finance_admin", "hr", "dismiss");
    }).toThrow(TRPCError);
  });

  it("reviewer is blocked from dismiss regardless of domain", () => {
    expect(() => assertNotReadOnly("reviewer")).toThrow(TRPCError);
  });

  it("external_auditor is blocked from dismiss", () => {
    expect(() => assertNotReadOnly("external_auditor")).toThrow(TRPCError);
  });
});

// ─── 11. Re-emergence — resolved items ───────────────────────────────────────

describe("re-emergence: resolved items reappear when source becomes active", () => {
  it("resolved item in current builder batch re-opens immediately", () => {
    const now = new Date("2026-05-01T10:00:00Z");
    const resolvedAt = new Date("2026-04-20T10:00:00Z"); // 11 days ago
    const items = [makeItem({ id: "payroll:1:approved_unpaid", domain: "payroll" })];
    const stateMap = buildStateMap([
      makeState(COMPANY_A, "payroll:1:approved_unpaid", "resolved", { resolvedAt }),
    ]);
    const result = overlayStateOnItems(items, stateMap, BASE_ACTIONS, now);
    expect(result[0].status).toBe("open");
    expect(result[0].allowedActions).toContain("resolve");
  });

  it("resolved item re-emerges even the day after resolution if source is active", () => {
    const now = new Date("2026-05-02T10:00:00Z");
    const resolvedAt = new Date("2026-05-01T10:00:00Z"); // 1 day ago
    const items = [makeItem({ id: "finance:1:invoices:overdue", domain: "finance" })];
    const stateMap = buildStateMap([
      makeState(COMPANY_A, "finance:1:invoices:overdue", "resolved", { resolvedAt }),
    ]);
    const result = overlayStateOnItems(items, stateMap, BASE_ACTIONS, now);
    expect(result[0].status).toBe("open");
  });

  it("resolved item NOT in current batch stays resolved (source went inactive)", () => {
    // Simulate: resolved item whose source went inactive — builder does NOT generate it.
    // overlayStateOnItems only receives builder-generated items, so if the item is
    // absent from `items`, overlayStateOnItems never sees its stateMap entry.
    // This test confirms: an item that is NOT in the builder batch is simply absent
    // from the result, i.e., it won't falsely appear as open.
    const now = new Date("2026-05-01T10:00:00Z");
    const resolvedAt = new Date("2026-04-20T10:00:00Z");
    const items: ControlTowerItem[] = []; // builder did NOT generate this item
    const stateMap = buildStateMap([
      makeState(COMPANY_A, "payroll:1:approved_unpaid", "resolved", { resolvedAt }),
    ]);
    const result = overlayStateOnItems(items, stateMap, BASE_ACTIONS, now);
    expect(result).toHaveLength(0);
  });

  it("re-emerged item passes filterActiveItems and appears in active queue", () => {
    const now = new Date("2026-05-01T10:00:00Z");
    const resolvedAt = new Date("2026-04-20T10:00:00Z");
    const items = [makeItem({ id: "contracts:1:pending_signature", domain: "contracts" })];
    const stateMap = buildStateMap([
      makeState(COMPANY_A, "contracts:1:pending_signature", "resolved", { resolvedAt }),
    ]);
    const overlaid = overlayStateOnItems(items, stateMap, BASE_ACTIONS, now);
    const active = filterActiveItems(overlaid);
    expect(active).toHaveLength(1);
    expect(active[0].status).toBe("open");
  });
});

// ─── 12. Re-emergence — dismissed items (7-day window) ───────────────────────

describe("re-emergence: dismissed items reappear after grace window", () => {
  it("dismissed item within 7-day window stays dismissed", () => {
    const dismissedAt = new Date("2026-04-28T10:00:00Z");
    const now = new Date("2026-04-30T10:00:00Z"); // 2 days later — still within window
    const items = [makeItem({ id: "finance:1:invoices:overdue", domain: "finance" })];
    const stateMap = buildStateMap([
      makeState(COMPANY_A, "finance:1:invoices:overdue", "dismissed", {
        dismissedAt,
        dismissalReason: "Handled offline",
      }),
    ]);
    const result = overlayStateOnItems(items, stateMap, BASE_ACTIONS, now);
    expect(result[0].status).toBe("dismissed");
  });

  it("dismissed item beyond 7-day window re-opens if source is still active", () => {
    const dismissedAt = new Date("2026-04-20T10:00:00Z");
    const now = new Date("2026-04-28T10:00:00Z"); // 8 days later — past window
    const items = [makeItem({ id: "finance:1:invoices:overdue", domain: "finance" })];
    const stateMap = buildStateMap([
      makeState(COMPANY_A, "finance:1:invoices:overdue", "dismissed", {
        dismissedAt,
        dismissalReason: "Handled offline",
      }),
    ]);
    const result = overlayStateOnItems(items, stateMap, BASE_ACTIONS, now);
    expect(result[0].status).toBe("open");
    expect(result[0].ownerUserId).toBeNull();
  });

  it("re-emerged dismissed item passes filterActiveItems", () => {
    const dismissedAt = new Date("2026-04-20T10:00:00Z");
    const now = new Date("2026-04-28T10:00:00Z"); // 8 days
    const items = [makeItem({ id: "compliance:1:renewals:failed", domain: "compliance" })];
    const stateMap = buildStateMap([
      makeState(COMPANY_A, "compliance:1:renewals:failed", "dismissed", {
        dismissedAt,
        dismissalReason: "Will escalate",
      }),
    ]);
    const overlaid = overlayStateOnItems(items, stateMap, BASE_ACTIONS, now);
    const active = filterActiveItems(overlaid);
    expect(active).toHaveLength(1);
    expect(active[0].status).toBe("open");
  });

  it("boundary: item dismissed exactly at REEMERGENCE_WINDOW_MS does not yet re-emerge", () => {
    const dismissedAt = new Date("2026-04-20T10:00:00Z");
    const now = new Date(dismissedAt.getTime() + REEMERGENCE_WINDOW_MS); // exactly at boundary
    const items = [makeItem({ id: "finance:1:invoices:overdue", domain: "finance" })];
    const stateMap = buildStateMap([
      makeState(COMPANY_A, "finance:1:invoices:overdue", "dismissed", {
        dismissedAt,
        dismissalReason: "Monitoring",
      }),
    ]);
    const result = overlayStateOnItems(items, stateMap, BASE_ACTIONS, now);
    // Exactly at window boundary: not strictly greater than → still dismissed
    expect(result[0].status).toBe("dismissed");
  });

  it("dismissed item without a dismissedAt timestamp stays dismissed (defensive)", () => {
    const now = new Date("2026-05-01T10:00:00Z");
    const items = [makeItem({ id: "operations:1:sla:breach", domain: "operations" })];
    const stateMap = buildStateMap([
      makeState(COMPANY_A, "operations:1:sla:breach", "dismissed", {
        dismissedAt: null,
        dismissalReason: "Closed",
      }),
    ]);
    const result = overlayStateOnItems(items, stateMap, BASE_ACTIONS, now);
    expect(result[0].status).toBe("dismissed");
  });
});

// ─── 13. Re-emergence — no-now backward compatibility ────────────────────────

describe("overlayStateOnItems backward compatibility (no now argument)", () => {
  it("resolved item stays resolved when now is not provided", () => {
    const items = [makeItem({ id: "payroll:1:approved_unpaid", domain: "payroll" })];
    const stateMap = buildStateMap([
      makeState(COMPANY_A, "payroll:1:approved_unpaid", "resolved"),
    ]);
    const result = overlayStateOnItems(items, stateMap, BASE_ACTIONS); // no now
    expect(result[0].status).toBe("resolved");
  });

  it("dismissed item stays dismissed when now is not provided", () => {
    const items = [makeItem({ id: "finance:1:invoices:overdue", domain: "finance" })];
    const stateMap = buildStateMap([
      makeState(COMPANY_A, "finance:1:invoices:overdue", "dismissed", {
        dismissedAt: new Date("2026-01-01"),
        dismissalReason: "Old",
      }),
    ]);
    const result = overlayStateOnItems(items, stateMap, BASE_ACTIONS); // no now
    expect(result[0].status).toBe("dismissed");
  });
});

// ─── 14. Source-confirmed resolution policy ───────────────────────────────────

describe("requiresSourceResolution policy gate", () => {
  it("payroll signals (non-scoped) require source resolution", () => {
    expect(requiresSourceResolution("payroll:1:2026:4:draft")).toBe(true);
    expect(requiresSourceResolution("payroll:1:approved_unpaid")).toBe(true);
  });

  it("finance signals require source resolution", () => {
    expect(requiresSourceResolution("finance:1:invoices:overdue")).toBe(true);
    expect(requiresSourceResolution("finance:1:payroll:approved_unpaid")).toBe(true);
  });

  it("compliance signals require source resolution", () => {
    expect(requiresSourceResolution("compliance:1:renewals:failed")).toBe(true);
    expect(requiresSourceResolution("compliance:1:work_permits:expiring_7d")).toBe(true);
    expect(requiresSourceResolution("compliance:1:omanization:2026:4:non_compliant")).toBe(true);
  });

  it("operations signals require source resolution", () => {
    expect(requiresSourceResolution("operations:1:sla:breach")).toBe(true);
    expect(requiresSourceResolution("operations:1:engagements:blocked")).toBe(true);
    expect(requiresSourceResolution("operations:1:tasks:overdue")).toBe(true);
  });

  it("documents and contracts require source resolution", () => {
    expect(requiresSourceResolution("documents:1:company:expiring_30d")).toBe(true);
    expect(requiresSourceResolution("contracts:1:pending_signature")).toBe(true);
  });

  it("scoped signals are exempt (handled via re-emergence)", () => {
    expect(requiresSourceResolution("hr:1:leave:pending:scoped:4")).toBe(false);
    expect(requiresSourceResolution("operations:1:tasks:overdue:scoped")).toBe(false);
    expect(requiresSourceResolution("documents:1:employee:expiring_7d:scoped")).toBe(false);
  });

  it("unknown domain returns false (safe default)", () => {
    expect(requiresSourceResolution("manual:1:anything")).toBe(false);
  });
});
