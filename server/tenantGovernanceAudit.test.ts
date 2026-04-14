import { describe, expect, it, vi } from "vitest";
import { auditEvents } from "../drizzle/schema";
import {
  recordContractStatusUpdatedAudit,
  recordInviteAcceptedAudit,
  recordInviteCreatedAudit,
  recordInviteRevokedAudit,
  recordMemberRemovedAudit,
  recordMemberRoleChangedAudit,
  recordPayrollRunApprovedAudit,
  recordPayrollRunMarkedPaidAudit,
  recordPayslipExportedAudit,
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

  it("recordInviteCreatedAudit writes invite_created including platformOperator", async () => {
    const db = mockDb();
    await recordInviteCreatedAudit(db as never, {
      companyId: 10,
      actorUserId: 1,
      inviteId: 44,
      email: "a@b.com",
      role: "company_member",
      platformOperator: true,
    });
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: TENANT_GOVERNANCE_ENTITY.COMPANY_INVITE,
        entityId: 44,
        action: TENANT_GOVERNANCE_ACTION.INVITE_CREATED,
        afterState: expect.objectContaining({ email: "a@b.com", role: "company_member" }),
        metadata: { platformOperator: true },
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

  it("recordInviteAcceptedAudit writes invite_accepted", async () => {
    const db = mockDb();
    await recordInviteAcceptedAudit(db as never, {
      companyId: 12,
      actorUserId: 88,
      inviteId: 90,
      assignedRole: "hr_admin",
    });
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: TENANT_GOVERNANCE_ENTITY.COMPANY_INVITE,
        entityId: 90,
        action: TENANT_GOVERNANCE_ACTION.INVITE_ACCEPTED,
        metadata: { targetUserId: 88 },
        afterState: expect.objectContaining({ role: "hr_admin" }),
      }),
    );
  });

  it("recordMemberRemovedAudit writes member_removed", async () => {
    const db = mockDb();
    await recordMemberRemovedAudit(db as never, {
      companyId: 10,
      actorUserId: 3,
      memberRowId: 66,
      targetUserId: 99,
      platformOperator: true,
    });
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: TENANT_GOVERNANCE_ENTITY.COMPANY_MEMBER,
        entityId: 66,
        action: TENANT_GOVERNANCE_ACTION.MEMBER_REMOVED,
        metadata: expect.objectContaining({ platformOperator: true, targetUserId: 99 }),
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

  it("recordPayrollRunMarkedPaidAudit writes payroll_run_marked_paid", async () => {
    const db = mockDb();
    await recordPayrollRunMarkedPaidAudit(db as never, {
      companyId: 3,
      actorUserId: 5,
      payrollRunId: 101,
      periodMonth: 5,
      periodYear: 2026,
    });
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: TENANT_GOVERNANCE_ENTITY.PAYROLL_RUN,
        entityId: 101,
        action: TENANT_GOVERNANCE_ACTION.PAYROLL_RUN_MARKED_PAID,
        afterState: expect.objectContaining({ status: "paid", periodMonth: 5, periodYear: 2026 }),
      }),
    );
  });

  it("recordPayslipExportedAudit writes payslip_exported on payroll_line_item", async () => {
    const db = mockDb();
    await recordPayslipExportedAudit(db as never, {
      companyId: 3,
      actorUserId: 5,
      payrollLineItemId: 700,
      payrollRunId: 101,
      employeeId: 12,
      periodMonth: 5,
      periodYear: 2026,
      payslipKey: "payslips/3/2026-5/emp-12.html",
    });
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: TENANT_GOVERNANCE_ENTITY.PAYROLL_LINE_ITEM,
        entityId: 700,
        action: TENANT_GOVERNANCE_ACTION.PAYSLIP_EXPORTED,
        afterState: expect.objectContaining({ employeeId: 12, payslipKey: "payslips/3/2026-5/emp-12.html" }),
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
