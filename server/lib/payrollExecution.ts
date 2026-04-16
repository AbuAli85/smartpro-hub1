import { createHash } from "node:crypto";

/** Round to 3 decimal places (OMR fils). */
export function roundOmr(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** PASI employee contribution: 7% of gross for Omani nationals (per product brief). */
export function pasiEmployeeFromGross(gross: number, isOmani: boolean): number {
  if (!isOmani || gross <= 0) return 0;
  return roundOmr(gross * 0.07);
}

export function isOmaniNationality(nationality: string | null | undefined): boolean {
  const n = (nationality ?? "").toLowerCase();
  return n === "omani" || n === "oman" || n === "عماني";
}

/** Standard monthly hours for hourly rate from basic salary. */
export const MONTHLY_WORK_HOURS = 208;

export function hourlyRateFromBasic(basic: number): number {
  if (basic <= 0) return 0;
  return basic / MONTHLY_WORK_HOURS;
}

/** ISO week key (year-Www) for overtime bucketing. */
export function isoWeekKey(d: Date): string {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((x.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${x.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export function sessionHours(checkIn: Date, checkOut: Date | null): number {
  if (!checkOut) return 0;
  return Math.max(0, (checkOut.getTime() - checkIn.getTime()) / 3600000);
}

/**
 * Overtime: hours beyond 40/week × 1.25 × hourly_rate (brief).
 * `sessions` = closed sessions in month with checkIn/checkOut.
 */
export function computeOvertimePay(
  sessions: Array<{ checkIn: Date; checkOut: Date | null }>,
  hourlyRate: number
): number {
  if (hourlyRate <= 0 || !sessions.length) return 0;
  const byWeek = new Map<string, number>();
  for (const s of sessions) {
    const h = sessionHours(s.checkIn, s.checkOut);
    if (h <= 0) continue;
    const wk = isoWeekKey(s.checkIn);
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + h);
  }
  let overtimeHours = 0;
  for (const h of byWeek.values()) {
    overtimeHours += Math.max(0, h - 40);
  }
  return roundOmr(overtimeHours * 1.25 * hourlyRate);
}

/** Oman civil ID: 8 digits (validation for WPS export). */
export function isValidOmaniCivilId(s: string | null | undefined): boolean {
  if (!s) return false;
  const t = String(s).trim();
  return /^\d{8}$/.test(t);
}

/** Best-effort bank identifier from OM IBAN (positions after country+check digits). */
export function bankCodeFromOmaniIban(iban: string | null | undefined): string {
  if (!iban) return "";
  const clean = iban.replace(/\s+/g, "").toUpperCase();
  if (!clean.startsWith("OM") || clean.length < 8) return "";
  return clean.slice(4, 7);
}

export type WpsDetailRow = {
  civilId: string;
  employeeName: string;
  amountOmr: number;
  accountNumber: string;
  bankCode: string;
};

/**
 * Fixed-width UTF-8 payload (bank upload placeholder — unsigned export per brief).
 * Header | Detail | Trailer with SHA-256 checksum (last 8 hex chars).
 */
export function buildWpsDatPayload(params: {
  companyCr: string;
  periodYear: number;
  periodMonth: number;
  rows: WpsDetailRow[];
}): { buffer: Buffer; checksum8: string; recordCount: number; totalAmount: number } {
  const created = new Date();
  const ymd =
    created.getFullYear() +
    String(created.getMonth() + 1).padStart(2, "0") +
    String(created.getDate()).padStart(2, "0");
  const totalAmount = roundOmr(params.rows.reduce((s, r) => s + r.amountOmr, 0));
  const recordCount = params.rows.length;
  const header = [
    "H",
    (params.companyCr || "UNKNOWN").slice(0, 20).padEnd(20, " "),
    ymd,
    String(params.periodYear),
    String(params.periodMonth).padStart(2, "0"),
    totalAmount.toFixed(3).padStart(14, "0"),
    String(recordCount).padStart(6, "0"),
  ].join("|");

  const detailLines = params.rows.map((r, i) =>
    [
      "D",
      String(i + 1).padStart(6, "0"),
      r.civilId.padStart(8, "0"),
      r.employeeName.slice(0, 40).padEnd(40, " "),
      r.amountOmr.toFixed(3).padStart(14, "0"),
      r.accountNumber.slice(0, 24).padEnd(24, " "),
      r.bankCode.slice(0, 8).padEnd(8, " "),
    ].join("|")
  );

  const body = [header, ...detailLines].join("\n");
  const hash = createHash("sha256").update(body, "utf8").digest("hex").toUpperCase();
  const checksum8 = hash.slice(-8);
  const trailer = ["T", checksum8, String(recordCount).padStart(6, "0"), totalAmount.toFixed(3).padStart(14, "0")].join("|");
  const full = `${body}\n${trailer}\n`;
  return {
    buffer: Buffer.from(full, "utf8"),
    checksum8,
    recordCount,
    totalAmount,
  };
}
