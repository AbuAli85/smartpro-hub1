import { and, desc, eq, like, or } from "drizzle-orm";
import { marketplaceBookings, marketplaceProviders, marketplaceServices } from "../../drizzle/schema";
import { escapeLike } from "@shared/objectUtils";
import { getDb } from "../db.client";

export async function getMarketplaceProviders(filters?: {
  category?: string;
  search?: string;
  status?: string;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [eq(marketplaceProviders.status, (filters?.status as any) || "active")];
  if (filters?.category) conditions.push(eq(marketplaceProviders.category, filters.category));
  if (filters?.search) {
    const s = escapeLike(filters.search);
    conditions.push(
      or(like(marketplaceProviders.businessName, `%${s}%`), like(marketplaceProviders.description, `%${s}%`))!
    );
  }
  return db
    .select()
    .from(marketplaceProviders)
    .where(and(...conditions))
    .orderBy(desc(marketplaceProviders.rating));
}

export async function getProviderById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(marketplaceProviders).where(eq(marketplaceProviders.id, id)).limit(1);
  return result[0] ?? null;
}

export async function createProvider(data: typeof marketplaceProviders.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(marketplaceProviders).values(data);
  return result[0] ?? null;
}

export async function updateProvider(id: number, data: Partial<typeof marketplaceProviders.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(marketplaceProviders).set(data).where(eq(marketplaceProviders.id, id));
}

export async function getProviderServices(providerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(marketplaceServices)
    .where(eq(marketplaceServices.providerId, providerId));
}

export async function getMarketplaceBookings(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(marketplaceBookings)
    .where(eq(marketplaceBookings.companyId, companyId))
    .orderBy(desc(marketplaceBookings.createdAt));
}

export async function createMarketplaceBooking(data: typeof marketplaceBookings.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(marketplaceBookings).values(data);
  return result[0] ?? null;
}
