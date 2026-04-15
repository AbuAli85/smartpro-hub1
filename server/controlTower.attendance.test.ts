import { describe, it, expect } from "vitest";
import { buildExecutiveInsightNarrative } from "./controlTower";

const baseInput = {
  revenueMtdOmr: 5000,
  combinedAtRiskArOmr: 0,
  overdueArInvoiceCount: 0,
  decisionsOpen: 0,
  slaBreaches: 0,
  contractsPendingSignature: 0,
  renewalWorkflowsFailed: 0,
  rankedAccountsCount: 0,
  absentToday: 0,
  overdueCheckouts: 0,
};

describe("buildExecutiveInsightNarrative — attendance signals", () => {
  it("stays calm when no absences or overdue checkouts", () => {
    const r = buildExecutiveInsightNarrative(baseInput);
    expect(r.severity).toBe("calm");
    expect(r.bullets.some((b) => b.includes("absent"))).toBe(false);
  });

  it("sets attention severity when employees are absent today", () => {
    const r = buildExecutiveInsightNarrative({ ...baseInput, absentToday: 2 });
    expect(r.severity).toBe("attention");
    expect(r.bullets.some((b) => b.includes("2 promoters absent"))).toBe(true);
  });

  it("sets attention severity when overdue checkouts exist", () => {
    const r = buildExecutiveInsightNarrative({ ...baseInput, overdueCheckouts: 1 });
    expect(r.severity).toBe("attention");
    expect(r.bullets.some((b) => b.includes("clocked in past shift end"))).toBe(true);
  });

  it("critical SLA breach overrides attendance attention", () => {
    const r = buildExecutiveInsightNarrative({ ...baseInput, slaBreaches: 1, absentToday: 3 });
    expect(r.severity).toBe("critical");
    expect(r.bullets.some((b) => b.includes("absent"))).toBe(true);
    expect(r.bullets.some((b) => b.includes("SLA"))).toBe(true);
  });

  it("singular grammar for exactly 1 absence", () => {
    const r = buildExecutiveInsightNarrative({ ...baseInput, absentToday: 1 });
    expect(r.bullets.some((b) => b.includes("1 promoter absent"))).toBe(true);
    expect(r.bullets.some((b) => b.includes("1 promoters absent"))).toBe(false);
  });
});
