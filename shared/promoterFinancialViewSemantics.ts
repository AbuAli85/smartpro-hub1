/**
 * Phase 3.5 — labels and definitions for forecast vs executed financial views.
 */

export type PromoterFinancialViewLabel = "forecast" | "executed" | "mixed" | "incomplete";

export const VIEW_COPY = {
  forecastPayroll:
    "Payroll cost from staging: prorated salary accrual per assignment row where readiness is not blocked.",
  forecastBilling: "Revenue from billing staging: billable amounts where readiness is not blocked (provisional).",
  executedPayroll:
    "Payroll cost from promoter payroll runs in approved / exported / paid state overlapping the period (frozen lines).",
  issuedBilling: "Revenue from promoter invoices in issued / sent / partially_paid / paid overlapping the period.",
  forecastMargin: "Forecast revenue minus forecast payroll cost (staging only — not realized).",
  executedMargin: "Executed revenue minus executed payroll cost (finalized slices only).",
  mixed:
    "Some components are forecast and some executed; compare tabs separately — do not sum across modes blindly.",
  incomplete:
    "Part of the period has no finalized payroll and/or no issued invoices; executed totals may understate reality.",
} as const;

export function profitabilityViewLabel(input: {
  forecastReady: boolean;
  executedReady: boolean;
}): PromoterFinancialViewLabel {
  if (input.forecastReady && input.executedReady) return "mixed";
  if (input.executedReady) return "executed";
  if (input.forecastReady) return "forecast";
  return "incomplete";
}
