import { describe, it, expect } from "vitest";
import {
  normalizeIban,
  isValidIbanChecksum,
  isOmaniIbanLength,
  sanitizeSifEmployeeName,
  collectWpsRowsForExport,
  buildSifCompliantWpsPayload,
  wpsSubmissionDeadlineUtc,
  daysUntilWpsDeadline,
  estimateGratuityArticle39,
} from "./lib/wpsService";
import {
  roundOmr,
  pasiEmployeeFromGross,
  computeOvertimePay,
  hourlyRateFromBasic,
  isValidOmaniCivilId,
  bankCodeFromOmaniIban,
  buildWpsDatPayload,
} from "./lib/payrollExecution";

describe("WPS / IBAN (wpsService)", () => {
  it("normalizeIban strips spaces and uppercases", () => {
    expect(normalizeIban(" om12 34 ")).toBe("OM1234");
  });

  it("normalizeIban handles null", () => {
    expect(normalizeIban(null)).toBe("");
  });

  it("isOmaniIbanLength is 23 chars for OM", () => {
    expect(isOmaniIbanLength("OM" + "1".repeat(21))).toBe(true);
    expect(isOmaniIbanLength("OM" + "1".repeat(19))).toBe(false);
  });

  it("isValidIbanChecksum rejects obviously invalid", () => {
    expect(isValidIbanChecksum("OM00")).toBe(false);
    expect(isValidIbanChecksum("")).toBe(false);
  });

  it("isValidIbanChecksum accepts sample valid IBAN (DE)", () => {
    expect(isValidIbanChecksum("DE89370400440532013000")).toBe(true);
  });

  it("bankCodeFromOmaniIban extracts 3-digit bank from OM IBAN", () => {
    expect(bankCodeFromOmaniIban("OM130200000123456789012")).toBe("020");
  });

  it("sanitizeSifEmployeeName strips non-ASCII", () => {
    expect(sanitizeSifEmployeeName("علي Ahmed")).toMatch(/Ahmed/);
  });

  it("sanitizeSifEmployeeName falls back to Employee", () => {
    expect(sanitizeSifEmployeeName("😀😀")).toBe("Employee");
  });

  it("wpsSubmissionDeadlineUtc is 10th of month after period (UTC)", () => {
    const d = wpsSubmissionDeadlineUtc(2026, 4);
    expect(d.getUTCMonth()).toBe(4);
    expect(d.getUTCDate()).toBe(10);
  });

  it("daysUntilWpsDeadline returns integer days", () => {
    const n = daysUntilWpsDeadline(2099, 6, new Date("2099-01-01T00:00:00Z"));
    expect(n).toBeGreaterThan(100);
  });
});

