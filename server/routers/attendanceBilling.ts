/**
 * Attendance Billing router (Phase 12C + 12D).
 *
 * Phase 12C — Candidate review surface (finance/admin):
 *   listAttendanceBillingCandidates    — paginated list with filters
 *   getAttendanceBillingCandidate      — detail + parsed lines + invoice linkage
 *   markAttendanceBillingCandidateReviewReady — draft → review_ready
 *   cancelAttendanceBillingCandidate   — draft/review_ready → cancelled
 *                                        (blocked when non-cancelled invoice exists)
 *
 * Phase 12D — Draft invoice conversion (finance/admin):
 *   convertAttendanceBillingCandidateToInvoice — review_ready candidate → draft invoice
 *   listAttendanceInvoices             — paginated list with filters
 *   getAttendanceInvoice               — detail with parsed billing lines
 *   cancelAttendanceInvoice            — draft/review_ready → cancelled
 *
 * Access: company_admin and finance_admin only (requireFinanceOrAdmin).
 * hr_admin is excluded — Phase 12C/12D policy.
 *
 * No invoice issuance, no payment records, no PDF/HTML artifacts in this phase.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, lte, isNotNull } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { requireDb } from "../db.client";
import { requireFinanceOrAdmin } from "../_core/policy";
import {
  attendanceBillingCandidates,
  attendanceInvoices,
  companies,
  type AttendanceBillingLineItem,
  type User,
} from "../../drizzle/schema";

// ─── Shared input schemas ─────────────────────────────────────────────────────

const candidateIdInput = z.object({
  candidateId: z.number().int().positive(),
});

const invoiceIdInput = z.object({
  invoiceId: z.number().int().positive(),
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format: ABIN-{companyId}-{clientCompanyId}-{YYYYMMDD}-{candidateId} */
function buildInvoiceNumber(
  companyId: number,
  clientCompanyId: number,
  periodStart: string,
  candidateId: number,
): string {
  const yyyymmdd = periodStart.replace(/-/g, "");
  return `ABIN-${companyId}-${clientCompanyId}-${yyyymmdd}-${candidateId}`;
}

