// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React, { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ControlTowerViewModeSelector } from "./components/ControlTowerViewModeSelector";
import { OperatingBriefSection } from "./components/OperatingBriefSection";
import { getControlTowerPresentationConfig, type ControlTowerViewMode } from "./presentationMode";
import type { OperatingBrief } from "./operatingBriefTypes";

afterEach(() => {
  cleanup();
});

function VisibilityFixture({ mode }: { mode: ControlTowerViewMode }) {
  const c = getControlTowerPresentationConfig(mode);
  return (
    <div>
      {c.showQueue ? <div data-testid="queue">queue</div> : null}
      {c.showKpis ? <div data-testid="kpi">kpi</div> : null}
      {c.showFooter ? <div data-testid="footer">footer</div> : null}
      {c.showPrioritiesSection ? <div data-testid="priorities">priorities</div> : null}
      {c.showRiskStrip ? <div data-testid="risk">risk</div> : null}
    </div>
  );
}

const sampleBrief: OperatingBrief = {
  timestamp: "2026-04-01T12:00:00.000Z",
  situationSummary: "Operational load concentrated in payroll.",
  keyPressures: ["Payroll: pressure"],
  leadershipFocus: ["Approve policy"],
  operatingCheckpoints: ["Checkpoint"],
  reviewFocus: ["Review item"],
  outcomeSummary: "Better",
  trendSummary: "Stable",
};

describe("presentation visibility (mirrors page rules)", () => {
  it("operate mode shows queue, KPI, footer, priorities", () => {
    render(<VisibilityFixture mode="operate" />);
    expect(screen.getByTestId("queue")).toBeInTheDocument();
    expect(screen.getByTestId("kpi")).toBeInTheDocument();
    expect(screen.getByTestId("footer")).toBeInTheDocument();
    expect(screen.getByTestId("priorities")).toBeInTheDocument();
  });

  it("brief mode hides queue only", () => {
    render(<VisibilityFixture mode="brief" />);
    expect(screen.queryByTestId("queue")).toBeNull();
    expect(screen.getByTestId("kpi")).toBeInTheDocument();
    expect(screen.getByTestId("footer")).toBeInTheDocument();
    expect(screen.getByTestId("priorities")).toBeInTheDocument();
  });

  it("present mode hides queue, KPI, footer, priorities but keeps risk strip", () => {
    render(<VisibilityFixture mode="present" />);
    expect(screen.queryByTestId("queue")).toBeNull();
    expect(screen.queryByTestId("kpi")).toBeNull();
    expect(screen.queryByTestId("footer")).toBeNull();
    expect(screen.queryByTestId("priorities")).toBeNull();
    expect(screen.getByTestId("risk")).toBeInTheDocument();
  });
});

describe("ControlTowerViewModeSelector", () => {
  function Harness() {
    const [mode, setMode] = useState<ControlTowerViewMode>("operate");
    return (
      <div>
        <ControlTowerViewModeSelector value={mode} onChange={setMode} />
        <span data-testid="mode">{mode}</span>
      </div>
    );
  }

  it("changes mode when segment is clicked", () => {
    render(<Harness />);
    expect(screen.getByTestId("mode")).toHaveTextContent("operate");
    fireEvent.click(screen.getByRole("button", { name: "Present" }));
    expect(screen.getByTestId("mode")).toHaveTextContent("present");
  });
});

describe("OperatingBriefSection presentation copy", () => {
  it("shows Copy presentation summary only in present view", () => {
    const { rerender } = render(
      <OperatingBriefSection brief={sampleBrief} variant="weekly" viewMode="operate" emphasized={false} />,
    );
    expect(screen.queryByRole("button", { name: /Copy presentation summary/i })).toBeNull();
    rerender(<OperatingBriefSection brief={sampleBrief} variant="weekly" viewMode="present" emphasized />);
    expect(screen.getByRole("button", { name: /Copy presentation summary/i })).toBeInTheDocument();
  });
});
