import { describe, expect, it } from "vitest";
import { describeOperationalIssueHistoryAuditBranches } from "./attendanceOperationalIssueHistoryLinks";

describe("describeOperationalIssueHistoryAuditBranches", () => {
  it("always includes the entity link and optional correction/manual/record dimensions", () => {
    expect(
      describeOperationalIssueHistoryAuditBranches({
        id: 42,
        correctionId: null,
        manualCheckinRequestId: null,
        attendanceRecordId: null,
      }),
    ).toEqual([{ kind: "entity_operational_issue", operationalIssueRowId: 42 }]);

    expect(
      describeOperationalIssueHistoryAuditBranches({
        id: 7,
        correctionId: 100,
        manualCheckinRequestId: null,
        attendanceRecordId: 55,
      }),
    ).toEqual([
      { kind: "entity_operational_issue", operationalIssueRowId: 7 },
      { kind: "correction_id", correctionId: 100 },
      { kind: "attendance_record_id", attendanceRecordId: 55 },
    ]);

    expect(
      describeOperationalIssueHistoryAuditBranches({
        id: 1,
        correctionId: null,
        manualCheckinRequestId: 9,
        attendanceRecordId: null,
      }),
    ).toEqual([
      { kind: "entity_operational_issue", operationalIssueRowId: 1 },
      { kind: "manual_checkin_request_id", manualCheckinRequestId: 9 },
    ]);
  });
});
