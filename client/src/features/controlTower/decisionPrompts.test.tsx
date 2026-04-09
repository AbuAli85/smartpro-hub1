// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Router } from "wouter";
import type { ActionQueueItemExecutionView } from "./escalationTypes";
import type { DomainNarrativeSummary } from "./domainNarrativeTypes";
import type { ControlTowerOutcomeSummary } from "./outcomeTypes";
import type { TrendComparison } from "./trendTypes";
import { DOMAIN_ORDER } from "./domainMapper";
import { buildExecutiveDecisionPrompts } from "./decisionPrompts";
import { getDecisionPromptHref } from "./decisionLinks";
import type { ExecutiveDecisionPrompt } from "./decisionPromptTypes";
import { ExecutiveDecisionSection } from "./components/ExecutiveDecisionSection";

function queueItem(
  id: string,
  kind: ActionQueueItemExecutionView["kind"],
  source: ActionQueueItemExecutionView["source"],
  esc: Partial<ActionQueueItemExecutionView["escalation"]>,
  ex: Partial<ActionQueueItemExecutionView["execution"]>,
  overrides: Partial<ActionQueueItemExecutionView> = {},
): ActionQueueItemExecutionView {
  return {
    id,
    kind,
    title: "t",
    severity: "medium",
    blocking: false,
    source,
    href: "/x",
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
    ...overrides,
  };
}

function baseSummary(d: DomainNarrativeSummary["domain"], o: Partial<DomainNarrativeSummary> = {}): DomainNarrativeSummary {
  return {
    domain: d,
    currentCount: 0,
    previousCount: null,
    escalatedCount: 0,
    breachedCount: 0,
    stuckCount: 0,
    unassignedHighCount: 0,
    escalationsAdded: 0,
    escalationsCleared: 0,
    breachesAdded: 0,
    breachesRecovered: 0,
    ownershipGapsClosed: 0,
    ownershipGapsAdded: 0,
    netChange: null,
    ...o,
  };
}

function allSummaries(overrides: Partial<Record<DomainNarrativeSummary["domain"], Partial<DomainNarrativeSummary>>>): DomainNarrativeSummary[] {
  return DOMAIN_ORDER.map((d) => baseSummary(d, overrides[d]));
}

const zeroOutcome = (): ControlTowerOutcomeSummary => ({
  newItemsCount: 0,
  resolvedItemsCount: 0,
  escalationsClearedCount: 0,
  escalationsAddedCount: 0,
  breachesRecoveredCount: 0,
  breachesAddedCount: 0,
  ownershipGapsClosedCount: 0,
  ownershipGapsAddedCount: 0,
});

const trend = (cur: TrendComparison["current"], prev: TrendComparison["previous"] | null): TrendComparison => ({
  current: cur,
  previous: prev,
});

