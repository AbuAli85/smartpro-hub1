import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { toWhatsAppPhoneDigits } from "@shared/whatsappPhoneDigits";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import type { User } from "../../drizzle/schema";
import { proBillingCycles, subscriptionInvoices } from "../../drizzle/schema";
import {
  listCollectionsExecutionQueue,
  listOverdueReceivableDetailRows,
  upsertCollectionWorkItem,
  type CollectionSourceType,
  type CollectionWorkflowStatus,
} from "../collectionsExecution";
import {
  buildAgedReceivablesSnapshot,
  buildAgedReceivablesSnapshotAllTenants,
} from "../controlTower";
import { getDb } from "../db";
import { sendPaymentReminderEmail } from "../email";
import { ENV } from "../_core/env";
import { resolveStatsCompanyFilter } from "../_core/tenant";
import { requireWorkspaceMembership } from "../_core/membership";
import { protectedProcedure, router } from "../_core/trpc";
import { canActOnCollectionsQueue } from "../executionCapabilities";
import { getCompanyById, getUserCompanyById } from "../repositories/companies.repository";
import {
  isCollectionReminderWhatsAppTemplateConfigured,
  sendCollectionPaymentReminderTemplate,
} from "../whatsappCloud";

const sourceTypeSchema = z.enum(["pro_billing_cycle", "subscription_invoice"]);
const workflowSchema = z.enum([
  "needs_follow_up",
  "promised_to_pay",
  "escalated",
  "disputed",
  "resolved",
]);

async function assertCollectionsAccess(ctx: { user: User }, companyId: number): Promise<void> {
  if (canAccessGlobalAdminProcedures(ctx.user)) return;
  const row = await getUserCompanyById(ctx.user.id, companyId);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });
  if (!canActOnCollectionsQueue(row.member.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only company admin or finance admin can manage collections.",
    });
  }
}

async function loadSourceRow(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  sourceType: CollectionSourceType,
  sourceId: number,
) {
  if (sourceType === "pro_billing_cycle") {
    const [r] = await db.select().from(proBillingCycles).where(eq(proBillingCycles.id, sourceId)).limit(1);
    return r ?? null;
  }
  const [r] = await db.select().from(subscriptionInvoices).where(eq(subscriptionInvoices.id, sourceId)).limit(1);
  return r ?? null;
}

function portalUrlForEmail(): string {
  const u = ENV.appPublicUrl.trim();
  if (u) return u.replace(/\/+$/, "") + "/client/invoices";
  return "https://smartprohub-q4qjnxjv.manus.space/client/invoices";
}

