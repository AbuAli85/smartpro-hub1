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
    });

    expect(result.status).toBe("complete");
    expect(result.messages).toHaveLength(0);
  });
});
