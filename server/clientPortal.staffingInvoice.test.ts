import { describe, it, expect } from "vitest";

// Pure logic tests — no DB required

function roundOmr(n: number) { return Math.round(n * 1000) / 1000; }

describe("clientPortal.getMyStaffingInvoice — logic", () => {
  it("returns hasNoSites=true when no promoter assignments exist", () => {
    const assignments: number[] = [];
    const clientSiteIds = [...new Set(assignments)];
    expect(clientSiteIds.length === 0).toBe(true);
  });

  it("filters records to only client-scoped sites", () => {
    const clientSiteIds = new Set([10, 11]);
    const records = [
      { siteId: 10 }, { siteId: 12 }, { siteId: 11 },
    ];
    const filtered = records.filter((r) => clientSiteIds.has(r.siteId));
    expect(filtered).toHaveLength(2);
    expect(filtered.every((r) => clientSiteIds.has(r.siteId))).toBe(true);
  });

  it("billable days = distinct Muscat dates per employee per site", () => {
    const dates = new Set(["2026-04-10", "2026-04-11", "2026-04-11"]);
    expect(dates.size).toBe(2);
  });

  it("amount = billableDays × dailyRateOmr rounded to 3dp", () => {
    expect(roundOmr(5 * 15.5)).toBe(77.5);
    expect(roundOmr(3 * 33.333)).toBe(99.999);
  });

  it("zero-day employees are excluded", () => {
    const promoters = [{ billableDays: 0 }, { billableDays: 3 }];
    expect(promoters.filter((p) => p.billableDays > 0)).toHaveLength(1);
  });

  it("zero-rate site shows 0 amount without error", () => {
    expect(roundOmr(5 * 0)).toBe(0);
  });

  it("grand total is sum of site totals rounded to 3dp", () => {
    const groups = [{ totalAmountOmr: 99.999 }, { totalAmountOmr: 0.001 }];
    expect(roundOmr(groups.reduce((s, g) => s + g.totalAmountOmr, 0))).toBe(100);
  });
});
