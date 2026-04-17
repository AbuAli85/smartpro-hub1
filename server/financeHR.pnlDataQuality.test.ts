import { describe, expect, it } from "vitest";
import { derivePnlDataQuality } from "./routers/financeHR";

describe("derivePnlDataQuality", () => {
  it("returns needs_review when both revenue and cost records are missing", () => {
    const result = derivePnlDataQuality({
      revenueRecordCount: 0,
      employeeCostRecordCount: 0,
      overheadOmr: 0,
      wpsMissingCount: 0,
      wpsInvalidCount: 0,
      wpsQualityScope: "none",
    });

    expect(result.status).toBe("needs_review");
    expect(result.messages[0]).toContain("No revenue or employee cost records");
  });

  it("returns partial with specific warnings for incomplete data", () => {
    const result = derivePnlDataQuality({
      revenueRecordCount: 4,
      employeeCostRecordCount: 0,
      overheadOmr: 0,
      wpsMissingCount: 2,
      wpsInvalidCount: 1,
      wpsQualityScope: "period",
    });

    expect(result.status).toBe("partial");
    expect(result.messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Employee cost entries are missing"),
        expect.stringContaining("No overhead allocation"),
        expect.stringContaining("WPS readiness issues"),
      ]),
    );
  });

  it("returns complete when records and quality checks are healthy", () => {
    const result = derivePnlDataQuality({
      revenueRecordCount: 3,
      employeeCostRecordCount: 5,
      overheadOmr: 24,
      wpsMissingCount: 0,
      wpsInvalidCount: 0,
      wpsQualityScope: "period",
    });

    expect(result.status).toBe("complete");
    expect(result.messages).toHaveLength(0);
  });

  it("returns partial when only generic company WPS fallback is available", () => {
    const result = derivePnlDataQuality({
      revenueRecordCount: 3,
      employeeCostRecordCount: 4,
      overheadOmr: 18,
      wpsMissingCount: 0,
      wpsInvalidCount: 0,
      wpsQualityScope: "company_fallback",
    });

    expect(result.status).toBe("partial");
    expect(result.messages).toContain(
      "Using company-level WPS validation fallback; period-specific validation is unavailable.",
    );
  });

  it("returns partial when no relevant WPS validation exists for the period", () => {
    const result = derivePnlDataQuality({
      revenueRecordCount: 2,
      employeeCostRecordCount: 2,
      overheadOmr: 12,
      wpsMissingCount: 0,
      wpsInvalidCount: 0,
      wpsQualityScope: "none",
    });

    expect(result.status).toBe("partial");
    expect(result.messages).toContain("No WPS validation records were found for this period.");
  });

  it("returns partial with WPS issue warning when period-scoped validations fail", () => {
    const result = derivePnlDataQuality({
      revenueRecordCount: 3,
      employeeCostRecordCount: 3,
      overheadOmr: 10,
      wpsMissingCount: 1,
      wpsInvalidCount: 2,
      wpsQualityScope: "period",
    });

    expect(result.status).toBe("partial");
    expect(result.messages).toContain("WPS readiness issues found for 3 employee record(s).");
  });
});
