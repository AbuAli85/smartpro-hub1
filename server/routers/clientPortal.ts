/**
 * Client Portal Router
 * Dedicated self-service portal for company clients.
 * All procedures are scoped to the authenticated user's company.
 */
import { z } from "zod";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { router, protectedProcedure } from "../_core/trpc";
import { createNotification, getDb } from "../db";
import { TRPCError } from "@trpc/server";
import {
  companies, contracts, proServices,
  marketplaceBookings, marketplaceProviders, governmentServiceCases,
  caseTasks, workPermits, employees, employeeGovernmentProfiles,
  proBillingCycles, companySubscriptions, subscriptionPlans,
  sanadApplications, sanadOffices,
  attendanceSites, attendanceRecords, promoterAssignments,
} from "../../drizzle/schema";
import { eq, and, desc, asc, lte, gte, or, isNotNull, inArray } from "drizzle-orm";
import { requireActiveCompanyId } from "../_core/tenant";
import { optionalActiveWorkspace } from "../_core/workspaceInput";
import type { User } from "../../drizzle/schema";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Client portal is company-only; platform staff must use admin routers. */
async function requirePortalCompanyId(user: User, companyId?: number | null): Promise<number> {
  if (canAccessGlobalAdminProcedures(user)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Client portal is for company accounts" });
  }
  return requireActiveCompanyId(user.id, companyId, user);
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const clientPortalRouter = router({

  /**
   * Dashboard KPI summary for the client's company
   */
  getDashboard: protectedProcedure
    .input(optionalActiveWorkspace.optional())
    .query(async ({ ctx, input }) => {
    const companyId = await requirePortalCompanyId(ctx.user as User, input?.companyId);
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
    }).merge(optionalActiveWorkspace))
    .query(async ({ ctx, input }) => {
      const companyId = await requirePortalCompanyId(ctx.user as User, input?.companyId);
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
    }).merge(optionalActiveWorkspace))
    .query(async ({ ctx, input }) => {
      const companyId = await requirePortalCompanyId(ctx.user as User, input?.companyId);
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
   * Promoter staffing invoice summary for the portal user's own company.
   *
   * Finds attendance sites linked to this company via promoter_assignments
   * (secondPartyCompanyId = portalCompanyId), then groups closed punches
   * at those sites into a per-promoter, per-site monthly summary.
   *
   * Returns the same shape as hr.getClientInvoiceSummary but scoped to
   * the calling client company, not the staffing company.
   */
  getMyStaffingInvoice: protectedProcedure
    .input(
      z.object({
        month: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM
      }).merge(optionalActiveWorkspace),
    )
    .query(async ({ ctx, input }) => {
      const portalCompanyId = await requirePortalCompanyId(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [yStr, mStr] = input.month.split("-");
      const year = Number(yStr);
      const month = Number(mStr);
      const mm = String(month).padStart(2, "0");
      const startDate = `${year}-${mm}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;
      const monthStart = new Date(`${startDate}T00:00:00.000Z`);
      const monthEnd = new Date(`${endDate}T23:59:59.999Z`);

      // 1. Find which attendance sites belong to this client company via promoter assignments
      const assignments = await db
        .select({ clientSiteId: promoterAssignments.clientSiteId })
        .from(promoterAssignments)
        .where(
          and(
            eq(promoterAssignments.secondPartyCompanyId, portalCompanyId),
            isNotNull(promoterAssignments.clientSiteId),
            eq(promoterAssignments.status, "active"),
          ),
        );

      const clientSiteIds = [
        ...new Set(
          assignments.map((a) => a.clientSiteId).filter((id): id is number => id != null),
        ),
      ];

      if (clientSiteIds.length === 0) {
        return { month: input.month, groups: [], grandTotalOmr: 0, hasNoSites: true };
      }

      // 2. Load site details (name, clientName, dailyRateOmr)
      const sites = await db
        .select({
          id: attendanceSites.id,
          name: attendanceSites.name,
          clientName: attendanceSites.clientName,
          dailyRateOmr: attendanceSites.dailyRateOmr,
        })
        .from(attendanceSites)
        .where(inArray(attendanceSites.id, clientSiteIds));
      const siteById = new Map(sites.map((s) => [s.id, s]));

      // 3. Load closed punches at client sites for the month
      // Note: attendanceRecords.companyId is the STAFFING company, not the client.
      // We filter by siteId instead — the punch happened at the client's site.
      const records = await db
        .select({
          id: attendanceRecords.id,
          employeeId: attendanceRecords.employeeId,
          checkIn: attendanceRecords.checkIn,
          checkOut: attendanceRecords.checkOut,
          siteId: attendanceRecords.siteId,
          companyId: attendanceRecords.companyId,
        })
        .from(attendanceRecords)
        .where(
          and(
            inArray(attendanceRecords.siteId, clientSiteIds),
            gte(attendanceRecords.checkIn, monthStart),
            lte(attendanceRecords.checkIn, monthEnd),
            isNotNull(attendanceRecords.checkOut),
          ),
        );

      if (records.length === 0) {
        return { month: input.month, groups: [], grandTotalOmr: 0, hasNoSites: false };
      }

      // 4. Load employee names (from the staffing company's employee records)
      const empIds = [...new Set(records.map((r) => r.employeeId))];
      const empRows = empIds.length
        ? await db
            .select({
              id: employees.id,
              firstName: employees.firstName,
              lastName: employees.lastName,
            })
            .from(employees)
            .where(inArray(employees.id, empIds))
        : [];
      const empById = new Map(empRows.map((e) => [e.id, e]));

      // 5. Group: site → employee → distinct Muscat calendar dates
      const { muscatCalendarYmdFromUtcInstant } = await import("@shared/attendanceMuscatTime");

      type EmpEntry = {
        employeeId: number;
        employeeName: string;
        dates: Set<string>;
        totalWorkedMinutes: number;
      };
      type SiteGroup = {
        siteId: number;
        siteName: string;
        clientName: string | null;
        dailyRateOmr: number;
        employees: Map<number, EmpEntry>;
      };

      const groupBySite = new Map<number, SiteGroup>();

      for (const rec of records) {
        if (rec.siteId == null) continue;
        const site = siteById.get(rec.siteId);
        if (!site) continue;

        const dateYmd = muscatCalendarYmdFromUtcInstant(new Date(rec.checkIn));

        if (!groupBySite.has(rec.siteId)) {
          groupBySite.set(rec.siteId, {
            siteId: rec.siteId,
            siteName: site.name,
            clientName: site.clientName ?? null,
            dailyRateOmr: Number(site.dailyRateOmr ?? 0),
            employees: new Map(),
          });
        }
        const sg = groupBySite.get(rec.siteId)!;

        if (!sg.employees.has(rec.employeeId)) {
          const emp = empById.get(rec.employeeId);
          sg.employees.set(rec.employeeId, {
            employeeId: rec.employeeId,
            employeeName: emp
              ? `${emp.firstName} ${emp.lastName}`.trim()
              : `Promoter #${rec.employeeId}`,
            dates: new Set(),
            totalWorkedMinutes: 0,
          });
        }
        const entry = sg.employees.get(rec.employeeId)!;
        entry.dates.add(dateYmd);
        if (rec.checkOut) {
          entry.totalWorkedMinutes += Math.max(
            0,
            Math.round(
              (new Date(rec.checkOut).getTime() - new Date(rec.checkIn).getTime()) / 60000,
            ),
          );
        }
      }

      // 6. Build output
      const groups = Array.from(groupBySite.values())
        .map((sg) => {
          const promoters = Array.from(sg.employees.values())
            .map((e) => ({
              employeeId: e.employeeId,
              employeeName: e.employeeName,
              billableDays: e.dates.size,
              billableHours: Math.round((e.totalWorkedMinutes / 60) * 10) / 10,
              amountOmr: Math.round(e.dates.size * sg.dailyRateOmr * 1000) / 1000,
            }))
            .filter((p) => p.billableDays > 0)
            .sort((a, b) => a.employeeName.localeCompare(b.employeeName));

          if (promoters.length === 0) return null;

          const totalBillableDays = promoters.reduce((s, p) => s + p.billableDays, 0);
          const totalBillableHours =
            Math.round(promoters.reduce((s, p) => s + p.billableHours, 0) * 10) / 10;
          const totalAmountOmr = Math.round(totalBillableDays * sg.dailyRateOmr * 1000) / 1000;

          return {
            siteId: sg.siteId,
            siteName: sg.siteName,
            clientName: sg.clientName,
            dailyRateOmr: sg.dailyRateOmr,
            totalBillableDays,
            totalBillableHours,
            totalAmountOmr,
            promoters,
          };
        })
        .filter((g): g is NonNullable<typeof g> => g !== null)
        .sort((a, b) => (a.siteName ?? "").localeCompare(b.siteName ?? ""));

      const grandTotalOmr = Math.round(groups.reduce((s, g) => s + g.totalAmountOmr, 0) * 1000) / 1000;

      return { month: input.month, groups, grandTotalOmr, hasNoSites: false };
    }),

  /**
   * List PRO service applications for the company
   */
  listProServices: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(20),
    }).merge(optionalActiveWorkspace))
    .query(async ({ ctx, input }) => {
      const companyId = await requirePortalCompanyId(ctx.user as User, input?.companyId);
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
    }).merge(optionalActiveWorkspace))
    .query(async ({ ctx, input }) => {
      const companyId = await requirePortalCompanyId(ctx.user as User, input?.companyId);
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

      // Batch-load all case tasks in a single query instead of one query per case row.
      const caseIds = rows.map((c) => c.id);
      const allTasks = caseIds.length > 0
        ? await db
            .select({ caseId: caseTasks.caseId, taskStatus: caseTasks.taskStatus })
            .from(caseTasks)
            .where(inArray(caseTasks.caseId, caseIds))
        : [];

      const tasksByCaseId = new Map<number, typeof allTasks>();
      for (const t of allTasks) {
        const arr = tasksByCaseId.get(t.caseId) ?? [];
        arr.push(t);
        tasksByCaseId.set(t.caseId, arr);
      }

      const enriched = rows.map((c) => {
        const tasks = tasksByCaseId.get(c.id) ?? [];
        const total = tasks.length;
        const completed = tasks.filter((t) => t.taskStatus === "completed").length;
        return { ...c, taskProgress: { total, completed, pct: total > 0 ? Math.round((completed / total) * 100) : 0 } };
      });

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
    }).merge(optionalActiveWorkspace))
    .query(async ({ ctx, input }) => {
      const companyId = await requirePortalCompanyId(ctx.user as User, input?.companyId);
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
    .input(z.object({ daysAhead: z.number().default(90) }).merge(optionalActiveWorkspace))
    .query(async ({ ctx, input }) => {
      const companyId = await requirePortalCompanyId(ctx.user as User, input?.companyId);
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
    }).merge(optionalActiveWorkspace))
    .mutation(async ({ ctx, input }) => {
      const companyId = await requirePortalCompanyId(ctx.user as User, input?.companyId);

      const notificationId = await createNotification(
        {
          userId: ctx.user.id,
          companyId,
          title: `[${input.category.toUpperCase()}] ${input.subject}`,
          message: input.message,
          type: "client_message",
          isRead: false,
        },
        { actorUserId: ctx.user.id },
      );
      if (notificationId == null) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      }

      // Notify owner
      try {
        const { notifyOwner } = await import("../_core/notification");
        await notifyOwner({
          title: `New Client Message: ${input.subject}`,
          content: `From: ${ctx.user.name} (Company ID: ${companyId})\nCategory: ${input.category}\n\n${input.message}`,
        });
      } catch (_) { /* non-critical */ }

      return { success: true, messageId: notificationId };
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
    }).merge(optionalActiveWorkspace))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const companyId = await requirePortalCompanyId(ctx.user as User, input?.companyId);
      let companyName = "Unknown Company";
      let companyCr: string | undefined;
      const [co] = await db.select({ name: companies.name, regNumber: companies.registrationNumber })
        .from(companies).where(eq(companies.id, companyId)).limit(1);
      if (co) {
        companyName = co.name;
        companyCr = co.regNumber ?? undefined;
      }
      const [office] = await db.select({ id: sanadOffices.id }).from(sanadOffices).limit(1);
      if (!office) throw new TRPCError({ code: "NOT_FOUND", message: "No Sanad office configured" });
      const { sanadServiceRequests } = await import("../../drizzle/schema");
      const [result] = await db.insert(sanadServiceRequests).values({
        officeId: office.id,
        requesterCompanyId: companyId,
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
  listMyDocuments: protectedProcedure
    .input(optionalActiveWorkspace.optional())
    .query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return [];
    const companyId = await requirePortalCompanyId(ctx.user as User, input?.companyId);
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
  getUpcomingRenewals: protectedProcedure
    .input(optionalActiveWorkspace.optional())
    .query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return [];
    const companyId = await requirePortalCompanyId(ctx.user as User, input?.companyId);
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
