import { describe, it, expect } from "vitest";
import {
  roundOmr,
  pasiEmployeeFromGross,
  computeOvertimePay,
  hourlyRateFromBasic,
  isValidOmaniCivilId,
  bankCodeFromOmaniIban,
  buildWpsDatPayload,
} from "./payrollExecution";

describe("payrollExecution", () => {
  it("PASI is 7% of gross for Omani", () => {
    expect(pasiEmployeeFromGross(1000, true)).toBe(70);
    expect(pasiEmployeeFromGross(1000, false)).toBe(0);
  });

  it("overtime uses >40h/week at 1.25x hourly", () => {
    const base = new Date("2026-04-06T08:00:00Z");
    const hr = hourlyRateFromBasic(2080);
    const sessions = [
      { checkIn: base, checkOut: new Date(base.getTime() + 45 * 3600000) },
    ];
    const ot = computeOvertimePay(sessions, hr);
    expect(ot).toBeGreaterThan(0);
    expect(roundOmr(ot)).toBe(ot);
  });

  it("validates civil ID and IBAN bank code", () => {
    expect(isValidOmaniCivilId("12345678")).toBe(true);
    expect(isValidOmaniCivilId("123")).toBe(false);
    expect(bankCodeFromOmaniIban("OM130200000123456789012")).toBe("020");
  });

  it("buildWpsDatPayload produces checksum and buffer", () => {
    const { buffer, checksum8, recordCount, totalAmount } = buildWpsDatPayload({
      companyCr: "CR1",
      periodYear: 2026,
      periodMonth: 4,
      rows: [
        {
          civilId: "12345678",
          employeeName: "Test User",
          amountOmr: 100.5,
          accountNumber: "OM130200000123456789012",
          bankCode: "020",
        },
      ],
    });
    expect(recordCount).toBe(1);
    expect(totalAmount).toBe(100.5);
    expect(checksum8).toHaveLength(8);
    expect(buffer.length).toBeGreaterThan(20);
  });
});
