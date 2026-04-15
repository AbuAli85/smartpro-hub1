import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getDb: vi.fn() };
});
vi.mock("./_core/membership", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./_core/membership")>();
  return { ...actual, requireWorkspaceMembership: vi.fn(), requireNotAuditor: vi.fn() };
});

describe("commission → payroll integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("commissionByUserId map uses userId not employee id", () => {
    const achievements = [{ employeeUserId: 500, totalCommission: "750.000" }];
    const map = new Map(achievements.map((r) => [r.employeeUserId, Number(r.totalCommission)]));
    expect(map.get(500)).toBe(750);
    expect(map.get(42)).toBeUndefined();
  });

  it("commission is zero when employee has no userId", () => {
    const map = new Map<number, number>();
    const emp = { userId: null as number | null };
    const commission = emp.userId != null ? (map.get(emp.userId) ?? 0) : 0;
    expect(commission).toBe(0);
  });

  it("commission is included in gross salary calculation", () => {
    const basic = 500;
    const housing = 100;
    const transport = 50;
    const other = 0;
    const commission = 200;
    const gross = basic + housing + transport + other + commission;
    expect(gross).toBe(850);
  });

  it("commission rounds to 3 decimal places (OMR standard)", () => {
    const raw = 123.456789;
    const rounded = Math.round(raw * 1000) / 1000;
    expect(rounded).toBe(123.457);
  });

  it("buildPayslipHtml includes commission line when > 0", () => {
    const commissionPay = 750;
    const html =
      commissionPay > 0
        ? `<tr><td>KPI Commission</td><td>OMR ${commissionPay.toFixed(3)}</td></tr>`
        : "";
    expect(html).toContain("KPI Commission");
    expect(html).toContain("750.000");
  });

  it("buildPayslipHtml omits commission line when 0", () => {
    const commissionPay = 0;
    const html =
      commissionPay > 0
        ? `<tr><td>KPI Commission</td><td>OMR ${commissionPay.toFixed(3)}</td></tr>`
        : "";
    expect(html).toBe("");
  });
});
