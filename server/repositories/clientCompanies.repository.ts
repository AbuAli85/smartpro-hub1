import { and, asc, desc, eq, like, or } from "drizzle-orm";
import { clientCompanies } from "../../drizzle/schema";
import { escapeLike } from "@shared/objectUtils";
import { getDb } from "../db.client";

export async function getClientCompanies(
  companyId: number,
  filters?: { status?: string; search?: string },
) {
  const db = await getDb();
  if (!db) return [];
  const conds = [eq(clientCompanies.companyId, companyId)];
  if (filters?.status) conds.push(eq(clientCompanies.status, filters.status as any));
  if (filters?.search) {
    const s = escapeLike(filters.search);
    conds.push(or(like(clientCompanies.name, `%${s}%`), like(clientCompanies.crNumber, `%${s}%`))!);
  }
  return db
    .select()
    .from(clientCompanies)
    .where(and(...conds))
    .orderBy(asc(clientCompanies.name));
}

export async function getClientCompanyById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(clientCompanies).where(eq(clientCompanies.id, id)).limit(1);
  return row ?? null;
}

export async function createClientCompany(data: typeof clientCompanies.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(clientCompanies).values(data).$returningId();
  return result;
}

export async function updateClientCompany(
  id: number,
  data: Partial<typeof clientCompanies.$inferInsert>,
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(clientCompanies).set({ ...data, updatedAt: new Date() }).where(eq(clientCompanies.id, id));
}
