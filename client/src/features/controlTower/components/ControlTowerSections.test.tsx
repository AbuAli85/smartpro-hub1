// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Router } from "wouter";
import { ExecutiveHeader } from "./ExecutiveHeader";
import { PrioritiesSection } from "./PrioritiesSection";
import { RiskStrip } from "./RiskStrip";
import type { PriorityItem } from "../priorityTypes";
import { buildRiskStripCards } from "../riskStripModel";

function wrap(ui: React.ReactElement) {
  return render(<Router>{ui}</Router>);
}

describe("ExecutiveHeader", () => {
  it("shows queue confidence badge when status is partial", () => {
    wrap(
      <ExecutiveHeader
        subtitle="Test subtitle"
        companyName="Acme LLC"
        freshnessLabel="Updated 2 min ago"
        queueStatus="partial"
        queueScopeActive
        actionsLoading={false}
      />,
    );
    expect(screen.getByText(/Queue: partial data/i)).toBeInTheDocument();
  });
});

describe("PrioritiesSection", () => {
  const basePriority = (overrides: Partial<PriorityItem> & Pick<PriorityItem, "id" | "actionId">): PriorityItem => ({
    title: "T",
    summary: "S",
    whyThisMatters: "Why",
    recommendedAction: "Do",
    priorityLevel: "critical",
    blocking: true,
    href: "/a",
    ctaLabel: "Act",
    source: "payroll",
    kind: "payroll_blocker",
    ...overrides,
  });

  it("shows partial-data confidence note when queue is partial and priorities exist", () => {
    wrap(
      <PrioritiesSection
        queueScopeActive
        actionsLoading={false}
        queueStatus="partial"
        priorityItems={[basePriority({ id: "1", actionId: "a1" })]}
        hasStrongPriorities
        actionItemsLength={1}
      />,
    );
    expect(screen.getByText(/Some sources failed to load/i)).toBeInTheDocument();
    expect(screen.getByText(/Treat priority order as best-effort/i)).toBeInTheDocument();
  });
});

describe("RiskStrip", () => {
  it("renders Blocked / At risk / Upcoming labels", () => {
    const cards = buildRiskStripCards({
      loading: false,
      expiredPermits: 0,
      wpsBlocked: false,
      complianceFailCount: 0,
      permitsExpiring7d: 0,
      slaBreaches: 0,
      complianceWarnCount: 0,
    });
    wrap(<RiskStrip cards={cards} />);
    expect(screen.getByText("Blocked")).toBeInTheDocument();
    expect(screen.getByText("At risk")).toBeInTheDocument();
    expect(screen.getByText("Upcoming")).toBeInTheDocument();
  });
});
