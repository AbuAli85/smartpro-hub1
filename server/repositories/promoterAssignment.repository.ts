import { and, eq, ne, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { promoterAssignments } from "../../drizzle/schema";
import { dateRangesOverlap } from "../../shared/promoterAssignmentLifecycle";
import {
  buildPromoterAssignmentAuditPayload,
  type PromoterAssignmentAuditPayload,
} from "../../shared/promoterAssignmentAudit";
import { createAuditLog } from "./audit.repository";

export type DbLike = MySql2Database<Record<string, never>>;

/**
 * Overlap rule: two **active** assignments for the same employee + client brand + site key
 * with overlapping calendar ranges. NULL end_date means open-ended (treated as far future for overlap).
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
  const siteMatch =
    params.clientSiteId == null
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
    if (dateRangesOverlap(params.startDate, params.endDate, r.startDate, r.endDate ?? null)) {
      return true;
    }
  }
  return false;
}

/** Writes standardized JSON to audit_logs.newValues; action column mirrors payload.eventType. */
export async function emitPromoterAssignmentAudit(input: {
  userId: number;
  payload: PromoterAssignmentAuditPayload;
}): Promise<void> {
  await createAuditLog({
    userId: input.userId,
    companyId: input.payload.companyId,
    action: input.payload.eventType,
    entityType: "promoter_assignment",
    entityId: null,
    newValues: buildPromoterAssignmentAuditPayload(input.payload),
  });
}
