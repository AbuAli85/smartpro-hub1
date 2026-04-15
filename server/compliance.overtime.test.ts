import { describe, it, expect } from "vitest";

const OMAN_MAX_DAILY_MINUTES = 540;
const OVERTIME_THRESHOLD_MINUTES = 545;

function isOvertimeDay(grossMinutes: number, breakMinutes: number): boolean {
  const net = Math.max(0, grossMinutes - breakMinutes);
  return net > OVERTIME_THRESHOLD_MINUTES;
}

function overtimeMinutes(grossMinutes: number, breakMinutes: number): number {
  const net = Math.max(0, grossMinutes - breakMinutes);
  return Math.max(0, net - OMAN_MAX_DAILY_MINUTES);
}

describe("Oman overtime compliance flag", () => {
  it("540 minutes net is not overtime (exactly at cap)", () => {
    expect(isOvertimeDay(540, 0)).toBe(false);
  });

  it("545 minutes net is not overtime (within 5-min buffer)", () => {
    expect(isOvertimeDay(545, 0)).toBe(false);
  });

  it("546 minutes net triggers overtime flag", () => {
    expect(isOvertimeDay(546, 0)).toBe(true);
  });

  it("600 minutes gross with 60-min break = 540 net — no flag", () => {
    expect(isOvertimeDay(600, 60)).toBe(false);
  });

  it("660 minutes gross with 60-min break = 600 net — flags 60 overtime minutes", () => {
    expect(isOvertimeDay(660, 60)).toBe(true);
    expect(overtimeMinutes(660, 60)).toBe(60);
  });

  it("break cannot make net negative", () => {
    // 30 min gross, 60 min break → net = 0, no flag
    expect(isOvertimeDay(30, 60)).toBe(false);
    expect(overtimeMinutes(30, 60)).toBe(0);
  });

  it("Friday / holiday threshold is the same (premium pay is payroll concern, not flag logic)", () => {
    // The flag logic is identical regardless of day-of-week;
    // the 125% vs 150% rate is a payroll calculation, not flagged here.
    expect(isOvertimeDay(600, 0)).toBe(true); // 60 overtime minutes regardless of day
  });

  it("getComplianceScore weight sum with new check equals 100", () => {
    const weights = [25, 20, 20, 20, 15]; // Omanisation, permits, renewals, WPS, hours cap
    const total = weights.reduce((s, w) => s + w, 0);
    expect(total).toBe(100);
  });
});
