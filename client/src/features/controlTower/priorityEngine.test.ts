import { describe, expect, it } from "vitest";
import { getRecommendedAction, getWhyThisMatters } from "./actionExplanations";
import {
  BELL_URGENT_COMPRESSION_THRESHOLD,
  buildPriorityItems,
  countUrgentItemsForBell,
  getPriorityLevelForItem,
  shouldCompressBellActionList,
} from "./priorityEngine";
import type { ActionQueueItem } from "./actionQueueTypes";
import { getDueLabel, getDueLabelOrNone } from "./timeLabels";
import { groupActionQueueItems, mapRoleRowToItem, type RawRoleQueueRow } from "./actionQueuePipeline";

function item(overrides: Partial<ActionQueueItem> & Pick<ActionQueueItem, "id" | "kind">): ActionQueueItem {
  return {
    title: "T",
    severity: "medium",
    blocking: false,
    source: "hr",
    href: "/x",
    ctaLabel: "Open",
    ...overrides,
  };
}

describe("getWhyThisMatters / getRecommendedAction", () => {
  it("returns canonical copy for payroll_blocker", () => {
    const a = item({ id: "1", kind: "payroll_blocker", title: "Payroll" });
    expect(getWhyThisMatters(a)).toContain("Payroll cannot proceed");
    expect(getRecommendedAction(a)).toContain("payroll exceptions");
  });

  it("uses plural-safe permit copy for grouped permits", () => {
    const a = item({
      id: "group-permit-expired",
      kind: "permit_expired",
      title: "3 expired work permits",
      count: 3,
      blocking: true,
      source: "workforce",
    });
    expect(getWhyThisMatters(a)).toContain("permits");
    expect(getRecommendedAction(a)).toContain("permits");
  });
});

describe("getDueLabel", () => {
  it("labels overdue, today, tomorrow, and in N days in Muscat calendar sense", () => {
    const now = new Date("2026-04-09T12:00:00.000Z");
    expect(getDueLabel(item({ id: "a", kind: "task_overdue", dueAt: "2026-04-08T00:00:00.000Z" }), now)).toBe("Overdue");
    expect(getDueLabel(item({ id: "b", kind: "task_overdue", dueAt: "2026-04-09T08:00:00.000Z" }), now)).toBe("Due today");
    expect(getDueLabel(item({ id: "c", kind: "task_overdue", dueAt: "2026-04-10T08:00:00.000Z" }), now)).toBe("Due tomorrow");
    expect(getDueLabel(item({ id: "d", kind: "task_overdue", dueAt: "2026-04-12T08:00:00.000Z" }), now)).toBe("Due in 3 days");
  });

  it("returns null without implying a deadline when dueAt is missing", () => {
    expect(getDueLabel(item({ id: "e", kind: "generic_attention" }))).toBeNull();
    expect(getDueLabelOrNone(item({ id: "e", kind: "generic_attention" }))).toBe("No deadline");
  });
});

describe("getPriorityLevelForItem", () => {
  it("classifies blocking payroll as critical", () => {
    expect(
      getPriorityLevelForItem(
        item({ id: "p", kind: "payroll_blocker", blocking: true, severity: "medium" }),
      ),
    ).toBe("critical");
  });

  it("classifies expired permits as critical", () => {
    expect(getPriorityLevelForItem(item({ id: "e", kind: "permit_expired", blocking: true, severity: "high" }))).toBe(
      "critical",
    );
  });
});

describe("buildPriorityItems", () => {
  it("ranks expired permit before pending signature", () => {
    const sig = item({
      id: "s1",
      kind: "contract_signature_pending",
      title: "Contracts",
      severity: "medium",
      source: "contracts",
    });
    const permit = item({
      id: "e1",
      kind: "permit_expired",
      title: "Expired",
      severity: "high",
      blocking: true,
      source: "workforce",
    });
    const out = buildPriorityItems([sig, permit], null);
    expect(out[0].kind).toBe("permit_expired");
    expect(out[1].kind).toBe("contract_signature_pending");
  });

  it("returns at most 3 priorities", () => {
    const five = Array.from({ length: 5 }, (_, i) =>
      item({
        id: `p${i}`,
        kind: "permit_expired",
        title: `P${i}`,
        severity: "high",
        blocking: true,
        source: "workforce",
      }),
    );
    expect(buildPriorityItems(five, null).length).toBe(3);
  });

  it("excludes watch items when three critical priorities fill the cap", () => {
    const critical = [1, 2, 3].map((k) =>
      item({
        id: `c${k}`,
        kind: "government_case_overdue",
        title: `Case ${k}`,
        severity: "high",
        blocking: true,
        source: "workforce",
      }),
    );
    const watch = [4, 5].map((k) =>
      item({
        id: `w${k}`,
        kind: "generic_attention",
        title: `Hygiene ${k}`,
        severity: "low",
        source: "operations",
      }),
    );
    const out = buildPriorityItems([...critical, ...watch], null);
    expect(out).toHaveLength(3);
    expect(out.every((p) => p.priorityLevel !== "watch")).toBe(true);
  });

  it("produces explanations for grouped permit row", () => {
    const rows: RawRoleQueueRow[] = ["a", "b", "c"].map((id) => ({
      id,
      type: "permit_expiry",
      title: "Expired",
      severity: "high",
      href: "/workforce/permits",
      status: "overdue",
    }));
    const grouped = groupActionQueueItems(rows.map(mapRoleRowToItem));
    const out = buildPriorityItems(grouped, null);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("permit_expired");
    expect(out[0].whyThisMatters).toContain("compliance");
    expect(out[0].ctaLabel).toBe("Review permits");
  });
});

describe("notification compression", () => {
  it("triggers when urgent count exceeds threshold", () => {
    const rows = Array.from({ length: BELL_URGENT_COMPRESSION_THRESHOLD + 1 }, (_, i) =>
      item({
        id: `u${i}`,
        kind: "permit_expired",
        title: `P${i}`,
        severity: "high",
        blocking: true,
        source: "workforce",
      }),
    );
    expect(countUrgentItemsForBell(rows)).toBe(BELL_URGENT_COMPRESSION_THRESHOLD + 1);
    expect(shouldCompressBellActionList(rows)).toBe(true);
  });

  it("does not compress at threshold", () => {
    const rows = Array.from({ length: BELL_URGENT_COMPRESSION_THRESHOLD }, (_, i) =>
      item({
        id: `u${i}`,
        kind: "permit_expired",
        severity: "high",
        blocking: true,
        source: "workforce",
      }),
    );
    expect(shouldCompressBellActionList(rows)).toBe(false);
  });
});
