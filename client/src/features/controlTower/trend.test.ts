import { describe, expect, it } from "vitest";
import { buildSnapshotFromItems } from "./snapshot";
import type { ActionQueueItemExecutionView } from "./escalationTypes";
import {
  buildPrioritiesTrendHints,
  buildQueueTotalTrendHint,
  buildTrendSummaryLine,
  getDelta,
  getDriftSignals,
  getProgressSignals,
  getTrendDirection,
  getTrendLabel,
} from "./trend";
import type { ControlTowerSnapshot, TrendComparison } from "./trendTypes";

const baseSnap = (overrides: Partial<ControlTowerSnapshot>): ControlTowerSnapshot => ({
  timestamp: new Date().toISOString(),
  totalItems: 5,
  escalatedCount: 1,
  attentionCount: 1,
  breachedCount: 0,
  unassignedHighCount: 0,
  stuckCount: 1,
  prioritiesCount: 2,
  ...overrides,
});

function mockItem(esc: Partial<ActionQueueItemExecutionView["escalation"]>, ex: Partial<ActionQueueItemExecutionView["execution"]>): ActionQueueItemExecutionView {
  return {
    id: "x",
    kind: "generic_attention",
    title: "t",
    severity: "medium",
    blocking: false,
    source: "hr",
    href: "/h",
    ctaLabel: "Open",
    execution: {
      ownerLabel: null,
      assigned: false,
      assignedToSelf: false,
      ageDays: null,
      agingLevel: null,
      overdue: false,
      lastUpdatedAt: null,
      needsOwner: false,
      stuck: false,
      ...ex,
    },
    escalation: {
      slaState: "within_sla",
      escalationLevel: "normal",
      followThroughRequired: false,
      escalationReason: null,
      ...esc,
    },
  };
}

describe("getDelta / getTrendDirection", () => {
  it("computes numeric delta", () => {
    const cur = baseSnap({ escalatedCount: 3 });
    const prev = baseSnap({ escalatedCount: 1 });
    expect(getDelta(cur, prev, "escalatedCount")).toBe(2);
  });

  it("returns null delta without previous", () => {
    const cur = baseSnap({});
    expect(getDelta(cur, null, "totalItems")).toBeNull();
  });

  it("classifies direction for risk metrics", () => {
    expect(getTrendDirection(2, "risk")).toBe("up");
    expect(getTrendDirection(-1, "risk")).toBe("down");
    expect(getTrendDirection(0, "risk")).toBe("flat");
    expect(getTrendDirection(null, "risk")).toBe("unknown");
  });
});

describe("getTrendLabel", () => {
  it("describes backlog change", () => {
    expect(getTrendLabel("totalItems", 2)).toContain("Backlog grew");
    expect(getTrendLabel("totalItems", -1)).toContain("Backlog shrank");
    expect(getTrendLabel("totalItems", 0)).toContain("No change");
  });
});

describe("getDriftSignals / getProgressSignals", () => {
  it("flags escalation increase as drift", () => {
    const c: TrendComparison = {
      current: baseSnap({ escalatedCount: 3 }),
      previous: baseSnap({ escalatedCount: 1 }),
    };
    expect(getDriftSignals(c)).toContain("Escalations are rising");
  });

  it("flags stuck decrease as progress", () => {
    const c: TrendComparison = {
      current: baseSnap({ stuckCount: 0 }),
      previous: baseSnap({ stuckCount: 2 }),
    };
    expect(getProgressSignals(c)).toContain("Backlog clearing");
  });

  it("returns empty drift without previous", () => {
    expect(getDriftSignals({ current: baseSnap({}), previous: null })).toEqual([]);
  });
});

describe("buildTrendSummaryLine", () => {
  it("combines drift and progress when both present", () => {
    const line = buildTrendSummaryLine({
      current: baseSnap({ escalatedCount: 3, stuckCount: 0 }),
      previous: baseSnap({ escalatedCount: 1, stuckCount: 2 }),
    });
    expect(line).toBeTruthy();
    expect(line!.length).toBeGreaterThan(5);
  });

  it("returns null when no material change", () => {
    const s = baseSnap({});
    expect(buildTrendSummaryLine({ current: s, previous: s })).toBeNull();
  });
});

describe("buildSnapshotFromItems", () => {
  it("counts from execution + escalation only", () => {
    const items: ActionQueueItemExecutionView[] = [
      mockItem(
        { escalationLevel: "escalated", slaState: "breached" },
        { stuck: true, needsOwner: true },
      ),
      mockItem({ escalationLevel: "attention", slaState: "within_sla" }, { stuck: false }),
    ];
    const snap = buildSnapshotFromItems(items, { prioritiesCount: 2, now: new Date("2026-04-10T12:00:00.000Z") });
    expect(snap.totalItems).toBe(2);
    expect(snap.escalatedCount).toBe(1);
    expect(snap.attentionCount).toBe(1);
    expect(snap.breachedCount).toBe(1);
    expect(snap.stuckCount).toBe(1);
    expect(snap.unassignedHighCount).toBe(1);
    expect(snap.prioritiesCount).toBe(2);
    expect(snap.itemRefs).toHaveLength(2);
    expect(snap.itemRefs?.[0]?.id).toBeDefined();
  });
});

describe("buildPrioritiesTrendHints / buildQueueTotalTrendHint", () => {
  it("formats inline hints when deltas move", () => {
    const c: TrendComparison = {
      current: baseSnap({ escalatedCount: 2, stuckCount: 1, unassignedHighCount: 0 }),
      previous: baseSnap({ escalatedCount: 1, stuckCount: 2, unassignedHighCount: 1 }),
    };
    const hints = buildPrioritiesTrendHints(c);
    expect(hints).toBeTruthy();
    expect(hints).toContain("Escalated");
    const qh = buildQueueTotalTrendHint(c);
    expect(qh === null || typeof qh === "string").toBe(true);
  });
});
