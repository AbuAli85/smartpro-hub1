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
    blockers.push("payroll_basis_not_configured");
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

export type BillableUnitInput = {
  billingModel: BillingModel;
  /** Effective overlap days in period (inclusive). */
  overlapDays: number;
  /** Attendance hours (linked sessions) in period — optional. */
  attendanceHours: number | null;
  /** When set, used for fixed_term / per_month heuristics. */
  periodMonthsApprox?: number;
};

/**
 * Computes billable units per model. Assumptions are documented in comments.
 */
export function computeBillableUnits(input: BillableUnitInput): { units: number | null; note: string } {
  const m = input.billingModel;
  if (m == null) return { units: null, note: "no_billing_model" };

  if (m === "per_month") {
    /** Phase 2: one billable unit if any overlap in the billing period. */
    return { units: input.overlapDays > 0 ? 1 : 0, note: "per_month: 1 if any effective overlap in period" };
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
