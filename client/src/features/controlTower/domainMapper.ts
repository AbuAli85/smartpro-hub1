import type { ActionQueueItem } from "./actionQueueTypes";
import type { ControlTowerDomain } from "./domainNarrativeTypes";

/**
 * Single canonical mapping from queue row → business domain (deterministic).
 */
export function getControlTowerDomain(item: ActionQueueItem): ControlTowerDomain {
  const { kind, source } = item;

  if (kind === "payroll_blocker" || source === "payroll") return "payroll";

  if (kind === "contract_signature_pending" || source === "contracts") return "contracts";

  if (
    kind === "permit_expired" ||
    kind === "permit_expiring" ||
    kind === "government_case_overdue" ||
    source === "workforce"
  ) {
    return "workforce";
  }

  if (kind === "leave_approval_pending" || kind === "attendance_exception" || source === "hr") {
    return "hr";
  }

  if (kind === "compliance_failure" || kind === "document_expiry" || source === "compliance") {
    return "compliance";
  }

  if (source === "operations") return "operations";

  if (source === "system") return "general";

  if (kind === "task_overdue" || kind === "generic_attention") {
    return "general";
  }

  return "general";
}

export const DOMAIN_ORDER: ControlTowerDomain[] = [
  "payroll",
  "workforce",
  "contracts",
  "hr",
  "compliance",
  "operations",
  "general",
];
