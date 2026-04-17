import { nanoid } from "nanoid";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createMarketplaceBooking,
  createProvider,
  getMarketplaceBookings,
  getMarketplaceProviders,
  getProviderById,
  getProviderServices,
  updateProvider,
  getUserCompanyById,
} from "../db";
import { requireNotAuditor } from "../_core/membership";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { requireActiveCompanyId } from "../_core/tenant";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";

export const marketplaceRouter = router({
  listProviders: publicProcedure
    .input(
      z.object({
        category: z.string().optional(),
        search: z.string().optional(),
        status: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      return getMarketplaceProviders(input);
    }),

  getProvider: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const provider = await getProviderById(input.id);
    const services = await getProviderServices(input.id);
    return { provider, services };
  }),

  registerProvider: protectedProcedure
    .input(
      z.object({
        businessName: z.string().min(2),
        businessNameAr: z.string().optional(),
        category: z.string().min(2),
        description: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        website: z.string().optional(),
        location: z.string().optional(),
        city: z.string().optional(),
        tags: z.array(z.string()).default([]),
        companyId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const m = await getUserCompanyById(ctx.user.id, companyId);
      if (!m?.member) throw new TRPCError({ code: "FORBIDDEN", message: "No active company membership." });
      requireNotAuditor(m.member.role, "External Auditors cannot register providers.");
      const { companyId: _omit, ...rest } = input;
      await createProvider({
        ...rest,
        userId: ctx.user.id,
        companyId,
      });
      return { success: true };
    }),

  updateProvider: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        businessName: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(["active", "inactive", "pending_review", "suspended"]).optional(),
        isVerified: z.boolean().optional(),
        isFeatured: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const p = await getProviderById(id);
      if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Provider not found" });
      if (canAccessGlobalAdminProcedures(ctx.user)) {
        await updateProvider(id, data);
        return { success: true };
      }
      if (p.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Provider not found" });
      }
      await updateProvider(id, data);
      return { success: true };
    }),

  listBookings: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user);
      return getMarketplaceBookings(companyId);
    }),

  createBooking: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        providerId: z.number(),
        serviceId: z.number(),
        scheduledAt: z.string().optional(),
        notes: z.string().optional(),
        amount: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const bookingNumber = "BK-" + Date.now() + "-" + nanoid(4).toUpperCase();
      const { companyId: _omit, ...bookingRest } = input;
      const bookingId = await createMarketplaceBooking({
        ...bookingRest,
        companyId,
        clientId: ctx.user.id,
        bookingNumber,
        amount: input.amount ? String(input.amount) : undefined,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
      });
      const { getDb } = await import("../db");
      const { tryCreateEngagementFromSource } = await import("../services/engagementAutoCreate");
      const db = await getDb();
      if (db) {
        await tryCreateEngagementFromSource(db, companyId, ctx.user.id, {
          sourceType: "marketplace_booking",
          sourceId: bookingId,
        });
      }
      return { success: true, bookingNumber };
    }),

  categories: publicProcedure.query(() => {
    return [
      "PRO Services",
      "Legal Services",
      "Accounting & Finance",
      "IT & Technology",
      "HR Consulting",
      "Business Setup",
      "Translation",
      "Logistics",
      "Marketing",
      "Real Estate",
    ];
  }),

  // Submit a review for a completed booking
  submitReview: protectedProcedure
    .input(z.object({
      bookingId: z.number(),
      rating: z.number().min(1).max(5),
      review: z.string().max(1000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { getDb } = await import("../db");
      const { marketplaceBookings, marketplaceProviders } = await import("../../drizzle/schema");
      const { eq, sql } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      // Get booking and verify ownership
      const bookings = await db.select().from(marketplaceBookings)
        .where(eq(marketplaceBookings.id, input.bookingId)).limit(1);
      if (!bookings.length) throw new Error("Booking not found");
      const booking = bookings[0];
      if (booking.clientId !== ctx.user.id) throw new Error("Not authorized");
      if (booking.status !== "completed") throw new Error("Can only review completed bookings");
      if (booking.rating) throw new Error("Already reviewed");

      // Save review on booking
      await db.update(marketplaceBookings)
        .set({ rating: input.rating, review: input.review ?? null })
        .where(eq(marketplaceBookings.id, input.bookingId));

      // Update provider average rating
      const allRatings = await db.select({ rating: marketplaceBookings.rating })
        .from(marketplaceBookings)
        .where(eq(marketplaceBookings.providerId, booking.providerId));
      const validRatings = allRatings.filter(r => r.rating !== null);
      const avgRating = validRatings.length
        ? validRatings.reduce((s, r) => s + (r.rating ?? 0), 0) / validRatings.length
        : 0;

      await db.update(marketplaceProviders)
        .set({
          rating: String(avgRating.toFixed(2)),
          reviewCount: validRatings.length,
        })
        .where(eq(marketplaceProviders.id, booking.providerId));

      return { success: true };
    }),

  // Get reviews for a provider (from completed bookings)
  getProviderReviews: publicProcedure
    .input(z.object({ providerId: z.number() }))
    .query(async ({ input }) => {
      const { getDb } = await import("../db");
      const { marketplaceBookings } = await import("../../drizzle/schema");
      const { eq, and, isNotNull } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return [];
      return db.select({
        id: marketplaceBookings.id,
        rating: marketplaceBookings.rating,
        review: marketplaceBookings.review,
        completedAt: marketplaceBookings.completedAt,
        bookingNumber: marketplaceBookings.bookingNumber,
      })
        .from(marketplaceBookings)
        .where(and(
          eq(marketplaceBookings.providerId, input.providerId),
          isNotNull(marketplaceBookings.rating)
        ))
        .limit(20);
    }),
});
