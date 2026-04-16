/**
 * Structural / operational health signals for promoter assignments.
 * Reusable on server list responses and UI badges.
 */

import type { AssignmentStatus } from "./promoterAssignmentLifecycle";

export const PROMOTER_ASSIGNMENT_HEALTH_FLAGS = [
  "missing_site",
  "missing_supervisor",
  "missing_billing_rate",
  "active_without_rate_source",
  "suspended_without_reason",
  "invalid_date_range",
  "terminal_without_end_date",
  "cms_sync_skipped_or_blocked",
  "contract_target_unknown",
] as const;

export type PromoterAssignmentHealthFlag = (typeof PROMOTER_ASSIGNMENT_HEALTH_FLAGS)[number];

export type AssignmentLikeForHealth = {
  assignmentStatus: AssignmentStatus;
  startDate: Date | string;
  endDate: Date | string | null;
  clientSiteId: number | null;
  supervisorUserId: number | null;
  billingRate: string | null | undefined;
  rateSource: string | null | undefined;
  suspensionReason: string | null | undefined;
  terminationReason: string | null | undefined;
  cmsSyncState: string | null | undefined;
};

export type HealthEvaluationOptions = {
  /** When true, flag active rows with rate_source implying an external contract rate but no numeric rate. */
  strictRateSource?: boolean;
  /** Brand has no required-headcount target from contracts (coverage layer). */
  brandHasContractTarget?: boolean | null;
  referenceDate?: Date | string;
};

export function evaluatePromoterAssignmentHealth(
  a: AssignmentLikeForHealth,
  options: HealthEvaluationOptions = {},
): PromoterAssignmentHealthFlag[] {
  const flags: PromoterAssignmentHealthFlag[] = [];
  const ref = options.referenceDate ?? new Date();

  const start = typeof a.startDate === "string" ? a.startDate.slice(0, 10) : a.startDate.toISOString().slice(0, 10);
  const end =
    a.endDate == null
      ? null
      : typeof a.endDate === "string"
        ? a.endDate.slice(0, 10)
        : a.endDate.toISOString().slice(0, 10);

  if (end != null && end < start) {
    flags.push("invalid_date_range");
  }

  if (a.clientSiteId == null) {
    flags.push("missing_site");
  }
  if (a.supervisorUserId == null) {
    flags.push("missing_supervisor");
  }

  if (a.assignmentStatus === "active") {
    const rate = a.billingRate != null && String(a.billingRate).trim() !== "";
    if (!rate) {
      flags.push("missing_billing_rate");
    }
    if (
      options.strictRateSource &&
      (a.rateSource === "contract_default" || a.rateSource === "client_default") &&
      !rate
    ) {
      flags.push("active_without_rate_source");
    }
  }

  if (a.assignmentStatus === "suspended" && !(a.suspensionReason?.trim())) {
    flags.push("suspended_without_reason");
  }

  if (
    (a.assignmentStatus === "completed" || a.assignmentStatus === "terminated") &&
    a.endDate == null
  ) {
    flags.push("terminal_without_end_date");
  }

  const sync = a.cmsSyncState ?? "";
  if (sync === "skipped" || sync === "failed") {
    flags.push("cms_sync_skipped_or_blocked");
  }

  if (options.brandHasContractTarget === false) {
    flags.push("contract_target_unknown");
  }

  return flags;
}

export function assignmentNeedsAttention(flags: PromoterAssignmentHealthFlag[]): boolean {
  return flags.length > 0;
}
