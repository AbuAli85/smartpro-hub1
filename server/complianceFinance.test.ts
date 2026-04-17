/**
 * complianceFinance.test.ts
 * Unit tests for Phase 1 (WPS), Phase 2 (Omanization), and Phase 3 (Financial Engine).
 * All pure-function tests — no DB required.
 */
import { describe, it, expect } from "vitest";

// ─── Phase 1: WPS Validation ─────────────────────────────────────────────────
import {
  validateEmployeeWpsReadiness as validateEmployeeWps,
  type WpsValidationInput,
} from "../shared/employeeWps";

describe("Phase 1 — WPS Validation", () => {
  const base: WpsValidationInput = {
    status: "active",
    ibanNumber: "OM810180000070123456789",
    basicSalary: 350,
    employmentType: "full_time",
    hireDate: "2024-01-01",
  };

  it("passes a fully valid active employee with valid IBAN and salary", () => {
    const result = validateEmployeeWps(base);
    expect(result.isReady).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.status).toBe("ready");
  });

  it("fails when IBAN is missing", () => {
    const result = validateEmployeeWps({ ...base, ibanNumber: null });
    expect(result.isReady).toBe(false);
    expect(result.issues).toContain("missing_iban");
  });

  it("fails when IBAN format is invalid", () => {
    const result = validateEmployeeWps({ ...base, ibanNumber: "INVALID123" });
    expect(result.isReady).toBe(false);
    expect(result.issues).toContain("invalid_iban_format");
  });

  it("fails when basic salary is zero", () => {
    const result = validateEmployeeWps({ ...base, basicSalary: 0 });
    expect(result.isReady).toBe(false);
    expect(result.issues).toContain("non_positive_basic_salary");
  });

  it("fails when hire date is missing", () => {
    const result = validateEmployeeWps({ ...base, hireDate: undefined });
    expect(result.isReady).toBe(false);
    expect(result.issues).toContain("missing_hire_date");
  });

  it("fails when employment type is missing", () => {
    const result = validateEmployeeWps({ ...base, employmentType: undefined });
    expect(result.isReady).toBe(false);
    expect(result.issues).toContain("missing_employment_type");
  });

  it("fails when employee is not active", () => {
    const result = validateEmployeeWps({ ...base, status: "terminated" });
    expect(result.isReady).toBe(false);
    expect(result.issues).toContain("employee_not_active");
  });

  it("returns 'ready' status for a passing employee", () => {
    const result = validateEmployeeWps(base);
    expect(result.status).toBe("ready");
  });

  it("returns 'missing' status when IBAN is absent", () => {
    const result = validateEmployeeWps({ ...base, ibanNumber: null });
    expect(result.status).toBe("missing");
  });

  it("collects multiple issues in one pass", () => {
    const result = validateEmployeeWps({ ...base, ibanNumber: null, basicSalary: 0, hireDate: undefined });
    expect(result.issues.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── Phase 2: Omanization ─────────────────────────────────────────────────────
import {
  computeOmanizationRate,
  isOmaniNationality,
  omanizationBadgeLabel,
  omanizationBadgeVariant,
} from "../shared/omanization";

describe("Phase 2 — Omanization Compliance", () => {
  it("computes 35% rate correctly", () => {
    const result = computeOmanizationRate({ totalActive: 100, omaniCount: 35 });
    expect(result.ratePercent).toBe(35);
    expect(result.meetsTarget).toBe(true);
    expect(result.shortfallHeadcount).toBe(0);
  });

  it("computes shortfall correctly when below target", () => {
    const result = computeOmanizationRate({ totalActive: 100, omaniCount: 20 });
    expect(result.meetsTarget).toBe(false);
    expect(result.shortfallHeadcount).toBe(15); // need 35, have 20
  });

  it("returns 0% and no shortfall when no employees", () => {
    const result = computeOmanizationRate({ totalActive: 0, omaniCount: 0 });
    expect(result.ratePercent).toBe(0);
    expect(result.shortfallHeadcount).toBe(0);
  });

  it("respects custom target percent", () => {
    const result = computeOmanizationRate({ totalActive: 100, omaniCount: 50 }, 60);
    expect(result.meetsTarget).toBe(false);
    expect(result.shortfallHeadcount).toBe(10);
  });

  it("recognises Omani nationality strings", () => {
    expect(isOmaniNationality("OM")).toBe(true);
    expect(isOmaniNationality("Omani")).toBe(true);
    expect(isOmaniNationality("oman")).toBe(true);
    expect(isOmaniNationality("عماني")).toBe(true);
    expect(isOmaniNationality("IN")).toBe(false);
    expect(isOmaniNationality(null)).toBe(false);
    expect(isOmaniNationality("")).toBe(false);
  });

  it("returns correct badge label for compliant company", () => {
    const result = computeOmanizationRate({ totalActive: 100, omaniCount: 40 });
    expect(omanizationBadgeLabel(result)).toContain("Compliant");
  });

  it("returns correct badge label for non-compliant company", () => {
    const result = computeOmanizationRate({ totalActive: 100, omaniCount: 10 });
    expect(omanizationBadgeLabel(result)).toContain("Non-Compliant");
  });

  it("returns 'default' variant for compliant company", () => {
    const result = computeOmanizationRate({ totalActive: 100, omaniCount: 40 });
    expect(omanizationBadgeVariant(result)).toBe("default");
  });

  it("returns 'destructive' variant for severely non-compliant company", () => {
    const result = computeOmanizationRate({ totalActive: 100, omaniCount: 5 });
    expect(omanizationBadgeVariant(result)).toBe("destructive");
  });

  it("returns 'secondary' variant for company within 20% of target", () => {
    // 35% target, 30% rate → 30/35 = 85.7% of target → within 20% → secondary
    const result = computeOmanizationRate({ totalActive: 100, omaniCount: 30 });
    expect(omanizationBadgeVariant(result)).toBe("secondary");
  });
});

// ─── Phase 3: Financial Engine ────────────────────────────────────────────────
import {
  computeMargin,
  aggregateMargins,
  formatOmr,
  marginBadgeVariant,
} from "../shared/financialEngine";

describe("Phase 3 — Financial Engine", () => {
  it("computes a profitable margin correctly", () => {
    const result = computeMargin({ revenueOmr: 10000, employeeCostOmr: 6000, platformOverheadOmr: 500 });
    expect(result.grossMarginOmr).toBe(4000);
    expect(result.netMarginOmr).toBe(3500);
    expect(result.grossMarginPercent).toBe(40);
    expect(result.netMarginPercent).toBe(35);
    expect(result.healthLabel).toBe("profitable");
  });

  it("computes a loss scenario", () => {
    const result = computeMargin({ revenueOmr: 5000, employeeCostOmr: 6000, platformOverheadOmr: 0 });
    expect(result.netMarginOmr).toBe(-1000);
    expect(result.healthLabel).toBe("loss");
  });

  it("computes break-even scenario", () => {
    const result = computeMargin({ revenueOmr: 5000, employeeCostOmr: 4500, platformOverheadOmr: 500 });
    expect(result.netMarginOmr).toBe(0);
    expect(result.healthLabel).toBe("break_even");
  });

  it("handles zero revenue gracefully", () => {
    const result = computeMargin({ revenueOmr: 0, employeeCostOmr: 0, platformOverheadOmr: 0 });
    expect(result.grossMarginPercent).toBe(0);
    expect(result.netMarginPercent).toBe(0);
  });

  it("aggregates multiple periods correctly", () => {
    const p1 = computeMargin({ revenueOmr: 10000, employeeCostOmr: 6000, platformOverheadOmr: 500 });
    const p2 = computeMargin({ revenueOmr: 8000, employeeCostOmr: 5000, platformOverheadOmr: 500 });
    const agg = aggregateMargins([p1, p2]);
    expect(agg.revenueOmr).toBe(18000);
    expect(agg.employeeCostOmr).toBe(11000);
    expect(agg.netMarginOmr).toBe(6000);
  });

  it("formats OMR amounts correctly", () => {
    expect(formatOmr(1234.5)).toBe("OMR 1234.50");
    expect(formatOmr(0)).toBe("OMR 0.00");
  });

  it("returns correct badge variants", () => {
    const profitable = computeMargin({ revenueOmr: 10000, employeeCostOmr: 6000, platformOverheadOmr: 500 });
    const loss = computeMargin({ revenueOmr: 5000, employeeCostOmr: 6000, platformOverheadOmr: 0 });
    const breakEven = computeMargin({ revenueOmr: 5000, employeeCostOmr: 4500, platformOverheadOmr: 500 });
    expect(marginBadgeVariant(profitable)).toBe("default");
    expect(marginBadgeVariant(loss)).toBe("destructive");
    expect(marginBadgeVariant(breakEven)).toBe("secondary");
  });

  it("rounds margin percentages to 2 decimal places", () => {
    const result = computeMargin({ revenueOmr: 3000, employeeCostOmr: 2000, platformOverheadOmr: 0 });
    // 1000/3000 = 33.333...% → should be 33.33
    expect(result.netMarginPercent).toBe(33.33);
  });
});
