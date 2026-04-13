import { and, desc, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../drizzle/schema";

type DB = MySql2Database<typeof schema>;

export async function insertCentreActivityLog(
  db: DB,
  args: {
    centerId: number;
    actorUserId: number | null;
    activityType: string;
    note?: string | null;
    metadata?: Record<string, unknown> | null;
    occurredAt?: Date;
  },
) {
  await db.insert(schema.sanadCentreActivityLog).values({
    centerId: args.centerId,
    actorUserId: args.actorUserId,
    activityType: args.activityType,
    note: args.note ?? null,
    metadataJson: args.metadata ?? null,
    occurredAt: args.occurredAt ?? new Date(),
  });
}

export async function listCentreActivityLog(db: DB, centerId: number, limit: number) {
  return db
    .select({
      id: schema.sanadCentreActivityLog.id,
      actorUserId: schema.sanadCentreActivityLog.actorUserId,
      activityType: schema.sanadCentreActivityLog.activityType,
      note: schema.sanadCentreActivityLog.note,
      metadataJson: schema.sanadCentreActivityLog.metadataJson,
      occurredAt: schema.sanadCentreActivityLog.occurredAt,
      actorName: schema.users.name,
      actorEmail: schema.users.email,
    })
    .from(schema.sanadCentreActivityLog)
    .leftJoin(schema.users, eq(schema.users.id, schema.sanadCentreActivityLog.actorUserId))
    .where(eq(schema.sanadCentreActivityLog.centerId, centerId))
    .orderBy(desc(schema.sanadCentreActivityLog.occurredAt))
    .limit(Math.min(Math.max(limit, 1), 200));
}

export async function listCentreNotes(db: DB, centerId: number, limit: number) {
  return db
    .select({
      id: schema.sanadCentreNotes.id,
      authorUserId: schema.sanadCentreNotes.authorUserId,
      body: schema.sanadCentreNotes.body,
      createdAt: schema.sanadCentreNotes.createdAt,
      authorName: schema.users.name,
      authorEmail: schema.users.email,
    })
    .from(schema.sanadCentreNotes)
    .innerJoin(schema.users, eq(schema.users.id, schema.sanadCentreNotes.authorUserId))
    .where(eq(schema.sanadCentreNotes.centerId, centerId))
    .orderBy(desc(schema.sanadCentreNotes.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export async function insertCentreNoteAndPreview(
  db: DB,
  args: { centerId: number; authorUserId: number; body: string },
) {
  const trimmed = args.body.trim();
  const preview = trimmed.length > 500 ? `${trimmed.slice(0, 497)}…` : trimmed;
  await db.insert(schema.sanadCentreNotes).values({
    centerId: args.centerId,
    authorUserId: args.authorUserId,
    body: trimmed,
  });
  await db
    .update(schema.sanadCentresPipeline)
    .set({
      latestNotePreview: preview || null,
      updatedAt: new Date(),
    })
    .where(eq(schema.sanadCentresPipeline.centerId, args.centerId));
  await insertCentreActivityLog(db, {
    centerId: args.centerId,
    actorUserId: args.authorUserId,
    activityType: "note_added",
    note: trimmed.length > 2000 ? `${trimmed.slice(0, 1997)}…` : trimmed,
    metadata: { previewLength: preview.length },
  });
}
