import { auditEvents } from "../drizzle/schema";
import { getDb } from "./db";

/** JSON-safe fields for training audit (before/after). */
export function trainingRecordAuditSnapshot(r: {
  trainingStatus: string;
  score?: number | null;
  certificateUrl?: string | null;
  completedAt?: Date | null;
  employeeUserId: number;
}): Record<string, unknown> {
  return {
    trainingStatus: r.trainingStatus,
    score: r.score ?? null,
    certificateUrl: r.certificateUrl ?? null,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    employeeUserId: r.employeeUserId,
  };
}

/** JSON-safe fields for self-review audit (before/after). */
export function selfReviewAuditSnapshot(r: {
  reviewStatus: string;
  managerRating?: number | null;
  managerFeedback?: string | null;
  goalsNextPeriod?: string | null;
  reviewedAt?: Date | null;
  reviewedByUserId?: number | null;
}): Record<string, unknown> {
  return {
    reviewStatus: r.reviewStatus,
    managerRating: r.managerRating ?? null,
    managerFeedback: r.managerFeedback ?? null,
    goalsNextPeriod: r.goalsNextPeriod ?? null,
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    reviewedByUserId: r.reviewedByUserId ?? null,
  };
}

type DbInstance = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/**
 * Writes one audit_events row. Call only after a successful mutation.
 */
export async function insertHrPerformanceAuditEvent(
  db: DbInstance,
  params: {
    companyId: number;
    actorUserId: number;
    entityType: string;
    entityId: number;
    action: string;
    beforeState: Record<string, unknown> | null;
    afterState: Record<string, unknown> | null;
  }
): Promise<void> {
  await db.insert(auditEvents).values({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    beforeState: params.beforeState,
    afterState: params.afterState,
  });
}
