/**
 * Pure description of which attendance_audit rows are merged into an operational issue history timeline.
 * Used by {@link loadOperationalIssueHistoryBundle} and unit-tested for merge integrity.
 */
export type OperationalIssueHistoryAuditBranch =
  | { kind: "entity_operational_issue"; operationalIssueRowId: number }
  | { kind: "correction_id"; correctionId: number }
  | { kind: "manual_checkin_request_id"; manualCheckinRequestId: number }
  | { kind: "attendance_record_id"; attendanceRecordId: number };

/**
 * Declares OR-linked audit dimensions for one `attendance_operational_issues` row.
 * Always includes the entity link; optional dimensions mirror server `attendance_audit` columns.
 */
export function describeOperationalIssueHistoryAuditBranches(issue: {
  id: number;
  correctionId: number | null;
  manualCheckinRequestId: number | null;
  attendanceRecordId: number | null;
}): OperationalIssueHistoryAuditBranch[] {
  const branches: OperationalIssueHistoryAuditBranch[] = [
    { kind: "entity_operational_issue", operationalIssueRowId: issue.id },
  ];
  if (issue.correctionId != null) {
    branches.push({ kind: "correction_id", correctionId: issue.correctionId });
  }
  if (issue.manualCheckinRequestId != null) {
    branches.push({
      kind: "manual_checkin_request_id",
      manualCheckinRequestId: issue.manualCheckinRequestId,
    });
  }
  if (issue.attendanceRecordId != null) {
    branches.push({ kind: "attendance_record_id", attendanceRecordId: issue.attendanceRecordId });
  }
  return branches;
}
