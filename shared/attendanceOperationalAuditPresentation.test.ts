import { describe, expect, it } from "vitest";
import { ATTENDANCE_AUDIT_ACTION } from "./attendanceAuditTaxonomy";
import { formatOperationalIssueHistoryAuditActionLabel } from "./attendanceOperationalAuditPresentation";

describe("formatOperationalIssueHistoryAuditActionLabel", () => {
  it("uses shared triage labels for operational audit actions", () => {
    expect(formatOperationalIssueHistoryAuditActionLabel(ATTENDANCE_AUDIT_ACTION.OPERATIONAL_ISSUE_ASSIGN)).toContain(
      "assigned",
    );
    expect(formatOperationalIssueHistoryAuditActionLabel(ATTENDANCE_AUDIT_ACTION.OPERATIONAL_ISSUE_ACKNOWLEDGE)).toContain(
      "acknowledged",
    );
  });

  it("falls back to spaced snake_case for other actions", () => {
    expect(formatOperationalIssueHistoryAuditActionLabel("correction_approve")).toBe("correction approve");
  });
});
