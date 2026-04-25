/**
 * server/controlTower/signalBuilders.test.ts
 *
 * Signal aggregation tests for Control Tower domain builders.
 *
 * Strategy: stub only the DB queries used by each builder — return fake rows —
 * then assert that the returned ControlTowerItem[] matches expected shape.
 *
 * We do NOT hit a real database; each builder receives a mock DbClient.
 */

import { describe, it, expect, vi } from "vitest";
import {
  buildPayrollSignals,
  buildHrSignals,
  buildComplianceSignals,
  buildOperationsSignals,
  buildFinanceSignals,
  buildDocumentSignals,
  buildContractSignals,
} from "./signalBuilders";
import { rankItems, topRankedItems } from "./rankItems";
import type { ControlTowerItem } from "@shared/controlTowerTypes";
import type { VisibilityScope } from "../_core/visibilityScope";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const COMPANY_ID = 42;
const NOW = new Date("2026-04-10T08:00:00Z"); // Muscat = 2026-04-10 (UTC+4 → day 10)

const SCOPE_COMPANY: VisibilityScope = { type: "company", companyId: COMPANY_ID };
const SCOPE_DEPT: VisibilityScope = {
  type: "department",
  companyId: COMPANY_ID,
  selfEmployeeId: 10,
  department: "Operations",
  departmentEmployeeIds: [10, 11, 12],
};
const SCOPE_TEAM: VisibilityScope = {
  type: "team",
  companyId: COMPANY_ID,
  selfEmployeeId: 20,
  managedEmployeeIds: [20, 21, 22],
};

const ALLOWED_ACTIONS = ["view_detail", "acknowledge", "assign", "resolve", "dismiss"] as const;

// ─── DB mock factory ─────────────────────────────────────────────────────────

/**
 * Returns a db mock that returns different row sets for each sequential await.
 * Uses a counter so each `.then()` call pops the next row set.
 * Methods are lazily chained via mockImplementation to avoid stack overflow.
 */
function multiCallDb(rowSets: unknown[][]): unknown {
  let callIndex = 0;

  function makeFluent(): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    const methods = ["select", "from", "where", "limit", "innerJoin", "leftJoin"];
    for (const m of methods) {
      // Lazy: only calls makeFluent() when the method is actually invoked.
      obj[m] = vi.fn().mockImplementation(() => makeFluent());
    }
    obj["then"] = (res: (v: unknown) => unknown) => {
      const rows = rowSets[callIndex] ?? [];
      callIndex++;
      return Promise.resolve(res(rows));
    };
    return obj;
  }

  return makeFluent();
}

// ─── rankItems ────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<ControlTowerItem> = {}): ControlTowerItem {
  return {
    id: "test:1",
    companyId: COMPANY_ID,
    domain: "operations",
    severity: "medium",
    status: "open",
    title: "Test item",
    description: "desc",
    ownerUserId: null,
    departmentId: null,
    employeeId: null,
    relatedEntityType: null,
    relatedEntityId: null,
    dueAt: null,
    createdAt: NOW,
    source: "system",
    allowedActions: ["view_detail"],
    ...overrides,
  };
}

