import { and, eq } from "drizzle-orm";
import { auditEvents, companyMembers } from "../drizzle/schema";

/** High-signal compliance events in `audit_events` (not HR-sensitive). */
export const COMPLIANCE_ENTITY = {
  USER_SESSION: "user_session",
  NOTIFICATION: "notification",
} as const;

export const COMPLIANCE_ACTION = {
  SESSION_LOGIN: "session_login",
  SESSION_LOGOUT: "session_logout",
  NOTIFICATION_CREATED: "notification_created",
} as const;

/** Drizzle DB or transaction client (select + insert). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InsertClient = any;

/**
 * One row per active company membership so each tenant's audit log shows sign-ins.
 * Skips users with no memberships (nothing tenant-scoped to show).
 */
export async function recordSessionLoginAudits(
  db: InsertClient,
  params: {
    userId: number;
    loginMethod?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  },
): Promise<void> {
  const memberships = await db
    .select({ companyId: companyMembers.companyId })
    .from(companyMembers)
    .where(and(eq(companyMembers.userId, params.userId), eq(companyMembers.isActive, true)));
  if (memberships.length === 0) return;

  const metadata: Record<string, unknown> = {
    loginMethod: params.loginMethod ?? null,
  };

  for (const row of memberships) {
    await db.insert(auditEvents).values({
      companyId: row.companyId,
      actorUserId: params.userId,
      entityType: COMPLIANCE_ENTITY.USER_SESSION,
      entityId: params.userId,
      action: COMPLIANCE_ACTION.SESSION_LOGIN,
      beforeState: null,
      afterState: null,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      metadata,
    });
  }
}

export async function recordSessionLogoutAudits(
  db: InsertClient,
  params: {
    userId: number;
    ipAddress?: string | null;
    userAgent?: string | null;
  },
): Promise<void> {
  const memberships = await db
    .select({ companyId: companyMembers.companyId })
    .from(companyMembers)
    .where(and(eq(companyMembers.userId, params.userId), eq(companyMembers.isActive, true)));
  if (memberships.length === 0) return;

  for (const row of memberships) {
    await db.insert(auditEvents).values({
      companyId: row.companyId,
      actorUserId: params.userId,
      entityType: COMPLIANCE_ENTITY.USER_SESSION,
      entityId: params.userId,
      action: COMPLIANCE_ACTION.SESSION_LOGOUT,
      beforeState: null,
      afterState: null,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      metadata: null,
    });
  }
}

export async function recordNotificationCreatedAudit(
  db: InsertClient,
  params: {
    companyId: number;
    notificationId: number;
    recipientUserId: number;
    type: string;
    title: string;
    actorUserId: number | null;
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    entityType: COMPLIANCE_ENTITY.NOTIFICATION,
    entityId: params.notificationId,
    action: COMPLIANCE_ACTION.NOTIFICATION_CREATED,
    beforeState: null,
    afterState: null,
    metadata: {
      recipientUserId: params.recipientUserId,
      type: params.type,
      title: params.title,
    },
  });
}
