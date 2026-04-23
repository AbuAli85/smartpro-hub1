import { z } from "zod";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  sanadRatings,
  sanadRatingReplies,
  sanadOffices,
  companies,
  users,
  sanadServiceRequests,
} from "../../drizzle/schema";
import { and, avg, count, desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { notifyOwner } from "../_core/notification";
import { requireActiveCompanyId } from "../_core/tenant";
import type { User } from "../../drizzle/schema";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clampRating(v: number) {
  return Math.max(1, Math.min(5, Math.round(v)));
}

async function recomputeOfficeScore(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  officeId: number
) {
  const [agg] = await db
    .select({
      avgOverall: avg(sanadRatings.overallRating),
      total: count(sanadRatings.id),
    })
    .from(sanadRatings)
    .where(
      and(
        eq(sanadRatings.officeId, officeId),
        eq(sanadRatings.isPublished, true)
      )
    );

  const avgScore = agg.avgOverall ? Number(agg.avgOverall) : null;
  await db
    .update(sanadOffices)
    .set({
      avgRating: avgScore ? String(Math.round(avgScore * 10) / 10) : null,
      totalReviews: Number(agg.total),
    })
    .where(eq(sanadOffices.id, officeId));
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const ratingsRouter = router({
  // ── Submit a rating (companies only) ──────────────────────────────────────
  submitRating: protectedProcedure
    .input(
      z.object({
        officeId: z.number().int().positive(),
        serviceRequestId: z.number().int().positive().optional(),
        overallRating: z.number().int().min(1).max(5),
        speedRating: z.number().int().min(1).max(5).optional(),
        qualityRating: z.number().int().min(1).max(5).optional(),
        communicationRating: z.number().int().min(1).max(5).optional(),
        reviewTitle: z.string().max(255).optional(),
        reviewBody: z.string().max(2000).optional(),
        companyId: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // AUTH FIRST: guard before DB
      const companyId = await requireActiveCompanyId(
        ctx.user.id,
        input.companyId,
        ctx.user as User
      );
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB unavailable",
        });

      // Verify office exists
      const [office] = await db
        .select({ id: sanadOffices.id, name: sanadOffices.name })
        .from(sanadOffices)
        .where(eq(sanadOffices.id, input.officeId));
      if (!office)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Sanad centre not found",
        });

      // Prevent duplicate review per company per office
      const [existing] = await db
        .select({ id: sanadRatings.id })
        .from(sanadRatings)
        .where(
          and(
            eq(sanadRatings.officeId, input.officeId),
            eq(sanadRatings.companyId, companyId)
          )
        );
      if (existing)
        throw new TRPCError({
          code: "CONFLICT",
          message: "Your company has already reviewed this centre",
        });

      // Check if linked to a verified completed service request
      let isVerified = false;
      if (input.serviceRequestId) {
        const [req] = await db
          .select({
            id: sanadServiceRequests.id,
            status: sanadServiceRequests.status,
          })
          .from(sanadServiceRequests)
          .where(
            and(
              eq(sanadServiceRequests.id, input.serviceRequestId),
              eq(sanadServiceRequests.officeId, input.officeId),
              eq(sanadServiceRequests.requesterCompanyId, companyId)
            )
          );
        isVerified = req?.status === "completed";
      }

      const [inserted] = await db.insert(sanadRatings).values({
        officeId: input.officeId,
        companyId,
        reviewerUserId: ctx.user.id,
        serviceRequestId: input.serviceRequestId ?? null,
        overallRating: clampRating(input.overallRating),
        speedRating: input.speedRating ? clampRating(input.speedRating) : null,
        qualityRating: input.qualityRating
          ? clampRating(input.qualityRating)
          : null,
        communicationRating: input.communicationRating
          ? clampRating(input.communicationRating)
          : null,
        reviewTitle: input.reviewTitle ?? null,
        reviewBody: input.reviewBody ?? null,
        isVerified,
        isPublished: true,
      });

      const ratingId = (inserted as unknown as { insertId: number }).insertId;
      await recomputeOfficeScore(db, input.officeId);

      await notifyOwner({
        title: `New ${isVerified ? "Verified " : ""}Review for ${office.name}`,
        content: `Rating: ${input.overallRating}/5${input.reviewBody ? ` — "${input.reviewBody.slice(0, 100)}"` : ""}`,
      }).catch(() => {});

      return { id: ratingId, isVerified };
    }),

  // ── Get ratings for a specific office (public) ────────────────────────────
  getOfficeRatings: publicProcedure
    .input(
      z.object({
        officeId: z.number().int().positive(),
        limit: z.number().int().min(1).max(50).default(20),
        offset: z.number().int().min(0).default(0),
        verifiedOnly: z.boolean().default(false),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { ratings: [], total: 0, aggregate: null };

      const conditions = [
        eq(sanadRatings.officeId, input.officeId),
        eq(sanadRatings.isPublished, true),
      ];
      if (input.verifiedOnly)
        conditions.push(eq(sanadRatings.isVerified, true));

      const [aggregate] = await db
        .select({
          avgOverall: avg(sanadRatings.overallRating),
          avgSpeed: avg(sanadRatings.speedRating),
          avgQuality: avg(sanadRatings.qualityRating),
          avgComm: avg(sanadRatings.communicationRating),
          total: count(sanadRatings.id),
          verified: sql<number>`SUM(CASE WHEN ${sanadRatings.isVerified} = 1 THEN 1 ELSE 0 END)`,
          star5: sql<number>`SUM(CASE WHEN ${sanadRatings.overallRating} = 5 THEN 1 ELSE 0 END)`,
          star4: sql<number>`SUM(CASE WHEN ${sanadRatings.overallRating} = 4 THEN 1 ELSE 0 END)`,
          star3: sql<number>`SUM(CASE WHEN ${sanadRatings.overallRating} = 3 THEN 1 ELSE 0 END)`,
          star2: sql<number>`SUM(CASE WHEN ${sanadRatings.overallRating} = 2 THEN 1 ELSE 0 END)`,
          star1: sql<number>`SUM(CASE WHEN ${sanadRatings.overallRating} = 1 THEN 1 ELSE 0 END)`,
        })
        .from(sanadRatings)
        .where(
          and(
            eq(sanadRatings.officeId, input.officeId),
            eq(sanadRatings.isPublished, true)
          )
        );

      const ratings = await db
        .select({
          id: sanadRatings.id,
          overallRating: sanadRatings.overallRating,
          speedRating: sanadRatings.speedRating,
          qualityRating: sanadRatings.qualityRating,
          communicationRating: sanadRatings.communicationRating,
          reviewTitle: sanadRatings.reviewTitle,
          reviewBody: sanadRatings.reviewBody,
          isVerified: sanadRatings.isVerified,
          helpfulCount: sanadRatings.helpfulCount,
          createdAt: sanadRatings.createdAt,
          reviewerName: users.name,
          companyName: companies.name,
        })
        .from(sanadRatings)
        .leftJoin(users, eq(sanadRatings.reviewerUserId, users.id))
        .leftJoin(companies, eq(sanadRatings.companyId, companies.id))
        .where(and(...conditions))
        .orderBy(desc(sanadRatings.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      // Fetch replies for each rating
      const ratingIds = ratings.map(r => r.id);
      let replies: Array<{
        ratingId: number;
        id: number;
        replyBody: string;
        createdAt: Date;
        replierName: string | null;
      }> = [];
      if (ratingIds.length) {
        replies = await db
          .select({
            ratingId: sanadRatingReplies.ratingId,
            id: sanadRatingReplies.id,
            replyBody: sanadRatingReplies.replyBody,
            createdAt: sanadRatingReplies.createdAt,
            replierName: users.name,
          })
          .from(sanadRatingReplies)
          .leftJoin(users, eq(sanadRatingReplies.repliedByUserId, users.id))
          .where(
            sql`${sanadRatingReplies.ratingId} IN (${sql.join(
              ratingIds.map(id => sql`${id}`),
              sql`, `
            )})`
          );
      }

      const repliesByRating = replies.reduce<Record<number, typeof replies>>(
        (acc, r) => {
          if (!acc[r.ratingId]) acc[r.ratingId] = [];
          acc[r.ratingId].push(r);
          return acc;
        },
        {}
      );

      return {
        ratings: ratings.map(r => ({
          ...r,
          replies: repliesByRating[r.id] ?? [],
        })),
        total: Number(aggregate.total),
        aggregate: aggregate.total
          ? {
              avgOverall: aggregate.avgOverall
                ? Math.round(Number(aggregate.avgOverall) * 10) / 10
                : null,
              avgSpeed: aggregate.avgSpeed
                ? Math.round(Number(aggregate.avgSpeed) * 10) / 10
                : null,
              avgQuality: aggregate.avgQuality
                ? Math.round(Number(aggregate.avgQuality) * 10) / 10
                : null,
              avgComm: aggregate.avgComm
                ? Math.round(Number(aggregate.avgComm) * 10) / 10
                : null,
              total: Number(aggregate.total),
              verified: Number(aggregate.verified),
              distribution: {
                5: Number(aggregate.star5),
                4: Number(aggregate.star4),
                3: Number(aggregate.star3),
                2: Number(aggregate.star2),
                1: Number(aggregate.star1),
              },
            }
          : null,
      };
    }),

  // ── Reply to a rating (office admin) ─────────────────────────────────────
  replyToRating: protectedProcedure
    .input(
      z.object({
        ratingId: z.number().int().positive(),
        replyBody: z.string().min(1).max(1000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB unavailable",
        });

      const [rating] = await db
        .select({ id: sanadRatings.id })
        .from(sanadRatings)
        .where(eq(sanadRatings.id, input.ratingId));
      if (!rating)
        throw new TRPCError({ code: "NOT_FOUND", message: "Rating not found" });

      // Only allow one reply per rating
      const [existingReply] = await db
        .select({ id: sanadRatingReplies.id })
        .from(sanadRatingReplies)
        .where(eq(sanadRatingReplies.ratingId, input.ratingId));
      if (existingReply)
        throw new TRPCError({
          code: "CONFLICT",
          message: "A reply already exists for this review",
        });

      const [inserted] = await db.insert(sanadRatingReplies).values({
        ratingId: input.ratingId,
        repliedByUserId: ctx.user.id,
        replyBody: input.replyBody,
      });

      return { id: (inserted as unknown as { insertId: number }).insertId };
    }),

  // ── Mark a review as helpful ──────────────────────────────────────────────
  markHelpful: protectedProcedure
    .input(z.object({ ratingId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB unavailable",
        });

      await db
        .update(sanadRatings)
        .set({ helpfulCount: sql`${sanadRatings.helpfulCount} + 1` })
        .where(eq(sanadRatings.id, input.ratingId));

      return { success: true };
    }),

  // ── Moderate a rating (admin only) ───────────────────────────────────────
  moderateRating: protectedProcedure
    .input(
      z.object({
        ratingId: z.number().int().positive(),
        isPublished: z.boolean(),
        moderationNote: z.string().max(500).optional(),
      })
    )
     .mutation(async ({ ctx, input }) => {
      // AUTH FIRST: guard before DB
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required",
        });
      }
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB unavailable",
        });

      await db
        .update(sanadRatings)
        .set({
          isPublished: input.isPublished,
          moderationNote: input.moderationNote ?? null,
          moderatedBy: ctx.user.id,
          moderatedAt: new Date(),
        })
        .where(eq(sanadRatings.id, input.ratingId));

      // Recompute office score after moderation
      const [rating] = await db
        .select({ officeId: sanadRatings.officeId })
        .from(sanadRatings)
        .where(eq(sanadRatings.id, input.ratingId));
      if (rating) await recomputeOfficeScore(db, rating.officeId);

      return { success: true };
    }),

  // ── List all ratings for moderation (admin) ───────────────────────────────
  listForModeration: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
        publishedOnly: z.boolean().optional(),
        officeId: z.number().int().positive().optional(),
      })
    )
    .query(async ({ ctx, input }) => {

      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required",
        });
      const db = await getDb();
      if (!db) return { ratings: [], total: 0 };
      }

      const conditions: ReturnType<typeof eq>[] = [];
      if (input.publishedOnly === true)
        conditions.push(eq(sanadRatings.isPublished, true));
      if (input.publishedOnly === false)
        conditions.push(eq(sanadRatings.isPublished, false));
      if (input.officeId)
        conditions.push(eq(sanadRatings.officeId, input.officeId));

      const [{ total }] = await db
        .select({ total: count(sanadRatings.id) })
        .from(sanadRatings)
        .where(conditions.length ? and(...conditions) : undefined);

      const ratings = await db
        .select({
          id: sanadRatings.id,
          officeId: sanadRatings.officeId,
          officeName: sanadOffices.name,
          overallRating: sanadRatings.overallRating,
          reviewTitle: sanadRatings.reviewTitle,
          reviewBody: sanadRatings.reviewBody,
          isVerified: sanadRatings.isVerified,
          isPublished: sanadRatings.isPublished,
          moderationNote: sanadRatings.moderationNote,
          helpfulCount: sanadRatings.helpfulCount,
          createdAt: sanadRatings.createdAt,
          reviewerName: users.name,
          companyName: companies.name,
        })
        .from(sanadRatings)
        .leftJoin(sanadOffices, eq(sanadRatings.officeId, sanadOffices.id))
        .leftJoin(users, eq(sanadRatings.reviewerUserId, users.id))
        .leftJoin(companies, eq(sanadRatings.companyId, companies.id))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(sanadRatings.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return { ratings, total: Number(total) };
    }),

  // ── Get my company's rating for an office ─────────────────────────────────
  getMyRating: protectedProcedure
    .input(
      z.object({
        officeId: z.number().int().positive(),
        companyId: z.number().int().positive().optional(),
      })
    )
    .query(async ({ ctx, input }) => {

      const companyId = await requireActiveCompanyId(
        ctx.user.id,
        input.companyId,
        ctx.user as User
      );
      const db = await getDb();
      if (!db) return null;

      const [rating] = await db
        .select()
        .from(sanadRatings)
        .where(
          and(
            eq(sanadRatings.officeId, input.officeId),
            eq(sanadRatings.companyId, companyId)
          )
        );

      return rating ?? null;
    }),

  // ── Get rating stats summary for a Sanad office dashboard ─────────────────
  getOfficeDashboardStats: protectedProcedure
    .input(z.object({ officeId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const [agg] = await db
        .select({
          avgOverall: avg(sanadRatings.overallRating),
          total: count(sanadRatings.id),
          verified: sql<number>`SUM(CASE WHEN ${sanadRatings.isVerified} = 1 THEN 1 ELSE 0 END)`,
          thisMonth: sql<number>`SUM(CASE WHEN ${sanadRatings.createdAt} >= DATE_FORMAT(NOW(), '%Y-%m-01') THEN 1 ELSE 0 END)`,
        })
        .from(sanadRatings)
        .where(
          and(
            eq(sanadRatings.officeId, input.officeId),
            eq(sanadRatings.isPublished, true)
          )
        );

      return {
        avgOverall: agg.avgOverall
          ? Math.round(Number(agg.avgOverall) * 10) / 10
          : null,
        total: Number(agg.total),
        verified: Number(agg.verified),
        thisMonth: Number(agg.thisMonth),
      };
    }),
});