describe("rankItems", () => {
  it("sorts critical before high before medium before low", () => {
    const items = [
      makeItem({ id: "1", severity: "low" }),
      makeItem({ id: "2", severity: "critical" }),
      makeItem({ id: "3", severity: "medium" }),
      makeItem({ id: "4", severity: "high" }),
    ];
    const ranked = rankItems(items, NOW);
    expect(ranked.map((i) => i.severity)).toEqual(["critical", "high", "medium", "low"]);
  });

  it("within same severity: overdue first", () => {
    const past = new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000);
    const future = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000);
    const items = [
      makeItem({ id: "1", severity: "high", dueAt: future }),
      makeItem({ id: "2", severity: "high", dueAt: past }),
    ];
    const ranked = rankItems(items, NOW);
    expect(ranked[0].id).toBe("2"); // overdue first
  });

  it("within same severity, non-overdue: due-soon before no-due-date", () => {
    const soon = new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000);
    const items = [
      makeItem({ id: "1", severity: "medium", dueAt: null }),
      makeItem({ id: "2", severity: "medium", dueAt: soon }),
    ];
    const ranked = rankItems(items, NOW);
    expect(ranked[0].id).toBe("2");
  });

  it("within same severity and due-date bucket: open before acknowledged", () => {
    const items = [
      makeItem({ id: "1", severity: "high", status: "acknowledged" }),
      makeItem({ id: "2", severity: "high", status: "open" }),
    ];
    const ranked = rankItems(items, NOW);
    expect(ranked[0].id).toBe("2");
  });

  it("within same severity/status: older createdAt first", () => {
    const older = new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000);
    const items = [
      makeItem({ id: "1", severity: "medium", createdAt: NOW }),
      makeItem({ id: "2", severity: "medium", createdAt: older }),
    ];
    const ranked = rankItems(items, NOW);
    expect(ranked[0].id).toBe("2");
  });

  it("topRankedItems returns at most limit items", () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      makeItem({ id: String(i), severity: "medium" }),
    );
    expect(topRankedItems(items, 3, NOW)).toHaveLength(3);
  });
});

// ─── buildPayrollSignals ──────────────────────────────────────────────────────

describe("buildPayrollSignals", () => {
  it("emits draft signal when draft run exists for current month", async () => {
    // First query: draftRuns → 1 row; Second query: approvedRuns → 0 rows; Third: anyRun → 1
    const db = multiCallDb([[{ id: 101 }], [], [{ cnt: 1 }]]);
    const items = await buildPayrollSignals(
      db as never,
      COMPANY_ID,
      SCOPE_COMPANY,
      [...ALLOWED_ACTIONS],
      NOW,
    );
    const draft = items.find((i) => i.id.includes("draft"));
    expect(draft).toBeDefined();
    expect(draft?.severity).toBe("high");
    expect(draft?.domain).toBe("payroll");
  });

  it("emits approved_unpaid signal when approved runs exist", async () => {
    // draftRuns → empty; approvedRuns → 2 rows; anyRun → 2
    const db = multiCallDb([[], [{ id: 1 }, { id: 2 }], [{ cnt: 2 }]]);
    const items = await buildPayrollSignals(
      db as never,
      COMPANY_ID,
      SCOPE_COMPANY,
      [...ALLOWED_ACTIONS],
      NOW,
    );
    const unpaid = items.find((i) => i.id.includes("approved_unpaid"));
    expect(unpaid).toBeDefined();
    expect(unpaid?.severity).toBe("high");
    expect(unpaid?.title).toContain("2 approved payroll runs");
  });

  it("emits not_started signal when no run exists and day >= 5", async () => {
    // draftRuns → empty; approvedRuns → empty; anyRun → 0 (day 10 in NOW fixture)
    const db = multiCallDb([[], [], [{ cnt: 0 }]]);
    const items = await buildPayrollSignals(
      db as never,
      COMPANY_ID,
      SCOPE_COMPANY,
      [...ALLOWED_ACTIONS],
      NOW,
    );
    const notStarted = items.find((i) => i.id.includes("not_started"));
    expect(notStarted).toBeDefined();
    expect(notStarted?.severity).toBe("medium");
  });

  it("does NOT emit not_started signal when day < 5", async () => {
    const earlyNow = new Date("2026-04-03T08:00:00Z"); // day 3 in Muscat
    const db = multiCallDb([[], [], [{ cnt: 0 }]]);
    const items = await buildPayrollSignals(
      db as never,
      COMPANY_ID,
      SCOPE_COMPANY,
      [...ALLOWED_ACTIONS],
      earlyNow,
    );
    expect(items.find((i) => i.id.includes("not_started"))).toBeUndefined();
  });

  it("returns empty array when everything is normal", async () => {
    // draftRuns → empty; approvedRuns → empty; anyRun → 1 (run exists but not draft/approved)
    const db = multiCallDb([[], [], [{ cnt: 1 }]]);
    const items = await buildPayrollSignals(
      db as never,
      COMPANY_ID,
      SCOPE_COMPANY,
      [...ALLOWED_ACTIONS],
      NOW,
    );
    expect(items).toHaveLength(0);
  });
});

