import { z } from "zod";
import {
  createCrmCommunication,
  createCrmContact,
  createCrmDeal,
  getCrmCommunications,
  getCrmContacts,
  getCrmDeals,
  getUserCompany,
  updateCrmContact,
  updateCrmDeal,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";

export const crmRouter = router({
  // Contacts
  listContacts: protectedProcedure
    .input(z.object({ status: z.string().optional(), search: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) return [];
      return getCrmContacts(membership.company.id, input);
    }),

  createContact: protectedProcedure
    .input(
      z.object({
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
      const membership = await getUserCompany(ctx.user.id);
      const companyId = membership?.company.id ?? 1;
      await createCrmContact({ ...input, companyId, ownerId: ctx.user.id });
      return { success: true };
    }),

  updateContact: protectedProcedure
    .input(
      z.object({
        id: z.number(),
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
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateCrmContact(id, data);
      return { success: true };
    }),

  // Deals
  listDeals: protectedProcedure
    .input(z.object({ stage: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) return [];
      return getCrmDeals(membership.company.id, input);
    }),

  createDeal: protectedProcedure
    .input(
      z.object({
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
      const membership = await getUserCompany(ctx.user.id);
      const companyId = membership?.company.id ?? 1;
      await createCrmDeal({
        ...input,
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
        title: z.string().optional(),
        stage: z.enum(["lead", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"]).optional(),
        value: z.number().optional(),
        probability: z.number().min(0).max(100).optional(),
        notes: z.string().optional(),
        expectedCloseDate: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const updateData: any = { ...data };
      if (data.value !== undefined) updateData.value = String(data.value);
      if (data.expectedCloseDate) updateData.expectedCloseDate = new Date(data.expectedCloseDate);
      if (data.stage === "closed_won" || data.stage === "closed_lost") updateData.closedAt = new Date();
      await updateCrmDeal(id, updateData);
      return { success: true };
    }),

  // Communications
  listCommunications: protectedProcedure
    .input(z.object({ contactId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) return [];
      return getCrmCommunications(membership.company.id, input.contactId);
    }),

  createCommunication: protectedProcedure
    .input(
      z.object({
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
      const membership = await getUserCompany(ctx.user.id);
      const companyId = membership?.company.id ?? 1;
      await createCrmCommunication({
        ...input,
        companyId,
        userId: ctx.user.id,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
      });
      return { success: true };
    }),

  pipelineStats: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return null;
    const deals = await getCrmDeals(membership.company.id);
    const stages = ["lead", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"] as const;
    return stages.map((stage) => {
      const stageDeals = deals.filter((d) => d.stage === stage);
      const totalValue = stageDeals.reduce((sum, d) => sum + Number(d.value ?? 0), 0);
      return { stage, count: stageDeals.length, totalValue };
    });
  }),
});
