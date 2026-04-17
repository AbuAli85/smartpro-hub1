/**
 * shared/financialEngine.ts
 * Pure helpers for the SmartPRO Financial Engine v1.
 * Formula: Revenue − Employee Cost − Platform Overhead = Margin
 *
 * No DB, no side-effects — safe to use in tests, frontend, and server.
 */

export interface FinancialEngineInput {
  /** Total revenue billed to clients (OMR) */
  revenueOmr: number;
  /** Total gross salary cost for all employees in scope (OMR) */
  employeeCostOmr: number;
  /** Platform overhead: licences, admin, ops (OMR) */
  platformOverheadOmr: number;
}

export interface FinancialEngineResult {
  revenueOmr: number;
  employeeCostOmr: number;
  platformOverheadOmr: number;
  /** Gross margin before overhead: Revenue − Employee Cost */
  grossMarginOmr: number;
  /** Net margin after overhead: Revenue − Employee Cost − Platform Overhead */
  netMarginOmr: number;
  /** Gross margin % of revenue (0–100), rounded to 2 dp */
  grossMarginPercent: number;
  /** Net margin % of revenue (0–100), rounded to 2 dp */
  netMarginPercent: number;
  /** Simple health label */
  healthLabel: "profitable" | "break_even" | "loss";
}

/**
 * Compute the SmartPRO P&L margin for a company or period.
 */
export function computeMargin(input: FinancialEngineInput): FinancialEngineResult {
  const { revenueOmr, employeeCostOmr, platformOverheadOmr } = input;

  const grossMarginOmr = revenueOmr - employeeCostOmr;
  const netMarginOmr = grossMarginOmr - platformOverheadOmr;

  const grossMarginPercent =
    revenueOmr > 0 ? Math.round((grossMarginOmr / revenueOmr) * 10000) / 100 : 0;
  const netMarginPercent =
    revenueOmr > 0 ? Math.round((netMarginOmr / revenueOmr) * 10000) / 100 : 0;

  const healthLabel: FinancialEngineResult["healthLabel"] =
    netMarginOmr > 0 ? "profitable" : netMarginOmr === 0 ? "break_even" : "loss";

  return {
    revenueOmr,
    employeeCostOmr,
    platformOverheadOmr,
    grossMarginOmr,
    netMarginOmr,
    grossMarginPercent,
    netMarginPercent,
    healthLabel,
  };
}

/**
 * Aggregate multiple period results into a single summary.
 */
export function aggregateMargins(periods: FinancialEngineResult[]): FinancialEngineResult {
  const totals = periods.reduce(
    (acc, p) => ({
      revenueOmr: acc.revenueOmr + p.revenueOmr,
      employeeCostOmr: acc.employeeCostOmr + p.employeeCostOmr,
      platformOverheadOmr: acc.platformOverheadOmr + p.platformOverheadOmr,
    }),
    { revenueOmr: 0, employeeCostOmr: 0, platformOverheadOmr: 0 },
  );
  return computeMargin(totals);
}

/** Format OMR amount for display (2 decimal places). */
export function formatOmr(amount: number): string {
  return `OMR ${amount.toFixed(2)}`;
}

/** Health badge variant for shadcn Badge component. */
export type MarginBadgeVariant = "default" | "secondary" | "destructive" | "outline";

export function marginBadgeVariant(result: FinancialEngineResult): MarginBadgeVariant {
  if (result.healthLabel === "profitable") return "default";
  if (result.healthLabel === "break_even") return "secondary";
  return "destructive";
}
