import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import type { User } from "../../drizzle/schema";
import { assertRowBelongsToActiveCompany, requireActiveCompanyId } from "../_core/tenant";
import { deriveDealLifecycle, type ContractLite } from "../commercialLifecycle";
import { getContactPostSaleSummary, getPostSaleSignals } from "../postSaleSignals";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { contracts, crmDeals, serviceQuotations } from "../../drizzle/schema";
import {
  createCrmCommunication,
  createCrmContact,
  createCrmDeal,
  getCrmCommunications,
  getCrmContactById,
  getCrmContacts,
  getCrmDealById,
  getCrmDeals,
  getDb,
  updateCrmContact,
  updateCrmDeal,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";

async function resolveCrmCompanyId(
  ctx: { user: { id: number; role?: string | null; platformRole?: string | null } },
  inputCompanyId?: number
): Promise<number> {
  if (canAccessGlobalAdminProcedures(ctx.user)) {
    if (inputCompanyId != null) return inputCompanyId;
    throw new TRPCError({ code: "BAD_REQUEST", message: "companyId is required when you have no company membership" });
  }
  return requireActiveCompanyId(ctx.user.id, inputCompanyId, ctx.user as User);
}

export const crmRouter = router({
  // Contacts
  listContacts: protectedProcedure
    .input(
      z.object({
        status: z.string().optional(),
        search: z.string().optional(),
        companyId: z.number().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        const companyId = await resolveCrmCompanyId(ctx, input.companyId);
        return getCrmContacts(companyId, { status: input.status, search: input.search });
      } catch {
        return [];
      }
    }),

  createContact: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        company: z.string().optional(),
        position: z.string().optional(),
        country: z.string().optional(),
        city: z.string().optional(),
        source: z.string().optional(),
        status: z.enum(["lead", "prospect", "customer", "inactive"]).default("lead"),
        notes: z.string().optional(),
        tags: z.array(z.string()).default([]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const companyId = await resolveCrmCompanyId(ctx, input.companyId);
      const { companyId: _omit, ...rest } = input;
      await createCrmContact({ ...rest, companyId, ownerId: ctx.user.id });
      return { success: true };
    }),

  updateContact: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        companyId: z.number().optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        company: z.string().optional(),
        position: z.string().optional(),
        status: z.enum(["lead", "prospect", "customer", "inactive"]).optional(),
        notes: z.string().optional(),
        tags: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const row = await getCrmContactById(input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      await assertRowBelongsToActiveCompany(ctx.user, row.companyId, "Contact", input.companyId);
      const { id, companyId: _c, ...data } = input;
      await updateCrmContact(id, data);
      return { success: true };
    }),

  // Deals
  listDeals: protectedProcedure
    .input(z.object({ stage: z.string().optional(), companyId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      try {
        const companyId = await resolveCrmCompanyId(ctx, input.companyId);
        return getCrmDeals(companyId, { stage: input.stage });
      } catch {
        return [];
      }
    }),

  createDeal: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        title: z.string().min(2),
        contactId: z.number().optional(),
        value: z.number().optional(),
        currency: z.string().default("OMR"),
        stage: z.enum(["lead", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"]).default("lead"),
        probability: z.number().min(0).max(100).default(0),
        expectedCloseDate: z.string().optional(),
        source: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const companyId = await resolveCrmCompanyId(ctx, input.companyId);
      if (input.contactId != null) {
        const c = await getCrmContactById(input.contactId);
        if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
        if (c.companyId !== companyId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
        }
      }
      const { companyId: _omit, ...rest } = input;
      await createCrmDeal({
        ...rest,
        companyId,
        ownerId: ctx.user.id,
        value: input.value ? String(input.value) : undefined,
        expectedCloseDate: input.expectedCloseDate ? new Date(input.expectedCloseDate) : undefined,
      });
      return { success: true };
    }),

  updateDeal: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        companyId: z.number().optional(),
        title: z.string().optional(),
        stage: z.enum(["lead", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"]).optional(),
        value: z.number().optional(),
        probability: z.number().min(0).max(100).optional(),
        notes: z.string().optional(),
        expectedCloseDate: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const row = await getCrmDealById(input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found" });
      await assertRowBelongsToActiveCompany(ctx.user, row.companyId, "Deal", input.companyId ?? row.companyId);
      const { id, companyId: _c, ...data } = input;
      const updateData: Record<string, unknown> = { ...data };
      if (data.value !== undefined) updateData.value = String(data.value);
      if (data.expectedCloseDate) updateData.expectedCloseDate = new Date(data.expectedCloseDate);
      if (data.stage === "closed_won" || data.stage === "closed_lost") updateData.closedAt = new Date();
      await updateCrmDeal(id, updateData as any);
      return { success: true };
    }),

  // Communications
  listCommunications: protectedProcedure
    .input(z.object({ contactId: z.number().optional(), companyId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      try {
        const companyId = await resolveCrmCompanyId(ctx, input.companyId);
        return getCrmCommunications(companyId, input.contactId);
      } catch {
        return [];
      }
    }),

  /**
   * Unified commercial snapshot for a contact: deals, quotations (by CRM deal link or email match),
   * and contracts produced from those quotations. Server-authoritative; tenant-scoped.
   */
  getContact360: protectedProcedure
    .input(z.object({ contactId: z.number(), companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const companyId = await resolveCrmCompanyId(ctx, input.companyId);
      const contact = await getCrmContactById(input.contactId);
      if (!contact || contact.companyId !== companyId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      }
      await assertRowBelongsToActiveCompany(ctx.user, contact.companyId, "Contact", input.companyId);

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const deals = await db
        .select()
        .from(crmDeals)
        .where(and(eq(crmDeals.companyId, companyId), eq(crmDeals.contactId, input.contactId)))
        .orderBy(desc(crmDeals.updatedAt));

      const dealIds = deals.map((d) => d.id);
      const emailNorm = (contact.email ?? "").trim().toLowerCase();

      const byDeal =
        dealIds.length > 0
          ? await db
              .select()
              .from(serviceQuotations)
              .where(and(eq(serviceQuotations.companyId, companyId), inArray(serviceQuotations.crmDealId, dealIds)))
          : [];

      const byEmail =
        emailNorm.length > 0
          ? await db
              .select()
              .from(serviceQuotations)
              .where(
                and(
                  eq(serviceQuotations.companyId, companyId),
                  sql`LOWER(TRIM(${serviceQuotations.clientEmail})) = ${emailNorm}`,
                ),
              )
          : [];

      const byContactId = await db
        .select()
        .from(serviceQuotations)
        .where(and(eq(serviceQuotations.companyId, companyId), eq(serviceQuotations.crmContactId, input.contactId)));

      const quoteMap = new Map<number, (typeof byDeal)[0]>();
      for (const q of [...byDeal, ...byEmail, ...byContactId]) quoteMap.set(q.id, q);
      const quotations = Array.from(quoteMap.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      const convIds = quotations
        .map((q) => q.convertedToContractId)
        .filter((id): id is number => id != null);
      const contractsFromQuotations =
        convIds.length > 0
          ? await db.select().from(contracts).where(inArray(contracts.id, convIds))
          : [];

      const contractById = new Map<number, ContractLite>(
        contractsFromQuotations.map((c) => [
          c.id,
          {
            id: c.id,
            status: c.status ?? "",
            endDate: c.endDate ? new Date(c.endDate) : null,
          },
        ]),
      );

      const dealsWithLifecycle = deals.map((deal) => {
        const dq = quotations.filter((q) => q.crmDealId === deal.id);
        const lifecycle = deriveDealLifecycle(
          { id: deal.id, stage: deal.stage ?? "lead" },
          dq.map((q) => ({ status: q.status, convertedToContractId: q.convertedToContractId })),
          contractById,
        );
        return { deal, lifecycle, quotations: dq };
      });

      type ThreadRow = {
        sortAt: Date;
        kind: "deal" | "quotation" | "contract";
        title: string;
        subtitle: string;
        href: string;
        entityId: number;
      };
      const thread: ThreadRow[] = [];
      for (const d of deals) {
        thread.push({
          sortAt: new Date(d.updatedAt),
          kind: "deal",
          title: d.title,
          subtitle: d.stage ?? "",
          href: `/crm?contact=${input.contactId}&deal=${d.id}`,
          entityId: d.id,
        });
      }
      for (const q of quotations) {
        thread.push({
          sortAt: new Date(q.createdAt),
          kind: "quotation",
          title: q.referenceNumber,
          subtitle: q.status,
          href: `/quotations?quote=${q.id}`,
          entityId: q.id,
        });
      }
      for (const c of contractsFromQuotations) {
        thread.push({
          sortAt: new Date(c.updatedAt ?? c.createdAt),
          kind: "contract",
          title: c.title,
          subtitle: c.status ?? "",
          href: `/contracts?id=${c.id}`,
          entityId: c.id,
        });
      }
      thread.sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime());

      const contactPostSale = await getContactPostSaleSummary(db, companyId, contractsFromQuotations);
      const workspacePostSale = await getPostSaleSignals(db, companyId);

      return {
        contact,
        deals,
        quotations,
        contractsFromQuotations,
        dealsWithLifecycle,
        lifecycleThread: thread,
        contactPostSale,
        workspaceCollections: {
          proBillingOverdueOmr: workspacePostSale.proBillingOverdueOmr,
          proBillingOverdueCount: workspacePostSale.proBillingOverdueCount,
          subscriptionOverdueOmr: workspacePostSale.subscriptionOverdueOmr,
          subscriptionOverdueCount: workspacePostSale.subscriptionOverdueCount,
          scopeNote:
            "Tenant-wide billing signals — invoices are not linked to individual CRM contacts in this schema.",
        },
        billingReviewHint: {
          completedProWithFeesLast90dCount: workspacePostSale.completedProWithFeesLast90dCount,
          caveat: workspacePostSale.completedWorkBillingCaveat,
        },
      };
    }),

  /** Deals with derived commercial lifecycle (for pipeline / owner views). */
  listDealsWithLifecycle: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const companyId = await resolveCrmCompanyId(ctx, input.companyId);
      const db = await getDb();
      if (!db) return [];
      const deals = await db
        .select()
        .from(crmDeals)
        .where(eq(crmDeals.companyId, companyId))
        .orderBy(desc(crmDeals.updatedAt));
      if (deals.length === 0) return [];
      const dealIds = deals.map((d) => d.id);
      const quotes = await db
        .select()
        .from(serviceQuotations)
        .where(and(eq(serviceQuotations.companyId, companyId), inArray(serviceQuotations.crmDealId, dealIds)));
      const convIds = quotes.map((q) => q.convertedToContractId).filter((id): id is number => id != null);
      const contractRows =
        convIds.length > 0 ? await db.select().from(contracts).where(inArray(contracts.id, convIds)) : [];
      const contractById = new Map<number, ContractLite>(
        contractRows.map((c) => [
          c.id,
          {
            id: c.id,
            status: c.status ?? "",
            endDate: c.endDate ? new Date(c.endDate) : null,
          },
        ]),
      );

      return deals.map((deal) => {
        const dq = quotes.filter((q) => q.crmDealId === deal.id);
        const lifecycle = deriveDealLifecycle(
          { id: deal.id, stage: deal.stage ?? "lead" },
          dq.map((q) => ({ status: q.status, convertedToContractId: q.convertedToContractId })),
          contractById,
        );
        return { ...deal, lifecycle };
      });
    }),

  createCommunication: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        contactId: z.number().optional(),
        dealId: z.number().optional(),
        type: z.enum(["email", "call", "meeting", "note", "sms", "whatsapp"]),
        subject: z.string().optional(),
        content: z.string().optional(),
        direction: z.enum(["inbound", "outbound"]).default("outbound"),
        duration: z.number().optional(),
        scheduledAt: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const companyId = await resolveCrmCompanyId(ctx, input.companyId);
      if (input.contactId != null) {
        const c = await getCrmContactById(input.contactId);
        if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
        if (c.companyId !== companyId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
        }
      }
      if (input.dealId != null) {
        const d = await getCrmDealById(input.dealId);
        if (!d) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found" });
        if (d.companyId !== companyId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found" });
        }
      }
      const { companyId: _omit, ...rest } = input;
      await createCrmCommunication({
        ...rest,
        companyId,
        userId: ctx.user.id,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
      });
      return { success: true };
    }),

  pipelineStats: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
    let deals;
    try {
      const companyId = await resolveCrmCompanyId(ctx, input?.companyId);
      deals = await getCrmDeals(companyId);
    } catch {
      return null;
    }
    const stages = ["lead", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"] as const;
    return stages.map((stage) => {
      const stageDeals = deals.filter((d) => d.stage === stage);
      const totalValue = stageDeals.reduce((sum, d) => sum + Number(d.value ?? 0), 0);
      return { stage, count: stageDeals.length, totalValue };
    });
  }),
});
