/**
 * Shared WPS (Wage Protection System) validation rules.
 * Pure functions only — no DB access, no side effects.
 * Server procedures call these and persist the result.
 */

// ── Status values ─────────────────────────────────────────────────────────────

export const WPS_STATUS_VALUES = ["ready", "invalid", "missing", "exempt"] as const;
export type WpsStatus = (typeof WPS_STATUS_VALUES)[number];

// ── Issue keys ────────────────────────────────────────────────────────────────

export const WPS_ISSUE_KEYS = [
  "missing_iban",
  "invalid_iban_format",
  "missing_basic_salary",
  "non_positive_basic_salary",
  "employee_not_active",
  "missing_hire_date",
  "missing_employment_type",
] as const;
export type WpsIssueKey = (typeof WPS_ISSUE_KEYS)[number];

// ── IBAN validation ───────────────────────────────────────────────────────────

/**
 * Validates an IBAN string per ISO 13616.
 * Accepts only alphanumeric characters (spaces stripped).
 * Length must be 15–34 characters.
 * Country code must be two uppercase letters.
 * Does NOT perform full mod-97 check (v1 scope).
 */
export function isValidIbanFormat(iban: string | null | undefined): boolean {
  if (!iban) return false;
  const cleaned = iban.replace(/\s+/g, "").toUpperCase();
  if (cleaned.length < 15 || cleaned.length > 34) return false;
  if (!/^[A-Z]{2}/.test(cleaned)) return false;
  if (!/^[A-Z0-9]+$/.test(cleaned)) return false;
  return true;
}

// ── Validation input type ─────────────────────────────────────────────────────

export interface WpsValidationInput {
  status: "active" | "on_leave" | "terminated" | "resigned";
  employmentType?: string | null;
  hireDate?: Date | string | null;
  ibanNumber?: string | null;
  basicSalary?: string | number | null;
}

// ── Validation result ─────────────────────────────────────────────────────────

export interface WpsValidationResult {
  /** Derived WPS status for this employee. */
  status: WpsStatus;
  /** List of issue keys that caused a non-ready status. */
  issues: WpsIssueKey[];
  /** Whether the employee is fully WPS-ready. */
  isReady: boolean;
  /** Normalised IBAN (uppercase, no spaces) if present and valid. */
  normalizedIban: string | null;
  /** Parsed basic salary as a number, or null if absent/invalid. */
  parsedBasicSalary: number | null;
}

export interface WpsValidationPeriodInput {
  periodYear?: number | null;
  periodMonth?: number | null;
}

export interface NormalizedWpsValidationPeriod {
  periodYear: number | null;
  periodMonth: number | null;
  scope: "period" | "generic";
}

export function normalizeWpsValidationPeriod(
  input: WpsValidationPeriodInput,
): NormalizedWpsValidationPeriod {
  const hasYear = input.periodYear !== null && input.periodYear !== undefined;
  const hasMonth = input.periodMonth !== null && input.periodMonth !== undefined;
  if (!hasYear && !hasMonth) {
    return { periodYear: null, periodMonth: null, scope: "generic" };
  }
  if (!hasYear || !hasMonth) {
    throw new Error("WPS period context requires both periodYear and periodMonth.");
  }
  const periodYear = Number(input.periodYear);
  const periodMonth = Number(input.periodMonth);
  if (!Number.isInteger(periodYear) || periodYear < 2000 || periodYear > 2100) {
    throw new Error("Invalid WPS periodYear.");
  }
  if (!Number.isInteger(periodMonth) || periodMonth < 1 || periodMonth > 12) {
    throw new Error("Invalid WPS periodMonth.");
  }
  return { periodYear, periodMonth, scope: "period" };
}

// ── Core rule function ────────────────────────────────────────────────────────

/**
 * Derives WPS readiness for a single employee.
 * Returns status, issues, and normalised values.
 * Safe to call multiple times — deterministic for the same input.
 */
export function validateEmployeeWpsReadiness(
  input: WpsValidationInput,
): WpsValidationResult {
  const issues: WpsIssueKey[] = [];

  // 1. Employee must be active
  if (input.status !== "active" && input.status !== "on_leave") {
    issues.push("employee_not_active");
  }

  // 2. IBAN checks
  const rawIban = input.ibanNumber?.trim() ?? null;
  let normalizedIban: string | null = null;
  if (!rawIban) {
    issues.push("missing_iban");
  } else if (!isValidIbanFormat(rawIban)) {
    issues.push("invalid_iban_format");
  } else {
    normalizedIban = rawIban.replace(/\s+/g, "").toUpperCase();
  }

  // 3. Basic salary checks
  const rawSalary = input.basicSalary;
  let parsedBasicSalary: number | null = null;
  if (rawSalary === null || rawSalary === undefined || rawSalary === "") {
    issues.push("missing_basic_salary");
  } else {
    const n = typeof rawSalary === "number" ? rawSalary : parseFloat(String(rawSalary));
    if (isNaN(n)) {
      issues.push("missing_basic_salary");
    } else if (n <= 0) {
      issues.push("non_positive_basic_salary");
    } else {
      parsedBasicSalary = n;
    }
  }

  // 4. Employment lifecycle
  if (!input.hireDate) {
    issues.push("missing_hire_date");
  }
  if (!input.employmentType) {
    issues.push("missing_employment_type");
  }

  // Derive status
  let status: WpsStatus;
  if (issues.length === 0) {
    status = "ready";
  } else if (issues.includes("missing_iban") || issues.includes("missing_basic_salary")) {
    status = "missing";
  } else {
    status = "invalid";
  }

  return {
    status,
    issues,
    isReady: issues.length === 0,
    normalizedIban,
    parsedBasicSalary,
  };
}
