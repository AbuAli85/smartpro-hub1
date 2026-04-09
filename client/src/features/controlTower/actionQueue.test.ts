import { describe, expect, it } from "vitest";
import { computeActionQueueStatus } from "./actionQueueComputeStatus";
import { getActionSeverity } from "./actionSeverity";
import {
  buildActionQueueFromSources,
  groupActionQueueItems,
  mapRoleRowToItem,
  sortActionQueueItems,
  type RawRoleQueueRow,
} from "./actionQueuePipeline";
import { prioritizeActionQueueForRole } from "./actionQueueRolePrioritize";
import type { ActionQueueItem } from "./actionQueueTypes";

function permitExpiredRow(id: string): RawRoleQueueRow {
  return {
    id,
    type: "permit_expiry",
    title: "Permit expired",
    severity: "high",
    href: "/workforce/permits",
    status: "overdue",
  };
}

describe("getActionSeverity", () => {
  it("treats expired permits as high regardless of server hint", () => {
    expect(getActionSeverity({ kind: "permit_expired", blocking: true, lifecycle: "expired" })).toBe("high");
    expect(getActionSeverity({ kind: "permit_expired", blocking: true, lifecycle: "expired", serverSeverity: "low" })).toBe(
      "high",
    );
  });

  it("classifies permit expiring within horizon as medium", () => {
    expect(getActionSeverity({ kind: "permit_expiring", lifecycle: "due_soon" })).toBe("medium");
  });
});

describe("groupActionQueueItems", () => {
  it("merges multiple expired permits into one grouped high blocking row with count and plural CTA", () => {
    const rows = ["a", "b", "c"].map(permitExpiredRow);
    const items = rows.map((r) => mapRoleRowToItem(r));
    const grouped = groupActionQueueItems(items);
    expect(grouped).toHaveLength(1);
    const g = grouped[0];
    expect(g.kind).toBe("permit_expired");
    expect(g.blocking).toBe(true);
    expect(g.severity).toBe("high");
    expect(g.count).toBe(3);
    expect(g.title).toMatch(/3 expired work permits/);
    expect(g.ctaLabel).toBe("Review permits");
    expect(g.href).toContain("status=expired");
  });
});

describe("sortActionQueueItems", () => {
  it("orders high blocking payroll above medium non-blocking signature", () => {
    const payroll: ActionQueueItem = {
      id: "p1",
      kind: "payroll_blocker",
      title: "Payroll blocked",
      severity: "high",
      blocking: true,
      source: "payroll",
      href: "/payroll",
      ctaLabel: "Review payroll",
    };
    const sig: ActionQueueItem = {
      id: "s1",
      kind: "contract_signature_pending",
      title: "Contracts pending",
      severity: "medium",
      blocking: false,
      source: "contracts",
      href: "/contracts",
      ctaLabel: "Review contract",
    };
    const sorted = sortActionQueueItems([sig, payroll]);
    expect(sorted[0].id).toBe("p1");
    expect(sorted[1].id).toBe("s1");
  });
});

describe("prioritizeActionQueueForRole", () => {
  it("orders leave before payroll for hr_admin but payroll before leave for company_admin", () => {
    const leave: ActionQueueItem = {
      id: "group-leave-pending",
      kind: "leave_approval_pending",
      title: "2 leave requests pending approval",
      severity: "medium",
      blocking: false,
      source: "hr",
      href: "/hr/leave?status=pending",
      ctaLabel: "Review requests",
      count: 2,
    };
    const payroll: ActionQueueItem = {
      id: "p1",
      kind: "payroll_blocker",
      title: "Payroll draft",
      severity: "medium",
      blocking: false,
      source: "payroll",
      href: "/payroll",
      ctaLabel: "Review payroll",
    };
    const hrOrder = prioritizeActionQueueForRole([payroll, leave], "hr_admin");
    expect(hrOrder[0].kind).toBe("leave_approval_pending");
    expect(hrOrder[1].kind).toBe("payroll_blocker");

    const adminOrder = prioritizeActionQueueForRole([leave, payroll], "company_admin");
    expect(adminOrder[0].kind).toBe("payroll_blocker");
    expect(adminOrder[1].kind).toBe("leave_approval_pending");
  });
});

describe("computeActionQueueStatus", () => {
  it("does not return all_clear when a required source failed (partial)", () => {
    expect(
      computeActionQueueStatus({
        queueError: true,
        pulseError: false,
        items: [],
      }),
    ).toBe("partial");
    expect(
      computeActionQueueStatus({
        queueError: false,
        pulseError: true,
        items: [],
      }),
    ).toBe("partial");
  });

  it("returns error when both sources fail", () => {
    expect(
      computeActionQueueStatus({
        queueError: true,
        pulseError: true,
        items: [],
      }),
    ).toBe("error");
  });

  it("returns all_clear only when no errors and queue is empty", () => {
    expect(
      computeActionQueueStatus({
        queueError: false,
        pulseError: false,
        items: [],
      }),
    ).toBe("all_clear");
  });
});

describe("buildActionQueueFromSources", () => {
  it("produces a single sorted permit row for three raw expired permits", () => {
    const built = buildActionQueueFromSources({
      roleRows: [permitExpiredRow("1"), permitExpiredRow("2"), permitExpiredRow("3")],
      decisionRows: undefined,
      maxCandidates: 48,
    });
    const permits = built.filter((i) => i.kind === "permit_expired");
    expect(permits).toHaveLength(1);
    expect(permits[0].count).toBe(3);
    expect(permits[0].ctaLabel).toBe("Review permits");
  });
});
