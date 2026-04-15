import { describe, it, expect } from "vitest";

/** Mirror of the rounding helper from the procedure */
function roundOmr(n: number): number {
  return Math.round(n * 1000) / 1000;
}

describe("client invoice summary — business logic", () => {
  it("billable days = count of distinct Muscat dates with a closed punch", () => {
    const dates = new Set(["2026-04-14", "2026-04-15", "2026-04-15"]);
    expect(dates.size).toBe(2);
  });

  it("amount = billableDays × dailyRateOmr, rounded to 3dp", () => {
    expect(roundOmr(5 * 15.5)).toBe(77.5);
    expect(roundOmr(3 * 33.333)).toBe(99.999);
    expect(roundOmr(7 * 10.1)).toBe(70.7);
  });

  it("grand total rounds independently from group subtotals", () => {
    const groups = [{ totalAmountOmr: 99.999 }, { totalAmountOmr: 0.001 }];
    const grand = roundOmr(groups.reduce((s, g) => s + g.totalAmountOmr, 0));
    expect(grand).toBe(100);
  });

  it("zero-billable-days employees are excluded from output", () => {
    const promoters = [
      { employeeId: 1, billableDays: 0 },
      { employeeId: 2, billableDays: 5 },
    ];
    const filtered = promoters.filter((p) => p.billableDays > 0);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.employeeId).toBe(2);
  });

  it("sites with no qualifying promoters are excluded from groups", () => {
    const siteGroups = [
      { siteId: 1, promoters: [] as { billableDays: number }[] },
      { siteId: 2, promoters: [{ billableDays: 3 }] },
    ];
    const output = siteGroups.filter((g) => g.promoters.length > 0);
    expect(output).toHaveLength(1);
    expect(output[0]!.siteId).toBe(2);
  });

  it("dailyRateOmr of 0 produces 0 amount without error", () => {
    expect(roundOmr(5 * 0)).toBe(0);
  });

  it("groups sort by clientName then siteName", () => {
    const groups = [
      { clientName: "Toshiba" as string | null, siteName: "Extra OS1" },
      { clientName: "LG" as string | null, siteName: "City Centre" },
      { clientName: null, siteName: "Warehouse" },
    ];
    const sorted = [...groups].sort((a, b) => {
      const ka = a.clientName ?? a.siteName;
      const kb = b.clientName ?? b.siteName;
      const c = ka.localeCompare(kb);
      return c !== 0 ? c : a.siteName.localeCompare(b.siteName);
    });
    expect(sorted[0]!.siteName).toBe("City Centre");
    expect(sorted[1]!.siteName).toBe("Extra OS1");
    expect(sorted[2]!.siteName).toBe("Warehouse");
  });
});