describe("buildExecutiveDecisionPrompts", () => {
  it("emits intervene_now when breached and escalated items concentrate in one domain", () => {
    const summaries = allSummaries({
      workforce: { currentCount: 6, breachedCount: 2, escalatedCount: 2 },
    });
    const items = [
      queueItem("a", "permit_expired", "workforce", { slaState: "breached", escalationLevel: "escalated" }, {}),
    ];
    const out = buildExecutiveDecisionPrompts({
      queueItems: items,
      priorityItems: [],
      domainSummaries: summaries,
      outcomeSummary: zeroOutcome(),
      trendComparison: null,
      outcomeComparable: false,
      domainBaseline: false,
    });
    expect(out.some((p) => p.type === "intervene_now")).toBe(true);
    expect(out.find((p) => p.type === "intervene_now")?.domain).toBe("workforce");
  });

  it("emits review_ownership when ownership gaps are concentrated (outcome)", () => {
    const summaries = allSummaries({
      compliance: { currentCount: 4, unassignedHighCount: 3 },
    });
    const items = [queueItem("a", "compliance_failure", "compliance", {}, { needsOwner: true })];
    const out = buildExecutiveDecisionPrompts({
      queueItems: items,
      priorityItems: [],
      domainSummaries: summaries,
      outcomeSummary: { ...zeroOutcome(), ownershipGapsAddedCount: 2 },
      trendComparison: null,
      outcomeComparable: true,
      domainBaseline: true,
    });
    expect(out.some((p) => p.type === "review_ownership")).toBe(true);
  });

  it("emits push_clearance when backlog is stable but stale items remain", () => {
    const summaries = allSummaries({
      operations: { currentCount: 2, stuckCount: 2 },
    });
    const items = [
      queueItem(
        "a",
        "task_overdue",
        "operations",
        {},
        { stuck: true, agingLevel: "stale" },
        { blocking: false },
      ),
    ];
    const snap = {
      timestamp: new Date().toISOString(),
      totalItems: 2,
      escalatedCount: 0,
      attentionCount: 0,
      breachedCount: 0,
      unassignedHighCount: 0,
      stuckCount: 2,
      prioritiesCount: 0,
    };
    const out = buildExecutiveDecisionPrompts({
      queueItems: items,
      priorityItems: [],
      domainSummaries: summaries,
      outcomeSummary: zeroOutcome(),
      trendComparison: trend(snap, { ...snap, totalItems: 2, stuckCount: 2 }),
      outcomeComparable: false,
      domainBaseline: false,
    });
    expect(out.some((p) => p.type === "push_clearance")).toBe(true);
  });

  it("emits monitor_closely when pressure concentrates without strong domain baseline", () => {
    const summaries = allSummaries({
      payroll: { currentCount: 4, escalatedCount: 1, breachedCount: 0, netChange: null },
    });
    const items = [queueItem("a", "payroll_blocker", "payroll", { escalationLevel: "attention" }, {})];
    const out = buildExecutiveDecisionPrompts({
      queueItems: items,
      priorityItems: [],
      domainSummaries: summaries,
      outcomeSummary: zeroOutcome(),
      trendComparison: null,
      outcomeComparable: false,
      domainBaseline: false,
    });
    expect(out.some((p) => p.type === "monitor_closely")).toBe(true);
  });

  it("emits stabilize_domain when outcomes improved locally but pressure remains", () => {
    const summaries = allSummaries({
      payroll: {
        currentCount: 3,
        breachedCount: 1,
        escalatedCount: 0,
        breachesRecovered: 1,
        escalationsCleared: 0,
      },
    });
    const items = [queueItem("a", "payroll_blocker", "payroll", { slaState: "breached" }, {})];
    const out = buildExecutiveDecisionPrompts({
      queueItems: items,
      priorityItems: [],
      domainSummaries: summaries,
      outcomeSummary: zeroOutcome(),
      trendComparison: null,
      outcomeComparable: false,
      domainBaseline: false,
    });
    expect(out.some((p) => p.type === "stabilize_domain")).toBe(true);
  });

  it("caps prompts at 3", () => {
    const summaries = allSummaries({
      workforce: { currentCount: 8, breachedCount: 2, escalatedCount: 2 },
      compliance: { currentCount: 6, unassignedHighCount: 4, ownershipGapsAdded: 2 },
      payroll: { currentCount: 4, breachedCount: 1, escalatedCount: 1, breachesRecovered: 1 },
      operations: { currentCount: 3, stuckCount: 2 },
    });
    const items = [
      queueItem("w", "permit_expired", "workforce", { slaState: "breached", escalationLevel: "escalated" }, {}),
      queueItem("c", "compliance_failure", "compliance", {}, { needsOwner: true }),
      queueItem("p", "payroll_blocker", "payroll", { slaState: "breached" }, {}),
      queueItem("o", "task_overdue", "operations", {}, { stuck: true }),
    ];
    const snap = {
      timestamp: new Date().toISOString(),
      totalItems: 4,
      escalatedCount: 2,
      attentionCount: 0,
      breachedCount: 2,
      unassignedHighCount: 2,
      stuckCount: 2,
      prioritiesCount: 1,
    };
    const out = buildExecutiveDecisionPrompts({
      queueItems: items,
      priorityItems: [],
      domainSummaries: summaries,
      outcomeSummary: { ...zeroOutcome(), ownershipGapsAddedCount: 2 },
      trendComparison: trend(snap, { ...snap }),
      outcomeComparable: true,
      domainBaseline: true,
    });
    expect(out.length).toBeLessThanOrEqual(3);
  });

  it("dedupes identical type+domain pairs", () => {
    const summaries = allSummaries({
      workforce: { currentCount: 5, breachedCount: 2, escalatedCount: 2 },
    });
    const items = [
      queueItem("a", "permit_expired", "workforce", { slaState: "breached", escalationLevel: "escalated" }, {}),
      queueItem("b", "government_case_overdue", "workforce", { slaState: "breached", escalationLevel: "escalated" }, {}),
    ];
    const intervene = buildExecutiveDecisionPrompts({
      queueItems: items,
      priorityItems: [],
      domainSummaries: summaries,
      outcomeSummary: zeroOutcome(),
      trendComparison: null,
      outcomeComparable: false,
      domainBaseline: false,
    }).filter((p) => p.type === "intervene_now");
    expect(intervene.length).toBe(1);
  });
});

describe("getDecisionPromptHref", () => {
  it("maps known domains to conservative routes", () => {
    const mk = (domain: ExecutiveDecisionPrompt["domain"]): ExecutiveDecisionPrompt =>
      ({
        id: "x",
        type: "monitor_closely",
        title: "t",
        rationale: "r",
        recommendedMove: "m",
        priority: "low",
        domain,
      }) as ExecutiveDecisionPrompt;

    expect(getDecisionPromptHref(mk("payroll"), "payroll")).toBe("/payroll");
    expect(getDecisionPromptHref(mk("workforce"), "workforce")).toBe("/workforce/permits");
    expect(getDecisionPromptHref(mk("contracts"), "contracts")).toBe("/contracts");
    expect(getDecisionPromptHref(mk("hr"), "hr")).toBe("/hr/leave");
    expect(getDecisionPromptHref(mk("compliance"), "compliance")).toBe("/compliance");
    expect(getDecisionPromptHref(mk("operations"), "operations")).toBe("/operations");
    expect(getDecisionPromptHref({ domain: undefined }, "general")).toBe("/control-tower");
  });
});

describe("ExecutiveDecisionSection", () => {
  it("renders nothing when there are no prompts", () => {
    const { container } = render(
      <Router>
        <ExecutiveDecisionSection prompts={[]} />
      </Router>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders title, rationale, and recommended move for a prompt", () => {
    render(
      <Router>
        <ExecutiveDecisionSection
          prompts={[
            {
              id: "1",
              type: "monitor_closely",
              title: "Monitor payroll closely",
              rationale: "Risk remains concentrated in payroll items.",
              recommendedMove: "Track owners weekly.",
              priority: "low",
              domain: "payroll",
              href: "/payroll",
            },
          ]}
        />
      </Router>,
    );
    expect(screen.getByText("Monitor payroll closely")).toBeInTheDocument();
    expect(screen.getByText(/Risk remains concentrated/)).toBeInTheDocument();
    expect(screen.getByText("Track owners weekly.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open area/i })).toHaveAttribute("href", "/payroll");
  });
});
