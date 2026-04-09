// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Router } from "wouter";
import { buildExecutiveCommitments } from "./commitments";
import { getCommitmentHorizonLabel } from "./commitmentHorizon";
import type { ExecutiveCommitmentInputs } from "./commitmentTypes";
import type { ExecutiveDecisionPrompt } from "./decisionPromptTypes";
import { ExecutiveCommitmentsSection } from "./components/ExecutiveCommitmentsSection";
import { DOMAIN_ORDER } from "./domainMapper";
import type { DomainNarrativeSummary } from "./domainNarrativeTypes";

function prompt(overrides: Partial<ExecutiveDecisionPrompt> & Pick<ExecutiveDecisionPrompt, "id" | "type">): ExecutiveDecisionPrompt {
  return {
    title: "T",
    rationale: "R",
    recommendedMove: "M",
    priority: "high",
    ...overrides,
  } as ExecutiveDecisionPrompt;
}

function emptySummaries(): DomainNarrativeSummary[] {
  return DOMAIN_ORDER.map((domain) => ({
    domain,
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
  }));
}

const baseInputs = (prompts: ExecutiveDecisionPrompt[], summaries?: DomainNarrativeSummary[]): ExecutiveCommitmentInputs => ({
  decisionPrompts: prompts,
  queueItems: [],
  priorityItems: [],
  domainSummaries: summaries ?? emptySummaries(),
  outcomeSummary: null,
  trendComparison: null,
});

describe("buildExecutiveCommitments", () => {
  it("maps intervene_now to today horizon and breach/escalation success criteria", () => {
    const out = buildExecutiveCommitments(
      baseInputs([
        prompt({
          id: "intervene_now-workforce",
          type: "intervene_now",
          domain: "workforce",
          priority: "high",
        }),
      ]),
    );
    expect(out).toHaveLength(1);
    expect(out[0].horizon).toBe("today");
    expect(out[0].successCriteria.toLowerCase()).toContain("decline");
    expect(out[0].successCriteria.toLowerCase()).toMatch(/escalat|breach/);
    expect(out[0].checkpoint.toLowerCase()).toContain("follow-through");
  });

  it("maps review_ownership to an ownership-gap-oriented checkpoint", () => {
    const out = buildExecutiveCommitments(
      baseInputs([
        prompt({
          id: "review-compliance",
          type: "review_ownership",
          domain: "compliance",
          priority: "high",
        }),
      ]),
    );
    expect(out[0].checkpoint.toLowerCase()).toContain("owner");
    expect(out[0].successCriteria.toLowerCase()).toContain("ownership");
  });

  it("uses next_24h for review_ownership when unassigned concentration is high", () => {
    const summaries = emptySummaries().map((s) =>
      s.domain === "compliance" ? { ...s, unassignedHighCount: 5 } : s,
    );
    const out = buildExecutiveCommitments(
      baseInputs(
        [
          prompt({
            id: "review-compliance",
            type: "review_ownership",
            domain: "compliance",
            priority: "high",
          }),
        ],
        summaries,
      ),
    );
    expect(out[0].horizon).toBe("next_24h");
  });

  it("uses this_week for review_ownership when unassigned concentration is moderate", () => {
    const summaries = emptySummaries().map((s) =>
      s.domain === "hr" ? { ...s, unassignedHighCount: 1 } : s,
    );
    const out = buildExecutiveCommitments(
      baseInputs(
        [
          prompt({
            id: "review-hr",
            type: "review_ownership",
            domain: "hr",
            priority: "high",
          }),
        ],
        summaries,
      ),
    );
    expect(out[0].horizon).toBe("this_week");
  });

  it("maps push_clearance to next_48h and stale backlog success criteria", () => {
    const out = buildExecutiveCommitments(
      baseInputs([
        prompt({
          id: "push-1",
          type: "push_clearance",
          priority: "medium",
        }),
      ]),
    );
    expect(out[0].horizon).toBe("next_48h");
    expect(out[0].successCriteria.toLowerCase()).toContain("stale");
    expect(out[0].successCriteria.toLowerCase()).toContain("pressure");
  });

  it("maps stabilize_domain to this_week horizon", () => {
    const out = buildExecutiveCommitments(
      baseInputs([
        prompt({
          id: "stab-payroll",
          type: "stabilize_domain",
          domain: "payroll",
          priority: "medium",
        }),
      ]),
    );
    expect(out[0].horizon).toBe("this_week");
  });

  it("maps monitor_closely to monitor horizon", () => {
    const out = buildExecutiveCommitments(
      baseInputs([
        prompt({
          id: "mon-wf",
          type: "monitor_closely",
          domain: "workforce",
          priority: "low",
        }),
      ]),
    );
    expect(out[0].horizon).toBe("monitor");
  });

  it("returns at most 3 commitments", () => {
    const prompts: ExecutiveDecisionPrompt[] = [
      prompt({ id: "p1", type: "intervene_now", domain: "workforce", priority: "high" }),
      prompt({ id: "p2", type: "review_ownership", domain: "compliance", priority: "high" }),
      prompt({ id: "p3", type: "push_clearance", priority: "medium" }),
      prompt({ id: "p4", type: "monitor_closely", domain: "payroll", priority: "low" }),
    ];
    expect(buildExecutiveCommitments(baseInputs(prompts)).length).toBeLessThanOrEqual(3);
  });

  it("does not duplicate commitments for the same decision prompt id", () => {
    const p = prompt({ id: "same", type: "intervene_now", domain: "hr", priority: "high" });
    const out = buildExecutiveCommitments(baseInputs([p, p]));
    expect(out).toHaveLength(1);
    expect(out[0].decisionPromptId).toBe("same");
  });
});

describe("getCommitmentHorizonLabel", () => {
  it("returns human labels for all horizons", () => {
    expect(getCommitmentHorizonLabel("today")).toBe("Today");
    expect(getCommitmentHorizonLabel("next_24h")).toBe("Next 24h");
    expect(getCommitmentHorizonLabel("next_48h")).toBe("Next 48h");
    expect(getCommitmentHorizonLabel("this_week")).toBe("This week");
    expect(getCommitmentHorizonLabel("monitor")).toBe("Monitor");
  });
});

describe("ExecutiveCommitmentsSection", () => {
  it("renders nothing when there are no commitments", () => {
    const { container } = render(
      <Router>
        <ExecutiveCommitmentsSection commitments={[]} />
      </Router>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders title, checkpoint, success criteria, and horizon label", () => {
    render(
      <Router>
        <ExecutiveCommitmentsSection
          commitments={[
            {
              id: "c1",
              decisionPromptId: "p1",
              title: "Clear aging queue before escalation",
              checkpoint: "Clear aging queue items before they move into escalation.",
              horizon: "next_48h",
              successCriteria: "Stale backlog reduces and queue pressure does not rise.",
              domain: "operations",
              href: "/operations",
              priority: "medium",
            },
          ]}
        />
      </Router>,
    );
    expect(screen.getByText("Clear aging queue before escalation")).toBeInTheDocument();
    expect(screen.getByText(/Clear aging queue items before they move into escalation/)).toBeInTheDocument();
    expect(screen.getByText("Next 48h")).toBeInTheDocument();
    expect(screen.getByText(/Stale backlog reduces/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open area/i })).toHaveAttribute("href", "/operations");
  });
});
