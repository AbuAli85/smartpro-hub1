import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  createContract,
  getAllContracts,
  getContractById,
  getContractTemplates,
  getContracts,
  getUserCompany,
  updateContract,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";

export const contractsRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.string().optional(), type: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role === "admin") return getAllContracts({ status: input.status });
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) return [];
      return getContracts(membership.company.id, input);
    }),

  getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const contract = await getContractById(input.id);
    if (!contract) throw new TRPCError({ code: "NOT_FOUND" });
    return contract;
  }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(2),
        titleAr: z.string().optional(),
        type: z.enum(["employment", "service", "nda", "partnership", "vendor", "lease", "other"]),
        partyAName: z.string().optional(),
        partyBName: z.string().optional(),
        value: z.number().optional(),
        currency: z.string().default("OMR"),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        content: z.string().optional(),
        templateId: z.number().optional(),
        notes: z.string().optional(),
        tags: z.array(z.string()).default([]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const membership = await getUserCompany(ctx.user.id);
      const companyId = membership?.company.id ?? 1;
      const contractNumber = "CON-" + Date.now() + "-" + nanoid(4).toUpperCase();
      await createContract({
        ...input,
        companyId,
        createdBy: ctx.user.id,
        contractNumber,
        value: input.value ? String(input.value) : undefined,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
      });
      return { success: true, contractNumber };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().optional(),
        status: z
          .enum(["draft", "pending_review", "pending_signature", "signed", "active", "expired", "terminated", "cancelled"])
          .optional(),
        content: z.string().optional(),
        partyAName: z.string().optional(),
        partyBName: z.string().optional(),
        value: z.number().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        notes: z.string().optional(),
        tags: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const updateData: any = { ...data };
      if (data.value !== undefined) updateData.value = String(data.value);
      if (data.startDate) updateData.startDate = new Date(data.startDate);
      if (data.endDate) updateData.endDate = new Date(data.endDate);
      if (data.status === "signed") updateData.signedAt = new Date();
      await updateContract(id, updateData);
      return { success: true };
    }),

  templates: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    return getContractTemplates(membership?.company.id);
  }),
});
