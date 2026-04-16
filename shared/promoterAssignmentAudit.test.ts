import { describe, expect, it } from "vitest";
import { buildPromoterAssignmentAuditPayload } from "./promoterAssignmentAudit";

describe("buildPromoterAssignmentAuditPayload", () => {
  it("produces a stable JSON shape for status changes", () => {
    const j = buildPromoterAssignmentAuditPayload({
      assignmentId: "a1",
      companyId: 10,
      employeeId: 20,
      clientCompanyId: 30,
      siteId: 40,
      employerCompanyId: 50,
      eventType: "assignment_status_changed",
      change: { field: "assignmentStatus", from: "draft", to: "active" },
      meta: { billingModel: "per_month" },
    });
    expect(j).toEqual({
      assignmentId: "a1",
      companyId: 10,
      employeeId: 20,
      clientCompanyId: 30,
      siteId: 40,
      employerCompanyId: 50,
      eventType: "assignment_status_changed",
      change: { field: "assignmentStatus", from: "draft", to: "active" },
      meta: { billingModel: "per_month" },
    });
  });
});
