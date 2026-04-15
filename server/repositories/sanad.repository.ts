import { and, desc, eq } from "drizzle-orm";
import { sanadApplications, sanadOffices } from "../../drizzle/schema";
import { getDb } from "../db.client";

export async function getSanadOffices(_companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(sanadOffices)
    .where(eq(sanadOffices.status, "active"))
    .orderBy(desc(sanadOffices.createdAt));
}

export async function getAllSanadOffices() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sanadOffices).orderBy(desc(sanadOffices.createdAt));
}

export async function createSanadOffice(data: typeof sanadOffices.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(sanadOffices).values(data);
  return result[0] ?? null;
}

export async function updateSanadOffice(id: number, data: Partial<typeof sanadOffices.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(sanadOffices).set(data).where(eq(sanadOffices.id, id));
}

export async function getSanadApplications(companyId: number, filters?: { status?: string; type?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(sanadApplications.companyId, companyId)];
  if (filters?.status) conditions.push(eq(sanadApplications.status, filters.status as any));
  if (filters?.type) conditions.push(eq(sanadApplications.serviceType, filters.type as any));
  return db
    .select()
    .from(sanadApplications)
    .where(and(...conditions))
    .orderBy(desc(sanadApplications.createdAt));
}

export async function getSanadApplicationById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(sanadApplications).where(eq(sanadApplications.id, id)).limit(1);
  return row ?? null;
}

export async function getAllSanadApplications(filters?: { status?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = filters?.status ? [eq(sanadApplications.status, filters.status as any)] : [];
  return db
    .select()
    .from(sanadApplications)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(sanadApplications.createdAt));
}

export async function createSanadApplication(data: typeof sanadApplications.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(sanadApplications).values(data);
  return result[0] ?? null;
}

export async function updateSanadApplication(id: number, data: Partial<typeof sanadApplications.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(sanadApplications).set(data).where(eq(sanadApplications.id, id));
}
