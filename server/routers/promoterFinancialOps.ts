/**
 * Phase 3 — promoter payroll run execution, invoice issuance, profitability (assignment-centered).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import type { User } from "../../drizzle/schema";
import { getDb } from "../db";
import { requireNotAuditor, requireWorkspaceMembership } from "../_core/membership";
import { optionalActiveWorkspace } from "../_core/workspaceInput";
import { requireActiveCompanyId } from "../_core/tenant";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createPromoterInvoicesFromStaging,
  createPromoterPayrollRunFromStaging,
  exportPromoterPayrollRunCsv,
  getPromoterInvoiceDetail,
  getPromoterPayrollRunDetail,
  getProfitabilitySummary,
  issuePromoterInvoice,
  listPromoterInvoices,
  listPromoterPayrollRuns,
  markInvoicePaid,
  updatePromoterPayrollRunStatus,
} from "../promoterFinancialExecution.service";
const FINANCE_ROLES = ["company_admin", "hr_admin", "finance_admin"] as const;
const FINANCE_CONTROL_ROLES = ["company_admin", "finance_admin"] as const;

async function requirePromoterFinance(
  user: { id: number; role?: string | null; platformRole?: string | null },
  companyId: number,
): Promise<void> {
  const m = await requireWorkspaceMembership(user as User, companyId);
  requireNotAuditor(m.role);
  if (
    !canAccessGlobalAdminProcedures(user) &&
    !(FINANCE_ROLES as readonly string[]).includes(m.role)
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only company admin, HR admin, or finance admin can manage promoter financial execution.",
    });
  }
}

/** Approve, export, mark paid, issue invoice — company admin or finance admin (not HR-only). */
async function requirePromoterFinanceControl(
  user: { id: number; role?: string | null; platformRole?: string | null },
  companyId: number,
): Promise<void> {
  const m = await requireWorkspaceMembership(user as User, companyId);
  requireNotAuditor(m.role);
  if (
    !canAccessGlobalAdminProcedures(user) &&
    !(FINANCE_CONTROL_ROLES as readonly string[]).includes(m.role)
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only company administrators and finance administrators can approve, export, or finalize promoter financial records.",
    });
  }
}

