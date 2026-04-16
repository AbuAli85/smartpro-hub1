import { describe, expect, it } from "vitest";
import { computeBillableUnits, resolvePromoterAssignmentCommercial } from "./promoterAssignmentCommercialResolution";

describe("promoterAssignmentCommercialResolution", () => {
  it("resolves billing rate with assignment override", () => {
    const r = resolvePromoterAssignmentCommercial({
      assignmentStatus: "active",
      billingModel: "per_day",
      billingRate: "100",
      currencyCode: "OMR",
      rateSource: "assignment_override",
      employeeSalary: "500",
    });
    expect(r.billingRate).toBe("100");
    expect(r.blockers.length).toBe(0);
  });

  it("payroll intent skips missing billing rate blocker", () => {
    const r = resolvePromoterAssignmentCommercial(
      {
        assignmentStatus: "active",
        billingModel: "per_month",
        billingRate: null,
        currencyCode: "OMR",
        rateSource: "assignment_override",
        employeeSalary: "500",
      },
      { intent: "payroll" },
    );
    expect(r.blockers.some((b) => b === "missing_billing_rate")).toBe(false);
  });

  it("per_month yields one unit when overlap days positive", () => {
    const u = computeBillableUnits({
      billingModel: "per_month",
      overlapDays: 3,
      attendanceHours: null,
    });
    expect(u.units).toBe(1);
  });
});
