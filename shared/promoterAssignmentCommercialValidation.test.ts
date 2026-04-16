import { describe, expect, it } from "vitest";
import { validatePromoterAssignmentCommercial } from "./promoterAssignmentCommercialValidation";

describe("validatePromoterAssignmentCommercial", () => {
  it("flags missing billing rate as blocker when billing expected", () => {
    const v = validatePromoterAssignmentCommercial({
      assignmentStatus: "active",
      billingModel: "per_hour",
      billingRate: null,
      currencyCode: "OMR",
      rateSource: "manual",
      expectBilling: true,
    });
    expect(v.blockers.length).toBeGreaterThan(0);
  });

  it("returns structured issues for valid commercial row", () => {
    const v = validatePromoterAssignmentCommercial({
      assignmentStatus: "active",
      billingModel: "per_month",
      billingRate: "100",
      currencyCode: "OMR",
      rateSource: "manual",
      expectBilling: true,
    });
    expect(v.blockers.length).toBe(0);
    expect(Array.isArray(v.issues)).toBe(true);
  });
});
