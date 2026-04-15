import { and, desc, eq } from "drizzle-orm";
import { auditLogs } from "../../drizzle/schema";
import { getDb } from "../db.client";

/** Inserts legacy `audit_logs` rows. Prefer `audit_events` for new operational audit. */
export async function createAuditLog(data: typeof auditLogs.$inferInsert) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLogs).values(data);
}

/** Raw legacy table read — prefer `loadUnifiedAuditTimeline` for UI. */
export async function getAuditLogs(companyId?: number, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  const conditions = companyId ? [eq(auditLogs.companyId, companyId)] : [];
  return db
    .select()
    .from(auditLogs)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}
