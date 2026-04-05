import { and, desc, eq, notInArray } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import {
  auditEvents,
  auditLogs,
  contractSignatureAudit,
  contracts,
  users,
  type User,
} from "../drizzle/schema";
import { getDb, getUserCompany } from "./db";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import {
  canReadHrPerformanceAuditSensitiveRows,
  HR_AUDIT_SENSITIVE_ENTITY_TYPES,
} from "./hrPerformanceAuditReadPolicy";
import { canIncludeContractSignatureAuditInTimeline } from "./contractAuditTimelinePolicy";
import {
  projectAuditEventToUnified,
  projectAuditLogToUnified,
  projectContractSignatureAuditToUnified,
  type UnifiedAuditTimelineRow,
} from "./unifiedAuditProjectors";

export type { UnifiedAuditTimelineRow };

/**
 * Single timeline for the Audit Log UI and dashboards.
 * - `audit_events`: workforce, HR performance, and other structured mutations.
 * - `audit_logs`: platform operator writes (e.g. membership / platformRole) via platformOps.
 * - `contract_signature_audit` (joined to `contracts`): e-sign events, scoped by company + role policy.
 */
export async function loadUnifiedAuditTimeline(
  ctx: { user: User },
  limit: number,
): Promise<UnifiedAuditTimelineRow[]> {
  const db = await getDb();
  if (!db) return [];

  const cap = Math.min(Math.max(limit, 1), 500);
  const overfetch = Math.min(cap * 2, 1000);

  const isPlatform = canAccessGlobalAdminProcedures(ctx.user);
  let companyId: number | null = null;
  let memberRole: string | null = null;
  if (!isPlatform) {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership?.company?.id) return [];
    companyId = membership.company.id;
    memberRole = membership.member.role;
  }

  const eventConds = [];
  if (companyId != null) {
    eventConds.push(eq(auditEvents.companyId, companyId));
    const canHr = await canReadHrPerformanceAuditSensitiveRows(ctx.user, companyId);
    if (!canHr) {
      eventConds.push(notInArray(auditEvents.entityType, [...HR_AUDIT_SENSITIVE_ENTITY_TYPES]));
    }
  }

  const eventRows = await db
    .select()
    .from(auditEvents)
    .where(eventConds.length ? and(...eventConds) : undefined)
    .orderBy(desc(auditEvents.createdAt))
    .limit(overfetch);

  const logConds = [];
  if (companyId != null) {
    logConds.push(eq(auditLogs.companyId, companyId));
  }

  const logRows = await db
    .select()
    .from(auditLogs)
    .where(logConds.length ? and(...logConds) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(overfetch);

  const normEvents = eventRows.map(projectAuditEventToUnified);
  const normLogs = logRows.map(projectAuditLogToUnified);

  const includeContractAudit =
    isPlatform || (companyId != null && canIncludeContractSignatureAuditInTimeline(ctx.user, memberRole));

  let normContract: UnifiedAuditTimelineRow[] = [];
  if (includeContractAudit) {
    const csaConds = [];
    if (companyId != null) {
      csaConds.push(eq(contracts.companyId, companyId));
    }
    const auditActorUser = alias(users, "contract_sig_audit_actor");
    const contractJoinRows = await db
      .select({
        id: contractSignatureAudit.id,
        contractId: contractSignatureAudit.contractId,
        signatureId: contractSignatureAudit.signatureId,
        event: contractSignatureAudit.event,
        actorName: contractSignatureAudit.actorName,
        actorEmail: contractSignatureAudit.actorEmail,
        actorUserId: contractSignatureAudit.actorUserId,
        actorType: contractSignatureAudit.actorType,
        ipAddress: contractSignatureAudit.ipAddress,
        userAgent: contractSignatureAudit.userAgent,
        notes: contractSignatureAudit.notes,
        createdAt: contractSignatureAudit.createdAt,
        joinCompanyId: contracts.companyId,
        contractTitle: contracts.title,
        contractNumber: contracts.contractNumber,
        resolvedActorDisplayName: auditActorUser.name,
      })
      .from(contractSignatureAudit)
      .innerJoin(contracts, eq(contracts.id, contractSignatureAudit.contractId))
      .leftJoin(auditActorUser, eq(auditActorUser.id, contractSignatureAudit.actorUserId))
      .where(csaConds.length ? and(...csaConds) : undefined)
      .orderBy(desc(contractSignatureAudit.createdAt))
      .limit(overfetch);

    normContract = contractJoinRows.map((r) =>
      projectContractSignatureAuditToUnified(
        {
          id: r.id,
          contractId: r.contractId,
          signatureId: r.signatureId,
          event: r.event,
          actorName: r.actorName,
          actorEmail: r.actorEmail,
          actorUserId: r.actorUserId,
          actorType: r.actorType,
          ipAddress: r.ipAddress,
          userAgent: r.userAgent,
          notes: r.notes,
          createdAt: r.createdAt,
        },
        {
          companyId: r.joinCompanyId,
          contractTitle: r.contractTitle ?? "",
          contractNumber: r.contractNumber ?? "",
        },
        { resolvedActorDisplayName: r.resolvedActorDisplayName },
      ),
    );
  }

  return [...normEvents, ...normLogs, ...normContract]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, cap);
}
