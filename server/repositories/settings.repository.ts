import { eq } from "drizzle-orm";
import { systemSettings } from "../../drizzle/schema";
import { getDb } from "../db.client";

export async function getSystemSettings(category?: string) {
  const db = await getDb();
  if (!db) return [];
  const q = db.select().from(systemSettings);
  if (category) return q.where(eq(systemSettings.category, category));
  return q;
}

export async function upsertSystemSetting(key: string, value: string, updatedBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .insert(systemSettings)
    .values({ key, value, updatedBy })
    .onDuplicateKeyUpdate({ set: { value, updatedBy } });
}

export async function upsertSystemSettings(settings: { key: string; value: string }[], updatedBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  for (const s of settings) {
    await db
      .insert(systemSettings)
      .values({ key: s.key, value: s.value, updatedBy })
      .onDuplicateKeyUpdate({ set: { value: s.value, updatedBy } });
  }
}
