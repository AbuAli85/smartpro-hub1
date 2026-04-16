import { and, eq, ne, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { promoterAssignments } from "../../drizzle/schema";
import { dateRangesOverlap } from "../../shared/promoterAssignmentLifecycle";
import { createAuditLog } from "./audit.repository";

export type DbLike = MySql2Database<Record<string, never>>;

/**
 * Overlap rule (Phase 1): an employee cannot have two **active** assignments for the same client brand
 * (`first_party_company_id`) and the same site key (`client_site_id`, including both NULL) with overlapping dates.
 * Open-ended assignments use NULL `end_date` as infinity for overlap checks.
 */
export async function hasOverlappingActiveAssignment(
  db: DbLike,
  params: {
    firstPartyCompanyId: number;
    promoterEmployeeId: number;
    clientSiteId: number | null;
    startDate: Date;
    endDate: Date | null;
    excludeAssignmentId?: string;
  },
): Promise<boolean> {
  const siteMatch = params.clientSiteId == null
    ? sql`${promoterAssignments.clientSiteId} IS NULL`
    : eq(promoterAssignments.clientSiteId, params.clientSiteId);

  const rows = await db
    .select({
      id: promoterAssignments.id,
      startDate: promoterAssignments.startDate,
      endDate: promoterAssignments.endDate,
    })
    .from(promoterAssignments)
    .where(
      and(
        eq(promoterAssignments.promoterEmployeeId, params.promoterEmployeeId),
        eq(promoterAssignments.firstPartyCompanyId, params.firstPartyCompanyId),
        eq(promoterAssignments.assignmentStatus, "active"),
        siteMatch,
        params.excludeAssignmentId ? ne(promoterAssignments.id, params.excludeAssignmentId) : sql`1=1`,
      ),
    );

  for (const r of rows) {
    if (
      dateRangesOverlap(params.startDate, params.endDate, r.startDate, r.endDate ?? null)
    ) {
      return true;
    }
  }
  return false;
}

export async function emitPromoterAssignmentAudit(input: {
  companyId: number;
  userId: number;
  action:
    | "assignment_created"
    | "assignment_updated"
    | "assignment_status_changed"
    | "assignment_rate_changed"
    | "assignment_supervisor_changed";
  assignmentId: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  await createAuditLog({
    userId: input.userId,
    companyId: input.companyId,
    action: input.action,
    entityType: "promoter_assignment",
    entityId: null,
    newValues: { assignmentId: input.assignmentId, ...input.metadata },
  });
}
