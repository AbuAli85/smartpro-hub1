/**
 * Batch-load operational issue rows with display names for HR drilldowns (corrections, manual, etc.).
 */
import { and, desc, eq, inArray, or } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { describeOperationalIssueHistoryAuditBranches } from "@shared/attendanceOperationalIssueHistoryLinks";
import { attendanceAudit, attendanceOperationalIssues, users } from "../drizzle/schema";

type Db = MySql2Database<any>;

export type OperationalIssueSummaryDto = {
  id: number;
  issueKey: string;
  status: string;
  issueKind: string;
  businessDateYmd: string;
  assignedToUserId: number | null;
  assignedToName: string | null;
  acknowledgedByUserId: number | null;
  acknowledgedByName: string | null;
  acknowledgedAt: Date | null;
  reviewedByUserId: number | null;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  resolutionNote: string | null;
};

export async function loadOperationalIssueSummariesByKeys(
  db: Db,
  companyId: number,
  issueKeys: string[],
): Promise<Map<string, OperationalIssueSummaryDto>> {
  const uniq = [...new Set(issueKeys)].filter(Boolean);
  const out = new Map<string, OperationalIssueSummaryDto>();
  if (uniq.length === 0) return out;

  const rows = await db
    .select()
    .from(attendanceOperationalIssues)
    .where(
      and(
        eq(attendanceOperationalIssues.companyId, companyId),
        inArray(attendanceOperationalIssues.issueKey, uniq),
      ),
    );

  const userIds = new Set<number>();
  for (const r of rows) {
    if (r.assignedToUserId != null) userIds.add(r.assignedToUserId);
    if (r.acknowledgedByUserId != null) userIds.add(r.acknowledgedByUserId);
    if (r.reviewedByUserId != null) userIds.add(r.reviewedByUserId);
  }
  const uids = [...userIds];
  const nameRows =
    uids.length > 0
      ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, uids))
      : [];
  const nameById = new Map(nameRows.map((u) => [u.id, (u.name ?? "").trim() || `User #${u.id}`]));

  for (const r of rows) {
    out.set(r.issueKey, {
      id: r.id,
      issueKey: r.issueKey,
      status: r.status,
      issueKind: r.issueKind,
      businessDateYmd: r.businessDateYmd,
      assignedToUserId: r.assignedToUserId ?? null,
      assignedToName: r.assignedToUserId != null ? nameById.get(r.assignedToUserId) ?? null : null,
      acknowledgedByUserId: r.acknowledgedByUserId ?? null,
      acknowledgedByName: r.acknowledgedByUserId != null ? nameById.get(r.acknowledgedByUserId) ?? null : null,
      acknowledgedAt: r.acknowledgedAt ?? null,
      reviewedByUserId: r.reviewedByUserId ?? null,
      reviewedByName: r.reviewedByUserId != null ? nameById.get(r.reviewedByUserId) ?? null : null,
      reviewedAt: r.reviewedAt ?? null,
      resolutionNote: r.resolutionNote ?? null,
    });
  }
  return out;
}

export type OperationalIssueHistoryTimelineEntry = {
  id: number;
  createdAt: Date;
  actionType: string;
  actorUserId: number;
  actorName: string | null;
  reason: string | null;
  source: string | null;
};

export async function loadOperationalIssueHistoryBundle(
  db: Db,
  params: { companyId: number; issueKey: string },
): Promise<{
  summary: OperationalIssueSummaryDto;
  timeline: OperationalIssueHistoryTimelineEntry[];
} | null> {
  const [issue] = await db
    .select()
    .from(attendanceOperationalIssues)
    .where(
      and(
        eq(attendanceOperationalIssues.companyId, params.companyId),
        eq(attendanceOperationalIssues.issueKey, params.issueKey),
      ),
    )
    .limit(1);
  if (!issue) return null;

  const map = await loadOperationalIssueSummariesByKeys(db, params.companyId, [issue.issueKey]);
  const summary = map.get(issue.issueKey);
  if (!summary) return null;

  const branches = describeOperationalIssueHistoryAuditBranches({
    id: issue.id,
    correctionId: issue.correctionId ?? null,
    manualCheckinRequestId: issue.manualCheckinRequestId ?? null,
    attendanceRecordId: issue.attendanceRecordId ?? null,
  });
  const clauses = branches.map((b) => {
    if (b.kind === "entity_operational_issue") {
      return and(
        eq(attendanceAudit.entityType, "attendance_operational_issue"),
        eq(attendanceAudit.entityId, b.operationalIssueRowId),
      );
    }
    if (b.kind === "correction_id") return eq(attendanceAudit.correctionId, b.correctionId);
    if (b.kind === "manual_checkin_request_id") {
      return eq(attendanceAudit.manualCheckinRequestId, b.manualCheckinRequestId);
    }
    return eq(attendanceAudit.attendanceRecordId, b.attendanceRecordId);
  });

  const auditWhere =
    clauses.length === 1
      ? and(eq(attendanceAudit.companyId, params.companyId), clauses[0])
      : and(eq(attendanceAudit.companyId, params.companyId), or(...clauses));

  const auds = await db
    .select()
    .from(attendanceAudit)
    .where(auditWhere)
    .orderBy(desc(attendanceAudit.createdAt))
    .limit(120);

  const actorIds = [...new Set(auds.map((a) => a.actorUserId))];
  const actorRows =
    actorIds.length > 0
      ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, actorIds))
      : [];
  const actorNameById = new Map(actorRows.map((u) => [u.id, (u.name ?? "").trim() || `User #${u.id}`]));

  const timeline: OperationalIssueHistoryTimelineEntry[] = auds.map((a) => ({
    id: a.id,
    createdAt: a.createdAt,
    actionType: a.actionType,
    actorUserId: a.actorUserId,
    actorName: actorNameById.get(a.actorUserId) ?? null,
    reason: a.reason ?? null,
    source: a.source ?? null,
  }));

  return { summary, timeline };
}
