import { describe, expect, it } from "vitest";
import {
  prioritizeForRole,
  sortRoleActionQueue,
  type RoleActionQueueItem,
} from "./roleActionQueue";

function q(overrides: Partial<RoleActionQueueItem>): RoleActionQueueItem {
  return {
    id: overrides.id ?? "x",
    type: overrides.type ?? "task",
    title: overrides.title ?? "item",
    severity: overrides.severity ?? "medium",
    ownerUserId: overrides.ownerUserId ?? null,
    dueAt: overrides.dueAt ?? null,
    status: overrides.status ?? "open",
    href: overrides.href ?? "/",
    reason: overrides.reason ?? "reason",
  };
}

describe("sortRoleActionQueue", () => {
  it("sorts by severity, then overdue, then nearest due date", () => {
    const items = [
      q({ id: "permit-soon", type: "permit_expiry", severity: "high", status: "pending", dueAt: "2026-04-22T00:00:00.000Z" }),
      q({ id: "permit-expired", type: "permit_expiry", severity: "critical", status: "overdue", dueAt: "2026-04-01T00:00:00.000Z" }),
      q({ id: "payroll", type: "payroll_blocker", severity: "critical", status: "blocked", dueAt: "2026-04-10T00:00:00.000Z" }),
    ];

    const sorted = sortRoleActionQueue(items);
    expect(sorted.map((i) => i.id)).toEqual(["permit-expired", "payroll", "permit-soon"]);
  });
});

describe("prioritizeForRole", () => {
  it("prioritizes finance items for finance view", () => {
    const items = [
      q({ id: "gov", type: "government_case_overdue", severity: "critical", status: "overdue" }),
      q({ id: "payroll", type: "payroll_blocker", severity: "high", status: "blocked" }),
    ];
    const ranked = prioritizeForRole(items, "finance");
    expect(ranked[0]?.id).toBe("payroll");
  });
});
