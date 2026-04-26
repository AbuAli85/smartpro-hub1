import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import type { User } from "../../drizzle/schema";
import { assertRowBelongsToActiveCompany, requireActiveCompanyId } from "../_core/tenant";
import { deriveDealLifecycle, type ContractLite } from "../commercialLifecycle";
import { getPostSaleSignals, getStalledServiceContractIds, STALLED_DELIVERY_BASIS_SHORT } from "../postSaleSignals";
import {
  ACCOUNT_HEALTH_RULES_BASIS,
  buildAccountHealthForContact,
  countCommercialFrictionForContact,
  getContactLastActivityAt,
} from "../accountHealth";
import { and, count, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import {
  clientCompanies,
  contracts,
  crmContacts,
  crmDeals,
  customerDeployments,
  proBillingCycles,
  proServices,
  serviceQuotations,
} from "../../drizzle/schema";
import { buildContactRevenueRealizationHints, buildRevenueRealizationSnapshot } from "../revenueRealization";
import { resolvePrimaryAccountAction } from "../ownerResolution";
import { getWorkflowTrackingForContact, RESOLUTION_WORKFLOW_BASIS } from "../resolutionWorkflow";
import {
  createCrmCommunication,
  createCrmContact,
  createCrmDeal,
  createClientCompany,
  getCrmCommunications,
  getCrmContactById,
  getCrmContacts,
  getCrmDealById,
  getCrmDeals,
  getClientCompanies,
  getClientCompanyById,
  updateClientCompany,
  getDb,
  updateCrmContact,
  updateCrmDeal,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { requireAnyOperatorRole } from "../_core/policy";

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

/** Resolves companyId for CRM mutations while enforcing operator-level role. */
async function requireCrmMutationAccess(
  ctx: { user: User },
  inputCompanyId?: number
): Promise<number> {
  if (canAccessGlobalAdminProcedures(ctx.user)) {
    return resolveCrmCompanyId(ctx, inputCompanyId);
  }
  const m = await requireAnyOperatorRole(ctx.user, inputCompanyId);
  return m.companyId;
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
        /** Legacy free-text company (kept for backward compat); prefer clientCompanyId */
        company: z.string().optional(),
        /** FK to client_companies.id */
        clientCompanyId: z.number().int().positive().optional().nullable(),
        position: z.string().optional(),
        roleType: z.enum(["decision_maker", "influencer", "finance", "operations", "other"]).optional(),
        country: z.string().optional(),
        city: z.string().optional(),
        source: z.string().optional(),
        status: z.enum(["lead", "prospect", "customer", "inactive"]).default("lead"),
        notes: z.string().optional(),
        tags: z.array(z.string()).default([]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const companyId = await requireCrmMutationAccess(ctx as { user: User }, input.companyId);
      // Validate clientCompanyId belongs to same tenant
      if (input.clientCompanyId != null) {
        const cc = await getClientCompanyById(input.clientCompanyId);
        if (!cc || cc.companyId !== companyId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Client company not found" });
        }
      }
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
        clientCompanyId: z.number().int().positive().optional().nullable(),
        position: z.string().optional(),
        roleType: z.enum(["decision_maker", "influencer", "finance", "operations", "other"]).optional().nullable(),
        status: z.enum(["lead", "prospect", "customer", "inactive"]).optional(),
        notes: z.string().optional(),
        tags: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const companyId = await requireCrmMutationAccess(ctx as { user: User }, input.companyId);
      const row = await getCrmContactById(input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      await assertRowBelongsToActiveCompany(ctx.user, row.companyId, "Contact", input.companyId);
      if (input.clientCompanyId != null) {
        const cc = await getClientCompanyById(input.clientCompanyId);
        if (!cc || cc.companyId !== companyId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Client company not found" });
        }
      }
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
        clientCompanyId: z.number().int().positive().optional().nullable(),
        contactId: z.number().optional(),
        serviceType: z.enum(["manpower", "promoter", "pro_service", "project", "other"]).optional(),
        value: z.number().optional(),
        currency: z.string().default("OMR"),
        stage: z.enum([
          "lead", "qualified", "proposal", "quotation_sent",
          "negotiation", "closed_won", "closed_lost", "won", "lost",
        ]).default("lead"),
        probability: z.number().min(0).max(100).default(0),
        expectedCloseDate: z.string().optional(),
        expectedStartDate: z.string().optional(),
        source: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const companyId = await requireCrmMutationAccess(ctx as { user: User }, input.companyId);
      if (input.contactId != null) {
        const c = await getCrmContactById(input.contactId);
        if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
        if (c.companyId !== companyId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
        }
      }
      if (input.clientCompanyId != null) {
        const cc = await getClientCompanyById(input.clientCompanyId);
        if (!cc || cc.companyId !== companyId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Client company not found" });
        }
      }
      const { companyId: _omit, ...rest } = input;
      await createCrmDeal({
        ...rest,
        companyId,
        ownerId: ctx.user.id,
        value: input.value ? String(input.value) : undefined,
        expectedCloseDate: input.expectedCloseDate ? new Date(input.expectedCloseDate) : undefined,
        expectedStartDate: input.expectedStartDate ?? null,
      });
      return { success: true };
    }),

  updateDeal: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        companyId: z.number().optional(),
        title: z.string().optional(),
        clientCompanyId: z.number().int().positive().optional().nullable(),
        serviceType: z.enum(["manpower", "promoter", "pro_service", "project", "other"]).optional().nullable(),
        stage: z.enum([
          "lead", "qualified", "proposal", "quotation_sent",
          "negotiation", "closed_won", "closed_lost", "won", "lost",
        ]).optional(),
        value: z.number().optional(),
        probability: z.number().min(0).max(100).optional(),
        notes: z.string().optional(),
        expectedCloseDate: z.string().optional(),
        expectedStartDate: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const companyId = await requireCrmMutationAccess(ctx as { user: User }, input.companyId);
      const row = await getCrmDealById(input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found" });
      await assertRowBelongsToActiveCompany(ctx.user, row.companyId, "Deal", input.companyId ?? row.companyId);
      if (input.clientCompanyId != null) {
        const cc = await getClientCompanyById(input.clientCompanyId);
        if (!cc || cc.companyId !== companyId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Client company not found" });
        }
      }
      const { id, companyId: _c, ...data } = input;
      const updateData: Record<string, unknown> = { ...data };
      if (data.value !== undefined) updateData.value = String(data.value);
      if (data.expectedCloseDate) updateData.expectedCloseDate = new Date(data.expectedCloseDate);
      if (data.stage === "closed_won" || data.stage === "closed_lost" || data.stage === "won" || data.stage === "lost") {
        updateData.closedAt = new Date();
      }
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

      const workspacePostSale = await getPostSaleSignals(db, companyId);

      const stalledContractIds = await getStalledServiceContractIds(db, companyId);
      const contactPostSale = {
        stalledServiceContracts: contractsFromQuotations
          .filter((c) => stalledContractIds.has(c.id))
          .map((c) => ({ id: c.id, title: c.title })),
        stalledBasis: STALLED_DELIVERY_BASIS_SHORT,
      };
      const frictionCount = await countCommercialFrictionForContact(db, companyId, input.contactId);
      const lastActivityAt = await getContactLastActivityAt(db, companyId, input.contactId);
      const accountHealth = buildAccountHealthForContact(
        contractsFromQuotations,
        stalledContractIds,
        frictionCount,
        lastActivityAt,
        new Date(),
        workspacePostSale.proBillingOverdueCount > 0,
      );

      const [proPendingRow] = await db
        .select({ cnt: count() })
        .from(proBillingCycles)
        .where(and(eq(proBillingCycles.companyId, companyId), eq(proBillingCycles.status, "pending")));

      const revenueWorkspace = await buildRevenueRealizationSnapshot(
        db,
        companyId,
        workspacePostSale,
        Number(proPendingRow?.cnt ?? 0),
      );

      const revenueRealization = buildContactRevenueRealizationHints(revenueWorkspace, {
        accountTier: accountHealth.tier,
        stalledContractsCount: accountHealth.signals.stalledServiceContractsCount,
        expiringContractsNext30dCount: accountHealth.signals.expiringContractsNext30dCount,
        commercialFrictionCount: accountHealth.signals.commercialFrictionCount,
      });

      const nowRef = new Date();
      const in30 = new Date(nowRef.getTime() + 30 * 86400000);
      const expiringFirst = contractsFromQuotations
        .filter(
          (c) =>
            c.endDate &&
            new Date(c.endDate) >= nowRef &&
            new Date(c.endDate) <= in30 &&
            ["signed", "active"].includes(c.status ?? ""),
        )
        .sort((a, b) => new Date(a.endDate!).getTime() - new Date(b.endDate!).getTime())[0];
      const stalledFirst = contactPostSale.stalledServiceContracts[0];
      const sampleContractHref = stalledFirst
        ? `/contracts?id=${stalledFirst.id}`
        : expiringFirst
          ? `/contracts?id=${expiringFirst.id}`
          : null;

      const resolution = resolvePrimaryAccountAction({
        tier: accountHealth.tier,
        stalledContractsCount: accountHealth.signals.stalledServiceContractsCount,
        expiringContractsNext30dCount: accountHealth.signals.expiringContractsNext30dCount,
        commercialFrictionCount: accountHealth.signals.commercialFrictionCount,
        renewalWeakFollowUp: accountHealth.renewalWeakFollowUp,
        tenantOverdueBilling: workspacePostSale.proBillingOverdueCount > 0,
        billingFollowThroughPressure: revenueWorkspace.billingFollowThroughPressure,
        primaryHref: `/crm?contact=${input.contactId}`,
        sampleContractHref,
      });

      const nearestExpiryContract = contractsFromQuotations
        .filter(
          (c) =>
            c.endDate &&
            new Date(c.endDate) >= nowRef &&
            ["signed", "active"].includes(c.status ?? ""),
        )
        .sort((a, b) => new Date(a.endDate!).getTime() - new Date(b.endDate!).getTime())[0];
      const nearestExpiryEndDate = nearestExpiryContract?.endDate
        ? new Date(nearestExpiryContract.endDate).toISOString().slice(0, 10)
        : null;

      const resolutionWorkflow = await getWorkflowTrackingForContact(
        db,
        companyId,
        input.contactId,
        accountHealth.tier,
        nearestExpiryEndDate,
      );

      const [openProRow] = await db
        .select({ cnt: count() })
        .from(proServices)
        .where(
          and(
            eq(proServices.companyId, companyId),
            notInArray(proServices.status, ["completed", "cancelled", "rejected"]),
          ),
        );

      return {
        contact,
        deals,
        quotations,
        contractsFromQuotations,
        dealsWithLifecycle,
        lifecycleThread: thread,
        contactPostSale,
        accountHealth: {
          tier: accountHealth.tier,
          reasons: accountHealth.reasons,
          nextActions: accountHealth.nextActions,
          signals: accountHealth.signals,
          renewalWeakFollowUp: accountHealth.renewalWeakFollowUp,
          lastActivityAt: lastActivityAt?.toISOString() ?? null,
          basis: ACCOUNT_HEALTH_RULES_BASIS,
          tenantCollectionsScopeNote:
            workspacePostSale.proBillingOverdueCount > 0
              ? "Workspace has overdue PRO/officer billing — not mapped to this contact in data."
              : null,
        },
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
        revenueRealization,
        resolution: {
          primary: resolution.primary,
          alternatives: resolution.alternatives,
          basis:
            "Deterministic next step from account tier, delivery stall, renewal window, commercial friction, and workspace billing stress — not AI.",
          workflow: resolutionWorkflow,
          workflowTagBasis: RESOLUTION_WORKFLOW_BASIS,
        },
        companyDeliverySnapshot: {
          openProServicesCount: Number(openProRow?.cnt ?? 0),
          basis:
            "Company-wide count of open PRO service requests (not attributed to this CRM contact — PRO schema has no crmContactId). Use for operational load alongside this account’s commercial thread.",
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
      const companyId = await requireCrmMutationAccess(ctx as { user: User }, input.companyId);
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
    const stages = ["lead", "qualified", "proposal", "quotation_sent", "negotiation", "closed_won", "closed_lost", "won", "lost"] as const;
    return stages.map((stage) => {
      const stageDeals = deals.filter((d) => d.stage === stage);
      const totalValue = stageDeals.reduce((sum, d) => sum + Number(d.value ?? 0), 0);
      return { stage, count: stageDeals.length, totalValue };
    });
  }),

  /** Comprehensive deal view: deal + quotations + deployments + contact */
  getDealDetail: protectedProcedure
    .input(z.object({ dealId: z.number(), companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const companyId = await resolveCrmCompanyId(ctx, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const deal = await getCrmDealById(input.dealId);
      if (!deal || deal.companyId !== companyId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found" });
      }

      const [contact, quotations, deployments, clientCompany] = await Promise.all([
        deal.contactId
          ? db.select().from(crmContacts).where(eq(crmContacts.id, deal.contactId)).limit(1).then(r => r[0] ?? null)
          : Promise.resolve(null),
        db.select().from(serviceQuotations)
          .where(and(eq(serviceQuotations.companyId, companyId), eq(serviceQuotations.crmDealId, deal.id)))
          .orderBy(desc(serviceQuotations.createdAt)),
        db.select().from(customerDeployments)
          .where(and(eq(customerDeployments.companyId, companyId), eq(customerDeployments.dealId, deal.id)))
          .orderBy(desc(customerDeployments.createdAt)),
        deal.clientCompanyId
          ? db.select().from(clientCompanies).where(eq(clientCompanies.id, deal.clientCompanyId)).limit(1).then(r => r[0] ?? null)
          : Promise.resolve(null),
      ]);

      return { deal, contact, quotations, deployments, clientCompany };
    }),

  // ─── Client Companies sub-router ─────────────────────────────────────────────
  clientCompanies: router({
    list: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
        status: z.enum(["lead", "active", "inactive", "archived"]).optional(),
        search: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        try {
          const companyId = await resolveCrmCompanyId(ctx, input.companyId);
          return getClientCompanies(companyId, { status: input.status, search: input.search });
        } catch {
          return [];
        }
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number(), companyId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const companyId = await resolveCrmCompanyId(ctx, input.companyId);
        const cc = await getClientCompanyById(input.id);
        if (!cc || cc.companyId !== companyId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Client company not found" });
        }
        const db = await getDb();
        if (!db) return { ...cc, contacts: [], deals: [], recentQuotations: [] };

        // Load related records for the detail view
        const [contacts, deals, recentQuotations] = await Promise.all([
          db.select().from(crmContacts)
            .where(and(eq(crmContacts.companyId, companyId), eq(crmContacts.clientCompanyId, cc.id)))
            .orderBy(desc(crmContacts.createdAt)),
          db.select().from(crmDeals)
            .where(and(eq(crmDeals.companyId, companyId), eq(crmDeals.clientCompanyId, cc.id)))
            .orderBy(desc(crmDeals.updatedAt)),
          db.select().from(serviceQuotations)
            .where(and(eq(serviceQuotations.companyId, companyId), eq(serviceQuotations.clientCompanyId, cc.id)))
            .orderBy(desc(serviceQuotations.createdAt))
            .limit(10),
        ]);

        return { ...cc, contacts, deals, recentQuotations };
      }),

    create: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
        name: z.string().min(1).max(255),
        industry: z.string().max(100).optional(),
        crNumber: z.string().max(100).optional(),
        billingAddress: z.string().optional(),
        primaryContactId: z.number().int().positive().optional().nullable(),
        accountManagerId: z.number().int().positive().optional().nullable(),
        status: z.enum(["lead", "active", "inactive", "archived"]).default("lead"),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const companyId = await requireCrmMutationAccess(ctx as { user: User }, input.companyId);
        const { companyId: _omit, ...rest } = input;
        const result = await createClientCompany({ ...rest, companyId });
        return { id: result.id, success: true };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        companyId: z.number().optional(),
        name: z.string().min(1).max(255).optional(),
        industry: z.string().max(100).optional().nullable(),
        crNumber: z.string().max(100).optional().nullable(),
        billingAddress: z.string().optional().nullable(),
        primaryContactId: z.number().int().positive().optional().nullable(),
        accountManagerId: z.number().int().positive().optional().nullable(),
        status: z.enum(["lead", "active", "inactive", "archived"]).optional(),
        notes: z.string().optional().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        const companyId = await requireCrmMutationAccess(ctx as { user: User }, input.companyId);
        const cc = await getClientCompanyById(input.id);
        if (!cc || cc.companyId !== companyId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Client company not found" });
        }
        const { id, companyId: _c, ...data } = input;
        await updateClientCompany(id, data);
        return { success: true };
      }),
  }),
});
