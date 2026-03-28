import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  createCompany,
  getCompanies,
  getCompanyById,
  getCompanyStats,
  getCompanySubscription,
  getSubscriptionPlans,
  getUserCompany,
  updateCompany,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";

export const companiesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      const membership = await getUserCompany(ctx.user.id);
      return membership ? [membership.company] : [];
    }
    return getCompanies();
  }),

  getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
    const company = await getCompanyById(input.id);
    if (!company) throw new TRPCError({ code: "NOT_FOUND" });
    return company;
  }),

  myCompany: protectedProcedure.query(async ({ ctx }) => {
    return getUserCompany(ctx.user.id);
  }),

  myStats: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return null;
    return getCompanyStats(membership.company.id);
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2),
        nameAr: z.string().optional(),
        industry: z.string().optional(),
        country: z.string().default("OM"),
        city: z.string().optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        website: z.string().optional(),
        registrationNumber: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const slug = input.name.toLowerCase().replace(/\s+/g, "-") + "-" + nanoid(6);
      await createCompany({ ...input, slug, subscriptionPlanId: 1 });
      return { success: true };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        nameAr: z.string().optional(),
        industry: z.string().optional(),
        city: z.string().optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        website: z.string().optional(),
        status: z.enum(["active", "suspended", "pending", "cancelled"]).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      await updateCompany(id, data);
      return { success: true };
    }),

  subscriptionPlans: protectedProcedure.query(() => getSubscriptionPlans()),

  mySubscription: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return null;
    return getCompanySubscription(membership.company.id);
  }),
});
