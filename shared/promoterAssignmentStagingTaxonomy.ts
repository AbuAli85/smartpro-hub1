/**
 * Stable keys for staging blockers, warnings, and audit payloads (Phase 2.5).
 * Use these instead of ad hoc strings across server + UI.
 */

export const STAGING_BLOCKERS = [
  "missing_payroll_basis",
  "missing_billing_rate",
  "missing_billing_model",
  "missing_rate_source",
  "rate_source_requires_rate",
  "no_effective_overlap_in_period",
  "no_billable_overlap",
  "draft_assignment",
  "suspended_assignment",
  "billable_units_unresolved",
  "billable_amount_unresolved",
  "commercial_rule_incomplete",
  "attendance_unresolved",
  "site_mismatch",
  "future_assignment",
  "invalid_date_range",
] as const;

export type StagingBlockerKey = (typeof STAGING_BLOCKERS)[number];

export const STAGING_WARNINGS = [
  "monthly_proration_sensitive",
  "monthly_estimate_only",
  "low_attendance_vs_overlap",
  "commercial_rule_incomplete",
  "cms_sync_skipped_nonblocking",
] as const;

export type StagingWarningKey = (typeof STAGING_WARNINGS)[number];

/** Map legacy / internal strings to taxonomy keys where applicable. */
export function normalizeStagingKey(k: string): string {
  if (k === "payroll_basis_not_configured") return "missing_payroll_basis";
  return k;
}
