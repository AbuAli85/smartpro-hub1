// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { buildEscalationMeta } from "./escalation";
import {
  attachExecutionToQueueItems,
  buildExecutionMeta,
} from "./executionMeta";
import type { ActionQueueItem } from "./actionQueueTypes";
import {
  attachEscalationToQueueItems,
  formatEscalationSummaryLine,
  summarizeEscalationFromItems,
} from "./escalationMeta";
import { getSlaState } from "./sla";
import { getPriorityLevelForItem } from "./priorityEngine";
import { needsFollowThrough } from "./followThrough";
import { PrioritiesSection } from "./components/PrioritiesSection";

const NOW = new Date("2026-04-10T12:00:00.000Z");

function base(overrides: Partial<ActionQueueItem> & Pick<ActionQueueItem, "id" | "kind">): ActionQueueItem {
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getSlaState", () => {
  it("marks overdue item as breached", () => {
    const item = base({
      id: "1",
      kind: "task_overdue",
      dueAt: "2026-04-01T00:00:00.000Z",
    });
    const ex = buildExecutionMeta(item, null);
    const lvl = getPriorityLevelForItem(item);
    expect(getSlaState(item, ex, lvl)).toBe("breached");
  });

  it("uses unknown when no timing signals", () => {
    const item = base({ id: "1", kind: "generic_attention", severity: "low" });
    const ex = buildExecutionMeta(item, null);
    const lvl = getPriorityLevelForItem(item);
    expect(getSlaState(item, ex, lvl)).toBe("unknown");
    expect(ex.overdue).toBe(false);
  });

  it("nears SLA when due tomorrow", () => {
    const item = base({
      id: "1",
      kind: "leave_approval_pending",
      dueAt: "2026-04-11T00:00:00.000Z",
    });
    const ex = buildExecutionMeta(item, null);
    const lvl = getPriorityLevelForItem(item);
    expect(getSlaState(item, ex, lvl)).toBe("nearing_sla");
  });

  it("within SLA for fresh low-risk item with created today", () => {
    const item = base({
      id: "1",
      kind: "generic_attention",
      severity: "low",
      createdAt: "2026-04-10T08:00:00.000Z",
    });
    const ex = buildExecutionMeta(item, null);
    const lvl = getPriorityLevelForItem(item);
    expect(getSlaState(item, ex, lvl)).toBe("within_sla");
  });
});

describe("buildEscalationMeta", () => {
  it("escalates critical unassigned item", () => {
    const item = base({
      id: "1",
      kind: "payroll_blocker",
      blocking: true,
      severity: "high",
    });
    const ex = buildExecutionMeta(item, null);
    const lvl = getPriorityLevelForItem(item);
    const meta = buildEscalationMeta(item, ex, lvl);
    expect(meta.escalationLevel).toBe("escalated");
    expect(meta.followThroughRequired).toBe(true);
    expect(meta.escalationReason).toContain("owner");
  });

  it("escalates stuck high-severity item (stale)", () => {
    const item = base({
      id: "1",
      kind: "generic_attention",
      severity: "high",
      createdAt: "2026-04-01T00:00:00.000Z",
    });
    const ex = buildExecutionMeta(item, null);
    const lvl = getPriorityLevelForItem(item);
    expect(ex.stuck).toBe(true);
    const meta = buildEscalationMeta(item, ex, lvl);
    expect(meta.escalationLevel).toBe("escalated");
  });

  it("attention for aging important band", () => {
    const item = base({
      id: "1",
      kind: "leave_approval_pending",
      createdAt: "2026-04-07T00:00:00.000Z",
    });
    const ex = buildExecutionMeta(item, null);
    const lvl = getPriorityLevelForItem(item);
    const meta = buildEscalationMeta(item, ex, lvl);
    expect(["attention", "escalated"]).toContain(meta.escalationLevel);
    expect(meta.slaState === "nearing_sla" || meta.escalationLevel !== "normal").toBe(true);
  });

  it("normal / within for fresh assigned medium item", () => {
    const item = base({
      id: "1",
      kind: "generic_attention",
      severity: "medium",
      ownerLabel: "Sam",
      createdAt: "2026-04-10T08:00:00.000Z",
    });
    const ex = buildExecutionMeta(item, null);
    const lvl = getPriorityLevelForItem(item);
    const meta = buildEscalationMeta(item, ex, lvl);
    expect(meta.escalationLevel).toBe("normal");
    expect(meta.slaState === "within_sla" || meta.slaState === "unknown").toBe(true);
  });

  it("followThroughRequired for escalated cases", () => {
    const overdue = base({
      id: "1",
      kind: "task_overdue",
      dueAt: "2026-04-01T00:00:00.000Z",
    });
    const ex = buildExecutionMeta(overdue, null);
    const meta = buildEscalationMeta(overdue, ex, getPriorityLevelForItem(overdue));
    expect(meta.followThroughRequired).toBe(true);
    expect(needsFollowThrough(meta)).toBe(true);
  });
});

describe("summarizeEscalationFromItems", () => {
  it("counts escalated, nearing SLA, and follow-through", () => {
    const items = attachEscalationToQueueItems(
      attachExecutionToQueueItems(
        [
          base({
            id: "a",
            kind: "payroll_blocker",
            blocking: true,
            severity: "high",
            dueAt: "2026-04-01T00:00:00.000Z",
          }),
          base({
            id: "b",
            kind: "leave_approval_pending",
            dueAt: "2026-04-11T00:00:00.000Z",
          }),
          base({
            id: "c",
            kind: "generic_attention",
            severity: "medium",
            createdAt: "2026-04-10T00:00:00.000Z",
          }),
        ],
        null,
      ),
    );
    const s = summarizeEscalationFromItems(items);
    expect(s.escalated).toBeGreaterThanOrEqual(1);
    expect(s.nearingSla).toBeGreaterThanOrEqual(1);
    expect(s.followThrough).toBeGreaterThanOrEqual(1);
    const line = formatEscalationSummaryLine(s);
    expect(line).toBeTruthy();
    expect(line!.length).toBeGreaterThan(5);
  });
});

describe("PrioritiesSection escalation cues", () => {
  it("shows breached SLA on priority card when overdue", () => {
    const item = base({
      id: "a1",
      kind: "task_overdue",
      severity: "high",
      dueAt: "2026-04-01T00:00:00.000Z",
    });
    const execution = buildExecutionMeta(item, null);
    const priorityLevel = getPriorityLevelForItem(item);
    const escalation = buildEscalationMeta(item, execution, priorityLevel);

    render(
      <Router>
        <PrioritiesSection
          queueScopeActive
          actionsLoading={false}
          queueStatus="ready"
          priorityItems={[
            {
              id: "p1",
              actionId: "a1",
              title: "Overdue task",
              summary: "S",
              whyThisMatters: "Why",
              recommendedAction: "Act",
              priorityLevel,
              blocking: false,
              href: "/t",
              ctaLabel: "Open",
              dueLabel: "Overdue",
              ownerLabel: null,
              source: "hr",
              kind: item.kind,
              execution,
              escalation,
            },
          ]}
          hasStrongPriorities
          actionItemsLength={1}
        />
      </Router>,
    );
    expect(screen.getByText(/Breached SLA|Breached/i)).toBeInTheDocument();
  });
});