export const collectionsRouter = router({
  /**
   * AR aging snapshot (PRO officer cycles + subscription invoices), same rules as control tower.
   * Platform: all tenants when no company filter; else one tenant.
   */
  getAgingSnapshot: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      // AUTH FIRST: guard before DB
      const filter = await resolveStatsCompanyFilter(ctx.user as User, input?.companyId);
      if (filter.aggregateAllTenants) {
        if (!canAccessGlobalAdminProcedures(ctx.user)) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      } else {
        // assertCollectionsAccess is DB-backed; pre-check with pure membership first
        if (!canAccessGlobalAdminProcedures(ctx.user)) {
          await requireWorkspaceMembership(ctx.user as User, filter.companyId);
        }
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      if (filter.aggregateAllTenants) {
        return buildAgedReceivablesSnapshotAllTenants(db);
      }
      await assertCollectionsAccess(ctx, filter.companyId);
      return buildAgedReceivablesSnapshot(db, filter.companyId);
    }),

  /** Detailed overdue lines for reports and outreach (includes resolved workflow rows). */
  getOverdueLines: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      // AUTH FIRST: guard before DB
      const filter = await resolveStatsCompanyFilter(ctx.user as User, input?.companyId);
      const companyId = filter.aggregateAllTenants ? undefined : filter.companyId;
      if (filter.aggregateAllTenants) {
        if (!canAccessGlobalAdminProcedures(ctx.user)) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      } else {
        // assertCollectionsAccess is DB-backed; pre-check with pure membership first
        if (!canAccessGlobalAdminProcedures(ctx.user)) {
          await requireWorkspaceMembership(ctx.user as User, filter.companyId);
        }
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      if (!filter.aggregateAllTenants) {
        await assertCollectionsAccess(ctx, filter.companyId);
      }
      const rows = await listOverdueReceivableDetailRows(db, { companyId });
      return rows.map((r) => ({
        ...r,
        dueDate: r.dueDate ? r.dueDate.toISOString() : null,
      }));
    }),

  /** Prioritized queue (excludes resolved) — requires a single company scope. */
  getActionQueue: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        limit: z.number().min(1).max(200).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      // AUTH FIRST: guard before DB
      const filter = await resolveStatsCompanyFilter(ctx.user as User, input.companyId);
      if (filter.aggregateAllTenants) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Choose a company workspace to load the action queue.",
        });
      }
      // assertCollectionsAccess is DB-backed; pre-check with pure membership first
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        await requireWorkspaceMembership(ctx.user as User, filter.companyId);
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await assertCollectionsAccess(ctx, filter.companyId);
      return listCollectionsExecutionQueue(db, filter.companyId, input.limit);
    }),

  upsertWorkItem: protectedProcedure
    .input(
      z.object({
        companyId: z.number(),
        sourceType: sourceTypeSchema,
        sourceId: z.number(),
        workflowStatus: workflowSchema,
        note: z.string().max(8000).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // AUTH FIRST: pure membership check before DB (assertCollectionsAccess is DB-backed)
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        await requireWorkspaceMembership(ctx.user as User, input.companyId);
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await assertCollectionsAccess(ctx, input.companyId);
      const row = await loadSourceRow(db, input.sourceType, input.sourceId);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      const rowCompanyId =
        "companyId" in row && typeof row.companyId === "number" ? row.companyId : null;
      if (rowCompanyId !== input.companyId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      }
      await upsertCollectionWorkItem(db, {
        companyId: input.companyId,
        userId: ctx.user.id,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        workflowStatus: input.workflowStatus as CollectionWorkflowStatus,
        note: input.note,
      });
      return { success: true as const };
    }),

  sendReminderEmail: protectedProcedure
    .input(
      z.object({
        companyId: z.number(),
        sourceType: sourceTypeSchema,
        sourceId: z.number(),
        toEmail: z.string().email().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // AUTH FIRST: pure membership check before DB (assertCollectionsAccess is DB-backed)
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        await requireWorkspaceMembership(ctx.user as User, input.companyId);
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await assertCollectionsAccess(ctx, input.companyId);
      const row = await loadSourceRow(db, input.sourceType, input.sourceId);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      if (row.companyId !== input.companyId) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });

      const company = await getCompanyById(input.companyId);
      const to = (input.toEmail ?? company?.email ?? "").trim();
      if (!to) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No email address — set the company profile email or provide toEmail.",
        });
      }

      const invoiceLabel =
        "invoiceNumber" in row && typeof row.invoiceNumber === "string"
          ? row.invoiceNumber
          : String(row.invoiceNumber);
      const amountRaw =
        "amountOmr" in row && row.amountOmr != null
          ? row.amountOmr
          : "amount" in row && row.amount != null
            ? row.amount
            : "0";
      const amountOmr = Number(amountRaw).toFixed(3);
      const due = row.dueDate ? new Date(row.dueDate) : null;
      const now = new Date();
      const daysPastDue = due
        ? Math.max(0, Math.floor((now.getTime() - due.getTime()) / 86400000))
        : 0;
      const dueDateStr = due
        ? due.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
        : "—";

      const res = await sendPaymentReminderEmail({
        to,
        companyName: company?.name ?? "Customer",
        invoiceLabel,
        amountOmr,
        dueDateStr,
        daysPastDue,
        portalUrl: portalUrlForEmail(),
      });
      if (!res.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: res.error ?? "Failed to send email",
        });
      }
      return { success: true as const };
    }),

  sendReminderWhatsApp: protectedProcedure
    .input(
      z.object({
        companyId: z.number(),
        sourceType: sourceTypeSchema,
        sourceId: z.number(),
        toPhone: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isCollectionReminderWhatsAppTemplateConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "WhatsApp collections template not configured. Set WHATSAPP_TEMPLATE_COLLECTION_REMINDER (and Cloud API credentials).",
        });
      }
      // AUTH FIRST: pure membership check before DB (assertCollectionsAccess is DB-backed)
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        await requireWorkspaceMembership(ctx.user as User, input.companyId);
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await assertCollectionsAccess(ctx, input.companyId);
      const row = await loadSourceRow(db, input.sourceType, input.sourceId);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      if (row.companyId !== input.companyId) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });

      const company = await getCompanyById(input.companyId);
      const digits = toWhatsAppPhoneDigits(
        input.toPhone?.trim() || company?.phone || "",
      );
      if (!digits) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No valid phone — set company phone or pass toPhone.",
        });
      }

      const invoiceLabel =
        "invoiceNumber" in row && typeof row.invoiceNumber === "string"
          ? row.invoiceNumber
          : String(row.invoiceNumber);
      const amountRaw =
        "amountOmr" in row && row.amountOmr != null
          ? row.amountOmr
          : "amount" in row && row.amount != null
            ? row.amount
            : "0";
      const amountOmr = Number(amountRaw).toFixed(3);

      const res = await sendCollectionPaymentReminderTemplate({
        toDigits: digits,
        companyName: company?.name ?? "Customer",
        invoiceLabel,
        amountOmr,
      });
      if (!res.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: res.error });
      }
      return { success: true as const, messageId: res.messageId };
    }),

  whatsappReminderConfigured: protectedProcedure.query(() => ({
    configured: isCollectionReminderWhatsAppTemplateConfigured(),
  })),
});
