/**
 * Oman WPS / SIF helpers — IBAN validation, row assembly, and compliant .dat payloads.
 * Bank field issues are surfaced as warnings where a legacy account still allows payment.
 */
import { estimateGratuityArticle39 } from "./billingEngine";
import {
  bankCodeFromOmaniIban,
  buildWpsDatPayload,
  isValidOmaniCivilId,
  roundOmr,
  type WpsDetailRow,
} from "./payrollExecution";

export { buildWpsDatPayload, type WpsDetailRow } from "./payrollExecution";
export { estimateGratuityArticle39 };

/** ISO 13616 IBAN normalization (no spaces, upper case). */
export function normalizeIban(iban: string | null | undefined): string {
  return (iban ?? "").replace(/\s+/g, "").toUpperCase();
}

/** MOD-97-10 check (IBAN checksum digits in positions 3–4 after rearrangement). */
export function isValidIbanChecksum(iban: string): boolean {
  const clean = normalizeIban(iban);
  if (clean.length < 15 || clean.length > 34) return false;
  const rearranged = clean.slice(4) + clean.slice(0, 4);
  let expanded = "";
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    if (code >= 48 && code <= 57) expanded += ch;
    else if (code >= 65 && code <= 90) expanded += String(code - 55);
    else return false;
  }
  let remainder = 0;
  for (let i = 0; i < expanded.length; i++) {
    remainder = (remainder * 10 + parseInt(expanded[i], 10)) % 97;
  }
  return remainder === 1;
}

/** Oman retail IBAN is 23 characters: OM + 2 check + 4 bank + 16 account. */
export function isOmaniIbanLength(iban: string): boolean {
  return normalizeIban(iban).length === 23;
}

export function sanitizeSifEmployeeName(name: string): string {
  const ascii = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (ascii || "Employee").slice(0, 40);
}

export type WpsPayrollLineInput = {
  employeeName: string;
  nationalId: string | null | undefined;
  netSalary: number;
  ibanLine: string | null | undefined;
  ibanEmployee: string | null | undefined;
  bankAccountLine: string | null | undefined;
  bankAccountEmployee: string | null | undefined;
};

export type CollectWpsRowsResult = {
  rows: WpsDetailRow[];
  warnings: string[];
  blockingErrors: string[];
  civilSkippedNames: string[];
  zeroNetNames: string[];
};

function pickIban(line?: string | null, emp?: string | null): string {
  const a = (line ?? "").trim();
  const b = (emp ?? "").trim();
  return a || b;
}

function pickAccount(line?: string | null, emp?: string | null): string {
  const a = (line ?? "").trim().replace(/\s+/g, "");
  const b = (emp ?? "").trim().replace(/\s+/g, "");
  return a || b;
}

/**
 * Build WPS detail rows from payroll lines. Invalid IBAN checksum is a **warning** if a
 * domestic account number is present; otherwise it is blocking (no payout route).
 */
export function collectWpsRowsForExport(items: WpsPayrollLineInput[]): CollectWpsRowsResult {
  const warnings: string[] = [];
  const blockingErrors: string[] = [];
  const civilSkippedNames: string[] = [];
  const zeroNetNames: string[] = [];
  const rows: WpsDetailRow[] = [];

  for (const item of items) {
    const name = item.employeeName.trim() || "Employee";
    const net = Number(item.netSalary);
    if (net <= 0) {
      zeroNetNames.push(name);
      continue;
    }
    const civil = (item.nationalId ?? "").trim();
    if (!isValidOmaniCivilId(civil)) {
      civilSkippedNames.push(name);
      continue;
    }

    let ibanRaw = pickIban(item.ibanLine, item.ibanEmployee);
    const accountRaw = pickAccount(item.bankAccountLine, item.bankAccountEmployee);
    let iban = normalizeIban(ibanRaw);

    if (iban && !isValidIbanChecksum(iban)) {
      if (accountRaw) {
        warnings.push(`${name}: IBAN checksum failed — using legacy account number for WPS routing`);
        iban = "";
      } else {
        blockingErrors.push(`${name}: Invalid IBAN and no fallback account number`);
        continue;
      }
    }

    let accountNumber: string;
    let bankCode: string;

    if (iban && isValidIbanChecksum(iban)) {
      accountNumber = iban;
      bankCode = bankCodeFromOmaniIban(iban) || "UNK";
      if (iban.startsWith("OM") && !isOmaniIbanLength(iban)) {
        warnings.push(`${name}: IBAN length is not 23 (Oman) — verify with bank`);
      }
    } else if (accountRaw) {
      accountNumber = accountRaw;
      bankCode = "UNK";
      if (ibanRaw) {
        warnings.push(`${name}: Using domestic account without verified IBAN`);
      }
    } else {
      blockingErrors.push(`${name}: Missing bank account / IBAN`);
      continue;
    }

    rows.push({
      civilId: civil,
      employeeName: sanitizeSifEmployeeName(name),
      amountOmr: roundOmr(net),
      accountNumber: accountNumber.slice(0, 24),
      bankCode: bankCode.slice(0, 8),
    });
  }

  return { rows, warnings, blockingErrors, civilSkippedNames, zeroNetNames };
}

/**
 * SIF-compliant payload: sanitizes names and delegates to {@link buildWpsDatPayload}.
 */
export function buildSifCompliantWpsPayload(params: {
  companyCr: string;
  periodYear: number;
  periodMonth: number;
  rows: WpsDetailRow[];
}): ReturnType<typeof buildWpsDatPayload> {
  const rows = params.rows.map((r) => ({
    ...r,
    employeeName: sanitizeSifEmployeeName(r.employeeName),
    civilId: r.civilId.padStart(8, "0").slice(-8),
    accountNumber: r.accountNumber.slice(0, 24),
    bankCode: r.bankCode.slice(0, 8),
  }));
  return buildWpsDatPayload({ ...params, rows });
}

/**
 * Suggested MOHRE WPS file submission deadline: 10th calendar day of the month **after** the pay period.
 * (Operational rule of thumb — confirm against current ministerial decisions.)
 */
export function wpsSubmissionDeadlineUtc(periodYear: number, periodMonth: number): Date {
  return new Date(Date.UTC(periodYear, periodMonth, 10));
}

export function daysUntilWpsDeadline(periodYear: number, periodMonth: number, now: Date = new Date()): number {
  const d = wpsSubmissionDeadlineUtc(periodYear, periodMonth);
  return Math.ceil((d.getTime() - now.getTime()) / 86400000);
}