/** Round to 3 decimal places (OMR standard). */
function round3(n: number): string {
  return (Math.round(n * 1000) / 1000).toFixed(3);
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const attendanceBillingRouter = router({
  // ─── Phase 12C: Candidate procedures ────────────────────────────────────────

  /**
   * List attendance billing candidates for the active company.
   * Filters: status, periodStart, periodEnd, clientCompanyId.
   */
  listAttendanceBillingCandidates: protectedProcedure
    .input(
      z.object({
        status: z.enum(["draft", "review_ready", "cancelled"]).optional(),
        periodStart: z.string().regex(DATE_RE).optional(),
        periodEnd: z.string().regex(DATE_RE).optional(),
        clientCompanyId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { companyId } = await requireFinanceOrAdmin(ctx.user as User);
      const db = await requireDb();

      const conditions = [eq(attendanceBillingCandidates.companyId, companyId)];
      if (input.status) conditions.push(eq(attendanceBillingCandidates.status, input.status));
      if (input.periodStart) conditions.push(gte(attendanceBillingCandidates.periodStart, input.periodStart));
      if (input.periodEnd) conditions.push(lte(attendanceBillingCandidates.periodEnd, input.periodEnd));
      if (input.clientCompanyId != null) {
        conditions.push(eq(attendanceBillingCandidates.clientCompanyId, input.clientCompanyId));
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
   * Returns warning flag, computed hours, and invoice linkage (Phase 12D).
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

      let lines: AttendanceBillingLineItem[] = [];
      if (Array.isArray(candidate.billingLinesJson)) {
        lines = candidate.billingLinesJson as AttendanceBillingLineItem[];
      } else {
        console.warn(
          `[billing] candidate ${candidate.id} has unexpected billingLinesJson shape — returning empty lines`,
        );
      }

      // Phase 12D: look up whether a (non-cancelled) invoice exists for this candidate.
      const invRows = await db
        .select({ id: attendanceInvoices.id, status: attendanceInvoices.status })
        .from(attendanceInvoices)
        .where(eq(attendanceInvoices.candidateId, input.candidateId))
        .limit(1);

      const inv = invRows[0] ?? null;

      return {
        ...candidate,
        billingLinesJson: lines,
        hasSnapshotWarning: candidate.snapshotMissingCount > 0,
        totalHours:
          candidate.totalDurationMinutes != null
            ? Math.round((candidate.totalDurationMinutes / 60) * 10) / 10
            : null,
        invoiceId: inv?.id ?? null,
        invoiceStatus: inv?.status ?? null,
      };
    }),

  /**
   * Transition a draft billing candidate to review_ready.
   * Only draft candidates can be marked review-ready.
   */
  markAttendanceBillingCandidateReviewReady: protectedProcedure
    .input(candidateIdInput)
    .mutation(async ({ ctx, input }) => {
      const { companyId } = await requireFinanceOrAdmin(ctx.user as User);
      const db = await requireDb();

      const rows = await db
        .select({ id: attendanceBillingCandidates.id, status: attendanceBillingCandidates.status })
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
   * Idempotent on already-cancelled.
   * Blocked when a non-cancelled invoice exists for this candidate.
   */
  cancelAttendanceBillingCandidate: protectedProcedure
    .input(candidateIdInput)
    .mutation(async ({ ctx, input }) => {
      const { companyId } = await requireFinanceOrAdmin(ctx.user as User);
      const db = await requireDb();

      const rows = await db
        .select({ id: attendanceBillingCandidates.id, status: attendanceBillingCandidates.status })
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

      // Phase 12D: block cancellation when a non-cancelled invoice exists.
      const invRows = await db
        .select({ id: attendanceInvoices.id, status: attendanceInvoices.status })
        .from(attendanceInvoices)
        .where(eq(attendanceInvoices.candidateId, input.candidateId))
        .limit(1);

      const inv = invRows[0];
      if (inv && inv.status !== "cancelled") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot cancel this candidate: it has an associated invoice (id=${inv.id}, status=${inv.status}). Cancel the invoice first.`,
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

  // ─── Phase 12D: Invoice conversion procedures ────────────────────────────────

  /**
   * Convert a review_ready attendance billing candidate into a draft invoice.
   *
   * Preconditions (all checked server-side):
   *  - candidate.status === "review_ready"
   *  - candidate.clientCompanyId is not null
   *  - no existing non-cancelled attendance_invoice for this candidateId
   *  - if snapshotMissingCount > 0, snapshotWarningOverrideReason must be provided
   *
   * The invoice is created with status "draft". No issuance, no payment records.
   * billingLinesJson is copied from the candidate snapshot — live sessions are not read.
   */
  convertAttendanceBillingCandidateToInvoice: protectedProcedure
    .input(
      z.object({
        candidateId: z.number().int().positive(),
        ratePerHourOmr: z.number().positive({ message: "Rate must be greater than 0." }),
        dueDateYmd: z.string().regex(DATE_RE).optional(),
        vatRatePct: z.number().min(0).max(100).default(0),
        notes: z.string().max(2000).optional(),
        snapshotWarningOverrideReason: z.string().min(1).max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { companyId } = await requireFinanceOrAdmin(ctx.user as User);
      const db = await requireDb();

      // 1. Load candidate
      const candRows = await db
        .select()
        .from(attendanceBillingCandidates)
        .where(
          and(
            eq(attendanceBillingCandidates.id, input.candidateId),
            eq(attendanceBillingCandidates.companyId, companyId),
          ),
        )
        .limit(1);

      const candidate = candRows[0];
      if (!candidate) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Billing candidate not found." });
      }

      // 2. Status gate
      if (candidate.status !== "review_ready") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Only review_ready candidates can be converted. This candidate is '${candidate.status}'.`,
        });
      }

      // 3. Client company gate
      if (candidate.clientCompanyId == null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot convert: this candidate has no associated client company.",
        });
      }

      // 4. Snapshot warning gate
      if (candidate.snapshotMissingCount > 0 && !input.snapshotWarningOverrideReason) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `This candidate has ${candidate.snapshotMissingCount} billing line(s) with missing attendance snapshots. Provide snapshotWarningOverrideReason to acknowledge and proceed.`,
        });
      }

      // 5. Idempotency — check for existing non-cancelled invoice
      const existingInvRows = await db
        .select({ id: attendanceInvoices.id, status: attendanceInvoices.status })
        .from(attendanceInvoices)
        .where(eq(attendanceInvoices.candidateId, input.candidateId))
        .limit(1);

      const existingInv = existingInvRows[0];
      if (existingInv && existingInv.status !== "cancelled") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `This candidate already has an invoice (id=${existingInv.id}, status=${existingInv.status}).`,
        });
      }

      // 6. Fetch client display name
      const clientRows = await db
        .select({ name: companies.name })
        .from(companies)
        .where(eq(companies.id, candidate.clientCompanyId))
        .limit(1);

      const clientDisplayName = clientRows[0]?.name ?? `Company #${candidate.clientCompanyId}`;

      // 7. Compute financials
      const totalMinutes = candidate.totalDurationMinutes ?? 0;
      const totalHours = totalMinutes / 60;
      const subtotal = totalHours * input.ratePerHourOmr;
      const vat = subtotal * (input.vatRatePct / 100);
      const total = subtotal + vat;

      const invoiceNumber = buildInvoiceNumber(
        companyId,
        candidate.clientCompanyId,
        candidate.periodStart,
        input.candidateId,
      );

      // 8. Copy billing lines from candidate snapshot (never from live sessions)
      const billingLinesJson = Array.isArray(candidate.billingLinesJson)
        ? (candidate.billingLinesJson as AttendanceBillingLineItem[])
        : [];

      // 9. Insert draft invoice
      await db.insert(attendanceInvoices).values({
        candidateId: input.candidateId,
        companyId,
        clientCompanyId: candidate.clientCompanyId,
        clientDisplayName,
        invoiceNumber,
        periodStart: candidate.periodStart,
        periodEnd: candidate.periodEnd,
        currencyCode: "OMR",
        ratePerHourOmr: round3(input.ratePerHourOmr),
        totalDurationMinutes: candidate.totalDurationMinutes,
        subtotalOmr: round3(subtotal),
        vatRatePct: input.vatRatePct.toFixed(2),
        vatOmr: round3(vat),
        totalOmr: round3(total),
        billingLinesJson,
        status: "draft",
        dueDateYmd: input.dueDateYmd ?? null,
        notes: input.notes ?? null,
        snapshotWarningOverrideReason: input.snapshotWarningOverrideReason ?? null,
        createdByUserId: ctx.user.id,
      });

      // Fetch the inserted row to return its id
      const newInvRows = await db
        .select({ id: attendanceInvoices.id })
        .from(attendanceInvoices)
        .where(eq(attendanceInvoices.invoiceNumber, invoiceNumber))
        .limit(1);

      const invoiceId = newInvRows[0]?.id ?? null;

      console.log(
        `[billing] invoice ${invoiceNumber} (id=${invoiceId}) created from candidate ${input.candidateId} userId=${ctx.user.id} companyId=${companyId} total=${round3(total)} OMR`,
      );

      return {
        invoiceId,
        invoiceNumber,
        candidateId: input.candidateId,
        status: "draft" as const,
        totalOmr: round3(total),
      };
    }),

  /**
   * List attendance invoices for the active company.
   */
  listAttendanceInvoices: protectedProcedure
    .input(
      z.object({
        status: z.enum(["draft", "review_ready", "issued", "sent", "paid", "cancelled"]).optional(),
        clientCompanyId: z.number().int().positive().optional(),
        periodStart: z.string().regex(DATE_RE).optional(),
        periodEnd: z.string().regex(DATE_RE).optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { companyId } = await requireFinanceOrAdmin(ctx.user as User);
      const db = await requireDb();

      const conditions = [eq(attendanceInvoices.companyId, companyId)];
      if (input.status) conditions.push(eq(attendanceInvoices.status, input.status));
      if (input.clientCompanyId != null) {
        conditions.push(eq(attendanceInvoices.clientCompanyId, input.clientCompanyId));
      }
      if (input.periodStart) conditions.push(gte(attendanceInvoices.periodStart, input.periodStart));
      if (input.periodEnd) conditions.push(lte(attendanceInvoices.periodEnd, input.periodEnd));

      const rows = await db
        .select({
          id: attendanceInvoices.id,
          candidateId: attendanceInvoices.candidateId,
          companyId: attendanceInvoices.companyId,
          clientCompanyId: attendanceInvoices.clientCompanyId,
          clientDisplayName: attendanceInvoices.clientDisplayName,
          invoiceNumber: attendanceInvoices.invoiceNumber,
          periodStart: attendanceInvoices.periodStart,
          periodEnd: attendanceInvoices.periodEnd,
          currencyCode: attendanceInvoices.currencyCode,
          totalDurationMinutes: attendanceInvoices.totalDurationMinutes,
          subtotalOmr: attendanceInvoices.subtotalOmr,
          vatOmr: attendanceInvoices.vatOmr,
          totalOmr: attendanceInvoices.totalOmr,
          status: attendanceInvoices.status,
          dueDateYmd: attendanceInvoices.dueDateYmd,
          createdAt: attendanceInvoices.createdAt,
          updatedAt: attendanceInvoices.updatedAt,
        })
        .from(attendanceInvoices)
        .where(and(...conditions))
        .orderBy(desc(attendanceInvoices.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return rows;
    }),

  /**
   * Get a single attendance invoice with full parsed billing lines.
   */
  getAttendanceInvoice: protectedProcedure
    .input(invoiceIdInput)
    .query(async ({ ctx, input }) => {
      const { companyId } = await requireFinanceOrAdmin(ctx.user as User);
      const db = await requireDb();

      const rows = await db
        .select()
        .from(attendanceInvoices)
        .where(
          and(
            eq(attendanceInvoices.id, input.invoiceId),
            eq(attendanceInvoices.companyId, companyId),
          ),
        )
        .limit(1);

      const invoice = rows[0];
      if (!invoice) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Attendance invoice not found." });
      }

      let lines: AttendanceBillingLineItem[] = [];
      if (Array.isArray(invoice.billingLinesJson)) {
        lines = invoice.billingLinesJson as AttendanceBillingLineItem[];
      }

      return {
        ...invoice,
        billingLinesJson: lines,
        totalHours:
          invoice.totalDurationMinutes != null
            ? Math.round((invoice.totalDurationMinutes / 60) * 10) / 10
            : null,
      };
    }),

  /**
   * Cancel a draft or review_ready attendance invoice.
   * Idempotent on already-cancelled.
   * Rejects issued/sent/paid invoices.
   */
  cancelAttendanceInvoice: protectedProcedure
    .input(invoiceIdInput)
    .mutation(async ({ ctx, input }) => {
      const { companyId } = await requireFinanceOrAdmin(ctx.user as User);
      const db = await requireDb();

      const rows = await db
        .select({ id: attendanceInvoices.id, status: attendanceInvoices.status })
        .from(attendanceInvoices)
        .where(
          and(
            eq(attendanceInvoices.id, input.invoiceId),
            eq(attendanceInvoices.companyId, companyId),
          ),
        )
        .limit(1);

      const invoice = rows[0];
      if (!invoice) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Attendance invoice not found." });
      }
      if (invoice.status === "cancelled") {
        return { invoiceId: input.invoiceId, status: "cancelled" as const };
      }
      if (invoice.status !== "draft" && invoice.status !== "review_ready") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot cancel an invoice with status '${invoice.status}'. Only draft or review_ready invoices can be cancelled.`,
        });
      }

      await db
        .update(attendanceInvoices)
        .set({ status: "cancelled" })
        .where(eq(attendanceInvoices.id, input.invoiceId));

      console.log(
        `[billing] invoice ${input.invoiceId} cancelled userId=${ctx.user.id} companyId=${companyId}`,
      );

      return { invoiceId: input.invoiceId, status: "cancelled" as const };
    }),
});
