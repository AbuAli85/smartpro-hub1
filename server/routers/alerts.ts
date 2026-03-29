import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { getDb } from "../db";
import {
  companies,
  employeeDocuments,
  employeeGovernmentProfiles,
  employees,
  omaniProOfficers,
  proServices,
  sanadOffices,
  workPermits,
} from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";

// ─── Constants ────────────────────────────────────────────────────────────────

const ALERT_THRESHOLDS = [90, 60, 30, 7] as const;

type AlertSeverity = "critical" | "high" | "medium" | "low";
type AlertCategory =
  | "work_permit"
  | "visa"
  | "resident_card"
  | "labour_card"
  | "pro_service"
  | "sanad_licence"
  | "officer_document"
  | "employee_document";

export interface ExpiryAlert {
  id: string;
  category: AlertCategory;
  severity: AlertSeverity;
  daysUntilExpiry: number;
  expiryDate: Date;
  entityId: number;
  entityName: string;
  companyId?: number;
  companyName?: string;
  description: string;
  actionUrl?: string;
}

function getSeverity(days: number): AlertSeverity {
  if (days <= 7) return "critical";
  if (days <= 30) return "high";
  if (days <= 60) return "medium";
  return "low";
}

function daysFromNow(date: Date): number {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const alertsRouter = router({
  /**
   * Get all upcoming expiry alerts across all categories.
   * Returns items expiring within the next 90 days.
   */
  getExpiryAlerts: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        category: z
          .enum([
            "work_permit",
            "visa",
            "resident_card",
            "labour_card",
            "pro_service",
            "sanad_licence",
            "officer_document",
            "employee_document",
          ])
          .optional(),
        maxDays: z.number().min(1).max(365).default(90),
        severity: z.enum(["critical", "high", "medium", "low"]).optional(),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { alerts: [], summary: { critical: 0, high: 0, medium: 0, low: 0, total: 0 } };

      const maxDays = input?.maxDays ?? 90;
      const now = new Date();
      const cutoff = new Date(now.getTime() + maxDays * 24 * 60 * 60 * 1000);
      const allAlerts: ExpiryAlert[] = [];

      // ── 1. Work Permits ────────────────────────────────────────────────────
      if (!input?.category || input.category === "work_permit") {
        const conditions = [
          gte(workPermits.expiryDate, now),
          lte(workPermits.expiryDate, cutoff),
        ];
        if (input?.companyId) conditions.push(eq(workPermits.companyId, input.companyId));
        if (!canAccessGlobalAdminProcedures(ctx.user) && !input?.companyId) {
          // Non-admin: scope to their company
          const [member] = await db
            .select({ companyId: companies.id })
            .from(companies)
            .limit(1);
          if (member) conditions.push(eq(workPermits.companyId, member.companyId));
        }

        const permits = await db
          .select({
            permit: workPermits,
          empFirstName: employees.firstName,
          empLastName: employees.lastName,
          companyName: companies.name,
        })
        .from(workPermits)
        .leftJoin(employees, eq(employees.id, workPermits.employeeId))
        .leftJoin(companies, eq(companies.id, workPermits.companyId))
          .where(and(...conditions))
          .orderBy(asc(workPermits.expiryDate))
          .limit(200);

        for (const { permit, empFirstName, empLastName, companyName } of permits) {
          const empName = empFirstName && empLastName ? `${empFirstName} ${empLastName}` : null;
          if (!permit.expiryDate) continue;
          const days = daysFromNow(permit.expiryDate);
          allAlerts.push({
            id: `wp-${permit.id}`,
            category: "work_permit",
            severity: getSeverity(days),
            daysUntilExpiry: days,
            expiryDate: permit.expiryDate,
            entityId: permit.id,
            entityName: empName ?? `Employee #${permit.employeeId}`,
            companyId: permit.companyId,
            companyName: companyName ?? undefined,
            description: `Work permit ${permit.workPermitNumber} expires in ${days} day${days !== 1 ? "s" : ""}`,
            actionUrl: "/workforce/permits",
          });
        }
      }

      // ── 2. Employee Visa / Resident Card / Labour Card ─────────────────────
      if (
        !input?.category ||
        ["visa", "resident_card", "labour_card"].includes(input.category)
      ) {
        const govConditions: ReturnType<typeof eq>[] = [];
        if (input?.companyId) govConditions.push(eq(employees.companyId, input.companyId));

      const govProfiles = await db
        .select({
          profile: employeeGovernmentProfiles,
          empFirstName: employees.firstName,
          empLastName: employees.lastName,
          empCompanyId: employees.companyId,
          companyName: companies.name,
        })
        .from(employeeGovernmentProfiles)
        .leftJoin(employees, eq(employees.id, employeeGovernmentProfiles.employeeId))
        .leftJoin(companies, eq(companies.id, employees.companyId))
        .where(govConditions.length ? and(...govConditions) : undefined)
        .limit(500);

      for (const { profile, empFirstName, empLastName, empCompanyId, companyName } of govProfiles) {
        const empName = empFirstName && empLastName ? `${empFirstName} ${empLastName}` : null;
        const checks: Array<{ date: Date | null; cat: AlertCategory; label: string }> = [
          { date: profile.visaExpiryDate, cat: "visa", label: "Visa" },
          { date: profile.residentCardExpiryDate, cat: "resident_card", label: "Resident Card" },
          { date: profile.labourCardExpiryDate, cat: "labour_card", label: "Labour Card" },
        ];

        for (const { date, cat, label } of checks) {
          if (!date) continue;
          if (input?.category && input.category !== cat) continue;
          if (date <= now || date > cutoff) continue;
          const days = daysFromNow(date);
          allAlerts.push({
            id: `gov-${profile.id}-${cat}`,
            category: cat,
            severity: getSeverity(days),
            daysUntilExpiry: days,
            expiryDate: date,
            entityId: profile.id,
            entityName: empName ?? `Employee #${profile.employeeId}`,
            companyId: empCompanyId ?? undefined,
            companyName: companyName ?? undefined,
            description: `${label} for ${empName ?? "employee"} expires in ${days} day${days !== 1 ? "s" : ""}`,
            actionUrl: "/workforce/employees",
          });
        }
      }
      }

      // ── 3. PRO Services ────────────────────────────────────────────────────
      if (!input?.category || input.category === "pro_service") {
        const proConditions = [
          gte(proServices.expiryDate, now),
          lte(proServices.expiryDate, cutoff),
        ];
        if (input?.companyId) proConditions.push(eq(proServices.companyId, input.companyId));

        const pros = await db
          .select({
            pro: proServices,
            companyName: companies.name,
          })
          .from(proServices)
          .leftJoin(companies, eq(companies.id, proServices.companyId))
          .where(and(...proConditions))
          .orderBy(asc(proServices.expiryDate))
          .limit(200);

        for (const { pro, companyName } of pros) {
          if (!pro.expiryDate) continue;
          const days = daysFromNow(pro.expiryDate);
          allAlerts.push({
            id: `pro-${pro.id}`,
            category: "pro_service",
            severity: getSeverity(days),
            daysUntilExpiry: days,
            expiryDate: pro.expiryDate,
            entityId: pro.id,
            entityName: pro.serviceType ?? "PRO Service",
            companyId: pro.companyId,
            companyName: companyName ?? undefined,
            description: `PRO service "${pro.serviceType}" expires in ${days} day${days !== 1 ? "s" : ""}`,
            actionUrl: "/pro",
          });
        }
      }

      // ── 4. Sanad Office Licences ───────────────────────────────────────────
      if (!input?.category || input.category === "sanad_licence") {
        const sanadRows = await db
          .select()
          .from(sanadOffices)
          .where(
            and(
              sql`${sanadOffices.licenceExpiry} IS NOT NULL`,
              sql`${sanadOffices.licenceExpiry} >= ${now.toISOString().slice(0, 10)}`,
              sql`${sanadOffices.licenceExpiry} <= ${cutoff.toISOString().slice(0, 10)}`
            )
          )
          .orderBy(asc(sanadOffices.licenceExpiry))
          .limit(100);

        for (const office of sanadRows) {
          if (!office.licenceExpiry) continue;
          const expDate = new Date(office.licenceExpiry);
          const days = daysFromNow(expDate);
          allAlerts.push({
            id: `sanad-${office.id}`,
            category: "sanad_licence",
            severity: getSeverity(days),
            daysUntilExpiry: days,
            expiryDate: expDate,
            entityId: office.id,
            entityName: office.name,
            description: `Sanad office licence for "${office.name}" expires in ${days} day${days !== 1 ? "s" : ""}`,
            actionUrl: "/sanad",
          });
        }
      }

      // ── 5. Employee Documents (Vault) ──────────────────────────────────────
      if (!input?.category || input.category === "employee_document") {
        const docConditions = [
          gte(employeeDocuments.expiresAt, now),
          lte(employeeDocuments.expiresAt, cutoff),
        ];
        if (input?.companyId) docConditions.push(eq(employeeDocuments.companyId, input.companyId));

        const docs = await db
          .select({
            doc: employeeDocuments,
          empFirstName: employees.firstName,
          empLastName: employees.lastName,
          companyName: companies.name,
        })
        .from(employeeDocuments)
        .leftJoin(employees, eq(employees.id, employeeDocuments.employeeId))
        .leftJoin(companies, eq(companies.id, employeeDocuments.companyId))
          .where(and(...docConditions))
          .orderBy(asc(employeeDocuments.expiresAt))
          .limit(200);

        for (const { doc, empFirstName, empLastName, companyName } of docs) {
          const empName = empFirstName && empLastName ? `${empFirstName} ${empLastName}` : null;
          if (!doc.expiresAt) continue;
          const days = daysFromNow(doc.expiresAt);
          allAlerts.push({
            id: `doc-${doc.id}`,
            category: "employee_document",
            severity: getSeverity(days),
            daysUntilExpiry: days,
            expiryDate: doc.expiresAt,
            entityId: doc.id,
            entityName: `${doc.documentType ?? "Document"} — ${empName ?? "Employee"}`,
            companyId: doc.companyId,
            companyName: companyName ?? undefined,
            description: `${doc.documentType ?? "Document"} for ${empName ?? "employee"} expires in ${days} day${days !== 1 ? "s" : ""}`,
            actionUrl: "/workforce/documents",
          });
        }
      }

      // ── Filter by severity if requested ────────────────────────────────────
      const filtered = input?.severity
        ? allAlerts.filter((a) => a.severity === input.severity)
        : allAlerts;

      // ── Sort: most critical first ──────────────────────────────────────────
      filtered.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

      // ── Summary ────────────────────────────────────────────────────────────
      const summary = filtered.reduce(
        (acc, a) => {
          acc[a.severity]++;
          acc.total++;
          return acc;
        },
        { critical: 0, high: 0, medium: 0, low: 0, total: 0 }
      );

      return { alerts: filtered, summary };
    }),

  /**
   * Dismiss an alert by ID (client-side acknowledgement — stored in session, not DB).
   * Since we compute alerts dynamically, dismissal is a no-op that returns success.
   * A persistent dismissed_alerts table can be added in a future iteration.
   */
  dismissAlert: protectedProcedure
    .input(z.object({ alertId: z.string() }))
    .mutation(async () => {
      // Alerts are computed dynamically; dismissal acknowledged client-side
      return { success: true, alertId: "" };
    }),

  /**
   * Trigger a government renewal case from an expiry alert.
   * Creates a government_service_cases record for the relevant entity.
   */
  triggerRenewal: protectedProcedure
    .input(
      z.object({
        alertId: z.string(),
        category: z.enum(["work_permit", "visa", "resident_card", "labour_card", "pro_service", "sanad_licence", "officer_document", "employee_document"]),
        entityId: z.number(),
        companyId: z.number().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Map alert category to a government case type
      const caseTypeMap: Record<string, string> = {
        work_permit: "work_permit_renewal",
        visa: "visa_renewal",
        resident_card: "resident_card_renewal",
        labour_card: "labour_card_renewal",
        pro_service: "pro_service_renewal",
        sanad_licence: "licence_renewal",
        officer_document: "document_renewal",
        employee_document: "document_renewal",
      };
      const caseType = caseTypeMap[input.category] ?? "general_renewal";

      // Import government_service_cases table dynamically to avoid circular imports
      const { governmentServiceCases } = await import("../../drizzle/schema");

      // Map to valid caseType enum values
      const validCaseType = ["renewal", "amendment", "cancellation", "contract_registration", "employee_update", "document_update", "new_permit", "transfer"].includes(caseType)
        ? caseType as "renewal"
        : "renewal";

      const [result] = await db.insert(governmentServiceCases).values({
        companyId: input.companyId ?? 0,
        caseType: validCaseType,
        caseStatus: "draft",
        priority: "high",
        requestedBy: ctx.user.id,
        notes: input.notes ?? `Auto-created renewal case from expiry alert for ${input.category} entity ${input.entityId}`,
      });

      return {
        success: true,
        caseId: (result as { insertId?: number })?.insertId ?? 0,
        message: `Renewal case created for ${input.category} — navigate to Government Cases to track progress.`,
      };
    }),

  /**
   * Get a quick badge count for the notification bell.
   * Returns count of items expiring within 30 days.
   */
  getAlertBadgeCount: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { count: 0, critical: 0 };

    const now = new Date();
    const cutoff30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const cutoff7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Count work permits expiring within 30 days
    const [{ wpCount }] = await db
      .select({ wpCount: sql<number>`COUNT(*)` })
      .from(workPermits)
      .where(and(gte(workPermits.expiryDate, now), lte(workPermits.expiryDate, cutoff30)));

    // Count critical (within 7 days)
    const [{ wpCritical }] = await db
      .select({ wpCritical: sql<number>`COUNT(*)` })
      .from(workPermits)
      .where(and(gte(workPermits.expiryDate, now), lte(workPermits.expiryDate, cutoff7)));

    return {
      count: Number(wpCount ?? 0),
      critical: Number(wpCritical ?? 0),
    };
  }),
});
