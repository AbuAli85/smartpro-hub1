/**
 * Tenant governance audit helpers — high-signal events for membership, invites, payroll, and contract lifecycle.
 * Use only for explicit policy-relevant actions; do not replace domain-specific audit (e.g. signature rows in `contract_signature_audit`).
 */

import { auditEvents } from "../drizzle/schema";

/** Drizzle-style client with `insert(auditEvents).values(...)`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbInsert = any;

export const TENANT_GOVERNANCE_ENTITY = {
  COMPANY_MEMBER: "company_member",
  COMPANY_INVITE: "company_invite",
  PAYROLL_RUN: "payroll_run",
  PAYROLL_LINE_ITEM: "payroll_line_item",
  CONTRACT: "contract",
} as const;

export const TENANT_GOVERNANCE_ACTION = {
  MEMBER_ROLE_CHANGED: "member_role_changed",
  INVITE_CREATED: "invite_created",
  INVITE_REVOKED: "invite_revoked",
  INVITE_ACCEPTED: "invite_accepted",
  MEMBER_REMOVED: "member_removed",
  PAYROLL_RUN_APPROVED: "payroll_run_approved",
  PAYROLL_RUN_MARKED_PAID: "payroll_run_marked_paid",
  PAYSLIP_EXPORTED: "payslip_exported",
  CONTRACT_STATUS_UPDATED: "contract_status_updated",
  MEMBER_CAPABILITIES_CHANGED: "member_capabilities_changed",
  COMPANY_MODULES_CHANGED: "company_modules_changed",
} as const;

export async function recordMemberRoleChangedAudit(
  db: DbInsert,
  params: {
    companyId: number;
    actorUserId: number;
    memberRowId: number;
    targetUserId: number;
    previousRole: string;
    nextRole: string;
    /** True when a platform operator acts outside normal company-admin-only path */
    platformOperator: boolean;
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    entityType: TENANT_GOVERNANCE_ENTITY.COMPANY_MEMBER,
    entityId: params.memberRowId,
    action: TENANT_GOVERNANCE_ACTION.MEMBER_ROLE_CHANGED,
    beforeState: { role: params.previousRole, targetUserId: params.targetUserId },
    afterState: { role: params.nextRole, targetUserId: params.targetUserId },
    metadata: {
      targetUserId: params.targetUserId,
      platformOperator: params.platformOperator,
    },
  });
}

export async function recordInviteCreatedAudit(
  db: DbInsert,
  params: {
    companyId: number;
    actorUserId: number;
    inviteId: number;
    email: string;
    role: string;
    /** True when a platform operator creates an invite for a tenant workspace */
    platformOperator: boolean;
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    entityType: TENANT_GOVERNANCE_ENTITY.COMPANY_INVITE,
    entityId: params.inviteId,
    action: TENANT_GOVERNANCE_ACTION.INVITE_CREATED,
    beforeState: null,
    afterState: { email: params.email, role: params.role },
    metadata: { platformOperator: params.platformOperator },
  });
}

export async function recordInviteRevokedAudit(
  db: DbInsert,
  params: {
    companyId: number;
    actorUserId: number;
    inviteId: number;
    platformOperator: boolean;
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    entityType: TENANT_GOVERNANCE_ENTITY.COMPANY_INVITE,
    entityId: params.inviteId,
    action: TENANT_GOVERNANCE_ACTION.INVITE_REVOKED,
    beforeState: null,
    afterState: { revokedAt: new Date().toISOString() },
    metadata: { platformOperator: params.platformOperator },
  });
}

export async function recordInviteAcceptedAudit(
  db: DbInsert,
  params: {
    companyId: number;
    actorUserId: number;
    inviteId: number;
    assignedRole: string;
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    entityType: TENANT_GOVERNANCE_ENTITY.COMPANY_INVITE,
    entityId: params.inviteId,
    action: TENANT_GOVERNANCE_ACTION.INVITE_ACCEPTED,
    beforeState: null,
    afterState: { acceptedAt: new Date().toISOString(), role: params.assignedRole },
    metadata: { targetUserId: params.actorUserId },
  });
}

export async function recordMemberRemovedAudit(
  db: DbInsert,
  params: {
    companyId: number;
    actorUserId: number;
    memberRowId: number;
    targetUserId: number;
    platformOperator: boolean;
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    entityType: TENANT_GOVERNANCE_ENTITY.COMPANY_MEMBER,
    entityId: params.memberRowId,
    action: TENANT_GOVERNANCE_ACTION.MEMBER_REMOVED,
    beforeState: { isActive: true, targetUserId: params.targetUserId },
    afterState: { isActive: false, targetUserId: params.targetUserId },
    metadata: { targetUserId: params.targetUserId, platformOperator: params.platformOperator },
  });
}

