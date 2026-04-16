/**
 * Phase 3 — single place for staging → execution approval rules (payroll + billing).
 * Blocked rows never finalize without fixing data; warnings require explicit acknowledgment.
 */

import type { StagingReadiness } from "./promoterAssignmentStagingReadiness";

export type ExecutionAcknowledgment = {
  /** Warning keys the reviewer explicitly accepts for this run/invoice. */
  acceptedWarningKeys: string[];
  /** Free-text when policy requires reviewer note (e.g. estimate-only billing). */
  reviewerNote?: string;
};

export type PayrollInclusionResult =
  | { allowed: true }
  | { allowed: false; reason: string };

export type BillingInclusionResult =
  | { allowed: true }
  | { allowed: false; reason: string };

/** Blockers always disqualify a row from execution. */
export function hasHardBlockers(blockers: string[]): boolean {
  return blockers.length > 0;
}

export function canIncludePayrollStagingRow(
  input: {
    readiness: StagingReadiness;
    blockers: string[];
    warnings: string[];
  },
  ack?: ExecutionAcknowledgment | null,
): PayrollInclusionResult {
  if (input.readiness === "blocked" || hasHardBlockers(input.blockers)) {
    return { allowed: false, reason: "Row has blockers — cannot enter a payroll run." };
  }
  if (input.readiness === "not_applicable") {
    return { allowed: false, reason: "Row is not applicable for payroll in this period." };
  }
  if (input.readiness === "warning") {
    const missing = input.warnings.filter((w) => !ack?.acceptedWarningKeys.includes(w));
    if (missing.length > 0) {
      return {
        allowed: false,
        reason: `Warnings require acknowledgment: ${missing.join(", ")}`,
      };
    }
  }
  return { allowed: true };
}

export function canIncludeBillingStagingRow(
  input: {
    readiness: StagingReadiness;
    blockers: string[];
    warnings: string[];
  },
  ack?: ExecutionAcknowledgment | null,
): BillingInclusionResult {
  if (input.readiness === "blocked" || hasHardBlockers(input.blockers)) {
    return { allowed: false, reason: "Row has blockers — cannot be invoiced." };
  }
  if (input.readiness === "not_applicable") {
    return { allowed: false, reason: "Row is not billable in this period." };
  }
  const estimateOrProration = input.warnings.filter(
    (w) => w === "monthly_estimate_only" || w === "monthly_proration_sensitive",
  );
  if (estimateOrProration.length > 0) {
    const covered = estimateOrProration.every((w) => ack?.acceptedWarningKeys.includes(w));
    if (!covered) {
      return {
        allowed: false,
        reason: `Estimate/proration-sensitive warnings must be acknowledged: ${estimateOrProration.join(", ")}`,
      };
    }
    if (!ack?.reviewerNote?.trim()) {
      return {
        allowed: false,
        reason: "Provide a short reviewer note when accepting estimate-only or proration-sensitive billing rows.",
      };
    }
  }
  if (input.readiness === "warning") {
    const missing = input.warnings.filter((w) => !ack?.acceptedWarningKeys.includes(w));
    if (missing.length > 0) {
      return { allowed: false, reason: `Warnings require acknowledgment: ${missing.join(", ")}` };
    }
  }
  return { allowed: true };
}

export function canApprovePayrollRun(
  status: string,
  opts: { hasUnackedWarningsInSnapshot: boolean },
): { allowed: boolean; reason?: string } {
  if (status !== "review_ready" && status !== "draft") {
    return { allowed: false, reason: "Run is not in a state that can be approved." };
  }
  if (opts.hasUnackedWarningsInSnapshot) {
    return { allowed: false, reason: "Warning acknowledgments are incomplete." };
  }
  return { allowed: true };
}
