import { ATTENDANCE_AUDIT_ACTION } from "./attendanceAuditTaxonomy";

/** Human labels for operational triage audit rows (single source for HR audit table + issue history sheet). */
export const OPERATIONAL_TRIAGE_AUDIT_LABELS: Partial<Record<string, string>> = {
  [ATTENDANCE_AUDIT_ACTION.OPERATIONAL_ISSUE_ACKNOWLEDGE]: "Operational triage · acknowledged",
  [ATTENDANCE_AUDIT_ACTION.OPERATIONAL_ISSUE_RESOLVE]: "Operational triage · resolved",
  [ATTENDANCE_AUDIT_ACTION.OPERATIONAL_ISSUE_ASSIGN]: "Operational triage · assigned",
};

/** Badge / timeline label for any `attendance_audit.action_type` (prefers triage map, then spaced snake_case). */
export function formatOperationalIssueHistoryAuditActionLabel(actionType: string): string {
  if (OPERATIONAL_TRIAGE_AUDIT_LABELS[actionType]) return OPERATIONAL_TRIAGE_AUDIT_LABELS[actionType]!;
  return actionType.replace(/_/g, " ");
}
