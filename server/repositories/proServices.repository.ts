import { and, desc, eq, gte, lte } from "drizzle-orm";
import { proServices } from "../../drizzle/schema";
import { getDb } from "../db.client";

export async function getProServices(companyId: number, filters?: { status?: string; serviceType?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(proServices.companyId, companyId)];
  if (filters?.status) conditions.push(eq(proServices.status, filters.status as any));
  if (filters?.serviceType) conditions.push(eq(proServices.serviceType, filters.serviceType as any));
  return db.select().from(proServices).where(and(...conditions)).orderBy(desc(proServices.createdAt));
}

export async function getAllProServices(filters?: { status?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = filters?.status ? [eq(proServices.status, filters.status as any)] : [];
  return db
    .select()
    .from(proServices)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(proServices.createdAt));
}

export async function getExpiringDocuments(daysAhead: number = 30) {
  const db = await getDb();
  if (!db) return [];
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysAhead);
  return db
    .select()
    .from(proServices)
    .where(and(lte(proServices.expiryDate, futureDate), gte(proServices.expiryDate, new Date())))
    .orderBy(proServices.expiryDate);
}

export async function createProService(data: typeof proServices.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(proServices).values(data);
  return result[0] ?? null;
}

export async function getProServiceById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(proServices).where(eq(proServices.id, id)).limit(1);
  return row ?? null;
}

export async function updateProService(id: number, data: Partial<typeof proServices.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(proServices).set(data).where(eq(proServices.id, id));
}
