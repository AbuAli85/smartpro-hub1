/**
 * Canonical Control Tower action queue model — shared across hook, page, and notification UI.
 */

export type ActionSeverity = "high" | "medium" | "low";

export type ActionKind =
  | "payroll_blocker"
  | "permit_expired"
  | "permit_expiring"
  | "government_case_overdue"
  | "contract_signature_pending"
  | "leave_approval_pending"
  | "document_expiry"
  | "compliance_failure"
  | "attendance_exception"
  | "task_overdue"
  | "generic_attention";

export type ActionSource =
  | "payroll"
  | "workforce"
  | "contracts"
  | "hr"
  | "operations"
  | "compliance"
  | "system";

export interface ActionQueueItem {
  id: string;
  kind: ActionKind;
  title: string;
  reason?: string;
  severity: ActionSeverity;
  blocking: boolean;
  source: ActionSource;
  href: string;
  ctaLabel: string;
  ownerLabel?: string | null;
  dueAt?: string | null;
  /** Populated when this row represents a grouped aggregate */
  count?: number;
  /** Stable key for grouping homogeneous items (e.g. permit_expired) */
  groupKey?: string | null;
}

export type ActionQueueStatus = "ready" | "all_clear" | "no_urgent_blockers" | "partial" | "error";