// ─── buildHrSignals ───────────────────────────────────────────────────────────

describe("buildHrSignals", () => {
  it("emits leave signal for pending leave requests", async () => {
    const db = multiCallDb([[{ cnt: 3 }], [{ cnt: 0 }]]);
    const items = await buildHrSignals(
      db as never,
      COMPANY_ID,
      SCOPE_COMPANY,
      [...ALLOWED_ACTIONS],
      NOW,
    );
    expect(items).toHaveLength(1);
    expect(items[0].domain).toBe("hr");
    expect(items[0].title).toContain("3 pending leave requests");
  });

  it("emits employee request signal for pending requests", async () => {
    const db = multiCallDb([[{ cnt: 0 }], [{ cnt: 5 }]]);
    const items = await buildHrSignals(
      db as never,
      COMPANY_ID,
      SCOPE_COMPANY,
      [...ALLOWED_ACTIONS],
      NOW,
    );
    expect(items).toHaveLength(1);
    expect(items[0].title).toContain("5 pending employee requests");
  });

  it("returns empty when no pending HR items", async () => {
    const db = multiCallDb([[{ cnt: 0 }], [{ cnt: 0 }]]);
    const items = await buildHrSignals(
      db as never,
      COMPANY_ID,
      SCOPE_COMPANY,
      [...ALLOWED_ACTIONS],
      NOW,
    );
    expect(items).toHaveLength(0);
  });

  it("signal IDs include scoped suffix when dept scope", async () => {
    const db = multiCallDb([[{ cnt: 2 }], [{ cnt: 0 }]]);
    const items = await buildHrSignals(
      db as never,
      COMPANY_ID,
      SCOPE_DEPT,
      [...ALLOWED_ACTIONS],
      NOW,
    );
    expect(items[0].id).toContain("scoped");
  });
});

// ─── buildComplianceSignals ───────────────────────────────────────────────────

describe("buildComplianceSignals", () => {
  it("emits critical signal for non_compliant omanization", async () => {
    const db = multiCallDb([
      [{ complianceStatus: "non_compliant" }],
      [{ cnt: 0 }],
      [{ cnt: 0 }],
    ]);
    const items = await buildComplianceSignals(
      db as never,
      COMPANY_ID,
      SCOPE_COMPANY,
      [...ALLOWED_ACTIONS],
      NOW,
    );
    const om = items.find((i) => i.id.includes("omanization"));
    expect(om?.severity).toBe("critical");
  });

  it("emits medium signal for warning omanization", async () => {
    const db = multiCallDb([
      [{ complianceStatus: "warning" }],
      [{ cnt: 0 }],
      [{ cnt: 0 }],
    ]);
    const items = await buildComplianceSignals(
      db as never,
      COMPANY_ID,
      SCOPE_COMPANY,
      [...ALLOWED_ACTIONS],
      NOW,
    );
    const om = items.find((i) => i.id.includes("omanization"));
    expect(om?.severity).toBe("medium");
  });

  it("emits critical signal for failed renewal workflows", async () => {
    const db = multiCallDb([[], [{ cnt: 3 }], [{ cnt: 0 }]]);
    const items = await buildComplianceSignals(
      db as never,
      COMPANY_ID,
      SCOPE_COMPANY,
      [...ALLOWED_ACTIONS],
      NOW,
    );
    const rw = items.find((i) => i.id.includes("renewals"));
    expect(rw?.severity).toBe("critical");
    expect(rw?.title).toContain("3 renewal workflows failed");
  });

  it("emits high signal for work permits expiring in 7 days", async () => {
    const db = multiCallDb([[], [{ cnt: 0 }], [{ cnt: 2 }]]);
    const items = await buildComplianceSignals(
      db as never,
      COMPANY_ID,
      SCOPE_COMPANY,
      [...ALLOWED_ACTIONS],
      NOW,
    );
    const permits = items.find((i) => i.id.includes("work_permits"));
    expect(permits?.severity).toBe("high");
  });

  it("returns empty when fully compliant", async () => {
    const db = multiCallDb([[{ complianceStatus: "compliant" }], [{ cnt: 0 }], [{ cnt: 0 }]]);
    const items = await buildComplianceSignals(
      db as never,
      COMPANY_ID,
      SCOPE_COMPANY,
      [...ALLOWED_ACTIONS],
      NOW,
    );
    expect(items).toHaveLength(0);
  });
});