const periodInput = optionalActiveWorkspace.merge(
  z.object({
    periodStartYmd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    periodEndYmd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
);

const stagingAckFields = z.object({
  acceptedWarningKeys: z.array(z.string()).optional(),
  reviewerNote: z.string().optional(),
});

export const promoterFinancialOpsRouter = router({
  listPayrollRuns: protectedProcedure.input(optionalActiveWorkspace).query(async ({ ctx, input }) => {
    const activeId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
    await requirePromoterFinance(ctx.user, activeId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    return listPromoterPayrollRuns(db, { companyId: activeId });
  }),

  getPayrollRun: protectedProcedure
    .input(optionalActiveWorkspace.merge(z.object({ runId: z.number().int().positive() })))
    .query(async ({ ctx, input }) => {
      const activeId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      await requirePromoterFinance(ctx.user, activeId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const d = await getPromoterPayrollRunDetail(db, { companyId: activeId, runId: input.runId });
      if (!d) throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
      return d;
    }),

  createPayrollRunFromStaging: protectedProcedure
    .input(periodInput.merge(stagingAckFields.partial()))
    .mutation(async ({ ctx, input }) => {
      const activeId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      await requirePromoterFinance(ctx.user, activeId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const isPlatform = canAccessGlobalAdminProcedures(ctx.user);
      const result = await createPromoterPayrollRunFromStaging(db, {
        activeCompanyId: activeId,
        isPlatformAdmin: isPlatform,
        periodStartYmd: input.periodStartYmd,
        periodEndYmd: input.periodEndYmd,
        createdByUserId: ctx.user.id,
        warningAck:
          input.acceptedWarningKeys != null || input.reviewerNote
            ? { acceptedWarningKeys: input.acceptedWarningKeys ?? [], reviewerNote: input.reviewerNote }
            : undefined,
      });
      if (!result.run) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.message ?? "No payroll lines created",
        });
      }
      return result;
    }),

  submitPayrollRunForReview: protectedProcedure
    .input(optionalActiveWorkspace.merge(z.object({ runId: z.number().int().positive() })))
    .mutation(async ({ ctx, input }) => {
      const activeId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      await requirePromoterFinance(ctx.user, activeId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await updatePromoterPayrollRunStatus(db, {
        companyId: activeId,
        runId: input.runId,
        status: "review_ready",
        userId: ctx.user.id,
      });
      return { ok: true };
    }),

  approvePayrollRun: protectedProcedure
    .input(optionalActiveWorkspace.merge(z.object({ runId: z.number().int().positive() })))
    .mutation(async ({ ctx, input }) => {
      const activeId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      await requirePromoterFinanceControl(ctx.user, activeId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      try {
      await updatePromoterPayrollRunStatus(db, {
        companyId: activeId,
        runId: input.runId,
        status: "approved",
        userId: ctx.user.id,
        extra: { approvedByUserId: ctx.user.id, approvedAt: new Date() },
      });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
      return { ok: true };
    }),

  exportPayrollRun: protectedProcedure
    .input(optionalActiveWorkspace.merge(z.object({ runId: z.number().int().positive() })))
    .mutation(async ({ ctx, input }) => {
      const activeId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      await requirePromoterFinanceControl(ctx.user, activeId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      try {
      return await exportPromoterPayrollRunCsv(db, {
        companyId: activeId,
        runId: input.runId,
        userId: ctx.user.id,
      });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),

  markPayrollRunPaid: protectedProcedure
    .input(optionalActiveWorkspace.merge(z.object({ runId: z.number().int().positive() })))
    .mutation(async ({ ctx, input }) => {
      const activeId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      await requirePromoterFinanceControl(ctx.user, activeId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      try {
      const r = await updatePromoterPayrollRunStatus(db, {
        companyId: activeId,
        runId: input.runId,
        status: "paid",
        userId: ctx.user.id,
        extra: { paidAt: new Date(), paidByUserId: ctx.user.id },
      });
      return { ok: true, skipped: r.skipped };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),

  listInvoices: protectedProcedure.input(optionalActiveWorkspace).query(async ({ ctx, input }) => {
    const activeId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
    await requirePromoterFinance(ctx.user, activeId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    return listPromoterInvoices(db, { companyId: activeId });
  }),

  getInvoice: protectedProcedure
    .input(optionalActiveWorkspace.merge(z.object({ invoiceId: z.number().int().positive() })))
    .query(async ({ ctx, input }) => {
      const activeId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      await requirePromoterFinance(ctx.user, activeId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const d = await getPromoterInvoiceDetail(db, { companyId: activeId, invoiceId: input.invoiceId });
      if (!d) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      return d;
    }),

  createInvoicesFromStaging: protectedProcedure
    .input(
      periodInput.merge(stagingAckFields.partial()).merge(
        z.object({
          monthlyBillingMode: z.enum(["flat_if_any_overlap", "prorated_by_calendar_days"]).default("flat_if_any_overlap"),
        }),
      ),
    )
    .mutation(async ({ ctx, input }) => {
      const activeId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      await requirePromoterFinance(ctx.user, activeId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const isPlatform = canAccessGlobalAdminProcedures(ctx.user);
      try {
        return await createPromoterInvoicesFromStaging(db, {
          activeCompanyId: activeId,
          isPlatformAdmin: isPlatform,
          periodStartYmd: input.periodStartYmd,
          periodEndYmd: input.periodEndYmd,
          monthlyBillingMode: input.monthlyBillingMode,
          createdByUserId: ctx.user.id,
          warningAck:
            input.acceptedWarningKeys != null || input.reviewerNote
              ? { acceptedWarningKeys: input.acceptedWarningKeys ?? [], reviewerNote: input.reviewerNote }
              : undefined,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("Duplicate") || msg.includes("duplicate")) {
          throw new TRPCError({ code: "CONFLICT", message: "Invoice already exists for this client and period." });
        }
        throw e;
      }
    }),

  issueInvoice: protectedProcedure
    .input(optionalActiveWorkspace.merge(z.object({ invoiceId: z.number().int().positive() })))
    .mutation(async ({ ctx, input }) => {
      const activeId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      await requirePromoterFinanceControl(ctx.user, activeId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      try {
        return await issuePromoterInvoice(db, {
          companyId: activeId,
          invoiceId: input.invoiceId,
          userId: ctx.user.id,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),

  markInvoicePaid: protectedProcedure
    .input(optionalActiveWorkspace.merge(z.object({ invoiceId: z.number().int().positive() })))
    .mutation(async ({ ctx, input }) => {
      const activeId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      await requirePromoterFinanceControl(ctx.user, activeId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      try {
        const r = await markInvoicePaid(db, {
          companyId: activeId,
          invoiceId: input.invoiceId,
          userId: ctx.user.id,
        });
        return { ok: true, skipped: r.skipped };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),

  profitabilitySummary: protectedProcedure
    .input(
      periodInput.merge(
        z.object({
          mode: z.enum(["forecast", "executed"]),
        }),
      ),
    )
    .query(async ({ ctx, input }) => {
      const activeId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      await requirePromoterFinance(ctx.user, activeId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const isPlatform = canAccessGlobalAdminProcedures(ctx.user);
      return getProfitabilitySummary(db, {
        activeCompanyId: activeId,
        isPlatformAdmin: isPlatform,
        periodStartYmd: input.periodStartYmd,
        periodEndYmd: input.periodEndYmd,
        mode: input.mode,
      });
    }),
});
