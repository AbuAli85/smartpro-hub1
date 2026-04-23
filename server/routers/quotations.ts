import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { serviceQuotations, quotationLineItems, crmDeals, crmContacts } from "../../drizzle/schema";
import { eq, and, desc, sql, or, isNull } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import { storagePut } from "../storage";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { optionalActiveWorkspace } from "../_core/workspaceInput";
import { assertQuotationTenantAccess, requireActiveCompanyId } from "../_core/tenant";

type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** Validates CRM links and aligns contact from deal when omitted. */
async function resolveQuotationCrmLinks(
  db: DbClient,
  companyId: number | null,
  input: { crmDealId?: number | null; crmContactId?: number | null },
): Promise<{ crmDealId: number | null; crmContactId: number | null }> {
  let crmDealId = input.crmDealId ?? null;
  let crmContactId = input.crmContactId ?? null;

  if (crmDealId != null) {
    const [deal] = await db.select().from(crmDeals).where(eq(crmDeals.id, crmDealId)).limit(1);
    if (!deal) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found" });
    if (companyId != null && deal.companyId !== companyId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found" });
    }
    if (crmContactId != null && deal.contactId != null && deal.contactId !== crmContactId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Selected contact does not match the deal’s linked contact",
      });
    }
    if (crmContactId == null && deal.contactId != null) {
      crmContactId = deal.contactId;
    }
  }

  if (crmContactId != null) {
    const [contact] = await db.select().from(crmContacts).where(eq(crmContacts.id, crmContactId)).limit(1);
    if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
    if (companyId != null && contact.companyId !== companyId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
    }
  }

  return { crmDealId, crmContactId };
}

function generateRefNumber(): string {
  const year = new Date().getFullYear();
  const seq = Math.floor(Math.random() * 9000) + 1000;
  return `QT-${year}-${seq}`;
}

function calcLineTotals(items: Array<{ serviceName: string; description?: string; qty: number; unitPriceOmr: number; discountPct: number }>) {
  return items.map((item, idx) => {
    const discount = item.unitPriceOmr * item.qty * (item.discountPct / 100);
    const lineTotal = item.unitPriceOmr * item.qty - discount;
    return { ...item, lineTotal, sortOrder: idx };
  });
}

