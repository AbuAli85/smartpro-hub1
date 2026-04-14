import { describe, expect, it, vi } from "vitest";
import { auditEvents } from "../drizzle/schema";
import {
  recordContractStatusUpdatedAudit,
  recordInviteRevokedAudit,
  recordMemberRoleChangedAudit,
  recordPayrollRunApprovedAudit,
  TENANT_GOVERNANCE_ACTION,
  TENANT_GOVERNANCE_ENTITY,
} from "./tenantGovernanceAudit";

function mockDb() {
  const values = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values }));
  return { insert, values };
}

describe("tenantGovernanceAudit", () => {
  it("recordMemberRoleChangedAudit writes company_member / member_role_changed including platformOperator", async () => {
    const db = mockDb();
    await recordMemberRoleChangedAudit(db as never, {
      companyId: 10,
      actorUserId: 1,
      memberRowId: 55,
      targetUserId: 99,
      previousRole: "company_member",
      nextRole: "hr_admin",
      platformOperator: true,
    });
    expect(db.insert).toHaveBeenCalledWith(auditEvents);
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 10,
        actorUserId: 1,
        entityType: TENANT_GOVERNANCE_ENTITY.COMPANY_MEMBER,
        entityId: 55,
        action: TENANT_GOVERNANCE_ACTION.MEMBER_ROLE_CHANGED,
        metadata: expect.objectContaining({ platformOperator: true, targetUserId: 99 }),
      }),
    );
  });

  it("recordInviteRevokedAudit writes invite_revoked", async () => {
    const db = mockDb();
    await recordInviteRevokedAudit(db as never, {
      companyId: 10,
      actorUserId: 2,
      inviteId: 77,
      platformOperator: false,
    });
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: TENANT_GOVERNANCE_ENTITY.COMPANY_INVITE,
        entityId: 77,
        action: TENANT_GOVERNANCE_ACTION.INVITE_REVOKED,
        metadata: { platformOperator: false },
      }),
    );
  });

  it("recordPayrollRunApprovedAudit writes payroll_run_approved", async () => {
    const db = mockDb();
    await recordPayrollRunApprovedAudit(db as never, {
      companyId: 3,
      actorUserId: 5,
      payrollRunId: 100,
      periodMonth: 4,
      periodYear: 2026,
    });
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: TENANT_GOVERNANCE_ENTITY.PAYROLL_RUN,
        entityId: 100,
        action: TENANT_GOVERNANCE_ACTION.PAYROLL_RUN_APPROVED,
        afterState: expect.objectContaining({ periodMonth: 4, periodYear: 2026 }),
      }),
    );
  });

  it("recordContractStatusUpdatedAudit writes contract_status_updated", async () => {
    const db = mockDb();
    await recordContractStatusUpdatedAudit(db as never, {
      companyId: 8,
      actorUserId: 9,
      contractId: 200,
      previousStatus: "draft",
      nextStatus: "pending_signature",
    });
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: TENANT_GOVERNANCE_ENTITY.CONTRACT,
        entityId: 200,
        action: TENANT_GOVERNANCE_ACTION.CONTRACT_STATUS_UPDATED,
        beforeState: { status: "draft" },
        afterState: { status: "pending_signature" },
      }),
    );
  });
});
