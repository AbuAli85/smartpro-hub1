import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { subscriptionPlans, companySubscriptions, subscriptionInvoices } from "../../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getActiveCompanyMembership, requireActiveCompanyMembership } from "../_core/membership";

export const subscriptionsRouter = router({
  plans: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true));
  }),

  current: protectedProcedure.query(async ({ ctx }) => {
    const m = await getActiveCompanyMembership(ctx.user.id);
    if (!m) return null;
    const db = await getDb();
    if (!db) return null;
    const subs = await db
      .select({ sub: companySubscriptions, plan: subscriptionPlans })
      .from(companySubscriptions)
      .leftJoin(subscriptionPlans, eq(companySubscriptions.planId, subscriptionPlans.id))
      .where(eq(companySubscriptions.companyId, m.companyId))
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
      const { companyId } = await requireActiveCompanyMembership(ctx.user.id);
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      }

      const plan = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, input.planId)).limit(1);
      if (!plan.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
      }

      const now = new Date();
      const periodEnd = new Date(now);
      if (input.billingCycle === "monthly") {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      } else {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      }

      await db.update(companySubscriptions)
        .set({ status: "cancelled" })
        .where(eq(companySubscriptions.companyId, companyId));

      await db.insert(companySubscriptions).values({
        companyId,
        planId: input.planId,
        status: "active",
        billingCycle: input.billingCycle,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      });

      return { success: true };
    }),

  cancel: protectedProcedure.mutation(async ({ ctx }) => {
    const { companyId } = await requireActiveCompanyMembership(ctx.user.id);
    const db = await getDb();
    if (!db) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    }

    await db.update(companySubscriptions)
      .set({ status: "cancelled" })
      .where(eq(companySubscriptions.companyId, companyId));

    return { success: true };
  }),

  invoices: protectedProcedure.query(async ({ ctx }) => {
    const m = await getActiveCompanyMembership(ctx.user.id);
    if (!m) return [];
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(subscriptionInvoices)
      .where(eq(subscriptionInvoices.companyId, m.companyId))
      .orderBy(desc(subscriptionInvoices.createdAt))
      .limit(20);
  }),

  generateInvoice: protectedProcedure.mutation(async ({ ctx }) => {
    const { companyId } = await requireActiveCompanyMembership(ctx.user.id);
    const db = await getDb();
    if (!db) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    }

    const subs = await db
      .select({ sub: companySubscriptions, plan: subscriptionPlans })
      .from(companySubscriptions)
      .leftJoin(subscriptionPlans, eq(companySubscriptions.planId, subscriptionPlans.id))
      .where(and(
        eq(companySubscriptions.companyId, companyId),
        eq(companySubscriptions.status, "active"),
      ))
      .limit(1);

    if (!subs.length || !subs[0].plan) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "No active subscription found" });
    }

    const { sub, plan } = subs[0];
    const amount = sub.billingCycle === "annual" ? plan.priceAnnual : plan.priceMonthly;
    const invoiceNumber = `INV-${new Date().getFullYear()}-${nanoid(6).toUpperCase()}`;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14);

    await db.insert(subscriptionInvoices).values({
      companyId,
      subscriptionId: sub.id,
      invoiceNumber,
      amount,
      currency: plan.currency ?? "OMR",
      status: "issued",
      dueDate,
    });

    return { success: true, invoiceNumber };
  }),

  markInvoicePaid: protectedProcedure
    .input(z.object({ invoiceId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const { companyId } = await requireActiveCompanyMembership(ctx.user.id);
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      }

      await db.update(subscriptionInvoices)
        .set({ status: "paid", paidAt: new Date() })
        .where(and(
          eq(subscriptionInvoices.id, input.invoiceId),
          eq(subscriptionInvoices.companyId, companyId),
        ));

      return { success: true };
    }),

  checkFeature: protectedProcedure
    .input(z.object({ feature: z.string() }))
    .query(async ({ input, ctx }) => {
      const m = await getActiveCompanyMembership(ctx.user.id);
      if (!m) return { allowed: false, reason: "No company" };
      const db = await getDb();
      if (!db) return { allowed: false, reason: "DB unavailable" };

      const subs = await db
        .select({ sub: companySubscriptions, plan: subscriptionPlans })
        .from(companySubscriptions)
        .leftJoin(subscriptionPlans, eq(companySubscriptions.planId, subscriptionPlans.id))
        .where(and(
          eq(companySubscriptions.companyId, m.companyId),
          eq(companySubscriptions.status, "active"),
        ))
        .limit(1);

      if (!subs.length || !subs[0].plan) return { allowed: false, reason: "No active subscription" };

      const features = subs[0].plan.features as string[] ?? [];
      const allowed = features.includes(input.feature);
      return { allowed, planName: subs[0].plan.name, features };
    }),
});