export const quotationsRouter = router({
  // ── Create ──────────────────────────────────────────────────────────────────
  create: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        clientName: z.string().min(1),
        clientEmail: z.string().email().optional(),
        clientPhone: z.string().optional(),
        validityDays: z.number().min(1).max(365).default(30),
        notes: z.string().optional(),
        terms: z.string().optional(),
        lineItems: z.array(
          z.object({
            serviceName: z.string().min(1),
            description: z.string().optional(),
            qty: z.number().min(1).default(1),
            unitPriceOmr: z.number().min(0),
            discountPct: z.number().min(0).max(100).default(0),
          }),
        ).min(1),
        /** Optional CRM deal — ties the quote to pipeline reporting. */
        crmDealId: z.number().int().positive().optional().nullable(),
        /** Optional CRM contact — explicit customer record. */
        crmContactId: z.number().int().positive().optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {

      const companyId = canAccessGlobalAdminProcedures(ctx.user)
        ? input.companyId ?? null
        : await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { crmDealId, crmContactId } = await resolveQuotationCrmLinks(db, companyId, {
        crmDealId: input.crmDealId ?? null,
        crmContactId: input.crmContactId ?? null,
      });

      const lines = calcLineTotals(input.lineItems);
      const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
      const vat = subtotal * 0.05; // 5% VAT (Oman)
      const total = subtotal + vat;

      const refNumber = generateRefNumber();

      const [quotation] = await db
        .insert(serviceQuotations)
        .values({
          companyId,
          referenceNumber: refNumber,
          clientName: input.clientName,
          clientEmail: input.clientEmail ?? null,
          clientPhone: input.clientPhone ?? null,
          subtotalOmr: subtotal.toFixed(3),
          vatOmr: vat.toFixed(3),
          totalOmr: total.toFixed(3),
          validityDays: input.validityDays,
          notes: input.notes ?? null,
          terms: input.terms ?? null,
          status: "draft",
          crmDealId,
          crmContactId,
          createdBy: ctx.user.id,
        })
        .$returningId();

      const quotationId = quotation.id;

      await db.insert(quotationLineItems).values(
        lines.map((l) => ({
          quotationId,
          serviceName: l.serviceName,
          description: l.description ?? null,
          qty: l.qty,
          unitPriceOmr: l.unitPriceOmr.toFixed(3),
          discountPct: l.discountPct.toFixed(2),
          lineTotalOmr: l.lineTotal.toFixed(3),
          sortOrder: l.sortOrder,
        })),
      );

      return { id: quotationId, referenceNumber: refNumber };
    }),

  // ── List ─────────────────────────────────────────────────────────────────────
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(["draft", "sent", "accepted", "declined", "expired"]).optional(),
        companyId: z.number().optional(),
      }),
    )
     .query(async ({ ctx, input }) => {
      // AUTH FIRST: guard before DB
      const conditions = [];
      if (input.status) conditions.push(eq(serviceQuotations.status, input.status));
      let cid: number | undefined;
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        cid = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      }
      const db = await getDb();
      if (!db) return [];
      if (canAccessGlobalAdminProcedures(ctx.user)) {
        if (input.companyId != null) conditions.push(eq(serviceQuotations.companyId, input.companyId));
      } else {
        conditions.push(
          or(
            eq(serviceQuotations.companyId, cid!),
            and(isNull(serviceQuotations.companyId), eq(serviceQuotations.createdBy, ctx.user.id)),
          )!,
        );
      }
      return db
        .select()
        .from(serviceQuotations)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(serviceQuotations.createdAt));
    }),

  // ── Get by ID ────────────────────────────────────────────────────────────────
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [quotation] = await db
        .select()
        .from(serviceQuotations)
        .where(eq(serviceQuotations.id, input.id))
        .limit(1);

      if (!quotation) throw new TRPCError({ code: "NOT_FOUND" });

      await assertQuotationTenantAccess(ctx.user, {
        companyId: quotation.companyId,
        createdBy: quotation.createdBy,
      });

      const lineItems = await db
        .select()
        .from(quotationLineItems)
        .where(eq(quotationLineItems.quotationId, input.id))
        .orderBy(quotationLineItems.sortOrder);

      return { ...quotation, lineItems };
    }),

  // ── Update ───────────────────────────────────────────────────────────────────
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        clientName: z.string().min(1).optional(),
        clientEmail: z.string().email().optional(),
        clientPhone: z.string().optional(),
        validityDays: z.number().optional(),
        notes: z.string().optional(),
        terms: z.string().optional(),
        lineItems: z.array(
          z.object({
            serviceName: z.string().min(1),
            description: z.string().optional(),
            qty: z.number().min(1),
            unitPriceOmr: z.number().min(0),
            discountPct: z.number().min(0).max(100).default(0),
          }),
        ).optional(),
        crmDealId: z.number().int().positive().optional().nullable(),
        crmContactId: z.number().int().positive().optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [row] = await db
        .select({
          status: serviceQuotations.status,
          companyId: serviceQuotations.companyId,
          createdBy: serviceQuotations.createdBy,
          crmDealId: serviceQuotations.crmDealId,
          crmContactId: serviceQuotations.crmContactId,
        })
        .from(serviceQuotations)
        .where(eq(serviceQuotations.id, input.id))
        .limit(1);

      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      await assertQuotationTenantAccess(ctx.user, { companyId: row.companyId, createdBy: row.createdBy });
      if (row.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft quotations can be edited" });

      const nextDealId = input.crmDealId !== undefined ? input.crmDealId : row.crmDealId;
      const nextContactId = input.crmContactId !== undefined ? input.crmContactId : row.crmContactId;
      const resolved = await resolveQuotationCrmLinks(db, row.companyId, {
        crmDealId: nextDealId,
        crmContactId: nextContactId,
      });

      const updateData: Record<string, unknown> = {};
      updateData.crmDealId = resolved.crmDealId;
      updateData.crmContactId = resolved.crmContactId;
      if (input.clientName) updateData.clientName = input.clientName;
      if (input.clientEmail) updateData.clientEmail = input.clientEmail;
      if (input.clientPhone) updateData.clientPhone = input.clientPhone;
      if (input.validityDays) updateData.validityDays = input.validityDays;
      if (input.notes !== undefined) updateData.notes = input.notes;
      if (input.terms !== undefined) updateData.terms = input.terms;

      if (input.lineItems) {
        const lines = calcLineTotals(input.lineItems);
        const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
        const vat = subtotal * 0.05;
        const total = subtotal + vat;
        updateData.subtotalOmr = subtotal.toFixed(3);
        updateData.vatOmr = vat.toFixed(3);
        updateData.totalOmr = total.toFixed(3);

        await db.delete(quotationLineItems).where(eq(quotationLineItems.quotationId, input.id));
        await db.insert(quotationLineItems).values(
          lines.map((l) => ({
            quotationId: input.id,
            serviceName: l.serviceName,
            description: l.description ?? null,
            qty: l.qty,
            unitPriceOmr: l.unitPriceOmr.toFixed(3),
            discountPct: l.discountPct.toFixed(2),
            lineTotalOmr: l.lineTotal.toFixed(3),
            sortOrder: l.sortOrder,
          })),
        );
      }

      if (Object.keys(updateData).length > 0) {
        await db.update(serviceQuotations).set(updateData).where(eq(serviceQuotations.id, input.id));
      }

      return { success: true };
    }),

  // ── Send (generate PDF + mark sent) ─────────────────────────────────────────
  send: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [quotation] = await db
        .select()
        .from(serviceQuotations)
        .where(eq(serviceQuotations.id, input.id))
        .limit(1);

      if (!quotation) throw new TRPCError({ code: "NOT_FOUND" });
      await assertQuotationTenantAccess(ctx.user, {
        companyId: quotation.companyId,
        createdBy: quotation.createdBy,
      });

      const lineItems = await db
        .select()
        .from(quotationLineItems)
        .where(eq(quotationLineItems.quotationId, input.id))
        .orderBy(quotationLineItems.sortOrder);

      // Generate branded HTML quotation via LLM
      const lineItemsText = lineItems
        .map((l) => `- ${l.serviceName} (${l.description ?? ""}): Qty ${l.qty} × OMR ${Number(l.unitPriceOmr).toFixed(3)} = OMR ${Number(l.lineTotalOmr).toFixed(3)}`)
        .join("\n");

      const htmlResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are a professional business document generator for SmartPRO Business Services Hub, an Oman-based company. 
