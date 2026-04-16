/**
 * Commercial field validation for promoter assignments — severity: warning vs blocker (Phase 2.5).
 */

import type { BillingModel, RateSource } from "./promoterAssignmentCommercialResolution";

export type CommercialValidationSeverity = "warning" | "blocker";

export type CommercialValidationIssue = {
  key: string;
  severity: CommercialValidationSeverity;
};

export type CommercialValidationResult = {
  issues: CommercialValidationIssue[];
  blockers: string[];
  warnings: string[];
};

export function validatePromoterAssignmentCommercial(input: {
  assignmentStatus: string;
  billingModel: BillingModel;
  billingRate: string | null;
  currencyCode: string | null;
  rateSource: RateSource;
  expectBilling: boolean;
}): CommercialValidationResult {
  const issues: CommercialValidationIssue[] = [];

  if (input.expectBilling && input.billingModel == null) {
    issues.push({ key: "missing_billing_model", severity: "blocker" });
  }

  const rateStr = input.billingRate != null ? String(input.billingRate).trim() : "";
  const rateNum = Number(rateStr);
  const hasRate = rateStr !== "" && !Number.isNaN(rateNum) && rateNum > 0;

  if (input.expectBilling && input.assignmentStatus === "active" && !hasRate) {
    issues.push({ key: "missing_billing_rate", severity: "blocker" });
  }

  if (input.expectBilling && (rateStr !== "" && (Number.isNaN(rateNum) || rateNum < 0))) {
    issues.push({ key: "invalid_billing_rate", severity: "blocker" });
  }

  if (!input.currencyCode?.trim()) {
    issues.push({ key: "missing_currency", severity: "warning" });
  }

  if (
    input.expectBilling &&
    (input.rateSource === "contract_default" || input.rateSource === "client_default") &&
    !hasRate
  ) {
    issues.push({ key: "missing_rate_source", severity: "blocker" });
  }

  if (input.billingModel === "per_hour" && input.expectBilling) {
    issues.push({
      key: "per_hour_requires_attendance_units",
      severity: "warning",
    });
  }

  const blockers = issues.filter((i) => i.severity === "blocker").map((i) => i.key);
  const warnings = issues.filter((i) => i.severity === "warning").map((i) => i.key);

  return { issues, blockers, warnings };
}
