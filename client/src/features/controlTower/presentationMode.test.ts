import { describe, expect, it } from "vitest";
import { getControlTowerPresentationConfig, presentationOneLine } from "./presentationMode";

describe("getControlTowerPresentationConfig", () => {
  it("operate shows full stack", () => {
    const c = getControlTowerPresentationConfig("operate");
    expect(c.showQueue).toBe(true);
    expect(c.showKpis).toBe(true);
    expect(c.showFooter).toBe(true);
    expect(c.showPrioritiesSection).toBe(true);
    expect(c.showRiskStrip).toBe(true);
    expect(c.riskStripCompact).toBe(false);
    expect(c.dimNonBriefChrome).toBe(false);
    expect(c.emphasizeBrief).toBe(false);
  });

  it("brief hides queue and dims chrome", () => {
    const c = getControlTowerPresentationConfig("brief");
    expect(c.showQueue).toBe(false);
    expect(c.showKpis).toBe(true);
    expect(c.showFooter).toBe(true);
    expect(c.dimNonBriefChrome).toBe(true);
    expect(c.emphasizeBrief).toBe(true);
  });

  it("present hides queue, KPIs, footer, priorities; compact risk", () => {
    const c = getControlTowerPresentationConfig("present");
    expect(c.showQueue).toBe(false);
    expect(c.showKpis).toBe(false);
    expect(c.showFooter).toBe(false);
    expect(c.showPrioritiesSection).toBe(false);
    expect(c.showRiskStrip).toBe(true);
    expect(c.riskStripCompact).toBe(true);
    expect(c.emphasizeDecisions).toBe(true);
    expect(c.emphasizeCommitments).toBe(true);
    expect(c.emphasizeReview).toBe(true);
  });
});

describe("presentationOneLine", () => {
  it("returns first sentence when possible", () => {
    expect(presentationOneLine("Hello world. Next part.")).toBe("Hello world.");
  });

  it("truncates long text without sentence break", () => {
    const long = "a".repeat(200);
    expect(presentationOneLine(long, 50).length).toBeLessThanOrEqual(51);
  });
});
