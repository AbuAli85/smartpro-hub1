/**
 * Stable natural keys for `attendance_operational_issues.issue_key` (company-scoped UNIQUE).
 */
export type OperationalIssueKind =
  | "overdue_checkout"
  | "missed_shift"
  | "correction_pending"
  | "manual_pending";

export type OperationalIssueStatus = "open" | "acknowledged" | "resolved";

export function operationalIssueKey(params: {
  kind: OperationalIssueKind;
  attendanceRecordId?: number;
  scheduleId?: number;
  businessDateYmd?: string;
  correctionId?: number;
  manualCheckinRequestId?: number;
}): string {
  switch (params.kind) {
    case "overdue_checkout": {
      if (params.attendanceRecordId == null) {
        throw new Error("operationalIssueKey(overdue_checkout): attendanceRecordId required");
      }
      return `overdue_checkout:ar:${params.attendanceRecordId}`;
    }
    case "missed_shift": {
      if (params.scheduleId == null || !params.businessDateYmd) {
        throw new Error("operationalIssueKey(missed_shift): scheduleId and businessDateYmd required");
      }
      return `missed_shift:sch:${params.scheduleId}:d:${params.businessDateYmd}`;
    }
    case "correction_pending": {
      if (params.correctionId == null) {
        throw new Error("operationalIssueKey(correction_pending): correctionId required");
      }
      return `correction_pending:cor:${params.correctionId}`;
    }
    case "manual_pending": {
      if (params.manualCheckinRequestId == null) {
        throw new Error("operationalIssueKey(manual_pending): manualCheckinRequestId required");
      }
      return `manual_pending:mcr:${params.manualCheckinRequestId}`;
    }
  }
}
