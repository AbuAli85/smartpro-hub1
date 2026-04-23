import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { protectedProcedure, router } from "../_core/trpc";
import { ENV } from "../_core/env";
import { getDb } from "../db";
import {
  clientServiceInvoices,
  invoicePaymentRecords,
  paymentGatewaySessions,
  type User,
} from "../../drizzle/schema";
import { requireNotAuditor, requireWorkspaceMembership } from "../_core/membership";
import { applyInvoicePayment } from "../lib/applyClientInvoicePayment";
import { applyRefund, buildAgingSummary } from "../lib/billingEngine";
import {
  refundPayment,
  stripeCreateCheckoutSession,
  thawaniCheckoutPublicUrl,
  thawaniCreateCheckoutSession,
} from "../lib/paymentGateway";

function publicBaseUrl(): string {
  const base = ENV.appPublicUrl.replace(/\/+$/, "");
  if (!base) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "APP_PUBLIC_URL or PUBLIC_APP_URL must be set for payment redirects.",
    });
  }
  return base;
}

export const paymentsRouter = router({
  createSession: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        invoiceId: z.number(),
        gateway: z.enum(["thawani", "stripe"]),
        amountOmr: z.number().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      requireNotAuditor(m.role, "External Auditors cannot create payment sessions.");
      const [inv] = await db
        .select()
        .from(clientServiceInvoices)
        .where(and(eq(clientServiceInvoices.id, input.invoiceId), eq(clientServiceInvoices.companyId, m.companyId)))
        .limit(1);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      const balance = Number(inv.balanceOmr);
      if (balance <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice has no outstanding balance" });
      const payAmount = input.amountOmr != null ? Math.min(input.amountOmr, balance) : balance;
      if (payAmount <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid amount" });

      const clientReference = `spg_${nanoid(18)}`;
      const [ins] = await db.insert(paymentGatewaySessions).values({
        companyId: m.companyId,
        invoiceId: inv.id,
        gateway: input.gateway,
        clientReference,
        amountOmr: String(payAmount),
        status: "pending",
        metadata: { createdBy: "createSession" },
      });
      const pgsId = Number((ins as { insertId: number }).insertId);
      if (!Number.isFinite(pgsId)) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create payment session row" });
      }

      const base = publicBaseUrl();
      const meta = {
        invoiceId: String(inv.id),
        companyId: String(m.companyId),
        paymentGatewaySessionId: String(pgsId),
      };

      if (input.gateway === "thawani") {
        const session = await thawaniCreateCheckoutSession({
          clientReferenceId: clientReference,
          amountOmr: payAmount,
          productName: inv.invoiceNumber,
          successUrl: `${base}/pay/thank-you?gateway=thawani`,
          cancelUrl: `${base}/pay/thank-you?gateway=thawani&cancelled=1`,
          metadata: meta,
        });
        const sid = session.session_id;
        await db
          .update(paymentGatewaySessions)
          .set({ gatewaySessionId: sid })
          .where(eq(paymentGatewaySessions.id, pgsId));
        return {
          paymentGatewaySessionId: pgsId,
          gatewaySessionId: sid,
          redirectUrl: thawaniCheckoutPublicUrl(sid),
        };
      }

      const stripeSession = await stripeCreateCheckoutSession({
        invoiceLabel: inv.invoiceNumber,
        amountOmr: payAmount,
        successUrl: `${base}/pay/thank-you?gateway=stripe&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${base}/pay/thank-you?gateway=stripe&cancelled=1`,
        metadata: meta,
      });
      if (!stripeSession.url) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Stripe did not return a checkout URL" });
      }
      await db
        .update(paymentGatewaySessions)
        .set({ gatewaySessionId: stripeSession.id })
        .where(eq(paymentGatewaySessions.id, pgsId));
      return {
        paymentGatewaySessionId: pgsId,
        gatewaySessionId: stripeSession.id,
        redirectUrl: stripeSession.url,
      };
    }),

  getSession: protectedProcedure
    .input(
      z
        .object({
          companyId: z.number().optional(),
          paymentGatewaySessionId: z.number().int().positive().optional(),
          gatewaySessionId: z.string().min(1).optional(),
        })
        .refine((v) => v.paymentGatewaySessionId != null || v.gatewaySessionId != null, {
          message: "paymentGatewaySessionId or gatewaySessionId required",
        })
    )
    .query(async ({ ctx, input }) => {
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const cond =
        input.paymentGatewaySessionId != null
          ? eq(paymentGatewaySessions.id, input.paymentGatewaySessionId)
          : eq(paymentGatewaySessions.gatewaySessionId, input.gatewaySessionId!);
      const [row] = await db
        .select()
        .from(paymentGatewaySessions)
        .where(and(eq(paymentGatewaySessions.companyId, m.companyId), cond))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      return { session: row };
    }),

  listByInvoice: protectedProcedure
    .input(z.object({ companyId: z.number().optional(), invoiceId: z.number() }))
    .query(async ({ ctx, input }) => {
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [inv] = await db
        .select({ id: clientServiceInvoices.id })
        .from(clientServiceInvoices)
        .where(and(eq(clientServiceInvoices.id, input.invoiceId), eq(clientServiceInvoices.companyId, m.companyId)))
        .limit(1);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      const rows = await db
        .select()
        .from(paymentGatewaySessions)
        .where(eq(paymentGatewaySessions.invoiceId, input.invoiceId))
        .orderBy(desc(paymentGatewaySessions.createdAt));
      return { sessions: rows };
    }),

  recordManual: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        invoiceId: z.number(),
        amountOmr: z.number().positive(),
        paymentMethod: z.enum(["bank", "cash", "card", "other"]).default("bank"),
        reference: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      requireNotAuditor(m.role, "External Auditors cannot record payments.");
      const [inv] = await db
        .select()
        .from(clientServiceInvoices)
        .where(and(eq(clientServiceInvoices.id, input.invoiceId), eq(clientServiceInvoices.companyId, m.companyId)))
        .limit(1);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      const next = await applyInvoicePayment(db, {
        invoiceId: input.invoiceId,
        companyId: m.companyId,
        amountOmr: input.amountOmr,
        paymentMethod: input.paymentMethod,
        reference: input.reference ?? null,
      });
      return { success: true, balanceOmr: next.balanceOmr, status: next.status };
    }),

  refund: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        paymentRecordId: z.number(),
        amountOmr: z.number().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      requireNotAuditor(m.role, "External Auditors cannot refund payments.");

      const [row] = await db
        .select({
          pr: invoicePaymentRecords,
          inv: clientServiceInvoices,
        })
        .from(invoicePaymentRecords)
        .innerJoin(clientServiceInvoices, eq(invoicePaymentRecords.invoiceId, clientServiceInvoices.id))
        .where(
          and(
            eq(invoicePaymentRecords.id, input.paymentRecordId),
            eq(clientServiceInvoices.companyId, m.companyId)
          )
        )
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Payment record not found" });
      const gw = row.pr.gateway;
      const gatewayPaymentId = row.pr.gatewayPaymentId;
      if (!gw || !gatewayPaymentId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Refund is only supported for gateway (Thawani/Stripe) payments with a gateway payment id.",
        });
      }
      const paid = Number(row.pr.amountOmr);
      const refundAmt = input.amountOmr != null ? Math.min(input.amountOmr, paid) : paid;
      if (refundAmt <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid refund amount" });

      await refundPayment({
        gateway: gw,
        gatewayPaymentId,
        reason: "Refund requested",
        amountOmr: refundAmt < paid ? refundAmt : undefined,
      });

      const next = applyRefund(
        {
          totalOmr: Number(row.inv.totalOmr),
          amountPaidOmr: Number(row.inv.amountPaidOmr),
          balanceOmr: Number(row.inv.balanceOmr),
          status: row.inv.status as "draft" | "sent" | "partial" | "paid" | "overdue" | "void",
        },
        refundAmt
      );
      await db
        .update(clientServiceInvoices)
        .set({
          amountPaidOmr: String(next.amountPaidOmr),
          balanceOmr: String(next.balanceOmr),
          status: next.status,
        })
        .where(eq(clientServiceInvoices.id, row.inv.id));

      return { success: true, balanceOmr: next.balanceOmr, status: next.status };
    }),

  getAgingReport: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db
        .select({
          balanceOmr: clientServiceInvoices.balanceOmr,
          dueDate: clientServiceInvoices.dueDate,
        })
        .from(clientServiceInvoices)
        .where(
          and(
            eq(clientServiceInvoices.companyId, m.companyId),
            sql`${clientServiceInvoices.balanceOmr} > 0`,
            sql`${clientServiceInvoices.status} NOT IN ('void','paid')`
          )
        );
      const buckets = buildAgingSummary(
        rows.map((r) => ({
          balanceOmr: Number(r.balanceOmr),
          dueDate: r.dueDate,
        }))
      );
      return buckets;
    }),
});
