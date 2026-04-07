import { describe, expect, it } from "vitest";
import {
  fingerprintCenterRow,
  governorateKeyFromLabel,
  normalizeYearKey,
  parseIntSafe,
} from "./normalize";
import { computeGovernorateOpportunityRows } from "./opportunityScore";
import { parseGeographyCenterCounts, parseYearGovernorateCounts, parseYearGovernorateIncome } from "./parseSources";

describe("normalizeYearKey", () => {
  it("normalizes malformed year keys", () => {
    expect(normalizeYearKey("2024.000")).toBe(2024);
    expect(normalizeYearKey("2025")).toBe(2025);
    expect(normalizeYearKey(2023)).toBe(2023);
  });
});

describe("governorateKeyFromLabel", () => {
  it("maps common Oman governorates", () => {
    expect(governorateKeyFromLabel("Muscat").key).toBe("muscat");
    expect(governorateKeyFromLabel("مسقط").key).toBe("muscat");
    expect(governorateKeyFromLabel("North Al Batinah").key).toBe("north_batinah");
  });
});

describe("fingerprintCenterRow", () => {
  it("is stable for identical logical rows", () => {
    const a = fingerprintCenterRow({
      centerName: "Centre A",
      governorateKey: "muscat",
      wilayat: "Ruwi",
      village: "",
      contactNumber: "+968 9012 3456",
    });
    const b = fingerprintCenterRow({
      centerName: "Centre A",
      governorateKey: "muscat",
      wilayat: "Ruwi",
      village: "",
      contactNumber: "96890123456",
    });
    expect(a).toBe(b);
  });
});

describe("parseYearGovernorateCounts", () => {
  it("skips Total rows", () => {
    const rows = parseYearGovernorateCounts({
      "2024": { Muscat: 100, Total: 500, Dhofar: 50 },
    });
    const muscat = rows.find((r) => r.governorateLabel === "Muscat");
    expect(muscat?.value).toBe(100);
    expect(rows.some((r) => /^total$/i.test(r.governorateLabel))).toBe(false);
  });
});

describe("parseYearGovernorateIncome", () => {
  it("reads float income under odd year keys", () => {
    const rows = parseYearGovernorateIncome({
      "2024.000": { Muscat: 1_500_000.25 },
    });
    expect(rows[0]?.year).toBe(2024);
    expect(rows[0]?.value).toBeCloseTo(1_500_000.25);
  });
});

describe("parseGeographyCenterCounts", () => {
  it("parses nested governorate / wilayat / village", () => {
    const rows = parseGeographyCenterCounts({
      Muscat: {
        Muttrah: { "Al Azaiba": 12, Ruwi: 8 },
      },
    });
    expect(rows.length).toBeGreaterThan(0);
    const ruwi = rows.find((r) => r.wilayat === "Muttrah" && r.village === "Ruwi");
    expect(ruwi?.centerCount).toBe(8);
  });
});

describe("computeGovernorateOpportunityRows", () => {
  it("returns scores and recommendations", () => {
    const rows = computeGovernorateOpportunityRows([
      {
        governorateKey: "a",
        governorateLabel: "A",
        transactions: 1000,
        income: 500,
        centers: 10,
        workforce: 40,
      },
      {
        governorateKey: "b",
        governorateLabel: "B",
        transactions: 100,
        income: 50,
        centers: 2,
        workforce: 8,
      },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.opportunityScore).toBeGreaterThanOrEqual(0);
    expect(rows[0]!.recommendation.length).toBeGreaterThan(3);
  });
});

describe("parseIntSafe", () => {
  it("handles comma-separated numbers", () => {
    expect(parseIntSafe("1,234,567")).toBe(1234567);
  });
});
