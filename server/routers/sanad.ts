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

export const PROVIDER_TYPES = [
  "pro_office",
  "typing_centre",
  "admin_bureau",
  "legal_services",
  "attestation",
  "visa_services",
  "business_setup",
  "other",
] as const;

export const SERVICE_TYPES = [
  "work_permit",
  "work_permit_renewal",
  "work_permit_cancellation",
  "labor_card",
  "labor_card_renewal",
  "residence_visa",
  "residence_visa_renewal",
  "visit_visa",
  "exit_reentry",
  "commercial_registration",
  "commercial_registration_renewal",
  "business_license",
  "document_typing",
  "document_translation",
  "document_attestation",
  "pasi_registration",
  "omanisation_report",
  "other",
] as const;

export const WORK_ORDER_STATUSES = [
  "draft",
  "submitted",
  "in_progress",
  "awaiting_documents",
  "awaiting_payment",
  "completed",
  "rejected",
  "cancelled",
] as const;

export const sanadRouter = router({
  // ─── Service Providers (Sanad Offices) ────────────────────────────────────

  /** List all service providers — filterable by type/search */
  listProviders: protectedProcedure
    .input(
      z.object({
        providerType: z.enum(PROVIDER_TYPES).optional(),
        search: z.string().optional(),
        status: z.enum(["active", "inactive", "pending_approval", "suspended"]).optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const offices = ctx.user.role === "admin"
        ? await getAllSanadOffices()
        : await getSanadOffices(0);
      let results = offices as any[];
      if (input?.providerType) results = results.filter((o: any) => o.providerType === input.providerType);
      if (input?.status) results = results.filter((o: any) => o.status === input.status);
      if (input?.search) {
        const q = input.search.toLowerCase();
        results = results.filter(
          (o: any) =>
            (o.name ?? "").toLowerCase().includes(q) ||
            (o.nameAr ?? "").toLowerCase().includes(q) ||
            (o.city ?? "").toLowerCase().includes(q) ||
            (o.description ?? "").toLowerCase().includes(q)
        );
      }
      return results;
    }),

  /** Get a single provider by id */
  getProvider: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const offices = await getAllSanadOffices();
      const office = (offices as any[]).find((o: any) => o.id === input.id);
      if (!office) throw new TRPCError({ code: "NOT_FOUND", message: "Service provider not found" });
      return office;
    }),

  /** Create a new service provider (admin only) */
  createProvider: protectedProcedure
    .input(
      z.object({
        providerType: z.enum(PROVIDER_TYPES).default("pro_office"),
        name: z.string().min(2),
        nameAr: z.string().optional(),
        description: z.string().optional(),
        licenseNumber: z.string().optional(),
        location: z.string().optional(),
        city: z.string().optional(),
        governorate: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        website: z.string().optional(),
        contactPerson: z.string().optional(),
        openingHours: z.string().optional(),
        services: z.array(z.string()).default([]),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can register service providers" });
      await createSanadOffice({ ...input } as any);
      return { success: true };
    }),

  /** Update a service provider */
  updateProvider: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        providerType: z.enum(PROVIDER_TYPES).optional(),
        name: z.string().optional(),
        nameAr: z.string().optional(),
        description: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        website: z.string().optional(),
        contactPerson: z.string().optional(),
        location: z.string().optional(),
        city: z.string().optional(),
        governorate: z.string().optional(),
        openingHours: z.string().optional(),
        services: z.array(z.string()).optional(),
        status: z.enum(["active", "inactive", "pending_approval", "suspended"]).optional(),
        isVerified: z.boolean().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const { id, ...data } = input;
      await updateSanadOffice(id, data as any);
      return { success: true };
    }),

  // ─── Work Orders (Service Requests) ──────────────────────────────────────

  /** List work orders for the current company */
  listWorkOrders: protectedProcedure
    .input(
      z.object({
        status: z.string().optional(),
        serviceType: z.string().optional(),
        providerId: z.number().optional(),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      if (ctx.user.role === "admin") {
        return getAllSanadApplications({ status: input?.status });
      }
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) return [];
      return getSanadApplications(membership.company.id, {
        status: input?.status,
        type: input?.serviceType,
      });
    }),

  /** Create a new work order / service request */
  createWorkOrder: protectedProcedure
    .input(
      z.object({
        serviceType: z.enum(SERVICE_TYPES),
        title: z.string().optional(),
        providerId: z.number().optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
        beneficiaryName: z.string().optional(),
        beneficiaryNameAr: z.string().optional(),
        nationality: z.string().optional(),
        passportNumber: z.string().optional(),
        employeeId: z.number().optional(),
        notes: z.string().optional(),
        fees: z.number().optional(),
        dueDate: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const membership = await getUserCompany(ctx.user.id);
      const companyId = membership?.company.id ?? 1;
      const referenceNumber = "SAN-" + Date.now() + "-" + nanoid(4).toUpperCase();
      const title = input.title || input.serviceType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      await createSanadApplication({
        ...input,
        title,
        companyId,
        requestedById: ctx.user.id,
        referenceNumber,
        fees: input.fees ? String(input.fees) : undefined,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      } as any);
      return { success: true, referenceNumber };
    }),

  /** Update a work order status / notes */
  updateWorkOrder: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(WORK_ORDER_STATUSES).optional(),
        assignedToId: z.number().optional(),
        notes: z.string().optional(),
        providerNotes: z.string().optional(),
        rejectionReason: z.string().optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
        fees: z.number().optional(),
        dueDate: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const updateData: any = { ...data };
      if (data.fees !== undefined) updateData.fees = String(data.fees);
      if (data.dueDate) updateData.dueDate = new Date(data.dueDate);
      if (data.status === "submitted") updateData.submittedAt = new Date();
      if (data.status === "completed") updateData.completedAt = new Date();
      await updateSanadApplication(id, updateData);
      return { success: true };
    }),

  /** Rate a completed work order */
  rateWorkOrder: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        rating: z.number().min(1).max(5),
        ratingComment: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      await updateSanadApplication(input.id, {
        rating: input.rating,
        ratingComment: input.ratingComment,
      } as any);
      return { success: true };
    }),

  // ─── Legacy aliases (backward compat) ────────────────────────────────────
  listOffices: protectedProcedure.query(async ({ ctx }) => {
    return ctx.user.role === "admin" ? getAllSanadOffices() : getSanadOffices(0);
  }),
  listApplications: protectedProcedure
    .input(z.object({ status: z.string().optional(), type: z.string().optional() }).optional())
    .query(async ({ input, ctx }) => {
      if (ctx.user.role === "admin") return getAllSanadApplications({ status: input?.status });
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) return [];
      return getSanadApplications(membership.company.id, input ?? {});
    }),
});
