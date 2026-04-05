import type { AuditEvent, ContractSignatureAudit } from "../drizzle/schema";
import { isHrPerformanceSensitiveEntityType } from "./hrPerformanceAuditReadPolicy";

export type AuditSensitivity = "normal" | "hr_sensitive" | "legal_sensitive";

/** Normalized row for `analytics.auditLogs` and the Audit Log UI. */
export type UnifiedAuditTimelineRow = {
  _key: string;
  source: "audit_event" | "audit_log" | "contract_signature_audit";
  id: number;
  userId: number | null;
  companyId: number | null;
  action: string;
  entityType: string;
  entityId: number | null;
  oldValues: unknown;
  newValues: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  sensitivity: AuditSensitivity;
  summary: string;
  routeHint: string | null;
  actorLabel: string | null;
};

type AuditLogRow = {
  id: number;
  userId: number | null;
  companyId: number | null;
  action: string;
  entityType: string;
  entityId: number | null;
  oldValues: unknown;
  newValues: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
};

export function projectAuditEventToUnified(row: AuditEvent): UnifiedAuditTimelineRow {
  const hr = isHrPerformanceSensitiveEntityType(row.entityType);
  let routeHint: string | null = null;
  if (row.entityType === "work_permit" || row.entityType.includes("permit")) {
    routeHint = "/workforce/permits";
  } else if (row.entityType.includes("case") || row.entityType === "government_service_case") {
    routeHint = "/workforce/cases";
  }
  return {
    _key: `ae:${row.id}`,
    source: "audit_event",
    id: row.id,
    userId: row.actorUserId,
    companyId: row.companyId,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    oldValues: row.beforeState,
    newValues: row.afterState,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
    sensitivity: hr ? "hr_sensitive" : "normal",
    summary: `${row.action} · ${row.entityType} #${row.entityId}`,
    routeHint,
    actorLabel: null,
  };
}

export function projectAuditLogToUnified(row: AuditLogRow): UnifiedAuditTimelineRow {
  let routeHint: string | null = null;
  if (row.entityType === "company_member" || row.action.includes("membership") || row.action.includes("company")) {
    routeHint = "/company/team-access";
  }
  return {
    _key: `al:${row.id}`,
    source: "audit_log",
    id: row.id,
    userId: row.userId,
    companyId: row.companyId,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    oldValues: row.oldValues,
    newValues: row.newValues,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
    sensitivity: "normal",
    summary: `${row.action} · ${row.entityType}${row.entityId != null ? ` #${row.entityId}` : ""}`,
    routeHint,
    actorLabel: null,
  };
}

export function projectContractSignatureAuditToUnified(
  row: ContractSignatureAudit,
  ctx: { companyId: number; contractTitle: string; contractNumber: string },
): UnifiedAuditTimelineRow {
  const title = ctx.contractTitle?.trim() || "Contract";
  const num = ctx.contractNumber?.trim() || `#${row.contractId}`;
  return {
    _key: `csa:${row.id}`,
    source: "contract_signature_audit",
    id: row.id,
    userId: null,
    companyId: ctx.companyId,
    action: `signature_${row.event}`,
    entityType: "contract_signature",
    entityId: row.contractId,
    oldValues: null,
    newValues: {
      event: row.event,
      signatureId: row.signatureId,
      notes: row.notes,
      actorName: row.actorName,
      actorEmail: row.actorEmail,
      contractNumber: ctx.contractNumber,
      contractTitle: ctx.contractTitle,
    },
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
    sensitivity: "legal_sensitive",
    summary: `Contract "${title}" (${num}) — ${row.event.replace(/_/g, " ")}`,
    routeHint: "/contracts",
    actorLabel: row.actorName?.trim() || row.actorEmail?.trim() || null,
  };
}
