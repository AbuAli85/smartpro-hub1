import { TRPCError } from "@trpc/server";
import { getActiveCompanyMembership, requireNotAuditor } from "../_core/membership";
import { nanoid } from "nanoid";
import { z } from "zod";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import {
  createProService,
  getAllProServices,
  getExpiringDocuments,
  getProServiceById,
  getProServices,
  getUserCompany,
  updateProService,
} from "../db";
import { assertRowBelongsToActiveCompany, requireActiveCompanyId } from "../_core/tenant";
import { protectedProcedure, router } from "../_core/trpc";

const SERVICE_TYPE_ENUM = z.enum([
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
]);

export const proRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.string().optional(), serviceType: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      if (canAccessGlobalAdminProcedures(ctx.user)) return getAllProServices({ status: input.status });
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) return [];
      return getProServices(membership.company.id, input);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const row = await getProServiceById(input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "PRO service not found" });
      await assertRowBelongsToActiveCompany(ctx.user, row.companyId, "PRO service");
      return row;
    }),

  getStats: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    const all =
      canAccessGlobalAdminProcedures(ctx.user)
        ? await getAllProServices({})
        : membership
          ? await getProServices(membership.company.id, {})
          : [];
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      total: all.length,
      pending: all.filter((s) => s.status === "pending").length,
      inProgress: all.filter((s) =>
        ["assigned", "in_progress", "awaiting_documents"].includes(s.status ?? "")
      ).length,
      submittedToAuthority: all.filter((s) => s.status === "submitted_to_authority").length,
      completedThisMonth: all.filter(
        (s) => s.status === "completed" && s.completedAt && s.completedAt >= thisMonthStart
      ).length,
      rejected: all.filter((s) => s.status === "rejected").length,
      urgent: all.filter(
        (s) =>
          s.priority === "urgent" &&
          !["completed", "cancelled", "rejected"].includes(s.status ?? "")
      ).length,
      totalFeesCollected: all
        .filter((s) => s.status === "completed")
        .reduce((sum, s) => sum + parseFloat(s.fees ?? "0"), 0),
      feesPending: all
        .filter((s) => !["completed", "cancelled"].includes(s.status ?? ""))
        .reduce((sum, s) => sum + parseFloat(s.fees ?? "0"), 0),
    };
  }),

  expiringDocuments: protectedProcedure
    .input(z.object({ daysAhead: z.number().default(30) }))
    .query(async ({ input, ctx }) => {
      const rows = await getExpiringDocuments(input.daysAhead);
      if (canAccessGlobalAdminProcedures(ctx.user)) return rows;
      const companyId = await requireActiveCompanyId(ctx.user.id);
      return rows.filter((r) => r.companyId === companyId);
    }),

  create: protectedProcedure
    .input(
      z.object({
        serviceType: SERVICE_TYPE_ENUM,
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
      const membership = await getActiveCompanyMembership(ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "No company membership" });
      requireNotAuditor(membership.role, "External Auditors cannot create PRO service cases.");
      const companyId = membership.companyId;
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
        fees: z.number().optional(),
        permitNumber: z.string().optional(),
        visaNumber: z.string().optional(),
        dueDate: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const _m = await getActiveCompanyMembership(ctx.user.id);
      if (_m) requireNotAuditor(_m.role, "External Auditors cannot update PRO service cases.");
      const { id, ...data } = input;
      const existing = await getProServiceById(id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "PRO service not found" });
      await assertRowBelongsToActiveCompany(ctx.user, existing.companyId, "PRO service");
      const updateData: any = { ...data };
      if (data.status === "completed") updateData.completedAt = new Date();
      if (data.expiryDate) updateData.expiryDate = new Date(data.expiryDate);
      if (data.dueDate) updateData.dueDate = new Date(data.dueDate);
      if (data.fees !== undefined) updateData.fees = String(data.fees);
      await updateProService(id, updateData);
      return { success: true };
    }),
});
