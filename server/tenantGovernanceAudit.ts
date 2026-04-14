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
  CONTRACT: "contract",
} as const;

export const TENANT_GOVERNANCE_ACTION = {
  MEMBER_ROLE_CHANGED: "member_role_changed",
  INVITE_REVOKED: "invite_revoked",
  PAYROLL_RUN_APPROVED: "payroll_run_approved",
  CONTRACT_STATUS_UPDATED: "contract_status_updated",
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
