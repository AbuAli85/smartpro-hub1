import { and, desc, eq, or } from "drizzle-orm";
import { contractTemplates, contracts } from "../../drizzle/schema";
import { getDb } from "../db.client";

export async function getContracts(
  companyId: number,
  filters?: { status?: string; type?: string; limit?: number; offset?: number },
) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(contracts.companyId, companyId)];
  if (filters?.status) conditions.push(eq(contracts.status, filters.status as any));
  if (filters?.type) conditions.push(eq(contracts.type, filters.type as any));
  const q = db.select().from(contracts).where(and(...conditions)).orderBy(desc(contracts.createdAt));
  if (filters?.limit != null) {
    return q.limit(filters.limit).offset(filters.offset ?? 0);
  }
  return q;
}

export async function getAllContracts(filters?: { status?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = filters?.status ? [eq(contracts.status, filters.status as any)] : [];
  return db
    .select()
    .from(contracts)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(contracts.createdAt));
}

export async function getContractById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
  return result[0] ?? null;
}

export async function createContract(data: typeof contracts.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(contracts).values(data);
  return result[0] ?? null;
}

export async function updateContract(id: number, data: Partial<typeof contracts.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(contracts).set(data).where(eq(contracts.id, id));
}

export async function getContractTemplates(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = companyId
    ? [or(eq(contractTemplates.companyId, companyId), eq(contractTemplates.isGlobal, true))]
    : [eq(contractTemplates.isGlobal, true)];
  return db.select().from(contractTemplates).where(and(...conditions));
}
