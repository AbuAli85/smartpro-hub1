import { describe, expect, it } from "vitest";
import type { ControlTowerSnapshot } from "./trendTypes";
import {
  buildOutcomeSummary,
  buildOutcomeSummaryLine,
  buildPrioritiesSectionOutcomeHint,
  buildQueueSectionOutcomeHint,
  getOutcomeSignals,
  hasOutcomeBaseline,
} from "./outcomes";
import type { SnapshotItemRef } from "./outcomeTypes";

const snap = (overrides: Partial<ControlTowerSnapshot> & { itemRefs?: SnapshotItemRef[] }): ControlTowerSnapshot => ({
  timestamp: new Date().toISOString(),
  totalItems: 0,
  escalatedCount: 0,
  attentionCount: 0,
  breachedCount: 0,
  unassignedHighCount: 0,
  stuckCount: 0,
  prioritiesCount: 0,
  ...overrides,
});

describe("hasOutcomeBaseline", () => {
  it("is false without itemRefs", () => {
    expect(hasOutcomeBaseline(snap({ totalItems: 1 }))).toBe(false);
  });

  it("is true when itemRefs is an array", () => {
    expect(hasOutcomeBaseline(snap({ itemRefs: [] }))).toBe(true);
  });
});

describe("buildOutcomeSummary", () => {
  it("returns zeros when previous has no itemRefs", () => {
    const cur = snap({
      totalItems: 2,
      itemRefs: [
        { id: "a", escalationLevel: "escalated", slaState: "breached", assigned: false, needsOwner: true },
        { id: "b", escalationLevel: "normal", slaState: "within_sla", assigned: true, needsOwner: false },
      ],
    });
    const prev = snap({ totalItems: 1 });
    const s = buildOutcomeSummary(cur, prev);
    expect(s.newItemsCount).toBe(0);
    expect(s.escalationsAddedCount).toBe(0);
  });

  it("detects new and resolved items by id", () => {
    const prev = snap({
      itemRefs: [
        { id: "gone", escalationLevel: "normal", slaState: "within_sla", assigned: true, needsOwner: false },
        { id: "stay", escalationLevel: "normal", slaState: "within_sla", assigned: true, needsOwner: false },
      ],
    });
    const cur = snap({
      itemRefs: [
        { id: "stay", escalationLevel: "normal", slaState: "within_sla", assigned: true, needsOwner: false },
        { id: "new", escalationLevel: "normal", slaState: "within_sla", assigned: true, needsOwner: false },
      ],
    });
    const s = buildOutcomeSummary(cur, prev);
    expect(s.newItemsCount).toBe(1);
    expect(s.resolvedItemsCount).toBe(1);
  });

  it("counts escalation cleared when escalated item disappears", () => {
    const prev = snap({
      itemRefs: [{ id: "x", escalationLevel: "escalated", slaState: "within_sla", assigned: true, needsOwner: false }],
    });
    const cur = snap({ itemRefs: [] });
    expect(buildOutcomeSummary(cur, prev).escalationsClearedCount).toBe(1);
  });

  it("counts escalation added when item becomes escalated", () => {
    const prev = snap({
      itemRefs: [{ id: "x", escalationLevel: "normal", slaState: "within_sla", assigned: true, needsOwner: false }],
    });
    const cur = snap({
      itemRefs: [{ id: "x", escalationLevel: "escalated", slaState: "within_sla", assigned: true, needsOwner: false }],
    });
    expect(buildOutcomeSummary(cur, prev).escalationsAddedCount).toBe(1);
  });

  it("counts breach recovered when breached item becomes non-breached", () => {
    const prev = snap({
      itemRefs: [{ id: "x", escalationLevel: "attention", slaState: "breached", assigned: true, needsOwner: false }],
    });
    const cur = snap({
      itemRefs: [{ id: "x", escalationLevel: "attention", slaState: "nearing_sla", assigned: true, needsOwner: false }],
    });
    expect(buildOutcomeSummary(cur, prev).breachesRecoveredCount).toBe(1);
  });

  it("counts ownership gap closed when needsOwner clears", () => {
    const prev = snap({
      itemRefs: [{ id: "x", escalationLevel: "normal", slaState: "within_sla", assigned: false, needsOwner: true }],
    });
    const cur = snap({
      itemRefs: [{ id: "x", escalationLevel: "normal", slaState: "within_sla", assigned: true, needsOwner: false }],
    });
    expect(buildOutcomeSummary(cur, prev).ownershipGapsClosedCount).toBe(1);
  });
});

describe("getOutcomeSignals / buildOutcomeSummaryLine", () => {
  it("prioritizes breaches and escalations in the summary line", () => {
    const summary = buildOutcomeSummary(
      snap({
        itemRefs: [{ id: "a", escalationLevel: "normal", slaState: "within_sla", assigned: true, needsOwner: false }],
      }),
      snap({
        itemRefs: [{ id: "a", escalationLevel: "escalated", slaState: "breached", assigned: false, needsOwner: true }],
      }),
    );
    const line = buildOutcomeSummaryLine(summary);
    expect(line).toBeTruthy();
    const signals = getOutcomeSignals(summary);
    expect(signals[0]).toMatch(/breach/i);
    expect(line!.split(" · ").length).toBeLessThanOrEqual(3);
  });

  it("returns null when nothing changed", () => {
    const s = snap({
      itemRefs: [{ id: "a", escalationLevel: "normal", slaState: "within_sla", assigned: true, needsOwner: false }],
    });
    expect(buildOutcomeSummaryLine(buildOutcomeSummary(s, s))).toBeNull();
  });
});

describe("section hints", () => {
  it("builds queue hint for cleared items", () => {
    const summary = buildOutcomeSummary(
      snap({
        itemRefs: [{ id: "n", escalationLevel: "normal", slaState: "within_sla", assigned: true, needsOwner: false }],
      }),
      snap({
        itemRefs: [
          { id: "n", escalationLevel: "normal", slaState: "within_sla", assigned: true, needsOwner: false },
          { id: "gone", escalationLevel: "normal", slaState: "within_sla", assigned: true, needsOwner: false },
        ],
      }),
    );
    const h = buildQueueSectionOutcomeHint(summary, true);
    expect(h).toMatch(/cleared/i);
  });
});
