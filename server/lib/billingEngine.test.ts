import { describe, it, expect } from "vitest";
import {
  omr,
  dailyWageFromBasicMonthly,
  estimateGratuityArticle39,
  calculateInvoice,
  applyPayment,
  buildAgingSummary,
  projectCashFlow,
} from "./billingEngine";

describe("billingEngine.omr", () => {
  it("rounds to 3 decimals", () => {
    expect(omr(1.23456)).toBe(1.235);
    expect(omr(0)).toBe(0);
  });
});

describe("dailyWageFromBasicMonthly", () => {
  it("divides by 30", () => {
    expect(dailyWageFromBasicMonthly(900)).toBe(30);
    expect(dailyWageFromBasicMonthly(0)).toBe(0);
  });
});

describe("estimateGratuityArticle39", () => {
  it("returns zero for no service", () => {
    const r = estimateGratuityArticle39({ basicSalaryOmr: 600, yearsOfService: 0 });
    expect(r.gratuityOmr).toBe(0);
    expect(r.equivalentDays).toBe(0);
  });

  it("15 days per year for first 3 years", () => {
    const r = estimateGratuityArticle39({ basicSalaryOmr: 600, yearsOfService: 2 });
    const daily = 20;
    expect(r.dailyWageOmr).toBe(daily);
    expect(r.equivalentDays).toBe(30);
    expect(r.gratuityOmr).toBe(omr(30 * daily));
  });

  it("adds 30 days per year after year 3", () => {
    const r = estimateGratuityArticle39({ basicSalaryOmr: 300, yearsOfService: 4 });
    const daily = 10;
    expect(r.dailyWageOmr).toBe(daily);
    expect(r.equivalentDays).toBe(15 + 15 + 15 + 30);
    expect(r.gratuityOmr).toBe(omr(75 * daily));
  });

  it("handles fractional years", () => {
    const r = estimateGratuityArticle39({ basicSalaryOmr: 300, yearsOfService: 1.5 });
    expect(r.equivalentDays).toBeGreaterThan(15);
    expect(r.gratuityOmr).toBeGreaterThan(0);
  });
});

describe("calculateInvoice", () => {
  it("sums lines without VAT", () => {
    const r = calculateInvoice([
      { quantity: 10, unitRateOmr: 5 },
      { quantity: 2, unitRateOmr: 12.5 },
    ]);
    expect(r.subtotalOmr).toBe(75);
    expect(r.vatOmr).toBe(0);
    expect(r.totalOmr).toBe(75);
  });

  it("applies default VAT rate", () => {
    const r = calculateInvoice([{ quantity: 100, unitRateOmr: 1 }], { vatRatePctDefault: 5 });
    expect(r.subtotalOmr).toBe(100);
    expect(r.vatOmr).toBe(5);
    expect(r.totalOmr).toBe(105);
  });

  it("allows per-line VAT override", () => {
    const r = calculateInvoice([
      { quantity: 1, unitRateOmr: 100, vatRatePct: 0 },
      { quantity: 1, unitRateOmr: 50, vatRatePct: 5 },
    ]);
    expect(r.subtotalOmr).toBe(150);
    expect(r.vatOmr).toBe(2.5);
    expect(r.totalOmr).toBe(152.5);
  });
});

describe("applyPayment", () => {
  it("marks paid when balance cleared", () => {
    const r = applyPayment(
      { totalOmr: 100, amountPaidOmr: 0, balanceOmr: 100, status: "sent" },
      100
    );
    expect(r.balanceOmr).toBe(0);
    expect(r.status).toBe("paid");
    expect(r.amountPaidOmr).toBe(100);
  });

  it("partial payment", () => {
    const r = applyPayment(
      { totalOmr: 100, amountPaidOmr: 0, balanceOmr: 100, status: "sent" },
      40
    );
    expect(r.balanceOmr).toBe(60);
    expect(r.status).toBe("partial");
  });

  it("rejects overpayment", () => {
    expect(() =>
      applyPayment({ totalOmr: 50, amountPaidOmr: 0, balanceOmr: 50, status: "sent" }, 60)
    ).toThrow(/exceeds/);
  });

  it("rejects void invoice", () => {
    expect(() =>
      applyPayment({ totalOmr: 50, amountPaidOmr: 0, balanceOmr: 50, status: "void" }, 10)
    ).toThrow(/void/);
  });
});

