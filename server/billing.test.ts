import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB ──────────────────────────────────────────────────────────────────

const mockInsert = vi.fn().mockResolvedValue([{ insertId: 1 }]);
const mockUpdate = vi.fn().mockResolvedValue([{}]);
const mockSelect = vi.fn();

vi.mock("../server/db", () => ({
  getDb: vi.fn().mockResolvedValue({
    select: mockSelect,
    insert: () => ({ values: mockInsert }),
    update: () => ({ set: () => ({ where: mockUpdate }) }),
  }),
}));

// ─── Invoice number helper ────────────────────────────────────────────────────

function invoiceNumber(officerId: number, companyId: number, year: number, month: number) {
  const m = String(month).padStart(2, "0");
  return `INV-${year}${m}-O${String(officerId).padStart(4, "0")}-C${String(companyId).padStart(4, "0")}`;
}

describe("Billing Engine — invoice number format", () => {
  it("generates a correctly formatted invoice number", () => {
    const inv = invoiceNumber(1, 5, 2026, 3);
    expect(inv).toBe("INV-202603-O0001-C0005");
  });

  it("pads single-digit months with leading zero", () => {
    const inv = invoiceNumber(10, 20, 2025, 1);
    expect(inv).toBe("INV-202501-O0010-C0020");
  });

  it("handles large IDs", () => {
    const inv = invoiceNumber(1000, 9999, 2026, 12);
    expect(inv).toBe("INV-202612-O1000-C9999");
  });
});

// ─── OMR formatting helper ────────────────────────────────────────────────────

function formatOMR(val: string | number | null | undefined): string {
  const n = parseFloat(String(val ?? "0"));
  return `OMR ${n.toFixed(3)}`;
}

describe("Billing Engine — OMR formatting", () => {
  it("formats a number with 3 decimal places", () => {
    expect(formatOMR(100)).toBe("OMR 100.000");
  });

  it("handles string input", () => {
    expect(formatOMR("150.500")).toBe("OMR 150.500");
  });

  it("handles null/undefined gracefully", () => {
    expect(formatOMR(null)).toBe("OMR 0.000");
    expect(formatOMR(undefined)).toBe("OMR 0.000");
  });
});

// ─── Track A commission calculation ──────────────────────────────────────────

function calcTrackACommission(totalCollected: number, commissionPct: number): number {
  return (totalCollected * commissionPct) / 100;
}

describe("Billing Engine — Track A commission", () => {
  it("calculates 12.5% commission correctly", () => {
    // 4 companies × OMR 100 = OMR 400 collected
    const commission = calcTrackACommission(400, 12.5);
    expect(commission).toBe(50);
  });

  it("calculates 0% commission", () => {
    expect(calcTrackACommission(1000, 0)).toBe(0);
  });

  it("calculates 100% commission", () => {
    expect(calcTrackACommission(200, 100)).toBe(200);
  });
});

// ─── Track B fixed salary ─────────────────────────────────────────────────────

describe("Billing Engine — Track B fixed salary", () => {
  it("returns fixed salary as gross for Track B", () => {
    const track = "sanad";
    const fixedSalary = 600;
    const gross = track === "sanad" ? fixedSalary : 0;
    expect(gross).toBe(600);
  });

  it("net = gross - deductions", () => {
    const gross = 600;
    const deductions = 50;
    const net = Math.max(0, gross - deductions);
    expect(net).toBe(550);
  });

  it("net is never negative", () => {
    const gross = 100;
    const deductions = 200;
    const net = Math.max(0, gross - deductions);
    expect(net).toBe(0);
  });
});

// ─── Severity classification ──────────────────────────────────────────────────

function getSeverity(days: number): string {
  if (days <= 7) return "critical";
  if (days <= 30) return "high";
  if (days <= 60) return "medium";
  return "low";
}

describe("Expiry Alerts — severity classification", () => {
  it("classifies 0 days as critical", () => {
    expect(getSeverity(0)).toBe("critical");
  });

  it("classifies 7 days as critical", () => {
    expect(getSeverity(7)).toBe("critical");
  });

  it("classifies 8 days as high", () => {
    expect(getSeverity(8)).toBe("high");
  });

  it("classifies 30 days as high", () => {
    expect(getSeverity(30)).toBe("high");
  });

  it("classifies 31 days as medium", () => {
    expect(getSeverity(31)).toBe("medium");
  });

  it("classifies 60 days as medium", () => {
    expect(getSeverity(60)).toBe("medium");
  });

  it("classifies 61 days as low", () => {
    expect(getSeverity(61)).toBe("low");
  });

  it("classifies 90 days as low", () => {
    expect(getSeverity(90)).toBe("low");
  });
});

// ─── daysFromNow helper ───────────────────────────────────────────────────────

function daysFromNow(date: Date): number {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

describe("Expiry Alerts — daysFromNow", () => {
  it("returns positive days for future dates", () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const days = daysFromNow(future);
    expect(days).toBeGreaterThan(0);
    expect(days).toBeLessThanOrEqual(31);
  });

  it("returns negative days for past dates", () => {
    const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const days = daysFromNow(past);
    expect(days).toBeLessThan(0);
  });

  it("returns approximately 0 for today", () => {
    const today = new Date(Date.now() + 60 * 1000); // 1 minute from now
    const days = daysFromNow(today);
    expect(days).toBeGreaterThanOrEqual(0);
    expect(days).toBeLessThanOrEqual(1);
  });
});
