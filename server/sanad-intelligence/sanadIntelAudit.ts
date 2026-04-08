import { auditEvents } from "../../drizzle/schema";

/** Platform-scoped SANAD intelligence actions (no company tenant). */
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
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    companyId: SANAD_INTEL_AUDIT_COMPANY_ID,
    actorUserId: params.actorUserId,
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    metadata: params.metadata ?? null,
  });
}
