import { auditEvents } from "../../drizzle/schema";

/**
 * Platform-scoped SANAD intelligence rows in `audit_events`.
 * `companyId = 0` is intentional: these events are not tenant-scoped. Company-scoped audit readers
 * (`operations.recentActivity`, `workforce.listAuditEvents`, `unifiedAuditTimeline`) filter by a real
 * `companyId`, so they never surface these rows — avoiding cross-tenant leakage. Platform operators
 * can query `entityType = 'sanad_intel_center'` and `companyId = 0` when needed.
 */
export const SANAD_INTEL_AUDIT_COMPANY_ID = 0;

type DbInsertClient = {
  insert: (t: typeof auditEvents) => {
    values: (v: typeof auditEvents.$inferInsert) => Promise<unknown>;
  };
};

export async function insertSanadIntelAuditEvent(
  db: DbInsertClient,
  params: {
    actorUserId: number | null;
    entityType: string;
    entityId: number;
    action: string;
    metadata?: Record<string, unknown> | null;
    beforeState?: Record<string, unknown> | null;
    afterState?: Record<string, unknown> | null;
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    companyId: SANAD_INTEL_AUDIT_COMPANY_ID,
    actorUserId: params.actorUserId,
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    metadata: params.metadata ?? null,
    beforeState: params.beforeState ?? null,
    afterState: params.afterState ?? null,
  });
}
