import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { subscriptionPlans, companySubscriptions, subscriptionInvoices } from "../../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";
import { getUserCompany } from "../db";
import { nanoid } from "nanoid";

export const subscriptionsRouter = router({
  plans: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true));
  }),

  current: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return null;
    const db = await getDb();
    if (!db) return null;
    const subs = await db
      .select({ sub: companySubscriptions, plan: subscriptionPlans })
      .from(companySubscriptions)
      .leftJoin(subscriptionPlans, eq(companySubscriptions.planId, subscriptionPlans.id))
      .where(eq(companySubscriptions.companyId, membership.company.id))
      .orderBy(desc(companySubscriptions.createdAt))
      .limit(1);
    if (!subs.length) return null;
    return { ...subs[0].sub, plan: subs[0].plan };
  }),

  subscribe: protectedProcedure
    .input(z.object({
      planId: z.number(),
      billingCycle: z.enum(["monthly", "annual"]).default("monthly"),
    }))
    .mutation(async ({ input, ctx }) => {
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) throw new Error("No company found");
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const plan = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, input.planId)).limit(1);
      if (!plan.length) throw new Error("Plan not found");

      const now = new Date();
      const periodEnd = new Date(now);
      if (input.billingCycle === "monthly") {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      } else {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      }

      // Deactivate existing subscriptions
      await db.update(companySubscriptions)
        .set({ status: "cancelled" })
        .where(eq(companySubscriptions.companyId, membership.company.id));

      // Create new subscription
      await db.insert(companySubscriptions).values({
        companyId: membership.company.id,
        planId: input.planId,
        status: "active",
        billingCycle: input.billingCycle,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      });

      return { success: true };
    }),

  cancel: protectedProcedure.mutation(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) throw new Error("No company found");
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    await db.update(companySubscriptions)
      .set({ status: "cancelled" })
      .where(eq(companySubscriptions.companyId, membership.company.id));

    return { success: true };
  }),

  // List invoices for current company
  invoices: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return [];
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(subscriptionInvoices)
      .where(eq(subscriptionInvoices.companyId, membership.company.id))
      .orderBy(desc(subscriptionInvoices.createdAt))
      .limit(20);
  }),

  // Generate invoice for current subscription period
  generateInvoice: protectedProcedure.mutation(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) throw new Error("No company found");
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    // Get active subscription with plan
    const subs = await db
      .select({ sub: companySubscriptions, plan: subscriptionPlans })
      .from(companySubscriptions)
      .leftJoin(subscriptionPlans, eq(companySubscriptions.planId, subscriptionPlans.id))
      .where(and(
        eq(companySubscriptions.companyId, membership.company.id),
        eq(companySubscriptions.status, "active")
      ))
      .limit(1);

    if (!subs.length || !subs[0].plan) throw new Error("No active subscription found");

    const { sub, plan } = subs[0];
    const amount = sub.billingCycle === "annual" ? plan.priceAnnual : plan.priceMonthly;
    const invoiceNumber = `INV-${new Date().getFullYear()}-${nanoid(6).toUpperCase()}`;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14); // Net 14

    await db.insert(subscriptionInvoices).values({
      companyId: membership.company.id,
      subscriptionId: sub.id,
      invoiceNumber,
      amount,
      currency: plan.currency ?? "OMR",
      status: "issued",
      dueDate,
    });

    return { success: true, invoiceNumber };
  }),

  // Mark invoice as paid
  markInvoicePaid: protectedProcedure
    .input(z.object({ invoiceId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) throw new Error("No company found");
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      await db.update(subscriptionInvoices)
        .set({ status: "paid", paidAt: new Date() })
        .where(and(
          eq(subscriptionInvoices.id, input.invoiceId),
          eq(subscriptionInvoices.companyId, membership.company.id)
        ));

      return { success: true };
    }),

  // Check if a feature is available on current plan
  checkFeature: protectedProcedure
    .input(z.object({ feature: z.string() }))
    .query(async ({ input, ctx }) => {
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) return { allowed: false, reason: "No company" };
      const db = await getDb();
      if (!db) return { allowed: false, reason: "DB unavailable" };

      const subs = await db
        .select({ sub: companySubscriptions, plan: subscriptionPlans })
        .from(companySubscriptions)
        .leftJoin(subscriptionPlans, eq(companySubscriptions.planId, subscriptionPlans.id))
        .where(and(
          eq(companySubscriptions.companyId, membership.company.id),
          eq(companySubscriptions.status, "active")
        ))
        .limit(1);

      if (!subs.length || !subs[0].plan) return { allowed: false, reason: "No active subscription" };

      const features = subs[0].plan.features as string[] ?? [];
      const allowed = features.includes(input.feature);
      return { allowed, planName: subs[0].plan.name, features };
    }),
});

