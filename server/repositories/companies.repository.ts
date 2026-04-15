import { and, desc, eq } from "drizzle-orm";
import { companies, companyMembers } from "../../drizzle/schema";
import { getDb } from "../db.client";

export async function getCompanies() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(companies).orderBy(desc(companies.createdAt));
}

export async function getCompanyById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
  return result[0] ?? null;
}

export async function createCompany(data: typeof companies.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(companies).values(data);
  return result[0] ?? null;
}

export async function updateCompany(id: number, data: Partial<typeof companies.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(companies).set(data).where(eq(companies.id, id));
}

export async function getUserCompany(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select({ company: companies, member: companyMembers })
    .from(companyMembers)
    .innerJoin(companies, eq(companies.id, companyMembers.companyId))
    .where(and(eq(companyMembers.userId, userId), eq(companyMembers.isActive, true)))
    .limit(1);
  return result[0] ?? null;
}

export async function getUserCompanyById(userId: number, companyId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select({ company: companies, member: companyMembers })
    .from(companyMembers)
    .innerJoin(companies, eq(companies.id, companyMembers.companyId))
    .where(
      and(
        eq(companyMembers.userId, userId),
        eq(companyMembers.companyId, companyId),
        eq(companyMembers.isActive, true),
      )
    )
    .limit(1);
  return result[0] ?? null;
}

export async function getUserCompanies(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ company: companies, member: companyMembers })
    .from(companyMembers)
    .innerJoin(companies, eq(companies.id, companyMembers.companyId))
    .where(and(eq(companyMembers.userId, userId), eq(companyMembers.isActive, true)))
    .orderBy(companies.name);
}
