/**
 * Attendance Billing router (Phase 12C + 12D + 12E + 12F).
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
 *   cancelAttendanceInvoice            — draft/review_ready → cancelled (no reason)
 *
 * Phase 12E — Invoice issuance and HTML artifact (finance/admin):
 *   issueAttendanceInvoice             — draft/review_ready → issued + HTML artifact stored
 *   voidAttendanceInvoice              — issued/sent → cancelled with mandatory reason
 *                                        (blocked if payment records exist)
 *
 * Phase 12F — Sending and manual payment tracking (finance/admin):
 *   markAttendanceInvoiceSent          — issued → sent (manual, no email)
 *   recordAttendanceInvoicePayment     — record manual payment; marks paid when balance covered
 *   listAttendanceInvoicePayments      — payment history for an invoice
 *
 * Access: company_admin and finance_admin only (requireFinanceOrAdmin).
 * hr_admin is excluded — Phase 12 policy.
 *
 * No PDF, no email, no gateway integration in this phase.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { requireDb } from "../db.client";
import { requireFinanceOrAdmin } from "../_core/policy";
import {
  attendanceBillingCandidates,
  attendanceInvoices,
  attendanceInvoicePaymentRecords,
  companies,
  type AttendanceBillingLineItem,
  type User,
} from "../../drizzle/schema";
import {
  canCancelAttendanceInvoice,
  canVoidAttendanceInvoice,
  assertAttendanceInvoiceTransition,
  type AttendanceInvoiceStatus,
} from "../../shared/attendanceInvoiceStateMachine";
import { issueAttendanceInvoice } from "../services/attendanceBillingExecution.service";
import { recordAttendanceInvoicePayment } from "../services/attendanceBillingPayment.service";

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
          amountPaidOmr: attendanceInvoices.amountPaidOmr,
          status: attendanceInvoices.status,
          dueDateYmd: attendanceInvoices.dueDateYmd,
          sentAt: attendanceInvoices.sentAt,
          htmlArtifactUrl: attendanceInvoices.htmlArtifactUrl,
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

      const totalOmr = parseFloat(invoice.totalOmr);
      const amountPaidOmr = parseFloat(invoice.amountPaidOmr);
      const balanceOmr = Math.max(totalOmr - amountPaidOmr, 0);

      return {
        ...invoice,
        billingLinesJson: lines,
        totalHours:
          invoice.totalDurationMinutes != null
            ? Math.round((invoice.totalDurationMinutes / 60) * 10) / 10
            : null,
        balanceOmr: (Math.round(balanceOmr * 1000) / 1000).toFixed(3),
      };
    }),

  // ─── Phase 12E: Issuance + void ──────────────────────────────────────────────

  /**
   * Issue a draft or review_ready attendance invoice.
   * Builds and stores an HTML artifact, sets status = "issued".
   * Idempotent when already issued/sent (returns skipped: true).
   * Rejects paid and cancelled invoices.
   */
  issueAttendanceInvoice: protectedProcedure
    .input(invoiceIdInput)
    .mutation(async ({ ctx, input }) => {
      const { companyId } = await requireFinanceOrAdmin(ctx.user as User);
      const db = await requireDb();

      // Load company info for the HTML artifact supplier block
      const companyRows = await db
        .select({
          name: companies.name,
          taxNumber: companies.taxNumber,
          crNumber: companies.crNumber,
          address: companies.address,
        })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);

      const companyRow = companyRows[0];
      const companyInfo = {
        name: companyRow?.name ?? `Company #${companyId}`,
        taxNumber: companyRow?.taxNumber ?? null,
        crNumber: companyRow?.crNumber ?? null,
        address: companyRow?.address ?? null,
      };

      return issueAttendanceInvoice(db, {
        companyId,
        invoiceId: input.invoiceId,
        userId: ctx.user.id,
        companyInfo,
      });
    }),

  /**
   * Void an issued or sent attendance invoice with a mandatory reason.
   * Sets status = "cancelled" and appends the void reason to the notes field.
   * Blocked if payment records exist for the invoice.
   * Draft/review_ready invoices must use cancelAttendanceInvoice instead.
   * Paid invoices cannot be voided.
   */
  voidAttendanceInvoice: protectedProcedure
    .input(
      invoiceIdInput.merge(
        z.object({
          voidReason: z.string().min(5, "Void reason must be at least 5 characters.").max(500),
        }),
      ),
    )
    .mutation(async ({ ctx, input }) => {
      const { companyId } = await requireFinanceOrAdmin(ctx.user as User);
      const db = await requireDb();

      const rows = await db
        .select({
          id: attendanceInvoices.id,
          status: attendanceInvoices.status,
          notes: attendanceInvoices.notes,
        })
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

      const status = invoice.status as AttendanceInvoiceStatus;

      if (status === "draft" || status === "review_ready") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Use cancelAttendanceInvoice for draft or review_ready invoices.",
        });
      }
      if (status === "paid") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot void a paid invoice.",
        });
      }
      if (status === "cancelled") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invoice is already cancelled.",
        });
      }
      if (!canVoidAttendanceInvoice(status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot void invoice with status '${status}'.`,
        });
      }

      // Phase 12F: block void if payment records exist
      const paymentRows = await db
        .select({ id: attendanceInvoicePaymentRecords.id })
        .from(attendanceInvoicePaymentRecords)
        .where(eq(attendanceInvoicePaymentRecords.attendanceInvoiceId, input.invoiceId))
        .limit(1);

      if (paymentRows.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This invoice has payment records and cannot be voided. Create a reversal or credit workflow in a future phase.",
        });
      }

      const timestamp = new Date().toISOString();
      const voidNote = `[VOIDED ${timestamp} by user ${ctx.user.id}]: ${input.voidReason}`;
      const updatedNotes = invoice.notes ? `${invoice.notes}\n${voidNote}` : voidNote;

      await db
        .update(attendanceInvoices)
        .set({ status: "cancelled", notes: updatedNotes })
        .where(eq(attendanceInvoices.id, input.invoiceId));

      console.log(
        `[billing] invoice ${input.invoiceId} voided userId=${ctx.user.id} companyId=${companyId} reason="${input.voidReason}"`,
      );

      return { invoiceId: input.invoiceId, status: "cancelled" as const };
    }),

  /**
   * Cancel a draft or review_ready attendance invoice (no reason required).
   * Idempotent on already-cancelled.
   * Issued/sent invoices must use voidAttendanceInvoice (requires reason).
   * Paid invoices cannot be cancelled.
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

      const status = invoice.status as AttendanceInvoiceStatus;

      if (status === "cancelled") {
        return { invoiceId: input.invoiceId, status: "cancelled" as const };
      }

      if (status === "issued" || status === "sent") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Use voidAttendanceInvoice for issued or sent invoices (requires a void reason).",
        });
      }

      if (status === "paid") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot cancel a paid invoice.",
        });
      }

      if (!canCancelAttendanceInvoice(status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot cancel an invoice with status '${status}'.`,
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

  // ─── Phase 12F: Sending + manual payment ────────────────────────────────────

  /**
   * Mark an issued attendance invoice as sent.
   * Transitions issued → sent using the state machine.
   * Records sentAt and sentByUserId.
   * Does not send any email.
   */
  markAttendanceInvoiceSent: protectedProcedure
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

      const status = invoice.status as AttendanceInvoiceStatus;

      // assertAttendanceInvoiceTransition throws a descriptive Error on invalid transition
      try {
        assertAttendanceInvoiceTransition(status, "sent");
      } catch {
        if (status === "sent") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invoice is already marked as sent.",
          });
        }
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot mark as sent: invoice is '${status}'. Only issued invoices can be marked sent.`,
        });
      }

      const sentAt = new Date();

      await db
        .update(attendanceInvoices)
        .set({ status: "sent", sentAt, sentByUserId: ctx.user.id })
        .where(eq(attendanceInvoices.id, input.invoiceId));

      console.log(
        `[billing] invoice ${input.invoiceId} marked sent userId=${ctx.user.id} companyId=${companyId}`,
      );

      return { invoiceId: input.invoiceId, status: "sent" as const, sentAt };
    }),

  /**
   * Record a manual payment against an issued or sent attendance invoice.
   * Inserts into attendance_invoice_payment_records.
   * Updates attendance_invoices.amountPaidOmr.
   * Transitions status to "paid" when balance is fully covered.
   */
  recordAttendanceInvoicePayment: protectedProcedure
    .input(
      invoiceIdInput.merge(
        z.object({
          amountOmr: z.number().positive({ message: "Payment amount must be greater than 0." }),
          paymentMethod: z.enum(["bank", "cash", "card", "other"]).default("bank"),
          reference: z.string().max(255).optional(),
          notes: z.string().max(2000).optional(),
          paidAt: z.string().regex(DATE_RE).optional(),
        }),
      ),
    )
    .mutation(async ({ ctx, input }) => {
      const { companyId } = await requireFinanceOrAdmin(ctx.user as User);
      const db = await requireDb();

      const paidAt = input.paidAt ? new Date(input.paidAt + "T00:00:00Z") : new Date();

      return recordAttendanceInvoicePayment(db, {
        companyId,
        invoiceId: input.invoiceId,
        userId: ctx.user.id,
        amountOmr: input.amountOmr,
        paymentMethod: input.paymentMethod,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        paidAt,
      });
    }),

  /**
   * List payment records for a single attendance invoice.
   * Verifies the invoice belongs to the active company.
   * Returns records ordered by paidAt ASC, createdAt ASC.
   */
  listAttendanceInvoicePayments: protectedProcedure
    .input(invoiceIdInput)
    .query(async ({ ctx, input }) => {
      const { companyId } = await requireFinanceOrAdmin(ctx.user as User);
      const db = await requireDb();

      // Verify invoice belongs to this company
      const invRows = await db
        .select({ id: attendanceInvoices.id })
        .from(attendanceInvoices)
        .where(
          and(
            eq(attendanceInvoices.id, input.invoiceId),
            eq(attendanceInvoices.companyId, companyId),
          ),
        )
        .limit(1);

      if (!invRows[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Attendance invoice not found." });
      }

      const payments = await db
        .select()
        .from(attendanceInvoicePaymentRecords)
        .where(
          and(
            eq(attendanceInvoicePaymentRecords.attendanceInvoiceId, input.invoiceId),
            eq(attendanceInvoicePaymentRecords.companyId, companyId),
          ),
        )
        .orderBy(
          asc(attendanceInvoicePaymentRecords.paidAt),
          asc(attendanceInvoicePaymentRecords.createdAt),
        );

      return payments;
    }),
});
