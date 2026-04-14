import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { getDb } from "../db";
import { requireActiveCompanyId } from "../_core/tenant";
import type { User } from "../../drizzle/schema";
import {
  companies,
  employeeDocuments,
  employeeGovernmentProfiles,
  employees,
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
      const isGlobal = canAccessGlobalAdminProcedures(ctx.user);
      const tenantCompanyId = isGlobal
        ? undefined
        : await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user as User);

      const db = await getDb();
      if (!db) return { alerts: [], summary: { critical: 0, high: 0, medium: 0, low: 0, total: 0 } };

      /** When set, restrict rows to this company. When undefined, platform sees all tenants (no company filter). */
      const effectiveCompanyFilter: number | undefined = isGlobal ? input?.companyId : tenantCompanyId;

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
        if (effectiveCompanyFilter != null) {
          conditions.push(eq(workPermits.companyId, effectiveCompanyFilter));
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
        if (effectiveCompanyFilter != null) {
          govConditions.push(eq(employees.companyId, effectiveCompanyFilter));
        }

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
        if (effectiveCompanyFilter != null) {
          proConditions.push(eq(proServices.companyId, effectiveCompanyFilter));
        }

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

      // ── 4. Sanad Office Licences (platform operators only) ─────────────────
      if (isGlobal && (!input?.category || input.category === "sanad_licence")) {
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
        if (effectiveCompanyFilter != null) {
          docConditions.push(eq(employeeDocuments.companyId, effectiveCompanyFilter));
        }

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
      const isGlobal = canAccessGlobalAdminProcedures(ctx.user);
      const tenantCompanyId = isGlobal
        ? undefined
        : await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user as User);

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const companyScopedCategories = [
        "work_permit",
        "visa",
        "resident_card",
        "labour_card",
        "pro_service",
        "employee_document",
      ] as const;

      let effectiveCompanyId: number;
      if (input.category === "officer_document") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Officer document renewal is not supported yet" });
      }

      if (!isGlobal && input.category === "sanad_licence") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sanad licence renewals are managed by platform staff" });
      }

      if (isGlobal) {
        if (companyScopedCategories.includes(input.category as (typeof companyScopedCategories)[number])) {
          if (input.companyId == null) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "companyId is required for this alert category" });
          }
          effectiveCompanyId = input.companyId;
        } else if (input.category === "sanad_licence") {
          if (input.companyId == null) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "companyId is required to attach a renewal case" });
          }
          effectiveCompanyId = input.companyId;
        } else {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown category" });
        }
      } else {
        effectiveCompanyId = tenantCompanyId!;
      }

      let employeeId: number | null = null;
      let workPermitId: number | null = null;

      switch (input.category) {
        case "work_permit": {
          const [permit] = await db
            .select()
            .from(workPermits)
            .where(and(eq(workPermits.id, input.entityId), eq(workPermits.companyId, effectiveCompanyId)))
            .limit(1);
          if (!permit) throw new TRPCError({ code: "NOT_FOUND", message: "Work permit not found" });
          workPermitId = permit.id;
          employeeId = permit.employeeId ?? null;
          break;
        }
        case "visa":
        case "resident_card":
        case "labour_card": {
          const [row] = await db
            .select({ empId: employees.id })
            .from(employeeGovernmentProfiles)
            .innerJoin(employees, eq(employees.id, employeeGovernmentProfiles.employeeId))
            .where(
              and(
                eq(employeeGovernmentProfiles.id, input.entityId),
                eq(employees.companyId, effectiveCompanyId),
              ),
            )
            .limit(1);
          if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Government profile not found" });
          employeeId = row.empId;
          break;
        }
        case "pro_service": {
          const [pro] = await db
            .select()
            .from(proServices)
            .where(and(eq(proServices.id, input.entityId), eq(proServices.companyId, effectiveCompanyId)))
            .limit(1);
          if (!pro) throw new TRPCError({ code: "NOT_FOUND", message: "PRO service not found" });
          break;
        }
        case "employee_document": {
          const [doc] = await db
            .select()
            .from(employeeDocuments)
            .where(and(eq(employeeDocuments.id, input.entityId), eq(employeeDocuments.companyId, effectiveCompanyId)))
            .limit(1);
          if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });
          employeeId = doc.employeeId ?? null;
          break;
        }
        case "sanad_licence": {
          const [office] = await db.select().from(sanadOffices).where(eq(sanadOffices.id, input.entityId)).limit(1);
          if (!office) throw new TRPCError({ code: "NOT_FOUND", message: "Sanad office not found" });
          break;
        }
        default:
          throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported category" });
      }

      const { governmentServiceCases } = await import("../../drizzle/schema");

      const caseResult = await db.insert(governmentServiceCases).values({
        companyId: effectiveCompanyId,
        employeeId,
        workPermitId,
        caseType: "renewal",
        caseStatus: "draft",
        priority: "high",
        requestedBy: ctx.user.id,
        notes: input.notes ?? `Auto-created renewal case from expiry alert for ${input.category} entity ${input.entityId}`,
      });

      const insertRow = caseResult[0] as { insertId?: number };
      const caseId = Number(insertRow?.insertId ?? 0);

      return {
        success: true,
        caseId,
        message: `Renewal case created for ${input.category} — navigate to Government Cases to track progress.`,
      };
    }),

  /**
   * Get a quick badge count for the notification bell.
   * Returns count of items expiring within 30 days.
   */
  getAlertBadgeCount: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
    const isGlobal = canAccessGlobalAdminProcedures(ctx.user);
    /** Tenant users: resolved workspace. Global users: optional explicit company filter (no filter = all tenants). */
    const filterCompanyId = isGlobal
      ? (input?.companyId ?? null)
      : await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user as User);

    const db = await getDb();
    if (!db) return { count: 0, critical: 0 };

    const now = new Date();
    const cutoff30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const cutoff7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const scope30 = [
      gte(workPermits.expiryDate, now),
      lte(workPermits.expiryDate, cutoff30),
      ...(filterCompanyId != null ? [eq(workPermits.companyId, filterCompanyId)] : []),
    ];
    const scope7 = [
      gte(workPermits.expiryDate, now),
      lte(workPermits.expiryDate, cutoff7),
      ...(filterCompanyId != null ? [eq(workPermits.companyId, filterCompanyId)] : []),
    ];

    const [{ wpCount }] = await db
      .select({ wpCount: sql<number>`COUNT(*)` })
      .from(workPermits)
      .where(and(...scope30));

    const [{ wpCritical }] = await db
      .select({ wpCritical: sql<number>`COUNT(*)` })
      .from(workPermits)
      .where(and(...scope7));

    return {
      count: Number(wpCount ?? 0),
      critical: Number(wpCritical ?? 0),
    };
  }),
});