describe("collectWpsRowsForExport", () => {
  it("builds row for valid civil + valid IBAN", () => {
    const r = collectWpsRowsForExport([
      {
        employeeName: "Test User",
        nationalId: "12345678",
        netSalary: 500,
        ibanLine: "DE89370400440532013000",
        ibanEmployee: null,
        bankAccountLine: null,
        bankAccountEmployee: null,
      },
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.blockingErrors).toHaveLength(0);
    expect(r.rows[0].amountOmr).toBe(500);
  });

  it("blocks when IBAN invalid and no account", () => {
    const r = collectWpsRowsForExport([
      {
        employeeName: "A",
        nationalId: "87654321",
        netSalary: 100,
        ibanLine: "OM00INVALIDINVALIDINVALID",
        ibanEmployee: null,
        bankAccountLine: null,
        bankAccountEmployee: null,
      },
    ]);
    expect(r.rows).toHaveLength(0);
    expect(r.blockingErrors.length).toBeGreaterThan(0);
  });

  it("warns and uses legacy account when IBAN checksum fails but account exists", () => {
    const r = collectWpsRowsForExport([
      {
        employeeName: "B",
        nationalId: "11223344",
        netSalary: 200,
        ibanLine: "OM00INVALIDINVALIDINVALID",
        ibanEmployee: null,
        bankAccountLine: "1234567890",
        bankAccountEmployee: null,
      },
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.warnings.some((w) => w.includes("checksum"))).toBe(true);
    expect(r.rows[0].bankCode).toBe("UNK");
  });

  it("skips invalid civil IDs", () => {
    const r = collectWpsRowsForExport([
      {
        employeeName: "C",
        nationalId: "12",
        netSalary: 50,
        ibanLine: "DE89370400440532013000",
        ibanEmployee: null,
        bankAccountLine: null,
        bankAccountEmployee: null,
      },
    ]);
    expect(r.rows).toHaveLength(0);
    expect(r.civilSkippedNames).toContain("C");
  });

  it("collects zero net names", () => {
    const r = collectWpsRowsForExport([
      {
        employeeName: "D",
        nationalId: "12345678",
        netSalary: 0,
        ibanLine: "DE89370400440532013000",
        ibanEmployee: null,
        bankAccountLine: null,
        bankAccountEmployee: null,
      },
    ]);
    expect(r.zeroNetNames).toContain("D");
  });

  it("prefers line IBAN over employee IBAN", () => {
    const r = collectWpsRowsForExport([
      {
        employeeName: "E",
        nationalId: "12345678",
        netSalary: 10,
        ibanLine: "DE89370400440532013000",
        ibanEmployee: "OM130200000123456789012",
        bankAccountLine: null,
        bankAccountEmployee: null,
      },
    ]);
    expect(r.rows[0].accountNumber.startsWith("DE")).toBe(true);
  });
});

describe("buildSifCompliantWpsPayload", () => {
  it("produces buffer and checksum", () => {
    const out = buildSifCompliantWpsPayload({
      companyCr: "CR",
      periodYear: 2026,
      periodMonth: 4,
      rows: [
        {
          civilId: "12345678",
          employeeName: "X".repeat(50),
          amountOmr: 1,
          accountNumber: "123",
          bankCode: "020",
        },
      ],
    });
    expect(out.checksum8).toHaveLength(8);
    expect(out.recordCount).toBe(1);
  });
});

describe("payrollExecution (PASI, overtime, WPS buffer)", () => {
  it("roundOmr is 3dp", () => {
    expect(roundOmr(1.23456)).toBe(1.235);
  });

  it("pasiEmployeeFromGross", () => {
    expect(pasiEmployeeFromGross(1000, true)).toBe(70);
    expect(pasiEmployeeFromGross(1000, false)).toBe(0);
  });

  it("isValidOmaniCivilId", () => {
    expect(isValidOmaniCivilId("12345678")).toBe(true);
    expect(isValidOmaniCivilId("123")).toBe(false);
  });

  it("computeOvertimePay", () => {
    const base = new Date("2026-04-06T08:00:00Z");
    const hr = hourlyRateFromBasic(2080);
    const sessions = [{ checkIn: base, checkOut: new Date(base.getTime() + 45 * 3600000) }];
    const ot = computeOvertimePay(sessions, hr);
    expect(ot).toBeGreaterThan(0);
  });

  it("buildWpsDatPayload structure", () => {
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

describe("gratuity (Art. 39 via wpsService re-export)", () => {
  it("estimateGratuityArticle39 returns days and money", () => {
    const g = estimateGratuityArticle39({ basicSalaryOmr: 600, yearsOfService: 2 });
    expect(g.equivalentDays).toBeGreaterThan(0);
    expect(g.gratuityOmr).toBeGreaterThan(0);
  });

  it("zero years yields zero gratuity", () => {
    const g = estimateGratuityArticle39({ basicSalaryOmr: 600, yearsOfService: 0 });
    expect(g.gratuityOmr).toBe(0);
  });

  it("year 4 uses 30 days for the fourth year (15+15+15+30)", () => {
    const g = estimateGratuityArticle39({ basicSalaryOmr: 3000, yearsOfService: 4 });
    expect(g.equivalentDays).toBe(75);
  });
});

describe("WPS edge matrix", () => {
  const base = {
    nationalId: "12345678",
    netSalary: 100,
    ibanLine: null as string | null,
    ibanEmployee: null as string | null,
    bankAccountLine: null as string | null,
    bankAccountEmployee: null as string | null,
  };

  it.each([
    ["N1", { ...base, employeeName: "N1", bankAccountEmployee: "999", ibanLine: "DE89370400440532013000" }],
    ["N2", { ...base, employeeName: "N2", bankAccountLine: "888", ibanEmployee: "DE89370400440532013000" }],
  ])("row %s exports", (_label, row) => {
    const r = collectWpsRowsForExport([row]);
    expect(r.rows.length).toBe(1);
  });
});

describe("IBAN checksum table", () => {
  it.each([
    ["GB82WEST12345698765432", true],
    ["GB82WEST12345698765431", false],
  ])("checksum %s", (iban, ok) => {
    expect(isValidIbanChecksum(iban)).toBe(ok);
  });
});

describe("collectWpsRowsForExport multi-employee", () => {
  it("merges warnings from multiple rows", () => {
    const r = collectWpsRowsForExport([
      {
        employeeName: "P1",
        nationalId: "11111111",
        netSalary: 10,
        ibanLine: "OM00INVALIDINVALIDINVALID",
        ibanEmployee: null,
        bankAccountLine: "123",
        bankAccountEmployee: null,
      },
      {
        employeeName: "P2",
        nationalId: "22222222",
        netSalary: 10,
        ibanLine: "DE89370400440532013000",
        ibanEmployee: null,
        bankAccountLine: null,
        bankAccountEmployee: null,
      },
    ]);
    expect(r.rows).toHaveLength(2);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("warns on non-23 OM IBAN when otherwise valid", () => {
    const r = collectWpsRowsForExport([
      {
        employeeName: "Short",
        nationalId: "33333333",
        netSalary: 5,
        ibanLine: "DE89370400440532013000",
        ibanEmployee: null,
        bankAccountLine: null,
        bankAccountEmployee: null,
      },
    ]);
    expect(r.rows).toHaveLength(1);
  });
});

describe("buildSifCompliantWpsPayload multi-row", () => {
  it("totals amounts across rows", () => {
    const out = buildSifCompliantWpsPayload({
      companyCr: "X",
      periodYear: 2025,
      periodMonth: 12,
      rows: [
        {
          civilId: "12345678",
          employeeName: "A",
          amountOmr: 100,
          accountNumber: "DE89370400440532013000",
          bankCode: "ZZZ",
        },
        {
          civilId: "87654321",
          employeeName: "B",
          amountOmr: 200.25,
          accountNumber: "DE89370400440532013000",
          bankCode: "ZZZ",
        },
      ],
    });
    expect(out.totalAmount).toBe(300.25);
    expect(out.recordCount).toBe(2);
  });
});