export async function recordPayrollRunApprovedAudit(
  db: DbInsert,
  params: {
    companyId: number;
    actorUserId: number;
    payrollRunId: number;
    periodMonth: number;
    periodYear: number;
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    entityType: TENANT_GOVERNANCE_ENTITY.PAYROLL_RUN,
    entityId: params.payrollRunId,
    action: TENANT_GOVERNANCE_ACTION.PAYROLL_RUN_APPROVED,
    beforeState: null,
    afterState: {
      status: "approved",
      periodMonth: params.periodMonth,
      periodYear: params.periodYear,
    },
    metadata: null,
  });
}

export async function recordPayrollRunMarkedPaidAudit(
  db: DbInsert,
  params: {
    companyId: number;
    actorUserId: number;
    payrollRunId: number;
    periodMonth: number;
    periodYear: number;
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    entityType: TENANT_GOVERNANCE_ENTITY.PAYROLL_RUN,
    entityId: params.payrollRunId,
    action: TENANT_GOVERNANCE_ACTION.PAYROLL_RUN_MARKED_PAID,
    beforeState: null,
    afterState: {
      status: "paid",
      periodMonth: params.periodMonth,
      periodYear: params.periodYear,
      paidAt: new Date().toISOString(),
    },
    metadata: null,
  });
}

export async function recordPayslipExportedAudit(
  db: DbInsert,
  params: {
    companyId: number;
    actorUserId: number;
    payrollLineItemId: number;
    payrollRunId: number;
    employeeId: number;
    periodMonth: number;
    periodYear: number;
    payslipKey: string;
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    entityType: TENANT_GOVERNANCE_ENTITY.PAYROLL_LINE_ITEM,
    entityId: params.payrollLineItemId,
    action: TENANT_GOVERNANCE_ACTION.PAYSLIP_EXPORTED,
    beforeState: null,
    afterState: {
      payrollRunId: params.payrollRunId,
      employeeId: params.employeeId,
      periodMonth: params.periodMonth,
      periodYear: params.periodYear,
      payslipKey: params.payslipKey,
    },
    metadata: null,
  });
}

export async function recordMemberCapabilitiesChangedAudit(
  db: DbInsert,
  params: {
    companyId: number;
    actorUserId: number;
    targetUserId: number;
    memberRowId: number;
    previousPermissions: string[] | null;
    nextPermissions: string[];
    previousEffective: string[];
    nextEffective: string[];
    platformOperator: boolean;
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    entityType: TENANT_GOVERNANCE_ENTITY.COMPANY_MEMBER,
    entityId: params.memberRowId,
    action: TENANT_GOVERNANCE_ACTION.MEMBER_CAPABILITIES_CHANGED,
    beforeState: {
      permissions: params.previousPermissions,
      effective: params.previousEffective,
    },
    afterState: {
      permissions: params.nextPermissions,
      effective: params.nextEffective,
    },
    metadata: {
      targetUserId: params.targetUserId,
      platformOperator: params.platformOperator,
    },
  });
}

export async function recordCompanyModulesChangedAudit(
  db: DbInsert,
  params: {
    companyId: number;
    actorUserId: number;
    previousModules: string[] | null;
    nextModules: string[] | null;
    platformOperator: boolean;
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    entityType: "company",
    entityId: params.companyId,
    action: TENANT_GOVERNANCE_ACTION.COMPANY_MODULES_CHANGED,
    beforeState: { enabledModules: params.previousModules },
    afterState: { enabledModules: params.nextModules },
    metadata: { platformOperator: params.platformOperator },
  });
}

export async function recordContractStatusUpdatedAudit(
  db: DbInsert,
  params: {
    companyId: number;
    actorUserId: number;
    contractId: number;
    previousStatus: string | null;
    nextStatus: string;
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    entityType: TENANT_GOVERNANCE_ENTITY.CONTRACT,
    entityId: params.contractId,
    action: TENANT_GOVERNANCE_ACTION.CONTRACT_STATUS_UPDATED,
    beforeState: params.previousStatus != null ? { status: params.previousStatus } : null,
    afterState: { status: params.nextStatus },
    metadata: null,
  });
}
