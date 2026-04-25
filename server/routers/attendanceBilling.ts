/**
 * Attendance Billing Candidates router (Phase 12C).
 *
 * Finance/admin review surface for draft billing artifacts created by
 * onClientApprovalComplete when a client approval batch is approved.
 *
 * Access: company_admin and finance_admin only.
 * hr_admin is excluded by default (Phase 12C policy).
 *
 * Procedures:
 *   listAttendanceBillingCandidates    — paginated list with filters
 *   getAttendanceBillingCandidate      — detail with parsed billing lines
 *   markAttendanceBillingCandidateReviewReady — draft → review_ready
 *   cancelAttendanceBillingCandidate   — draft/review_ready → cancelled
 *
 * No invoice is created or issued by any procedure in this router.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { requireDb } from "../db.client";
import { requireFinanceOrAdmin } from "../_core/policy";
import {
  attendanceBillingCandidates,
  type AttendanceBillingLineItem,
} from "../../drizzle/schema";
import type { User } from "../../drizzle/schema";

const candidateIdInput = z.object({
  candidateId: z.number().int().positive(),
});

export const attendanceBillingRouter = router({
  /**
   * List attendance billing candidates for the active company.
   * Filters: status, periodStart, periodEnd, clientCompanyId.
   */
  listAttendanceBillingCandidates: protectedProcedure
    .input(
      z.object({
        status: z.enum(["draft", "review_ready", "cancelled"]).optional(),
        periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        clientCompanyId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { companyId } = await requireFinanceOrAdmin(ctx.user as User);
      const db = await requireDb();

      const conditions = [eq(attendanceBillingCandidates.companyId, companyId)];
      if (input.status) {
        conditions.push(eq(attendanceBillingCandidates.status, input.status));
      }
      if (input.periodStart) {
        conditions.push(gte(attendanceBillingCandidates.periodStart, input.periodStart));
      }
      if (input.periodEnd) {
        conditions.push(lte(attendanceBillingCandidates.periodEnd, input.periodEnd));
      }
      if (input.clientCompanyId != null) {
        conditions.push(
          eq(attendanceBillingCandidates.clientCompanyId, input.clientCompanyId),
        );
      }

      const rows = await db
        .select({
          id: attendanceBillingCandidates.id,
          batchId: attendanceBillingCandidates.batchId,
          companyId: attendanceBillingCandidates.companyId,
          clientCompanyId: attendanceBillingCandidates.clientCompanyId,
          periodStart: attendanceBillingCandidates.periodStart,
          periodEnd: attendanceBillingCandidates.periodEnd,
          source: attendanceBillingCandidates.source,
          status: attendanceBillingCandidates.status,
          approvedItemCount: attendanceBillingCandidates.approvedItemCount,
          snapshotMissingCount: attendanceBillingCandidates.snapshotMissingCount,
          totalDurationMinutes: attendanceBillingCandidates.totalDurationMinutes,
          createdAt: attendanceBillingCandidates.createdAt,
          updatedAt: attendanceBillingCandidates.updatedAt,
        })
        .from(attendanceBillingCandidates)
        .where(and(...conditions))
        .orderBy(desc(attendanceBillingCandidates.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return rows;
    }),

  /**
   * Get a single billing candidate with full parsed billing lines.
   * Returns a warning flag when snapshotMissingCount > 0.
   */
  getAttendanceBillingCandidate: protectedProcedure
    .input(candidateIdInput)
    .query(async ({ ctx, input }) => {
      const { companyId } = await requireFinanceOrAdmin(ctx.user as User);
      const db = await requireDb();

      const rows = await db
        .select()
        .from(attendanceBillingCandidates)
        .where(
          and(
            eq(attendanceBillingCandidates.id, input.candidateId),
            eq(attendanceBillingCandidates.companyId, companyId),
          ),
        )
        .limit(1);

      const candidate = rows[0];
      if (!candidate) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Billing candidate not found." });
      }

      // Validate billingLinesJson shape defensively
      let lines: AttendanceBillingLineItem[] = [];
      if (Array.isArray(candidate.billingLinesJson)) {
        lines = candidate.billingLinesJson as AttendanceBillingLineItem[];
      } else {
        console.warn(
          `[billing] candidate ${candidate.id} has unexpected billingLinesJson shape — returning empty lines`,
        );
      }

      return {
        ...candidate,
        billingLinesJson: lines,
        hasSnapshotWarning: candidate.snapshotMissingCount > 0,
        totalHours:
          candidate.totalDurationMinutes != null
            ? Math.round((candidate.totalDurationMinutes / 60) * 10) / 10
            : null,
      };
    }),

  /**
   * Transition a draft billing candidate to review_ready.
   * Only draft candidates can be marked review-ready.
   * Does NOT create or issue an invoice.
   */
  markAttendanceBillingCandidateReviewReady: protectedProcedure
    .input(candidateIdInput)
    .mutation(async ({ ctx, input }) => {
      const { companyId } = await requireFinanceOrAdmin(ctx.user as User);
      const db = await requireDb();

      const rows = await db
        .select({
          id: attendanceBillingCandidates.id,
          status: attendanceBillingCandidates.status,
        })
        .from(attendanceBillingCandidates)
        .where(
          and(
            eq(attendanceBillingCandidates.id, input.candidateId),
            eq(attendanceBillingCandidates.companyId, companyId),
          ),
        )
        .limit(1);

      const candidate = rows[0];
      if (!candidate) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Billing candidate not found." });
      }
      if (candidate.status !== "draft") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot mark review-ready: candidate is already '${candidate.status}'. Only draft candidates can be marked review-ready.`,
        });
      }

      await db
        .update(attendanceBillingCandidates)
        .set({ status: "review_ready" })
        .where(eq(attendanceBillingCandidates.id, input.candidateId));

      console.log(
        `[billing] candidate ${input.candidateId} marked review_ready userId=${ctx.user.id} companyId=${companyId}`,
      );

      return { candidateId: input.candidateId, status: "review_ready" as const };
    }),

  /**
   * Cancel a draft or review_ready billing candidate.
   * Cancelling an already-cancelled candidate is idempotent.
   */
  cancelAttendanceBillingCandidate: protectedProcedure
    .input(candidateIdInput)
    .mutation(async ({ ctx, input }) => {
      const { companyId } = await requireFinanceOrAdmin(ctx.user as User);
      const db = await requireDb();

      const rows = await db
        .select({
          id: attendanceBillingCandidates.id,
          status: attendanceBillingCandidates.status,
        })
        .from(attendanceBillingCandidates)
        .where(
          and(
            eq(attendanceBillingCandidates.id, input.candidateId),
            eq(attendanceBillingCandidates.companyId, companyId),
          ),
        )
        .limit(1);

      const candidate = rows[0];
      if (!candidate) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Billing candidate not found." });
      }
      if (candidate.status === "cancelled") {
        return { candidateId: input.candidateId, status: "cancelled" as const };
      }
      if (candidate.status !== "draft" && candidate.status !== "review_ready") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot cancel a candidate with status '${candidate.status}'.`,
        });
      }

      await db
        .update(attendanceBillingCandidates)
        .set({ status: "cancelled" })
        .where(eq(attendanceBillingCandidates.id, input.candidateId));

      console.log(
        `[billing] candidate ${input.candidateId} cancelled userId=${ctx.user.id} companyId=${companyId}`,
      );

      return { candidateId: input.candidateId, status: "cancelled" as const };
    }),
});
