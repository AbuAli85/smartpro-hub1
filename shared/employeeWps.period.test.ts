import { describe, expect, it } from "vitest";
import { normalizeWpsValidationPeriod } from "./employeeWps";

describe("normalizeWpsValidationPeriod", () => {
  it("keeps generic validation compatible when no period is provided", () => {
    const result = normalizeWpsValidationPeriod({});
    expect(result).toEqual({ periodYear: null, periodMonth: null, scope: "generic" });
  });

  it("accepts explicit period-scoped validation context", () => {
    const result = normalizeWpsValidationPeriod({ periodYear: 2026, periodMonth: 4 });
    expect(result).toEqual({ periodYear: 2026, periodMonth: 4, scope: "period" });
  });

  it("rejects partial period context", () => {
    expect(() => normalizeWpsValidationPeriod({ periodYear: 2026 })).toThrow(
      "WPS period context requires both periodYear and periodMonth.",
    );
  });
});
