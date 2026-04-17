import { and, desc, eq, gt, isNotNull, lt, ne, or } from "drizzle-orm";
import { engagements } from "../../drizzle/schema";
import { getDb } from "../db";
import { syncEngagementDerivedState } from "../services/engagements/deriveEngagementState";

const RECENT_MS = 48 * 60 * 60 * 1000;

/**
 * Scheduled / manual batch cohort: union of
 * - open (not completed / not archived),
 * - overdue-ish persisted signals,
 * - at-risk health,
 * - recently updated rows (captures late writes while server was down).
 */
function hotRollupWhere(companyId?: number | null) {
  const recentCutoff = new Date(Date.now() - RECENT_MS);
  const now = new Date();
  const open = and(ne(engagements.status, "completed"), ne(engagements.status, "archived"));
  const overdueish = or(
    and(isNotNull(engagements.slaDueAt), lt(engagements.slaDueAt, now)),
    and(isNotNull(engagements.topActionDueAt), lt(engagements.topActionDueAt, now)),
    eq(engagements.health, "delayed"),
    eq(engagements.topActionStatus, "overdue"),
  )!;
  const atRisk = eq(engagements.health, "at_risk");
  const recent = gt(engagements.updatedAt, recentCutoff);
  const cohort = or(open, overdueish, atRisk, recent)!;
  if (companyId != null && Number.isFinite(companyId)) {
    return and(eq(engagements.companyId, companyId), cohort);
  }
  return cohort;
}

/**
 * Batch recompute persisted health / top action for hot engagements.
 * Used by the server interval job and by the manual “Refresh rollups” mutation.
 */
export async function resyncHotEngagementDerivedState(input: {
  companyId?: number | null;
  limit: number;
}): Promise<{ scanned: number; synced: number; errors: number }> {
  const db = await getDb();
  if (!db) return { scanned: 0, synced: 0, errors: 0 };

  const rows = await db
    .select({ id: engagements.id, companyId: engagements.companyId })
    .from(engagements)
    .where(hotRollupWhere(input.companyId ?? undefined))
    .orderBy(desc(engagements.updatedAt))
    .limit(input.limit);

  let synced = 0;
  let errors = 0;
  for (const r of rows) {
    try {
      await syncEngagementDerivedState(db, r.id, r.companyId);
      synced++;
    } catch (e) {
      errors++;
      console.error(`[engagement-rollups] sync failed engagement=${r.id} company=${r.companyId}`, e);
    }
  }

  return { scanned: rows.length, synced, errors };
}
