// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Router } from "wouter";
import { getCommitmentHorizonLabel } from "./commitmentHorizon";
import { buildExecutiveReviewItems } from "./reviews";
import type { ExecutiveCommitment } from "./commitmentTypes";
import type { ExecutiveReviewContext } from "./reviewTypes";
import { ExecutiveReviewSection } from "./components/ExecutiveReviewSection";
import { DOMAIN_ORDER } from "./domainMapper";
import type { DomainNarrativeSummary } from "./domainNarrativeTypes";

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

const emptyCtx = (): ExecutiveReviewContext => ({
  queueItems: [],
  priorityItems: [],
  outcomeSummary: null,
  trendComparison: null,
  domainSummaries: emptySummaries(),
});

function mkCommitment(
  o: Partial<ExecutiveCommitment> & Required<Pick<ExecutiveCommitment, "id" | "decisionPromptId" | "decisionType">>,
): ExecutiveCommitment {
  return {
    title: "T",
    checkpoint: "C",
    horizon: "today",
    successCriteria: "S",
    priority: "high",
    ...o,
  };
}

describe("buildExecutiveReviewItems", () => {
  it("maps intervene_now to breach/escalation question and signal", () => {
    const commits = [
      mkCommitment({
        id: "commit-i1",
        decisionPromptId: "intervene_now-workforce",
        decisionType: "intervene_now",
        domain: "workforce",
        priority: "high",
      }),
    ];
    const out = buildExecutiveReviewItems(commits, emptyCtx());
    expect(out).toHaveLength(1);
    expect(out[0].reviewQuestion.toLowerCase()).toContain("declining");
    expect(out[0].reviewSignal.toLowerCase()).toMatch(/breach|escalat/);
    expect(out[0].commitmentId).toBe("commit-i1");
  });

  it("maps review_ownership to ownership-focused checks", () => {
    const out = buildExecutiveReviewItems(
      [
        mkCommitment({
          id: "commit-o1",
          decisionPromptId: "review-compliance",
          decisionType: "review_ownership",
          domain: "compliance",
          priority: "high",
        }),
      ],
      emptyCtx(),
    );
    expect(out[0].reviewQuestion.toLowerCase()).toContain("assigned");
    expect(out[0].accountabilityCheck.toLowerCase()).toContain("unassigned");
    expect(out[0].reviewSignal.toLowerCase()).toContain("ownership");
  });

  it("maps push_clearance to stale backlog review", () => {
    const out = buildExecutiveReviewItems(
      [
        mkCommitment({
          id: "commit-p1",
          decisionPromptId: "push-1",
          decisionType: "push_clearance",
          priority: "medium",
        }),
      ],
      emptyCtx(),
    );
    expect(out[0].reviewQuestion.toLowerCase()).toContain("stale");
    expect(out[0].reviewSignal.toLowerCase()).toContain("stale");
  });

  it("maps stabilize_domain to domain decline logic", () => {
    const out = buildExecutiveReviewItems(
      [
        mkCommitment({
          id: "commit-s1",
          decisionPromptId: "stab-payroll",
          decisionType: "stabilize_domain",
          domain: "payroll",
          priority: "medium",
        }),
      ],
      emptyCtx(),
    );
    expect(out[0].reviewQuestion.toLowerCase()).toContain("decline");
    expect(out[0].reviewSignal.toLowerCase()).toContain("breach");
  });

  it("maps monitor_closely to stability logic", () => {
    const out = buildExecutiveReviewItems(
      [
        mkCommitment({
          id: "commit-m1",
          decisionPromptId: "mon-ops",
          decisionType: "monitor_closely",
          domain: "operations",
          priority: "low",
        }),
      ],
      emptyCtx(),
    );
    expect(out[0].reviewQuestion.toLowerCase()).toMatch(/stable|improving/);
    expect(out[0].reviewSignal.toLowerCase()).toContain("escalation");
  });

  it("returns at most 3 items", () => {
    const commits = [
      mkCommitment({ id: "a", decisionPromptId: "p1", decisionType: "intervene_now", domain: "hr" }),
      mkCommitment({ id: "b", decisionPromptId: "p2", decisionType: "review_ownership", domain: "hr" }),
      mkCommitment({ id: "c", decisionPromptId: "p3", decisionType: "push_clearance" }),
      mkCommitment({ id: "d", decisionPromptId: "p4", decisionType: "monitor_closely", domain: "payroll" }),
    ];
    expect(buildExecutiveReviewItems(commits, emptyCtx()).length).toBeLessThanOrEqual(3);
  });

  it("preserves mapping from commitments (commitmentId links)", () => {
    const c = mkCommitment({
      id: "commit-x",
      decisionPromptId: "intervene-wf",
      decisionType: "intervene_now",
      domain: "workforce",
    });
    const [r] = buildExecutiveReviewItems([c], emptyCtx());
    expect(r.commitmentId).toBe("commit-x");
    expect(r.id).toBe("review-commit-x");
  });
});

describe("ExecutiveReviewSection", () => {
  it("hides when there are no items", () => {
    const { container } = render(
      <Router>
        <ExecutiveReviewSection items={[]} />
      </Router>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders accountability and signal labels", () => {
    render(
      <Router>
        <ExecutiveReviewSection
          items={[
            {
              id: "r1",
              commitmentId: "c1",
              title: "Stale backlog clearance",
              reviewQuestion: "Is the stale backlog being cleared without new escalation?",
              accountabilityCheck: "Are aging items moving out of the queue?",
              reviewSignal: "Stale queue reduced and no new escalations",
              domain: "operations",
              priority: "medium",
            },
          ]}
        />
      </Router>,
    );
    expect(screen.getByText(/Is the stale backlog being cleared/)).toBeInTheDocument();
    expect(screen.getByText(/Are aging items moving out/)).toBeInTheDocument();
    expect(screen.getByText(/Stale queue reduced/)).toBeInTheDocument();
    expect(screen.getByText(/Accountability:/)).toBeInTheDocument();
    expect(screen.getByText(/Signal:/)).toBeInTheDocument();
  });
});

describe("commitment horizon labels (cadence)", () => {
  it("renders standard horizon labels for commitments layer", () => {
    expect(getCommitmentHorizonLabel("today")).toBe("Today");
    expect(getCommitmentHorizonLabel("monitor")).toBe("Monitor");
  });
});

