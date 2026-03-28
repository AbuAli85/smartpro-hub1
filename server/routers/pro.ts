import { nanoid } from "nanoid";
import { z } from "zod";
import {
  createProService,
  getAllProServices,
  getExpiringDocuments,
  getProServices,
  getUserCompany,
  updateProService,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";

export const proRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.string().optional(), serviceType: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role === "admin") return getAllProServices({ status: input.status });
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) return [];
      return getProServices(membership.company.id, input);
    }),

  expiringDocuments: protectedProcedure
    .input(z.object({ daysAhead: z.number().default(30) }))
    .query(async ({ input }) => {
      return getExpiringDocuments(input.daysAhead);
    }),

  create: protectedProcedure
    .input(
      z.object({
        serviceType: z.enum([
          "visa_processing",
          "work_permit",
          "labor_card",
          "emirates_id",
          "oman_id",
          "residence_renewal",
          "visa_renewal",
          "permit_renewal",
          "document_attestation",
          "company_registration",
          "other",
        ]),
        employeeName: z.string().min(2),
        employeeNameAr: z.string().optional(),
        nationality: z.string().optional(),
        passportNumber: z.string().optional(),
        passportExpiry: z.string().optional(),
        visaNumber: z.string().optional(),
        permitNumber: z.string().optional(),
        expiryDate: z.string().optional(),
        renewalAlertDays: z.number().default(30),
        priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
        notes: z.string().optional(),
        fees: z.number().optional(),
        dueDate: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const membership = await getUserCompany(ctx.user.id);
      const companyId = membership?.company.id ?? 1;
      const serviceNumber = "PRO-" + Date.now() + "-" + nanoid(4).toUpperCase();
      await createProService({
        ...input,
        companyId,
        requestedBy: ctx.user.id,
        serviceNumber,
        fees: input.fees ? String(input.fees) : undefined,
        passportExpiry: input.passportExpiry ? new Date(input.passportExpiry) : undefined,
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      });
      return { success: true, serviceNumber };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        status: z
          .enum([
            "pending",
            "assigned",
            "in_progress",
            "awaiting_documents",
            "submitted_to_authority",
            "approved",
            "rejected",
            "completed",
            "cancelled",
          ])
          .optional(),
        assignedProId: z.number().optional(),
        notes: z.string().optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
        expiryDate: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const updateData: any = { ...data };
      if (data.status === "completed") updateData.completedAt = new Date();
      if (data.expiryDate) updateData.expiryDate = new Date(data.expiryDate);
      await updateProService(id, updateData);
      return { success: true };
    }),
});