// ─── buildOperationsSignals ───────────────────────────────────────────────────

describe("buildOperationsSignals", () => {
  it("emits critical signal for open SLA breaches", async () => {
    const db = multiCallDb([
      [{ cnt: 2 }], // sla
      [{ cnt: 0 }], // blockedEng
      [{ cnt: 0 }], // atRiskEng
      [{ cnt: 0 }], // overdueTasks
      [{ cnt: 0 }], // blockedTasks
    ]);
    const items = await buildOperationsSignals(
      db as never,
      COMPANY_ID,
      SCOPE_COMPANY,
      [...ALLOWED_ACTIONS],
      NOW,
    );
    const sla = items.find((i) => i.id.includes("sla"));
    expect(sla?.severity).toBe("critical");
    expect(sla?.title).toContain("2 open SLA breaches");
  });

  it("emits high signal for blocked engagements", async () => {
    const db = multiCallDb([
      [{ cnt: 0 }],
      [{ cnt: 3 }], // blocked engagements
      [{ cnt: 0 }],
      [{ cnt: 0 }],
      [{ cnt: 0 }],
    ]);
    const items = await buildOperationsSignals(
      db as never,
      COMPANY_ID,
      SCOPE_COMPANY,
      [...ALLOWED_ACTIONS],
      NOW,
    );
    const eng = items.find((i) => i.id.includes("blocked"));
    expect(eng?.severity).toBe("high");
  });

  it("scope-filtered task items have scoped suffix in ID", async () => {
    const db = multiCallDb([
      [{ cnt: 0 }],
      [{ cnt: 0 }],
      [{ cnt: 0 }],
      [{ cnt: 5 }], // overdue tasks
      [{ cnt: 0 }],
    ]);
    const items = await buildOperationsSignals(
      db as never,
      COMPANY_ID,
      SCOPE_TEAM,
      [...ALLOWED_ACTIONS],
      NOW,
    );
    const task = items.find((i) => i.domain === "operations" && i.id.includes("overdue"));
    expect(task?.id).toContain("scoped");
  });
});

// ─── buildFinanceSignals ──────────────────────────────────────────────────────

describe("buildFinanceSignals", () => {
  it("emits critical signal for overdue client invoices", async () => {
    const db = multiCallDb([[{ cnt: 4 }], []]);
    const items = await buildFinanceSignals(
      db as never,
      COMPANY_ID,
      SCOPE_COMPANY,
      [...ALLOWED_ACTIONS],
      NOW,
    );
    const inv = items.find((i) => i.id.includes("invoices"));
    expect(inv?.severity).toBe("critical");
    expect(inv?.title).toContain("4 overdue client invoices");
  });

  it("emits high signal for approved payroll awaiting payment", async () => {
    const db = multiCallDb([[{ cnt: 0 }], [{ id: 5 }, { id: 6 }]]);
    const items = await buildFinanceSignals(
      db as never,
      COMPANY_ID,
      SCOPE_COMPANY,
      [...ALLOWED_ACTIONS],
      NOW,
    );
    const payroll = items.find((i) => i.id.includes("payroll"));
    expect(payroll?.severity).toBe("high");
  });
});

