import { desc, eq } from "drizzle-orm";
import { notifications } from "../../drizzle/schema";
import { getDb } from "../db.client";
import { recordNotificationCreatedAudit } from "../complianceAudit";

export async function getUserNotifications(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
}

/**
 * Creates an in-app notification and, when `companyId` is set, records a
 * compliance row in `audit_events`.
 * Pass `audit.actorUserId` when a user triggered the notification.
 */
export async function createNotification(
  data: typeof notifications.$inferInsert,
  audit?: { actorUserId: number | null },
): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.insert(notifications).values(data);
  const insertId = Number((result as { insertId?: number }).insertId);
  if (!Number.isFinite(insertId) || insertId <= 0) return null;

  if (data.companyId != null) {
    try {
      await recordNotificationCreatedAudit(db, {
        companyId: data.companyId,
        notificationId: insertId,
        recipientUserId: data.userId,
        type: data.type,
        title: data.title,
        actorUserId: audit?.actorUserId ?? null,
      });
    } catch (e) {
      console.warn("[createNotification] Audit trail failed (non-fatal):", e);
    }
  }
  return insertId;
}

export async function markNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, userId));
}
