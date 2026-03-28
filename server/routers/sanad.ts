import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  createSanadApplication,
  createSanadOffice,
  getAllSanadApplications,
  getAllSanadOffices,
  getSanadApplications,
  getSanadOffices,
  getUserCompany,
  updateSanadApplication,
  updateSanadOffice,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";

export const sanadRouter = router({
  // Offices
  listOffices: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role === "admin") return getAllSanadOffices();
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return [];
    return getSanadOffices(membership.company.id);
  }),

  createOffice: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2),
        nameAr: z.string().optional(),
        licenseNumber: z.string().optional(),
        location: z.string().optional(),
        city: z.string().optional(),
        governorate: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        services: z.array(z.string()).default([]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const membership = await getUserCompany(ctx.user.id);
      if (!membership && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const companyId = membership?.company.id ?? 1;
      await createSanadOffice({ ...input, companyId, managerId: ctx.user.id });
      return { success: true };
    }),

  updateOffice: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        status: z.enum(["active", "inactive", "pending_approval", "suspended"]).optional(),
        location: z.string().optional(),
        city: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateSanadOffice(id, data);
      return { success: true };
    }),

  // Applications
  listApplications: protectedProcedure
    .input(
      z.object({
        status: z.string().optional(),
        type: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      if (ctx.user.role === "admin") return getAllSanadApplications({ status: input.status });
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) return [];
      return getSanadApplications(membership.company.id, input);
    }),

  createApplication: protectedProcedure
    .input(
      z.object({
        type: z.enum(["visa", "labor_card", "commercial_registration", "work_permit", "residence_permit", "business_license", "other"]),
        applicantName: z.string().min(2),
        applicantNameAr: z.string().optional(),
        nationality: z.string().optional(),
        passportNumber: z.string().optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
        notes: z.string().optional(),
        fees: z.number().optional(),
        dueDate: z.string().optional(),
        officeId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const membership = await getUserCompany(ctx.user.id);
      const companyId = membership?.company.id ?? 1;
      const applicationNumber = "SAN-" + Date.now() + "-" + nanoid(4).toUpperCase();
      await createSanadApplication({
        ...input,
        companyId,
        applicantId: ctx.user.id,
        applicationNumber,
        fees: input.fees ? String(input.fees) : undefined,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      });
      return { success: true, applicationNumber };
    }),

  updateApplication: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        status: z
          .enum(["draft", "submitted", "under_review", "awaiting_documents", "processing", "approved", "rejected", "completed", "cancelled"])
          .optional(),
        assignedToId: z.number().optional(),
        notes: z.string().optional(),
        rejectionReason: z.string().optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const updateData: any = { ...data };
      if (data.status === "submitted") updateData.submittedAt = new Date();
      if (data.status === "completed") updateData.completedAt = new Date();
      await updateSanadApplication(id, updateData);
      return { success: true };
    }),
});