describe("buildAgingSummary", () => {
  const d = (s: string) => new Date(s);
  it("buckets by due date", () => {
    const now = d("2026-04-16");
    const s = buildAgingSummary(
      [
        { balanceOmr: 100, dueDate: d("2026-04-20") },
        { balanceOmr: 50, dueDate: d("2026-03-25") },
        { balanceOmr: 25, dueDate: d("2026-01-01") },
      ],
      now
    );
    expect(s.current).toBe(100);
    expect(s.days1To30).toBe(50);
    expect(s.days91Plus).toBe(25);
    expect(s.totalOutstanding).toBe(175);
  });

  it("ignores zero balances", () => {
    const s = buildAgingSummary([{ balanceOmr: 0, dueDate: d("2020-01-01") }]);
    expect(s.totalOutstanding).toBe(0);
  });
});

describe("projectCashFlow", () => {
  it("accumulates closing balance", () => {
    const rows = projectCashFlow({
      openingBalanceOmr: 1000,
      monthlyNetOmr: [100, -50, 200],
    });
    expect(rows[0].closingOmr).toBe(1100);
    expect(rows[1].closingOmr).toBe(1050);
    expect(rows[2].closingOmr).toBe(1250);
  });

  it("handles negative net months", () => {
    const rows = projectCashFlow({ openingBalanceOmr: 500, monthlyNetOmr: [-100, -50] });
    expect(rows[0].closingOmr).toBe(400);
    expect(rows[1].closingOmr).toBe(350);
  });

  it("empty horizon", () => {
    expect(projectCashFlow({ openingBalanceOmr: 0, monthlyNetOmr: [] })).toEqual([]);
  });
});

describe("buildAgingSummary extra", () => {
  const d = (s: string) => new Date(s);
  it("31–60 bucket", () => {
    const now = d("2026-06-15");
    const s = buildAgingSummary([{ balanceOmr: 40, dueDate: d("2026-04-20") }], now);
    expect(s.days31To60).toBe(40);
  });

  it("61–90 bucket", () => {
    const now = d("2026-06-15");
    const s = buildAgingSummary([{ balanceOmr: 12, dueDate: d("2026-03-20") }], now);
    expect(s.days61To90).toBe(12);
  });

  it("string due dates", () => {
    const s = buildAgingSummary([{ balanceOmr: 10, dueDate: "2026-12-31" }], new Date("2026-06-01"));
    expect(s.current).toBe(10);
  });
});

describe("calculateInvoice edge", () => {
  it("empty lines", () => {
    const r = calculateInvoice([]);
    expect(r.subtotalOmr).toBe(0);
    expect(r.totalOmr).toBe(0);
  });

  it("fractional quantity", () => {
    const r = calculateInvoice([{ quantity: 1.5, unitRateOmr: 10 }]);
    expect(r.subtotalOmr).toBe(15);
  });
});

describe("applyPayment edge", () => {
  it("tiny remainder still partial", () => {
    const r = applyPayment(
      { totalOmr: 100.001, amountPaidOmr: 0, balanceOmr: 100.001, status: "sent" },
      100
    );
    expect(r.status).toBe("partial");
    expect(r.balanceOmr).toBeGreaterThan(0);
  });

  it("rejects non-positive payment", () => {
    expect(() =>
      applyPayment({ totalOmr: 10, amountPaidOmr: 0, balanceOmr: 10, status: "sent" }, 0)
    ).toThrow();
  });
});

describe("estimateGratuityArticle39 caps", () => {
  it("caps very long service", () => {
    const r = estimateGratuityArticle39({ basicSalaryOmr: 100, yearsOfService: 200 });
    expect(r.gratuityOmr).toBeGreaterThan(0);
    expect(Number.isFinite(r.equivalentDays)).toBe(true);
  });
});
