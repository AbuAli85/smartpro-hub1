/**
 * Centralized commercial / billing resolution for promoter assignments.
 *
 * Precedence for **client bill rate** (matches Phase 1.5 assignment fields):
 * 1. assignment_override — explicit `billing_rate` on assignment when present
 * 2. contract_default — `rate_source` indicates contract; rate must be present on assignment row (contract mirror is informational)
 * 3. client_default — same, expects `billing_rate` populated from client rules upstream
 *
 * Payroll compensation is **not** the billing rate. Phase 2 exposes `payrollBasis` placeholder
 * (employee salary snapshot) when available; otherwise null + blocker downstream.
 */

import type { AssignmentStatus } from "./promoterAssignmentLifecycle";

export type BillingModel = "per_month" | "per_day" | "per_hour" | "fixed_term" | null;

export type RateSource = "assignment_override" | "contract_default" | "client_default" | null;

export type CommercialResolutionInput = {
  assignmentStatus: AssignmentStatus;
  billingModel: BillingModel;
  billingRate: string | null;
  currencyCode: string | null;
  rateSource: RateSource;
  /** Employee monthly salary (optional) — payroll placeholder, not a bill rate. */
  employeeSalary: string | null;
};

export type CommercialResolution = {
  billingRate: string | null;
  billingModel: BillingModel;
  currencyCode: string;
  rateSource: RateSource;
  /** Which precedence path was used for billing rate. */
  billingRatePath: "assignment_explicit" | "inferred_from_rate_source" | "missing";
  /** Payroll-side basis — Phase 2 placeholder; not used for client invoicing. */
  payrollBasisAmount: string | null;
  payrollBasisNote: string | null;
  blockers: string[];
};

export function resolvePromoterAssignmentCommercial(
  input: CommercialResolutionInput,
  options?: { intent?: "payroll" | "billing" },
): CommercialResolution {
  const blockers: string[] = [];
  const currency = input.currencyCode?.trim() || "OMR";

  const rateStr = input.billingRate != null ? String(input.billingRate).trim() : "";
  const hasNumericRate = rateStr !== "" && !Number.isNaN(Number(rateStr)) && Number(rateStr) >= 0;

  const billingIntent = options?.intent ?? "billing";

  let billingRatePath: CommercialResolution["billingRatePath"] = "missing";
  if (hasNumericRate) {
    billingRatePath = input.rateSource === "assignment_override" ? "assignment_explicit" : "inferred_from_rate_source";
  } else {
    if (
      billingIntent === "billing" &&
      (input.rateSource === "contract_default" || input.rateSource === "client_default")
    ) {
      blockers.push("rate_source_requires_rate");
    }
    if (billingIntent === "billing" && input.assignmentStatus === "active" && !hasNumericRate) {
      blockers.push("missing_billing_rate");
    }
  }

  let payrollBasisAmount: string | null = null;
  let payrollBasisNote: string | null = null;
  if (input.employeeSalary != null && String(input.employeeSalary).trim() !== "") {
    payrollBasisAmount = String(input.employeeSalary);
    payrollBasisNote = "employee.salary (placeholder — not final payroll engine)";
  } else {
    payrollBasisNote = "employee.salary not available — payroll cost not resolved";
    blockers.push("missing_payroll_basis");
  }

  return {
    billingRate: hasNumericRate ? rateStr : null,
    billingModel: input.billingModel,
    currencyCode: currency,
    rateSource: input.rateSource,
    billingRatePath,
    payrollBasisAmount,
    payrollBasisNote,
    blockers,
  };
}

/** Phase 2.5: monthly client billing recognition mode. */
export type MonthlyBillingMode = "flat_if_any_overlap" | "prorated_by_calendar_days";

export type BillableUnitInput = {
  billingModel: BillingModel;
  /** Effective overlap days in period (inclusive). */
  overlapDays: number;
  /** Attendance hours (linked sessions) in period — optional. */
  attendanceHours: number | null;
  /** When set, used for fixed_term / per_month heuristics. */
  periodMonthsApprox?: number;
  /** Period bounds for monthly proration (YYYY-MM-DD). */
  periodStartYmd?: string;
  periodEndYmd?: string;
  /** Defaults to flat_if_any_overlap. */
  monthlyMode?: MonthlyBillingMode;
};

/**
 * Calendar days inclusive between two YYYY-MM-DD strings.
 */
export function countPeriodCalendarDays(periodStartYmd: string, periodEndYmd: string): number {
  const s = new Date(`${periodStartYmd.slice(0, 10)}T12:00:00Z`).getTime();
  const e = new Date(`${periodEndYmd.slice(0, 10)}T12:00:00Z`).getTime();
  return Math.floor((e - s) / 86400000) + 1;
}

/**
 * Under `flat_if_any_overlap`, monthly amount is estimate-only if overlap does not cover full billing period.
 */
export function isMonthlyProrationSensitive(
  mode: MonthlyBillingMode,
  overlap: { overlapStart: string; overlapEnd: string } | null,
  periodStartYmd: string,
  periodEndYmd: string,
): boolean {
  if (!overlap) return false;
  if (mode === "prorated_by_calendar_days") return false;
  const ps = periodStartYmd.slice(0, 10);
  const pe = periodEndYmd.slice(0, 10);
  return overlap.overlapStart > ps || overlap.overlapEnd < pe;
}

/**
 * Computes billable units per model. Assumptions are documented in comments.
 */
export function computeBillableUnits(input: BillableUnitInput): { units: number | null; note: string } {
  const m = input.billingModel;
  if (m == null) return { units: null, note: "no_billing_model" };

  if (m === "per_month") {
    const mode = input.monthlyMode ?? "flat_if_any_overlap";
    if (input.overlapDays <= 0) return { units: 0, note: "per_month: no overlap" };
    if (mode === "flat_if_any_overlap") {
      return { units: 1, note: "per_month flat_if_any_overlap: 1 unit if any overlap" };
    }
    /** Prorate: overlap days / period days (fractional unit for staging — not rounded money). */
    const pStart = input.periodStartYmd?.slice(0, 10);
    const pEnd = input.periodEndYmd?.slice(0, 10);
    if (!pStart || !pEnd) {
      return { units: 1, note: "per_month prorated: fallback 1 (period bounds missing)" };
    }
    const periodDays = countPeriodCalendarDays(pStart, pEnd);
    if (periodDays <= 0) return { units: null, note: "per_month: invalid period" };
    const frac = input.overlapDays / periodDays;
    return {
      units: Math.round(frac * 10000) / 10000,
      note: "per_month prorated_by_calendar_days: overlapDays/periodDays",
    };
  }
  if (m === "per_day") {
    /** Billable days = effective overlap days (assignment truth); attendance reconciliation is separate. */
    return { units: input.overlapDays, note: "per_day: overlap calendar days" };
  }
  if (m === "per_hour") {
    if (input.attendanceHours == null) {
      return { units: null, note: "per_hour: requires attendance hours" };
    }
    return { units: input.attendanceHours, note: "per_hour: sum linked session hours" };
  }
  if (m === "fixed_term") {
    /** Single fee per period if overlap exists. */
    return { units: input.overlapDays > 0 ? 1 : 0, note: "fixed_term: 1 if overlap in period" };
  }
  return { units: null, note: "unknown_model" };
}
