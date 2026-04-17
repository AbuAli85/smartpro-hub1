/**
 * shared/omanization.ts
 * Pure helpers for Omanization compliance rate calculation.
 * No DB, no side-effects — safe to use in tests, frontend, and server.
 */

export interface OmanizationInput {
  /** Total number of active employees in the company */
  totalActive: number;
  /** Number of active employees whose nationality is "OM" or "Omani" (case-insensitive) */
  omaniCount: number;
}

export interface OmanizationResult {
  totalActive: number;
  omaniCount: number;
  nonOmaniCount: number;
  /** Omanization rate as a percentage (0–100), rounded to 2 decimal places */
  ratePercent: number;
  /** Target rate from Oman Labour Law (varies by sector; default 35% for general commercial) */
  targetPercent: number;
  /** Whether the company meets the target */
  meetsTarget: boolean;
  /** Shortfall headcount needed to reach target (0 if already meeting) */
  shortfallHeadcount: number;
}

/** Default Omanization target for general commercial sector (Ministerial Decision 1/2017) */
export const DEFAULT_OMANIZATION_TARGET_PERCENT = 35;

/**
 * Compute Omanization compliance metrics for a company.
 * @param input - Employee counts
 * @param targetPercent - Override the default target (e.g. 60 for oil & gas)
 */
export function computeOmanizationRate(
  input: OmanizationInput,
  targetPercent = DEFAULT_OMANIZATION_TARGET_PERCENT,
): OmanizationResult {
  const { totalActive, omaniCount } = input;
  const nonOmaniCount = Math.max(0, totalActive - omaniCount);
  const ratePercent = totalActive > 0 ? Math.round((omaniCount / totalActive) * 10000) / 100 : 0;
  const meetsTarget = ratePercent >= targetPercent;

  // Minimum Omani headcount needed = ceil(target% * total)
  const requiredOmani = Math.ceil((targetPercent / 100) * totalActive);
  const shortfallHeadcount = Math.max(0, requiredOmani - omaniCount);

  return {
    totalActive,
    omaniCount,
    nonOmaniCount,
    ratePercent,
    targetPercent,
    meetsTarget,
    shortfallHeadcount,
  };
}

/**
 * Normalise a nationality string to a canonical ISO-3166-1 alpha-2 code or
 * a known label for Oman detection.
 * Returns `true` if the value represents an Omani national.
 */
export function isOmaniNationality(nationality: string | null | undefined): boolean {
  if (!nationality) return false;
  const n = nationality.trim().toLowerCase();
  return n === "om" || n === "omani" || n === "oman" || n === "عماني" || n === "عمان";
}

/**
 * Compliance badge label for display in the UI.
 */
export function omanizationBadgeLabel(result: OmanizationResult): string {
  if (result.totalActive === 0) return "No Employees";
  if (result.meetsTarget) return `Compliant (${result.ratePercent}%)`;
  return `Non-Compliant (${result.ratePercent}% / ${result.targetPercent}% target)`;
}

/**
 * Compliance badge variant for shadcn Badge component.
 */
export type OmanizationBadgeVariant = "default" | "secondary" | "destructive" | "outline";

export function omanizationBadgeVariant(result: OmanizationResult): OmanizationBadgeVariant {
  if (result.totalActive === 0) return "outline";
  if (result.meetsTarget) return "default";
  if (result.ratePercent >= result.targetPercent * 0.8) return "secondary"; // within 20% of target
  return "destructive";
}