Generate a clean, professional HTML quotation document. Use inline CSS only. 
Include: SmartPRO header with logo text, quotation reference, client details, itemized table, totals (subtotal + 5% VAT + total in OMR), validity, terms, and a professional footer.
Use colors: #f97316 (orange) for headings/accents, #1e293b (dark) for text. Make it print-ready.`,
          },
          {
            role: "user",
            content: `Generate quotation HTML for:
Reference: ${quotation.referenceNumber}
Client: ${quotation.clientName} (${quotation.clientEmail ?? "N/A"})
Date: ${new Date().toLocaleDateString("en-GB")}
Valid Until: ${new Date(Date.now() + quotation.validityDays * 86400000).toLocaleDateString("en-GB")}

Line Items:
${lineItemsText}

Subtotal: OMR ${Number(quotation.subtotalOmr).toFixed(3)}
VAT (5%): OMR ${Number(quotation.vatOmr).toFixed(3)}
Total: OMR ${Number(quotation.totalOmr).toFixed(3)}

Notes: ${quotation.notes ?? "N/A"}
Terms: ${quotation.terms ?? "Payment due within 30 days. All prices in Omani Rial (OMR)."}`,
          },
        ],
      });

      const rawContent = htmlResponse.choices[0]?.message?.content;
      const htmlContent = typeof rawContent === "string" ? rawContent : "<html><body>Quotation</body></html>";
      const htmlBuffer = Buffer.from(htmlContent, "utf-8");
      const tenantSeg =
        quotation.companyId != null ? String(quotation.companyId) : `creator-${quotation.createdBy}`;
      const fileKey = `quotations/${tenantSeg}/${quotation.referenceNumber}-${Date.now()}.html`;
      const { url: pdfUrl } = await storagePut(fileKey, htmlBuffer, "text/html");

      await db
        .update(serviceQuotations)
        .set({ status: "sent", sentAt: new Date(), pdfUrl })
        .where(eq(serviceQuotations.id, input.id));

      return { success: true, pdfUrl };
    }),

  // ── Accept ───────────────────────────────────────────────────────────────────
  accept: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [row] = await db
        .select({
          companyId: serviceQuotations.companyId,
          createdBy: serviceQuotations.createdBy,
        })
        .from(serviceQuotations)
        .where(eq(serviceQuotations.id, input.id))
        .limit(1);

      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      await assertQuotationTenantAccess(ctx.user, { companyId: row.companyId, createdBy: row.createdBy });

      await db
        .update(serviceQuotations)
        .set({ status: "accepted", acceptedAt: new Date() })
        .where(eq(serviceQuotations.id, input.id));

      return { success: true };
    }),

  // ── Decline ──────────────────────────────────────────────────────────────────
  decline: protectedProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [row] = await db
        .select({
          companyId: serviceQuotations.companyId,
          createdBy: serviceQuotations.createdBy,
        })
        .from(serviceQuotations)
        .where(eq(serviceQuotations.id, input.id))
        .limit(1);

      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      await assertQuotationTenantAccess(ctx.user, { companyId: row.companyId, createdBy: row.createdBy });

      await db
        .update(serviceQuotations)
        .set({ status: "declined", declinedAt: new Date(), declineReason: input.reason ?? null })
        .where(eq(serviceQuotations.id, input.id));

      return { success: true };
    }),

  // ── Delete (draft only) ───────────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [existing] = await db
        .select({
          status: serviceQuotations.status,
          companyId: serviceQuotations.companyId,
          createdBy: serviceQuotations.createdBy,
        })
        .from(serviceQuotations)
        .where(eq(serviceQuotations.id, input.id))
        .limit(1);

      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await assertQuotationTenantAccess(ctx.user, {
        companyId: existing.companyId,
        createdBy: existing.createdBy,
      });
      if (existing.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft quotations can be deleted" });

      await db.delete(quotationLineItems).where(eq(quotationLineItems.quotationId, input.id));
      await db.delete(serviceQuotations).where(eq(serviceQuotations.id, input.id));

      return { success: true };
    }),

  // ── Summary stats ────────────────────────────────────────────────────────────
  getSummary: protectedProcedure
    .input(optionalActiveWorkspace.optional())
    .query(async ({ ctx, input }) => {
    // AUTH FIRST: guard before DB
    let companyId: number | undefined;
    if (!canAccessGlobalAdminProcedures(ctx.user)) {
      companyId = await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user);
    }
    const db = await getDb();
    if (!db) return { total: 0, draft: 0, sent: 0, accepted: 0, declined: 0, totalValueOmr: 0 };

    const base = db
      .select({
        status: serviceQuotations.status,
        cnt: sql<number>`count(*)`,
        totalVal: sql<number>`sum(total_omr)`,
      })
      .from(serviceQuotations);

    const rows = canAccessGlobalAdminProcedures(ctx.user)
      ? await base.groupBy(serviceQuotations.status)
      : await base
          .where(
            or(
              eq(serviceQuotations.companyId, companyId!),
              and(isNull(serviceQuotations.companyId), eq(serviceQuotations.createdBy, ctx.user.id)),
            )!,
          )
          .groupBy(serviceQuotations.status);

    const result = { total: 0, draft: 0, sent: 0, accepted: 0, declined: 0, expired: 0, totalValueOmr: 0 };
    for (const row of rows) {
      const cnt = Number(row.cnt);
      result.total += cnt;
      result.totalValueOmr += Number(row.totalVal ?? 0);
      if (row.status === "draft") result.draft = cnt;
      else if (row.status === "sent") result.sent = cnt;
      else if (row.status === "accepted") result.accepted = cnt;
      else if (row.status === "declined") result.declined = cnt;
      else if (row.status === "expired") result.expired = cnt;
    }
    return result;
  }),
});
