import { describe, expect, it } from "vitest";
import { buildRoleExecutionView, mapMemberRoleToExecutionPersona } from "./roleExecutionSummary";

const baseInput = {
  decisionsOpen: 1,
  collectionQueueCount: 2,
  agedReceivablesOmr: 100,
  contractsPendingSignature: 0,
  renewalWorkflowsFailed: 0,
  slaBreaches: 0,
  openProServices: 3,
  proOverdueCount: 1,
  subscriptionOverdueCount: 0,
  employeeTasksOverdue: 0,
  employeeTasksBlocked: 0,
  pendingLeaveCount: 2,
  pendingExpenseCount: 1,
};

describe("mapMemberRoleToExecutionPersona", () => {
  it("maps workspace roles to personas", () => {
    expect(mapMemberRoleToExecutionPersona("company_admin")).toBe("owner_admin");
    expect(mapMemberRoleToExecutionPersona("finance_admin")).toBe("finance");
    expect(mapMemberRoleToExecutionPersona("external_auditor")).toBe("read_only");
  });
});

describe("buildRoleExecutionView", () => {
  it("produces read-only headline for auditors", () => {
    const v = buildRoleExecutionView({ ...baseInput, memberRole: "external_auditor" });
    expect(v.persona).toBe("read_only");
    expect(v.quickMetrics.length).toBeGreaterThan(0);
  });

  it("emphasises finance metrics for finance_admin", () => {
    const v = buildRoleExecutionView({ ...baseInput, memberRole: "finance_admin" });
    expect(v.persona).toBe("finance");
    expect(v.quickMetrics.some((m) => String(m.label).includes("PRO overdue"))).toBe(true);
  });
});
