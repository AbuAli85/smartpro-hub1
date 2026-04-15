import { and, desc, eq, like, or } from "drizzle-orm";
import { crmCommunications, crmContacts, crmDeals } from "../../drizzle/schema";
import { escapeLike } from "@shared/objectUtils";
import { getDb } from "../db.client";

// ─── Contacts ─────────────────────────────────────────────────────────────────

export async function getCrmContacts(companyId: number, filters?: { status?: string; search?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(crmContacts.companyId, companyId)];
  if (filters?.status) conditions.push(eq(crmContacts.status, filters.status as any));
  if (filters?.search) {
    const s = escapeLike(filters.search);
    conditions.push(
      or(
        like(crmContacts.firstName, `%${s}%`),
        like(crmContacts.lastName, `%${s}%`),
        like(crmContacts.email, `%${s}%`),
        like(crmContacts.company, `%${s}%`),
      )!
    );
  }
  return db.select().from(crmContacts).where(and(...conditions)).orderBy(desc(crmContacts.createdAt));
}

export async function createCrmContact(data: typeof crmContacts.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(crmContacts).values(data);
  return result[0] ?? null;
}

export async function getCrmContactById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(crmContacts).where(eq(crmContacts.id, id)).limit(1);
  return row ?? null;
}

export async function updateCrmContact(id: number, data: Partial<typeof crmContacts.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(crmContacts).set(data).where(eq(crmContacts.id, id));
}

// ─── Deals ────────────────────────────────────────────────────────────────────

export async function getCrmDeals(companyId: number, filters?: { stage?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(crmDeals.companyId, companyId)];
  if (filters?.stage) conditions.push(eq(crmDeals.stage, filters.stage as any));
  return db.select().from(crmDeals).where(and(...conditions)).orderBy(desc(crmDeals.createdAt));
}

export async function createCrmDeal(data: typeof crmDeals.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(crmDeals).values(data);
  return result[0] ?? null;
}

export async function getCrmDealById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(crmDeals).where(eq(crmDeals.id, id)).limit(1);
  return row ?? null;
}

export async function updateCrmDeal(id: number, data: Partial<typeof crmDeals.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(crmDeals).set(data).where(eq(crmDeals.id, id));
}

// ─── Communications ───────────────────────────────────────────────────────────

export async function getCrmCommunications(companyId: number, contactId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(crmCommunications.companyId, companyId)];
  if (contactId) conditions.push(eq(crmCommunications.contactId, contactId));
  return db
    .select()
    .from(crmCommunications)
    .where(and(...conditions))
    .orderBy(desc(crmCommunications.createdAt));
}

export async function createCrmCommunication(data: typeof crmCommunications.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(crmCommunications).values(data);
  return result[0] ?? null;
}
