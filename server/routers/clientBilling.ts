import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, lte, sql, gt } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  attendanceSites,
  attendanceSessions,
  clientServiceInvoices,
  clientInvoiceLineItems,
  invoicePaymentRecords,
  type User,
} from "../../drizzle/schema";
import { requireNotAuditor, requireWorkspaceMembership } from "../_core/membership";
import { monthYmdRange } from "../lib/payrollExecuteMonthly";
import {
  calculateInvoice,
  applyPayment,
  buildAgingSummary,
  projectCashFlow,
  omr,
} from "../lib/billingEngine";
import { clientKeyFromDisplayName } from "../lib/clientServiceInvoiceKeys";
import { tryCreateEngagementFromSource } from "../services/engagementAutoCreate";

function invoiceNumber(companyId: number, year: number, month: number, clientKey: string) {
  const m = String(month).padStart(2, "0");
  const short = clientKey.replace(/_/g, "").slice(0, 24);
  return `CSI-${companyId}-${year}${m}-${short}`;
}

export const clientBillingRouter = router({
  /**
   * Build monthly client invoices from attendance at billable sites (daily_rate × days present).
   * Idempotent per (company, client, period) via unique constraint.
   */
  generateClientServiceInvoices: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        month: z.number().min(1).max(12),
        year: z.number().min(2020).max(2100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      requireNotAuditor(m.role, "External Auditors cannot generate invoices.");
      const { start, end } = monthYmdRange(input.year, input.month);

      const sites = await db
        .select()
        .from(attendanceSites)
        .where(
          and(
            eq(attendanceSites.companyId, m.companyId),
            eq(attendanceSites.isActive, true),
            sql`${attendanceSites.clientName} IS NOT NULL`,
            sql`TRIM(${attendanceSites.clientName}) <> ''`,
            gt(attendanceSites.dailyRateOmr, "0")
          )
        );

      type Line = {
        siteId: number;
        description: string;
        quantity: number;
        unitRateOmr: number;
      };
      const byClient = new Map<string, { displayName: string; lines: Line[] }>();

      for (const site of sites) {
        const clientName = (site.clientName ?? "").trim();
        if (!clientName) continue;
        const key = clientKeyFromDisplayName(clientName);
        const [cnt] = await db
          .select({
            c: sql<string>`COUNT(DISTINCT ${attendanceSessions.businessDate})`,
          })
          .from(attendanceSessions)
          .where(
            and(
              eq(attendanceSessions.companyId, m.companyId),
              eq(attendanceSessions.siteId, site.id),
              eq(attendanceSessions.status, "closed"),
              gte(attendanceSessions.businessDate, start),
              lte(attendanceSessions.businessDate, end)
            )
          );
        const days = Number(cnt?.c ?? 0);
        if (days <= 0) continue;
        const rate = Number(site.dailyRateOmr ?? 0);
        const line: Line = {
          siteId: site.id,
          description: `${site.name} — billable days ${input.year}-${String(input.month).padStart(2, "0")}`,
          quantity: days,
          unitRateOmr: rate,
        };
        const bucket = byClient.get(key) ?? { displayName: clientName, lines: [] };
        bucket.lines.push(line);
        bucket.displayName = clientName;
        byClient.set(key, bucket);
      }

      let created = 0;
      let skipped = 0;

      for (const [clientKey, { displayName, lines }] of byClient) {
        const invNo = invoiceNumber(m.companyId, input.year, input.month, clientKey);
        const [exists] = await db
          .select({ id: clientServiceInvoices.id })
          .from(clientServiceInvoices)
          .where(
            and(
              eq(clientServiceInvoices.companyId, m.companyId),
              eq(clientServiceInvoices.clientKey, clientKey),
              eq(clientServiceInvoices.periodYear, input.year),
              eq(clientServiceInvoices.periodMonth, input.month)
            )
          )
          .limit(1);
        if (exists) {
          skipped++;
          continue;
        }

        const calc = calculateInvoice(lines.map((l) => ({ quantity: l.quantity, unitRateOmr: l.unitRateOmr })));
        const issue = `${input.year}-${String(input.month).padStart(2, "0")}-01`;
        const due = `${input.year}-${String(input.month).padStart(2, "0")}-${String(new Date(input.year, input.month, 0).getDate()).padStart(2, "0")}`;

        const [ins] = await db.insert(clientServiceInvoices).values({
          companyId: m.companyId,
          clientKey,
          clientDisplayName: displayName,
          invoiceNumber: invNo,
          periodYear: input.year,
          periodMonth: input.month,
          issueDate: issue,
          dueDate: due,
          subtotalOmr: String(calc.subtotalOmr),
          vatOmr: String(calc.vatOmr),
          totalOmr: String(calc.totalOmr),
          amountPaidOmr: "0",
          balanceOmr: String(calc.totalOmr),
          status: "sent",
        });
        const invoiceId = (ins as { insertId: number }).insertId;

        for (const l of lines) {
          const lt = omr(l.quantity * l.unitRateOmr);
          await db.insert(clientInvoiceLineItems).values({
            invoiceId,
            attendanceSiteId: l.siteId,
            description: l.description,
            quantity: String(l.quantity),
            unitRateOmr: String(l.unitRateOmr),
            lineTotalOmr: String(lt),
          });
        }
        await tryCreateEngagementFromSource(db, m.companyId, ctx.user.id, {
          sourceType: "client_service_invoice",
          sourceId: invoiceId,
        });
        created++;
      }

      return { created, skipped, clientsProcessed: byClient.size };
    }),

  listInvoices: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        status: z.enum(["draft", "sent", "partial", "paid", "overdue", "void"]).optional(),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const conds = [eq(clientServiceInvoices.companyId, m.companyId)];
      if (input.status) conds.push(eq(clientServiceInvoices.status, input.status));
      const rows = await db
        .select()
        .from(clientServiceInvoices)
        .where(and(...conds))
        .orderBy(desc(clientServiceInvoices.dueDate))
        .limit(input.limit)
        .offset(input.offset);
      const [countRow] = await db
        .select({ n: sql<string>`COUNT(*)` })
        .from(clientServiceInvoices)
        .where(and(...conds));
      return { invoices: rows, total: Number(countRow?.n ?? 0) };
    }),

  getInvoice: protectedProcedure
    .input(z.object({ invoiceId: z.number(), companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [inv] = await db
        .select()
        .from(clientServiceInvoices)
        .where(and(eq(clientServiceInvoices.id, input.invoiceId), eq(clientServiceInvoices.companyId, m.companyId)))
        .limit(1);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      const lines = await db
        .select()
        .from(clientInvoiceLineItems)
        .where(eq(clientInvoiceLineItems.invoiceId, input.invoiceId));
      const payments = await db
        .select()
        .from(invoicePaymentRecords)
        .where(eq(invoicePaymentRecords.invoiceId, input.invoiceId))
        .orderBy(desc(invoicePaymentRecords.paidAt));
      return { invoice: inv, lines, payments };
    }),

  recordPayment: protectedProcedure
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
      const next = applyPayment(
        {
          totalOmr: Number(inv.totalOmr),
          amountPaidOmr: Number(inv.amountPaidOmr),
          balanceOmr: Number(inv.balanceOmr),
          status: inv.status as "draft" | "sent" | "partial" | "paid" | "overdue" | "void",
        },
        input.amountOmr
      );
      await db.insert(invoicePaymentRecords).values({
        invoiceId: input.invoiceId,
        amountOmr: String(input.amountOmr),
        paidAt: new Date(),
        paymentMethod: input.paymentMethod,
        reference: input.reference ?? null,
      });
      await db
        .update(clientServiceInvoices)
        .set({
          amountPaidOmr: String(next.amountPaidOmr),
          balanceOmr: String(next.balanceOmr),
          status: next.status,
        })
        .where(eq(clientServiceInvoices.id, input.invoiceId));
      return { success: true, balanceOmr: next.balanceOmr, status: next.status };
    }),

  getARAgingSummary: protectedProcedure
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

  getCashFlowProjection: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        horizonMonths: z.number().min(1).max(36).default(12),
      })
    )
    .query(async ({ ctx, input }) => {
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const unpaid = await db
        .select({ b: sql<string>`SUM(${clientServiceInvoices.balanceOmr})` })
        .from(clientServiceInvoices)
        .where(and(eq(clientServiceInvoices.companyId, m.companyId), sql`${clientServiceInvoices.balanceOmr} > 0`));
      const opening = omr(Number(unpaid[0]?.b ?? 0));

      const recent = await db
        .select({ totalOmr: clientServiceInvoices.totalOmr })
        .from(clientServiceInvoices)
        .where(eq(clientServiceInvoices.companyId, m.companyId))
        .orderBy(desc(clientServiceInvoices.createdAt))
        .limit(6);
      const avgInflow =
        recent.length > 0 ? recent.reduce((s, r) => s + Number(r.totalOmr ?? 0), 0) / recent.length : 0;

      const monthlyNet = Array.from({ length: input.horizonMonths }, () => omr(avgInflow));
      const projection = projectCashFlow({ openingBalanceOmr: opening, monthlyNetOmr: monthlyNet });
      return { openingBalanceOmr: opening, assumedMonthlyInflowOmr: omr(avgInflow), projection };
    }),
});
