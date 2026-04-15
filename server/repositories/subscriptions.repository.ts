import { and, desc, eq } from "drizzle-orm";
import { companySubscriptions, subscriptionInvoices, subscriptionPlans } from "../../drizzle/schema";
import { getDb } from "../db.client";

export async function getSubscriptionPlans() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.isActive, true))
    .orderBy(subscriptionPlans.sortOrder);
}

export async function getCompanySubscription(companyId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select({ subscription: companySubscriptions, plan: subscriptionPlans })
    .from(companySubscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, companySubscriptions.planId))
    .where(and(eq(companySubscriptions.companyId, companyId), eq(companySubscriptions.status, "active")))
    .limit(1);
  return result[0] ?? null;
}

export async function getCompanyInvoices(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(subscriptionInvoices)
    .where(eq(subscriptionInvoices.companyId, companyId))
    .orderBy(desc(subscriptionInvoices.createdAt));
}