// ─── buildDocumentSignals ─────────────────────────────────────────────────────

describe("buildDocumentSignals", () => {
  it("emits high signal for employee docs expiring in 7 days", async () => {
    const db = multiCallDb([[{ cnt: 3 }], [{ cnt: 0 }]]);
    const items = await buildDocumentSignals(
      db as never,
      COMPANY_ID,
      SCOPE_COMPANY,
      [...ALLOWED_ACTIONS],
      NOW,
    );
    const doc = items.find((i) => i.id.includes("employee"));
    expect(doc?.severity).toBe("high");
  });

  it("emits medium signal for company docs expiring in 30 days", async () => {
    const db = multiCallDb([[{ cnt: 0 }], [{ cnt: 2 }]]);
    const items = await buildDocumentSignals(
      db as never,
      COMPANY_ID,
      SCOPE_COMPANY,
      [...ALLOWED_ACTIONS],
      NOW,
    );
    const doc = items.find((i) => i.id.includes("company"));
    expect(doc?.severity).toBe("medium");
  });

  it("scoped employee doc signal includes 'scoped' in ID for team scope", async () => {
    const db = multiCallDb([[{ cnt: 1 }], [{ cnt: 0 }]]);
    const items = await buildDocumentSignals(
      db as never,
      COMPANY_ID,
      SCOPE_TEAM,
      [...ALLOWED_ACTIONS],
      NOW,
    );
    expect(items[0].id).toContain("scoped");
  });
});

// ─── buildContractSignals ─────────────────────────────────────────────────────

describe("buildContractSignals", () => {
  it("emits high signal for contracts pending signature", async () => {
    const db = multiCallDb([[{ cnt: 2 }], [{ cnt: 0 }]]);
    const items = await buildContractSignals(
      db as never,
      COMPANY_ID,
      SCOPE_COMPANY,
      [...ALLOWED_ACTIONS],
      NOW,
    );
    const c = items.find((i) => i.id.includes("pending_signature"));
    expect(c?.severity).toBe("high");
    expect(c?.title).toContain("2 contracts awaiting signature");
  });

  it("emits medium signal for contracts expiring in 30 days", async () => {
    const db = multiCallDb([[{ cnt: 0 }], [{ cnt: 3 }]]);
    const items = await buildContractSignals(
      db as never,
      COMPANY_ID,
      SCOPE_COMPANY,
      [...ALLOWED_ACTIONS],
      NOW,
    );
    const c = items.find((i) => i.id.includes("expiring_30d"));
    expect(c?.severity).toBe("medium");
  });

  it("returns empty when no contract issues", async () => {
    const db = multiCallDb([[{ cnt: 0 }], [{ cnt: 0 }]]);
    const items = await buildContractSignals(
      db as never,
      COMPANY_ID,
      SCOPE_COMPANY,
      [...ALLOWED_ACTIONS],
      NOW,
    );
    expect(items).toHaveLength(0);
  });
});

// ─── allowedActions pass-through ─────────────────────────────────────────────

describe("allowedActions pass-through", () => {
  it("read-only caller gets view_detail-only actions on items", async () => {
    const db = multiCallDb([[{ cnt: 3 }], [{ cnt: 0 }]]);
    const readOnlyActions = ["view_detail"] as const;
    const items = await buildHrSignals(
      db as never,
      COMPANY_ID,
      SCOPE_COMPANY,
      [...readOnlyActions],
      NOW,
    );
    for (const item of items) {
      expect(item.allowedActions).toEqual(["view_detail"]);
    }
  });
});
