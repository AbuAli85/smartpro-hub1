/**
 * Client Portal Router
 * Dedicated self-service portal for company clients.
 * All procedures are scoped to the authenticated user's company.
 */
import { z } from "zod";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import {
  companies, companyMembers, contracts, proServices,
  marketplaceBookings, marketplaceProviders, governmentServiceCases,
  caseTasks, workPermits, employees, employeeGovernmentProfiles,
  proBillingCycles, companySubscriptions, subscriptionPlans,
  sanadApplications, sanadOffices,
} from "../../drizzle/schema";
import { eq, and, desc, asc, lte, gte, or, isNotNull } from "drizzle-orm";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getClientCompanyId(user: { id: number; role: string; platformRole?: string | null }): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  // Platform admins can see all — return null to indicate "all companies"
  if (canAccessGlobalAdminProcedures(user)) return null;
  const [member] = await db
    .select({ companyId: companyMembers.companyId })
    .from(companyMembers)
    .where(eq(companyMembers.userId, user.id))
    .limit(1);
  return member?.companyId ?? null;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const clientPortalRouter = router({

  /**
   * Dashboard KPI summary for the client's company
   */
  getDashboard: protectedProcedure.query(async ({ ctx }) => {
    const companyId = await getClientCompanyId(ctx.user);
    if (!companyId) throw new TRPCError({ code: "FORBIDDEN", message: "No company associated with your account" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 86400000);

    // Active contracts
    const allContracts = await db.select({ id: contracts.id, status: contracts.status, value: contracts.value, endDate: contracts.endDate })
      .from(contracts).where(eq(contracts.companyId, companyId));
    const activeContracts = allContracts.filter(c => ["active", "signed", "pending_signature"].includes(c.status ?? ""));
    const expiringContracts = allContracts.filter(c =>
      c.endDate && new Date(c.endDate) <= thirtyDaysFromNow && new Date(c.endDate) >= now
    );

    // Open government cases
    const openCases = await db.select({ id: governmentServiceCases.id })
      .from(governmentServiceCases)
      .where(and(
        eq(governmentServiceCases.companyId, companyId),
        or(
          eq(governmentServiceCases.caseStatus, "draft"),
          eq(governmentServiceCases.caseStatus, "awaiting_documents"),
          eq(governmentServiceCases.caseStatus, "ready_for_submission"),
          eq(governmentServiceCases.caseStatus, "submitted"),
          eq(governmentServiceCases.caseStatus, "in_review"),
          eq(governmentServiceCases.caseStatus, "action_required"),
        )
      ));

    // Pending invoices
    const pendingInvoices = await db.select({ id: proBillingCycles.id, amountOmr: proBillingCycles.amountOmr })
      .from(proBillingCycles)
      .where(and(eq(proBillingCycles.companyId, companyId), eq(proBillingCycles.status, "pending")));
    const totalPendingOMR = pendingInvoices.reduce((sum, i) => sum + Number(i.amountOmr ?? 0), 0);

    // Expiring work permits (≤30 days)
    const expiringPermits = await db.select({ id: workPermits.id })
      .from(workPermits)
      .where(and(
        eq(workPermits.companyId, companyId),
        eq(workPermits.permitStatus, "active"),
        lte(workPermits.expiryDate, thirtyDaysFromNow),
        gte(workPermits.expiryDate, now),
      ));

    // Active PRO services
    const activeProServices = await db.select({ id: proServices.id })
      .from(proServices)
      .where(and(
        eq(proServices.companyId, companyId),
        or(eq(proServices.status, "assigned"), eq(proServices.status, "in_progress"), eq(proServices.status, "awaiting_documents"), eq(proServices.status, "submitted_to_authority"))
      ));

    // Company info
    const [company] = await db.select({ name: companies.name, nameAr: companies.nameAr, registrationNumber: companies.registrationNumber })
      .from(companies).where(eq(companies.id, companyId)).limit(1);

    return {
      company,
      kpis: {
        activeContracts: activeContracts.length,
        expiringContracts: expiringContracts.length,
        openCases: openCases.length,
        pendingInvoices: pendingInvoices.length,
        totalPendingOMR: Number(totalPendingOMR.toFixed(3)),
        expiringPermits: expiringPermits.length,
        activeProServices: activeProServices.length,
      },
    };
  }),

  /**
   * List company contracts with full status info
   */
  listContracts: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(20),
    }))
    .query(async ({ ctx, input }) => {
      const companyId = await getClientCompanyId(ctx.user);
      if (!companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const rows = await db.select()
        .from(contracts)
        .where(and(
          eq(contracts.companyId, companyId),
          input.status ? eq(contracts.status, input.status as "draft" | "pending_review" | "pending_signature" | "signed" | "active" | "expired" | "terminated" | "cancelled") : undefined,
        ))
        .orderBy(desc(contracts.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      return {
        items: rows.map(c => ({
          ...c,
          daysToExpiry: c.endDate ? Math.ceil((new Date(c.endDate).getTime() - Date.now()) / 86400000) : null,
        })),
        total: rows.length,
      };
    }),

  /**
   * List billing invoices for the company
   */
  listInvoices: protectedProcedure
    .input(z.object({
      status: z.enum(["pending", "paid", "overdue", "cancelled", "waived"]).optional(),
      page: z.number().default(1),
      pageSize: z.number().default(20),
    }))
    .query(async ({ ctx, input }) => {
      const companyId = await getClientCompanyId(ctx.user);
      if (!companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const rows = await db.select()
        .from(proBillingCycles)
        .where(and(
          eq(proBillingCycles.companyId, companyId),
          input.status ? eq(proBillingCycles.status, input.status as "pending" | "paid" | "overdue" | "cancelled" | "waived") : undefined,
        ))
        .orderBy(desc(proBillingCycles.billingYear), desc(proBillingCycles.billingMonth));

      // Auto-mark overdue
      const enriched = rows.map(inv => {
        let effectiveStatus = inv.status;
        if (inv.status === "pending") {
          const dueDate = new Date(inv.billingYear, inv.billingMonth, 15); // 15th of following month
          if (dueDate < new Date()) effectiveStatus = "overdue";
        }
        return {
          ...inv,
          effectiveStatus,
          invoiceLabel: `INV-${inv.billingYear}-${String(inv.billingMonth).padStart(2, "0")}-${String(inv.id).padStart(4, "0")}`,
        };
      });

      return { items: enriched, total: enriched.length };
    }),

  /**
   * List PRO service applications for the company
   */
  listProServices: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(20),
    }))
    .query(async ({ ctx, input }) => {
      const companyId = await getClientCompanyId(ctx.user);
      if (!companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const rows = await db.select()
        .from(proServices)
        .where(and(
          eq(proServices.companyId, companyId),
          input.status ? eq(proServices.status, input.status as "pending" | "assigned" | "in_progress" | "awaiting_documents" | "submitted_to_authority" | "approved" | "rejected" | "completed" | "cancelled") : undefined,
        ))
        .orderBy(desc(proServices.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      return { items: rows, total: rows.length };
    }),

  /**
   * List government cases for the company with task progress
   */
  listGovernmentCases: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(20),
    }))
    .query(async ({ ctx, input }) => {
      const companyId = await getClientCompanyId(ctx.user);
      if (!companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const rows = await db.select()
        .from(governmentServiceCases)
        .where(and(
          eq(governmentServiceCases.companyId, companyId),
          input.status ? eq(governmentServiceCases.caseStatus, input.status as "draft" | "awaiting_documents" | "ready_for_submission" | "submitted" | "in_review" | "action_required" | "approved" | "rejected" | "completed" | "cancelled") : undefined,
        ))
        .orderBy(desc(governmentServiceCases.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      // Enrich with task progress
      const enriched = await Promise.all(rows.map(async (c) => {
        const tasks = await db.select({ taskStatus: caseTasks.taskStatus })
          .from(caseTasks).where(eq(caseTasks.caseId, c.id));
        const total = tasks.length;
        const completed = tasks.filter(t => t.taskStatus === "completed").length;
        return { ...c, taskProgress: { total, completed, pct: total > 0 ? Math.round((completed / total) * 100) : 0 } };
      }));

      return { items: enriched, total: enriched.length };
    }),

  /**
   * List marketplace bookings for the company
   */
  listBookings: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(20),
    }))
    .query(async ({ ctx, input }) => {
      const companyId = await getClientCompanyId(ctx.user);
      if (!companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const rows = await db.select({
        booking: marketplaceBookings,
        providerName: marketplaceProviders.businessName,
        providerCategory: marketplaceProviders.category,
      })
        .from(marketplaceBookings)
        .leftJoin(marketplaceProviders, eq(marketplaceBookings.providerId, marketplaceProviders.id))
        .where(and(
          eq(marketplaceBookings.companyId, companyId),
          input.status ? eq(marketplaceBookings.status, input.status as "pending" | "confirmed" | "in_progress" | "completed" | "cancelled") : undefined,
        ))
        .orderBy(desc(marketplaceBookings.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      return {
        items: rows.map(r => ({ ...r.booking, providerName: r.providerName, providerCategory: r.providerCategory })),
        total: rows.length,
      };
    }),

  /**
   * Get expiry alerts specific to this company
   */
  getExpiryAlerts: protectedProcedure
    .input(z.object({ daysAhead: z.number().default(90) }))
    .query(async ({ ctx, input }) => {
      const companyId = await getClientCompanyId(ctx.user);
      if (!companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return { items: [] };

      const now = new Date();
      const cutoff = new Date(now.getTime() + input.daysAhead * 86400000);

      // Work permits
      const permits = await db.select({
        id: workPermits.id,
        permitNumber: workPermits.workPermitNumber,
        expiryDate: workPermits.expiryDate,
        firstName: employees.firstName,
        lastName: employees.lastName,
      })
        .from(workPermits)
        .leftJoin(employees, eq(workPermits.employeeId, employees.id))
        .where(and(
          eq(workPermits.companyId, companyId),
          eq(workPermits.permitStatus, "active"),
          lte(workPermits.expiryDate, cutoff),
          gte(workPermits.expiryDate, now),
        ));

      // Contracts expiring
      const expiringContracts = await db.select({ id: contracts.id, title: contracts.title, endDate: contracts.endDate })
        .from(contracts)
        .where(and(
          eq(contracts.companyId, companyId),
          eq(contracts.status, "active"),
          lte(contracts.endDate, cutoff),
          gte(contracts.endDate, now),
        ));

      const items = [
        ...permits.map(p => ({
          type: "work_permit" as const,
          id: p.id,
          label: `Work Permit: ${p.firstName ?? ""} ${p.lastName ?? ""}`.trim(),
          reference: p.permitNumber,
          expiryDate: p.expiryDate,
          daysLeft: p.expiryDate ? Math.ceil((new Date(p.expiryDate).getTime() - now.getTime()) / 86400000) : null,
          severity: p.expiryDate
            ? Math.ceil((new Date(p.expiryDate).getTime() - now.getTime()) / 86400000) <= 7 ? "critical"
              : Math.ceil((new Date(p.expiryDate).getTime() - now.getTime()) / 86400000) <= 30 ? "high"
                : Math.ceil((new Date(p.expiryDate).getTime() - now.getTime()) / 86400000) <= 60 ? "medium" : "low"
            : "low",
        })),
        ...expiringContracts.map(c => ({
          type: "contract" as const,
          id: c.id,
          label: `Contract: ${c.title}`,
          reference: `#${c.id}`,
          expiryDate: c.endDate,
          daysLeft: c.endDate ? Math.ceil((new Date(c.endDate).getTime() - now.getTime()) / 86400000) : null,
          severity: c.endDate
            ? Math.ceil((new Date(c.endDate).getTime() - now.getTime()) / 86400000) <= 7 ? "critical"
              : Math.ceil((new Date(c.endDate).getTime() - now.getTime()) / 86400000) <= 30 ? "high"
                : Math.ceil((new Date(c.endDate).getTime() - now.getTime()) / 86400000) <= 60 ? "medium" : "low"
            : "low",
        })),
      ].sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999));

      return { items };
    }),

  /**
   * Send a message to the SmartPRO team
   */
  sendMessage: protectedProcedure
    .input(z.object({
      subject: z.string().min(1).max(200),
      message: z.string().min(1).max(2000),
      category: z.enum(["general", "billing", "contract", "pro_service", "government_case", "technical"]).default("general"),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = await getClientCompanyId(ctx.user);
      if (!companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Store in notifications table as a client message
      const { notifications } = await import("../../drizzle/schema");
      await db.insert(notifications).values({
        userId: ctx.user.id,
        title: `[${input.category.toUpperCase()}] ${input.subject}`,
        message: input.message,
        type: "client_message",
        isRead: false,
      });

      // Notify owner
      try {
        const { notifyOwner } = await import("../_core/notification");
        await notifyOwner({
          title: `New Client Message: ${input.subject}`,
          content: `From: ${ctx.user.name} (Company ID: ${companyId})\nCategory: ${input.category}\n\n${input.message}`,
        });
      } catch (_) { /* non-critical */ }

      return { success: true, messageId: Date.now() };
    }),

  /**
   * List messages sent by this company
   */
  listMessages: protectedProcedure
    .input(z.object({ page: z.number().default(1), pageSize: z.number().default(20) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { items: [] };
      const { notifications } = await import("../../drizzle/schema");

      const rows = await db.select()
        .from(notifications)
        .where(and(eq(notifications.userId, ctx.user.id), eq(notifications.type, "client_message")))
        .orderBy(desc(notifications.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      return { items: rows };
    }),

  /**
   * Mark a message as read
   */
  markMessageRead: protectedProcedure
    .input(z.object({ messageId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { notifications } = await import("../../drizzle/schema");
      await db.update(notifications)
        .set({ isRead: true })
        .where(and(eq(notifications.id, input.messageId), eq(notifications.userId, ctx.user.id)));
      return { success: true };
    }),

  /**
   * Submit a new service request from the client portal
   */
  submitServiceRequest: protectedProcedure
    .input(z.object({
      serviceType: z.string().min(1),
      description: z.string().min(1),
      contactName: z.string().min(1),
      contactPhone: z.string().min(1),
      contactEmail: z.string().email().optional(),
      urgency: z.enum(["normal", "urgent", "critical"]).default("normal"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const companyId = await getClientCompanyId(ctx.user);
      let companyName = "Unknown Company";
      let companyCr: string | undefined;
      if (companyId) {
        const [co] = await db.select({ name: companies.name, regNumber: companies.registrationNumber })
          .from(companies).where(eq(companies.id, companyId)).limit(1);
        if (co) { companyName = co.name; companyCr = co.regNumber ?? undefined; }
      }
      const [office] = await db.select({ id: sanadOffices.id }).from(sanadOffices).limit(1);
      if (!office) throw new TRPCError({ code: "NOT_FOUND", message: "No Sanad office configured" });
      const { sanadServiceRequests } = await import("../../drizzle/schema");
      const [result] = await db.insert(sanadServiceRequests).values({
        officeId: office.id,
        requesterCompanyId: companyId ?? undefined,
        requesterUserId: ctx.user.id,
        serviceType: input.serviceType,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail,
        companyName,
        companyCr,
        message: `[${input.urgency.toUpperCase()}] ${input.description}`,
        status: "new",
      });
      const refNumber = `SR-${new Date().getFullYear()}-${String((result as any).insertId).padStart(5, "0")}`;
      return { success: true, referenceNumber: refNumber, requestId: (result as any).insertId };
    }),

  /**
   * List all documents available to this company
   */
  listMyDocuments: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const companyId = await getClientCompanyId(ctx.user);
    if (!companyId) return [];
    const contractDocs = await db.select({
      id: contracts.id,
      type: contracts.type,
      title: contracts.title,
      status: contracts.status,
      url: contracts.pdfUrl,
      createdAt: contracts.createdAt,
    }).from(contracts).where(eq(contracts.companyId, companyId)).limit(50);
    const { employeeDocuments } = await import("../../drizzle/schema");
    const empDocs = await db.select({
      id: employeeDocuments.id,
      type: employeeDocuments.documentType,
      title: employeeDocuments.documentType,
      status: employeeDocuments.verificationStatus,
      url: employeeDocuments.fileUrl,
      createdAt: employeeDocuments.createdAt,
    }).from(employeeDocuments)
      .innerJoin(employees, eq(employeeDocuments.employeeId, employees.id))
      .where(eq(employees.companyId, companyId)).limit(100);
    return [
      ...contractDocs.map((d) => ({ ...d, category: "Contract" as const })),
      ...empDocs.map((d) => ({ ...d, category: "Employee Document" as const })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }),

  /**
   * Get upcoming renewals for this company in the next 90 days
   */
  getUpcomingRenewals: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const companyId = await getClientCompanyId(ctx.user);
    if (!companyId) return [];
    const now = new Date();
    const in90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const permits = await db.select({
      id: workPermits.id,
      type: workPermits.provider,
      reference: workPermits.workPermitNumber,
      expiryDate: workPermits.expiryDate,
      status: workPermits.permitStatus,
    }).from(workPermits)
      .innerJoin(employees, eq(workPermits.employeeId, employees.id))
      .where(and(
        eq(employees.companyId, companyId),
        lte(workPermits.expiryDate, in90),
        gte(workPermits.expiryDate, now),
      )).limit(50);
    return permits.map((p) => ({
      id: p.id,
      category: "Work Permit" as const,
      type: p.type ?? "Work Permit",
      reference: p.reference ?? `WP-${p.id}`,
      expiryDate: p.expiryDate,
      daysRemaining: p.expiryDate
        ? Math.ceil((new Date(p.expiryDate).getTime() - now.getTime()) / 86400000)
        : null,
      status: p.status,
    }));
  }),
});
