import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { subscriptionPlans, companySubscriptions } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { getUserCompany } from "../db";

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
});
