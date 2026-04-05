import { and, desc, eq, notInArray } from "drizzle-orm";
import { auditEvents, auditLogs, type User } from "../drizzle/schema";
import { getDb, getUserCompany } from "./db";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import {
  canReadHrPerformanceAuditSensitiveRows,
  HR_AUDIT_SENSITIVE_ENTITY_TYPES,
} from "./hrPerformanceAuditReadPolicy";

/** Merged row for analytics.auditLogs — combines operational `audit_events` and legacy `audit_logs` (platform role / membership). */
export type UnifiedAuditTimelineRow = {
  _key: string;
  source: "audit_event" | "audit_log";
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

/**
 * Single timeline for the Audit Log UI and dashboards.
 * - `audit_events`: workforce, HR performance, and other structured mutations.
 * - `audit_logs`: platform operator writes (e.g. membership / platformRole) via platformOps.
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
  if (!isPlatform) {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership?.company?.id) return [];
    companyId = membership.company.id;
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

  const normEvents: UnifiedAuditTimelineRow[] = eventRows.map((row) => ({
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
  }));

  const normLogs: UnifiedAuditTimelineRow[] = logRows.map((row) => ({
    _key: `al:${row.id}`,
    source: "audit_log",
    id: row.id,
    userId: row.userId,
    companyId: row.companyId,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId ?? null,
    oldValues: row.oldValues,
    newValues: row.newValues,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
  }));

  return [...normEvents, ...normLogs]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, cap);
}
