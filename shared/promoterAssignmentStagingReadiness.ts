/**
 * Payroll / billing staging readiness — centralized rules (Phase 2.5).
 */

import { normalizeStagingKey } from "./promoterAssignmentStagingTaxonomy";

export type StagingReadiness = "ready" | "warning" | "blocked" | "not_applicable";

export type ReadinessInput = {
  blockers: string[];
  warnings: string[];
};

/**
 * - **blocked** if any blocker exists.
 * - **warning** if no blockers but warnings exist.
 * - **ready** if neither.
 * - **not_applicable** if explicitly marked (caller passes blockers including `not_applicable`).
 */
export function evaluateStagingReadiness(input: ReadinessInput): StagingReadiness {
  const blockers = input.blockers.map(normalizeStagingKey);
  const warnings = input.warnings.map(normalizeStagingKey);

  if (blockers.some((b) => b === "not_applicable")) return "not_applicable";
  if (blockers.length > 0) return "blocked";
  if (warnings.length > 0) return "warning";
  return "ready";
}

export function evaluatePayrollStagingReadiness(input: {
  blockers: string[];
  warnings: string[];
}): StagingReadiness {
  return evaluateStagingReadiness(input);
}

export function evaluateBillingStagingReadiness(input: {
  blockers: string[];
  warnings: string[];
}): StagingReadiness {
  return evaluateStagingReadiness(input);
}
