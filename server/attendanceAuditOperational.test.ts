import { describe, expect, it } from "vitest";
import { ATTENDANCE_AUDIT_ACTION } from "@shared/attendanceAuditTaxonomy";
import {
  mapOperationalSubActionToAuditAction,
  operationalIssueKindToIssueKeyLikePattern,
  OPERATIONAL_TRIAGE_AUDIT_ACTIONS,
  resolveOperationalAuditLensFilter,
} from "./attendanceAuditOperational";

describe("attendanceAuditOperational", () => {
  it("maps sub-actions to stable audit action types", () => {
    expect(mapOperationalSubActionToAuditAction("acknowledge")).toBe(
      ATTENDANCE_AUDIT_ACTION.OPERATIONAL_ISSUE_ACKNOWLEDGE,
    );
    expect(mapOperationalSubActionToAuditAction("resolve")).toBe(
      ATTENDANCE_AUDIT_ACTION.OPERATIONAL_ISSUE_RESOLVE,
    );
    expect(mapOperationalSubActionToAuditAction("assign")).toBe(
      ATTENDANCE_AUDIT_ACTION.OPERATIONAL_ISSUE_ASSIGN,
    );
  });

  it("lists exactly the three triage audit actions", () => {
    expect(new Set(OPERATIONAL_TRIAGE_AUDIT_ACTIONS)).toEqual(
      new Set([
        ATTENDANCE_AUDIT_ACTION.OPERATIONAL_ISSUE_ACKNOWLEDGE,
        ATTENDANCE_AUDIT_ACTION.OPERATIONAL_ISSUE_RESOLVE,
        ATTENDANCE_AUDIT_ACTION.OPERATIONAL_ISSUE_ASSIGN,
      ]),
    );
  });

  it("maps issue kind filters to issueKey LIKE prefixes", () => {
    expect(operationalIssueKindToIssueKeyLikePattern("overdue_checkout")).toBe("overdue_checkout:%");
    expect(operationalIssueKindToIssueKeyLikePattern("manual_pending")).toBe("manual_pending:%");
  });

  it("resolveOperationalAuditLensFilter matches listAttendanceAudit operational behavior", () => {
    expect(resolveOperationalAuditLensFilter({ auditLens: "operational", operationalAction: "all" })).toEqual({
      kind: "operational_all",
    });
    expect(
      resolveOperationalAuditLensFilter({ auditLens: "operational", operationalAction: "assign" }),
    ).toEqual({
      kind: "operational_one",
      action: ATTENDANCE_AUDIT_ACTION.OPERATIONAL_ISSUE_ASSIGN,
    });
    expect(
      resolveOperationalAuditLensFilter({ auditLens: "all", actionType: ATTENDANCE_AUDIT_ACTION.FORCE_CHECKOUT }),
    ).toEqual({
      kind: "generic",
      action: ATTENDANCE_AUDIT_ACTION.FORCE_CHECKOUT,
    });
    expect(resolveOperationalAuditLensFilter({ auditLens: "all" })).toEqual({ kind: "none" });
  });
});
