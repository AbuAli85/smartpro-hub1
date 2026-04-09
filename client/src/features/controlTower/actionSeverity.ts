import type { ActionKind, ActionSeverity } from "./actionQueueTypes";

/**
 * Input for canonical severity — always route server hints through this policy.
 */
export type ActionSeverityInput = {
  kind: ActionKind;
  /** True when work cannot legally or operationally proceed without resolution */
  blocking?: boolean;
  /** Raw server severity from operations queue (informational only; policy wins) */
  serverSeverity?: "critical" | "high" | "medium" | "low";
  lifecycle?: "expired" | "overdue" | "due_soon" | "pending" | "info";
};

/**
 * Single source of truth for action severity classification.
 */
export function getActionSeverity(input: ActionSeverityInput): ActionSeverity {
  const { kind, blocking, lifecycle, serverSeverity } = input;

  // Hard HIGH — blocking operational / regulatory
  if (kind === "permit_expired") return "high";
  if (kind === "government_case_overdue") return "high";
  if (kind === "compliance_failure") return "high";
  if (kind === "document_expiry" && lifecycle === "expired") return "high";
  if (kind === "payroll_blocker" && blocking) return "high";
  if (serverSeverity === "critical") return "high";

  // MEDIUM — time-bound or signature / approval work
  if (kind === "permit_expiring" || lifecycle === "due_soon") return "medium";
  if (kind === "contract_signature_pending") return "medium";
  if (kind === "leave_approval_pending") return "medium";
  if (kind === "attendance_exception") return "medium";
  if (kind === "document_expiry" && lifecycle !== "expired") return "medium";
  if (kind === "task_overdue") return "medium";
  if (kind === "payroll_blocker" && !blocking) return "medium";
  if (serverSeverity === "high" || serverSeverity === "medium") return "medium";

  // LOW — hygiene / informational
  if (kind === "generic_attention") return "low";
  if (serverSeverity === "low") return "low";
  return "low";
}
