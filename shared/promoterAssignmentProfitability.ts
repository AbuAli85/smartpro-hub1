/**
 * Phase 3 — profitability views: forecast (staging) vs executed (runs/invoices).
 *
 * Allocation rule (initial, documented):
 * - **Payroll cost** for promoter execution lines is stored per assignment on the payroll run line
 *   (`accrued_pay_omr` frozen at run creation). No cross-assignment split of a single employee salary
 *   beyond what staging already implied per assignment row.
 * - **Revenue** uses frozen invoice line totals per assignment.
 * - If an employee appears on multiple assignment lines, each line carries its own accrual; summed
 *   by assignment / brand / site — this may double-count employee cost if salary were shared incorrectly
 *   upstream; Phase 2 staging is assignment-granular by design.
 */

import { countPeriodCalendarDays } from "./promoterAssignmentCommercialResolution";

export type FinancialViewMode = "forecast" | "executed" | "mixed";

export function classifyProfitabilityView(input: {
  hasForecastComponents: boolean;
  hasExecutedComponents: boolean;
}): FinancialViewMode {
  if (input.hasForecastComponents && input.hasExecutedComponents) return "mixed";
  if (input.hasExecutedComponents) return "executed";
  return "forecast";
}

/**
 * Prorate monthly salary across the selected period using overlap vs period calendar days.
 * Documented limitation: uses calendar days, not working days.
 */
export function computePromoterPayrollAccrualOmr(params: {
  monthlySalaryOmr: number;
  periodStartYmd: string;
  periodEndYmd: string;
  overlapDays: number;
}): number {
  const pd = countPeriodCalendarDays(params.periodStartYmd, params.periodEndYmd);
  if (pd <= 0 || params.overlapDays <= 0) return 0;
  return Math.round(params.monthlySalaryOmr * (params.overlapDays / pd) * 1000) / 1000;
}
