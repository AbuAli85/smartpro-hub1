import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql, sum } from "drizzle-orm";
import { z } from "zod";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { getDb } from "../db";
import {
  officerCompanyAssignments,
  officerPayouts,
  omaniProOfficers,
  proBillingCycles,
} from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { tryCreateEngagementFromSource } from "../services/engagementAutoCreate";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function invoiceNumber(officerId: number, companyId: number, year: number, month: number) {
  const m = String(month).padStart(2, "0");
  return `INV-${year}${m}-O${String(officerId).padStart(4, "0")}-C${String(companyId).padStart(4, "0")}`;
}

function payoutNumber(officerId: number, year: number, month: number) {
  const m = String(month).padStart(2, "0");
  return `PAY-${year}${m}-O${String(officerId).padStart(4, "0")}`;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const billingRouter = router({
  /**
   * Generate monthly PRO-officer invoices for all active officer-company assignments.
   * Admin only. Idempotent — skips already-generated invoices for the period.
   */
  generateProOfficerInvoices: protectedProcedure
    .input(
      z.object({
        month: z.number().min(1).max(12),
        year: z.number().min(2024).max(2100),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!canAccessGlobalAdminProcedures(ctx.user)) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Fetch all active assignments
      const assignments = await db
        .select()
        .from(officerCompanyAssignments)
        .where(eq(officerCompanyAssignments.status, "active"));

      let created = 0;
      let skipped = 0;

      for (const a of assignments) {
        const inv = invoiceNumber(a.officerId, a.companyId, input.year, input.month);
        // Check if already exists
        const [existing] = await db
          .select({ id: proBillingCycles.id })
          .from(proBillingCycles)
          .where(eq(proBillingCycles.invoiceNumber, inv))
          .limit(1);
        if (existing) { skipped++; continue; }

        // Due date: 15th of the billing month
        const dueDate = new Date(input.year, input.month - 1, 15);

        const [ins] = await db.insert(proBillingCycles).values({
          officerId: a.officerId,
          companyId: a.companyId,
          assignmentId: a.id,
          billingMonth: input.month,
          billingYear: input.year,
          amountOmr: a.monthlyFee ?? "100.000",
          status: "pending",
          invoiceNumber: inv,
          dueDate,
        });
        const newId = Number((ins as { insertId?: number }).insertId);
        if (newId) {
          await tryCreateEngagementFromSource(db, a.companyId, ctx.user.id, {
            sourceType: "pro_billing_cycle",
            sourceId: newId,
          });
        }
        created++;
      }

      return { success: true, created, skipped, total: assignments.length };
    }),

  /**
   * Mark a billing cycle invoice as paid.
   */
  markInvoicePaid: protectedProcedure
    .input(
      z.object({
        invoiceId: z.number(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!canAccessGlobalAdminProcedures(ctx.user)) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(proBillingCycles)
        .set({ status: "paid", paidAt: new Date(), notes: input.notes, updatedAt: new Date() })
        .where(eq(proBillingCycles.id, input.invoiceId));
      return { success: true };
    }),

  /**
   * Update invoice status (overdue, cancelled, waived).
   */
  updateInvoiceStatus: protectedProcedure
    .input(
      z.object({
        invoiceId: z.number(),
        status: z.enum(["pending", "paid", "overdue", "cancelled", "waived"]),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!canAccessGlobalAdminProcedures(ctx.user)) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const updateData: Record<string, unknown> = {
        status: input.status,
        updatedAt: new Date(),
      };
      if (input.notes) updateData.notes = input.notes;
      if (input.status === "paid") updateData.paidAt = new Date();
      await db
        .update(proBillingCycles)
        .set(updateData as any)
        .where(eq(proBillingCycles.id, input.invoiceId));
      return { success: true };
    }),

  /**
   * Get billing dashboard summary — outstanding, paid, overdue totals.
   */
  getBillingDashboard: protectedProcedure
    .input(
      z.object({
        month: z.number().min(1).max(12).optional(),
        year: z.number().min(2024).max(2100).optional(),
        companyId: z.number().optional(),
        officerId: z.number().optional(),
        status: z.enum(["pending", "paid", "overdue", "cancelled", "waived"]).optional(),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      if (!canAccessGlobalAdminProcedures(ctx.user)) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return { invoices: [], summary: { total: 0, pending: 0, paid: 0, overdue: 0, totalOmr: 0, paidOmr: 0, pendingOmr: 0, overdueOmr: 0 } };

      // Build filter conditions
      const conditions = [];
      if (input?.month) conditions.push(eq(proBillingCycles.billingMonth, input.month));
      if (input?.year) conditions.push(eq(proBillingCycles.billingYear, input.year));
      if (input?.companyId) conditions.push(eq(proBillingCycles.companyId, input.companyId));
      if (input?.officerId) conditions.push(eq(proBillingCycles.officerId, input.officerId));
      if (input?.status) conditions.push(eq(proBillingCycles.status, input.status));

      const invoices = await db
        .select({
          id: proBillingCycles.id,
          officerId: proBillingCycles.officerId,
          companyId: proBillingCycles.companyId,
          assignmentId: proBillingCycles.assignmentId,
          billingMonth: proBillingCycles.billingMonth,
          billingYear: proBillingCycles.billingYear,
          amountOmr: proBillingCycles.amountOmr,
          status: proBillingCycles.status,
          invoiceNumber: proBillingCycles.invoiceNumber,
          paidAt: proBillingCycles.paidAt,
          dueDate: proBillingCycles.dueDate,
          notes: proBillingCycles.notes,
          createdAt: proBillingCycles.createdAt,
          // Join officer name
          officerName: omaniProOfficers.fullName,
        })
        .from(proBillingCycles)
        .leftJoin(omaniProOfficers, eq(proBillingCycles.officerId, omaniProOfficers.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(proBillingCycles.createdAt))
        .limit(500);

      // Compute summary
      const summary = invoices.reduce(
        (acc, inv) => {
          const amt = parseFloat(String(inv.amountOmr) || "0");
          acc.total++;
          acc.totalOmr += amt;
          if (inv.status === "paid") { acc.paid++; acc.paidOmr += amt; }
          else if (inv.status === "pending") { acc.pending++; acc.pendingOmr += amt; }
          else if (inv.status === "overdue") { acc.overdue++; acc.overdueOmr += amt; }
          return acc;
        },
        { total: 0, pending: 0, paid: 0, overdue: 0, totalOmr: 0, paidOmr: 0, pendingOmr: 0, overdueOmr: 0 }
      );

      return { invoices, summary };
    }),

  /**
   * Calculate and create officer payout for a given month.
   * Track A (platform): commission = 12.5% of collected fees from paid invoices.
   * Track B (sanad): fixed OMR 600/month.
   */
  calculateOfficerPayout: protectedProcedure
    .input(
      z.object({
        officerId: z.number(),
        month: z.number().min(1).max(12),
        year: z.number().min(2024).max(2100),
        commissionPct: z.number().min(0).max(100).optional(), // override default 12.5
        fixedSalaryOmr: z.number().optional(), // override default 600
        deductionsOmr: z.number().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!canAccessGlobalAdminProcedures(ctx.user)) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Get officer details
      const [officer] = await db
        .select()
        .from(omaniProOfficers)
        .where(eq(omaniProOfficers.id, input.officerId))
        .limit(1);
      if (!officer) throw new TRPCError({ code: "NOT_FOUND", message: "Officer not found" });

      const track = officer.employmentTrack ?? "platform";
      const deductions = input.deductionsOmr ?? 0;

      let gross = 0;
      let commissionOmr = 0;
      let totalCollected = 0;
      const commissionPct = input.commissionPct ?? 12.5;
      const fixedSalary = input.fixedSalaryOmr ?? 600;

      if (track === "platform") {
        // Sum all PAID invoices for this officer in the period
        const [row] = await db
          .select({ total: sum(proBillingCycles.amountOmr) })
          .from(proBillingCycles)
          .where(
            and(
              eq(proBillingCycles.officerId, input.officerId),
              eq(proBillingCycles.billingMonth, input.month),
              eq(proBillingCycles.billingYear, input.year),
              eq(proBillingCycles.status, "paid")
            )
          );
        totalCollected = parseFloat(String(row?.total ?? "0"));
        commissionOmr = (totalCollected * commissionPct) / 100;
        gross = commissionOmr;
      } else {
        // Track B: fixed salary
        gross = fixedSalary;
      }

      const net = Math.max(0, gross - deductions);

      // Upsert payout record
      const [existing] = await db
        .select({ id: officerPayouts.id })
        .from(officerPayouts)
        .where(
          and(
            eq(officerPayouts.officerId, input.officerId),
            eq(officerPayouts.payoutMonth, input.month),
            eq(officerPayouts.payoutYear, input.year)
          )
        )
        .limit(1);

      const payoutData = {
        officerId: input.officerId,
        payoutMonth: input.month,
        payoutYear: input.year,
        employmentTrack: track as "platform" | "sanad",
        totalCollectedOmr: String(totalCollected),
        commissionPct: String(commissionPct),
        commissionOmr: String(commissionOmr),
        fixedSalaryOmr: String(fixedSalary),
        grossOmr: String(gross),
        deductionsOmr: String(deductions),
        netOmr: String(net),
        notes: input.notes,
        updatedAt: new Date(),
      };

      if (existing) {
        await db.update(officerPayouts).set(payoutData).where(eq(officerPayouts.id, existing.id));
        return { success: true, payoutId: existing.id, gross, net, track };
      } else {
        const [result] = await db.insert(officerPayouts).values({ ...payoutData, status: "pending" });
        return { success: true, payoutId: (result as any).insertId, gross, net, track };
      }
    }),

  /**
   * List officer payouts — filterable by officer, period, status.
   */
  getOfficerPayouts: protectedProcedure
    .input(
      z.object({
        officerId: z.number().optional(),
        month: z.number().min(1).max(12).optional(),
        year: z.number().min(2024).max(2100).optional(),
        status: z.enum(["pending", "approved", "paid", "on_hold"]).optional(),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      if (!canAccessGlobalAdminProcedures(ctx.user)) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];

      const conditions = [];
      if (input?.officerId) conditions.push(eq(officerPayouts.officerId, input.officerId));
      if (input?.month) conditions.push(eq(officerPayouts.payoutMonth, input.month));
      if (input?.year) conditions.push(eq(officerPayouts.payoutYear, input.year));
      if (input?.status) conditions.push(eq(officerPayouts.status, input.status));

      const rows = await db
        .select({
          id: officerPayouts.id,
          officerId: officerPayouts.officerId,
          payoutMonth: officerPayouts.payoutMonth,
          payoutYear: officerPayouts.payoutYear,
          employmentTrack: officerPayouts.employmentTrack,
          totalCollectedOmr: officerPayouts.totalCollectedOmr,
          commissionPct: officerPayouts.commissionPct,
          commissionOmr: officerPayouts.commissionOmr,
          fixedSalaryOmr: officerPayouts.fixedSalaryOmr,
          grossOmr: officerPayouts.grossOmr,
          deductionsOmr: officerPayouts.deductionsOmr,
          netOmr: officerPayouts.netOmr,
          status: officerPayouts.status,
          paidAt: officerPayouts.paidAt,
          notes: officerPayouts.notes,
          createdAt: officerPayouts.createdAt,
          officerName: omaniProOfficers.fullName,
          officerTrack: omaniProOfficers.employmentTrack,
        })
        .from(officerPayouts)
        .leftJoin(omaniProOfficers, eq(officerPayouts.officerId, omaniProOfficers.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(officerPayouts.createdAt));

      return rows;
    }),

  /**
   * Update payout status (approve, mark paid, put on hold).
   */
  updatePayoutStatus: protectedProcedure
    .input(
      z.object({
        payoutId: z.number(),
        status: z.enum(["pending", "approved", "paid", "on_hold"]),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!canAccessGlobalAdminProcedures(ctx.user)) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const updateData: Record<string, unknown> = { status: input.status, updatedAt: new Date() };
      if (input.notes) updateData.notes = input.notes;
      if (input.status === "paid") updateData.paidAt = new Date();
      await db.update(officerPayouts).set(updateData as any).where(eq(officerPayouts.id, input.payoutId));
      return { success: true };
    }),

  /**
   * Aged Receivables — group overdue invoices into age buckets
   */
  getAgedReceivables: protectedProcedure.query(async ({ ctx }) => {
    if (!canAccessGlobalAdminProcedures(ctx.user)) throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) return [];
    const now = new Date();
    const overdue = await db.select().from(proBillingCycles).where(eq(proBillingCycles.status, "overdue"));
    const buckets = { b0_30: 0, b31_60: 0, b61_90: 0, b90plus: 0 };
    const counts = { b0_30: 0, b31_60: 0, b61_90: 0, b90plus: 0 };
    for (const inv of overdue) {
      if (!inv.dueDate) continue;
      const days = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / 86400000);
      const amt = parseFloat(String(inv.amountOmr ?? "0"));
      if (days <= 30) { buckets.b0_30 += amt; counts.b0_30++; }
      else if (days <= 60) { buckets.b31_60 += amt; counts.b31_60++; }
      else if (days <= 90) { buckets.b61_90 += amt; counts.b61_90++; }
      else { buckets.b90plus += amt; counts.b90plus++; }
    }
    return [
      { label: "0–30 days", amountOmr: Math.round(buckets.b0_30 * 1000) / 1000, count: counts.b0_30 },
      { label: "31–60 days", amountOmr: Math.round(buckets.b31_60 * 1000) / 1000, count: counts.b31_60 },
      { label: "61–90 days", amountOmr: Math.round(buckets.b61_90 * 1000) / 1000, count: counts.b61_90 },
      { label: "90+ days", amountOmr: Math.round(buckets.b90plus * 1000) / 1000, count: counts.b90plus },
    ];
  }),

  /**
   * Revenue Trend — last 6 months invoiced vs collected (OMR)
   */
  getRevenueTrend: protectedProcedure.query(async ({ ctx }) => {
    if (!canAccessGlobalAdminProcedures(ctx.user)) throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) return [];
    const now = new Date();
    const months: { year: number; month: number; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1, label: d.toLocaleString("en-GB", { month: "short", year: "2-digit" }) });
    }
    const all = await db.select().from(proBillingCycles);
    return months.map(({ year, month, label }) => {
      const period = all.filter((r) => r.billingYear === year && r.billingMonth === month);
      const invoiced = period.reduce((s, r) => s + parseFloat(String(r.amountOmr ?? "0")), 0);
      const collected = period.filter((r) => r.status === "paid").reduce((s, r) => s + parseFloat(String(r.amountOmr ?? "0")), 0);
      return { label, invoiced: Math.round(invoiced * 1000) / 1000, collected: Math.round(collected * 1000) / 1000 };
    });
  }),

  /**
   * Top Clients by Revenue — top 10 companies by total invoiced OMR
   */
  getTopClients: protectedProcedure.query(async ({ ctx }) => {
    if (!canAccessGlobalAdminProcedures(ctx.user)) throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select({
        companyId: proBillingCycles.companyId,
        totalOmr: sum(proBillingCycles.amountOmr),
        invoiceCount: sql<number>`count(*)`,
      })
      .from(proBillingCycles)
      .groupBy(proBillingCycles.companyId)
      .orderBy(desc(sum(proBillingCycles.amountOmr)))
      .limit(10);
    return rows.map((r) => ({
      companyId: r.companyId,
      totalOmr: parseFloat(String(r.totalOmr ?? "0")),
      invoiceCount: Number(r.invoiceCount),
    }));
  }),

  /**
   * Mark overdue invoices — any pending invoice past due date becomes overdue.
   */
  markOverdueInvoices: protectedProcedure.mutation(async ({ ctx }) => {
    if (!canAccessGlobalAdminProcedures(ctx.user)) throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const now = new Date();
    await db
      .update(proBillingCycles)
      .set({ status: "overdue", updatedAt: now })
      .where(
        and(
          eq(proBillingCycles.status, "pending"),
          sql`${proBillingCycles.dueDate} < ${now}`
        )
      );
    return { success: true };
  }),
});
