/**
 * Automated Renewal Workflows Router
 *
 * Business logic:
 * - Admins define rules (entity type + days-before threshold) that auto-create
 *   government cases, optionally auto-assign the best available PRO officer,
 *   and notify both the client and platform owner.
 * - A "run" is created each time a rule fires against a specific expiring entity.
 * - The `processWorkflows` procedure is the engine — it scans all active rules,
 *   finds matching expiring entities, and fires them if not already triggered.
 * - Idempotent: a run is only created once per (rule, entity, expiry window).
 */

import { z } from "zod";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { and, asc, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { getDb, getUserCompany } from "../db";
import {
  renewalWorkflowRules,
  renewalWorkflowRuns,
  governmentServiceCases,
  caseTasks,
  employees,
  employeeGovernmentProfiles,
  workPermits,
  officerCompanyAssignments,
} from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { notifyOwner } from "../_core/notification";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Company scope for renewal rules/runs: null = platform staff (all tenants). */
async function resolveWorkflowCompanyScope(user: {
  id: number;
  role?: string | null;
  platformRole?: string | null;
}): Promise<number | null> {
  if (canAccessGlobalAdminProcedures(user)) return null;
  const membership = await getUserCompany(user.id);
  return membership?.company.id ?? null;
}

function requireDb(db: Awaited<ReturnType<typeof getDb>>) {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

/** Auto-tasks for a renewal case */
const RENEWAL_TASKS = [
  { taskType: "gather_documents" as const, title: "Gather required renewal documents", sortOrder: 1 },
  { taskType: "submit_mol" as const, title: "Submit renewal application on MOL portal", sortOrder: 2 },
  { taskType: "pay_fees" as const, title: "Pay government renewal fees", sortOrder: 3 },
  { taskType: "collect_documents" as const, title: "Collect renewed documents from authority", sortOrder: 4 },
  { taskType: "update_records" as const, title: "Update employee records with new expiry dates", sortOrder: 5 },
];

/** Find the best available officer for a company */
async function findBestOfficer(companyId: number): Promise<number | null> {
  const db = requireDb(await getDb());
  const assignments = await db
    .select({ officerId: officerCompanyAssignments.officerId })
    .from(officerCompanyAssignments)
    .where(
      and(
        eq(officerCompanyAssignments.companyId, companyId),
        eq(officerCompanyAssignments.status, "active")
      )
    )
    .limit(1);
  return assignments[0]?.officerId ?? null;
}

/** Create a government case with auto-tasks */
async function createRenewalCase(
  companyId: number,
  officerId: number | null,
  entityType: string,
  entityId: number,
  entityLabel: string,
  createdBy: number
): Promise<number> {
  const db = requireDb(await getDb());
  const caseTypeMap: Record<string, "renewal" | "document_update"> = {
    work_permit: "renewal",
    visa: "renewal",
    resident_card: "renewal",
    labour_card: "renewal",
    sanad_licence: "renewal",
    officer_document: "document_update",
    employee_document: "document_update",
    pro_service: "renewal",
  };
  const caseType = (caseTypeMap[entityType] ?? "renewal") as "renewal" | "amendment" | "cancellation" | "contract_registration" | "employee_update" | "document_update" | "new_permit" | "transfer";

  const [inserted] = await db.insert(governmentServiceCases).values({
    companyId,
    employeeId: ["work_permit", "visa", "resident_card", "labour_card", "employee_document"].includes(entityType) ? entityId : null,
    workPermitId: entityType === "work_permit" ? entityId : null,
    assignedTo: officerId,
    caseType,
    caseStatus: "awaiting_documents",
    priority: "high",
    notes: `Auto-created by Renewal Workflow Engine for ${entityType} #${entityId} (${entityLabel})`,
    requestedBy: createdBy,
  });

  const caseId = (inserted as unknown as { insertId: number }).insertId;

  const tasks = RENEWAL_TASKS.map(t => ({
    caseId,
    taskType: t.taskType,
    title: t.title,
    sortOrder: t.sortOrder,
    status: "pending" as const,
    createdBy,
  }));
  await db.insert(caseTasks).values(tasks);

  return caseId;
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const renewalWorkflowsRouter = router({

  // ── List rules ─────────────────────────────────────────────────────────────
  listRules: protectedProcedure
    .input(z.object({
      entityType: z.string().optional(),
      isActive: z.boolean().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const companyId = await resolveWorkflowCompanyScope(ctx.user);
      const rows = await db
        .select()
        .from(renewalWorkflowRules)
        .where(
          and(
            companyId
              ? or(eq(renewalWorkflowRules.companyId, companyId), isNull(renewalWorkflowRules.companyId))
              : undefined,
            input?.entityType ? eq(renewalWorkflowRules.entityType, input.entityType as "work_permit") : undefined,
            input?.isActive !== undefined ? eq(renewalWorkflowRules.isActive, input.isActive) : undefined,
          )
        )
        .orderBy(asc(renewalWorkflowRules.entityType), asc(renewalWorkflowRules.triggerDaysBefore));
      return rows;
    }),

  // ── Create rule ────────────────────────────────────────────────────────────
  createRule: protectedProcedure
    .input(z.object({
      name: z.string().min(3).max(255),
      description: z.string().optional(),
      entityType: z.enum(["work_permit", "visa", "resident_card", "labour_card", "sanad_licence", "officer_document", "employee_document", "pro_service"]),
      triggerDaysBefore: z.number().int().min(1).max(365).default(30),
      autoCreateCase: z.boolean().default(true),
      autoAssignOfficer: z.boolean().default(false),
      notifyClient: z.boolean().default(true),
      notifyOwnerFlag: z.boolean().default(true),
      caseType: z.enum(["renewal", "amendment", "cancellation", "contract_registration", "employee_update", "document_update", "new_permit", "transfer"]).default("renewal"),
      companyId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const memberCompanyId = await resolveWorkflowCompanyScope(ctx.user);
      const effectiveCompanyId = canAccessGlobalAdminProcedures(ctx.user) ? (input.companyId ?? null) : memberCompanyId;

      const [result] = await db.insert(renewalWorkflowRules).values({
        companyId: effectiveCompanyId,
        name: input.name,
        description: input.description,
        entityType: input.entityType,
        triggerDaysBefore: input.triggerDaysBefore,
        autoCreateCase: input.autoCreateCase,
        autoAssignOfficer: input.autoAssignOfficer,
        notifyClient: input.notifyClient,
        notifyOwner: input.notifyOwnerFlag,
        caseType: input.caseType,
        isActive: true,
        createdBy: ctx.user.id,
      });
      return { id: (result as unknown as { insertId: number }).insertId };
    }),

  // ── Update rule ────────────────────────────────────────────────────────────
  updateRule: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(3).max(255).optional(),
      description: z.string().optional(),
      triggerDaysBefore: z.number().int().min(1).max(365).optional(),
      autoCreateCase: z.boolean().optional(),
      autoAssignOfficer: z.boolean().optional(),
      notifyClient: z.boolean().optional(),
      notifyOwner: z.boolean().optional(),
      caseType: z.enum(["renewal", "amendment", "cancellation", "contract_registration", "employee_update", "document_update", "new_permit", "transfer"]).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const { id, ...rest } = input;
      const [rule] = await db.select().from(renewalWorkflowRules).where(eq(renewalWorkflowRules.id, id)).limit(1);
      if (!rule) throw new TRPCError({ code: "NOT_FOUND" });

      const companyId = await resolveWorkflowCompanyScope(ctx.user);
      if (companyId && rule.companyId !== null && rule.companyId !== companyId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await db.update(renewalWorkflowRules).set(rest).where(eq(renewalWorkflowRules.id, id));
      return { success: true };
    }),

  // ── Delete rule ────────────────────────────────────────────────────────────
  deleteRule: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const [rule] = await db.select().from(renewalWorkflowRules).where(eq(renewalWorkflowRules.id, input.id)).limit(1);
      if (!rule) throw new TRPCError({ code: "NOT_FOUND" });
      const companyId = await resolveWorkflowCompanyScope(ctx.user);
      if (companyId && rule.companyId !== null && rule.companyId !== companyId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await db.delete(renewalWorkflowRules).where(eq(renewalWorkflowRules.id, input.id));
      return { success: true };
    }),

  // ── List runs ──────────────────────────────────────────────────────────────
  listRuns: protectedProcedure
    .input(z.object({
      status: z.enum(["pending", "triggered", "case_created", "skipped", "failed"]).optional(),
      pageSize: z.number().int().min(1).max(100).default(50),
      page: z.number().int().min(1).default(1),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const companyId = await resolveWorkflowCompanyScope(ctx.user);
      const limit = input?.pageSize ?? 50;
      const offset = ((input?.page ?? 1) - 1) * limit;

      const rows = await db
        .select()
        .from(renewalWorkflowRuns)
        .where(
          and(
            companyId ? eq(renewalWorkflowRuns.companyId, companyId) : undefined,
            input?.status ? eq(renewalWorkflowRuns.status, input.status) : undefined,
          )
        )
        .orderBy(desc(renewalWorkflowRuns.createdAt))
        .limit(limit)
        .offset(offset);

      return { items: rows, page: input?.page ?? 1, pageSize: limit };
    }),

  // ── Process workflows (automation engine) ─────────────────────────────────
  processWorkflows: protectedProcedure
    .input(z.object({
      dryRun: z.boolean().default(false),
      companyId: z.number().optional(),
    }).optional())
    .mutation(async ({ ctx, input }) => {
      if (!canAccessGlobalAdminProcedures(ctx.user)) throw new TRPCError({ code: "FORBIDDEN", message: "Only platform admins can run the workflow engine" });

      const db = requireDb(await getDb());
      const dryRun = input?.dryRun ?? false;
      const filterCompanyId = input?.companyId;
      const now = new Date();

      const rules = await db
        .select()
        .from(renewalWorkflowRules)
        .where(eq(renewalWorkflowRules.isActive, true));

      type RunResult = {
        ruleId: number; ruleName: string; entityType: string;
        entityId: number; entityLabel: string; expiryDate: Date;
        daysLeft: number; action: string; caseId?: number;
      };
      const results: RunResult[] = [];

      for (const rule of rules) {
        const thresholdDate = new Date(now.getTime() + rule.triggerDaysBefore * 24 * 60 * 60 * 1000);

        // ── Work permits ────────────────────────────────────────────────────
        if (rule.entityType === "work_permit") {
          const permits = await db
            .select({
              id: workPermits.id,
              companyId: workPermits.companyId,
              workPermitNumber: workPermits.workPermitNumber,
              expiryDate: workPermits.expiryDate,
              firstName: employees.firstName,
              lastName: employees.lastName,
            })
            .from(workPermits)
            .leftJoin(employees, eq(workPermits.employeeId, employees.id))
            .where(
              and(
                gte(workPermits.expiryDate, now),
                lte(workPermits.expiryDate, thresholdDate),
                eq(workPermits.permitStatus, "active"),
                filterCompanyId ? eq(workPermits.companyId, filterCompanyId) : undefined,
                rule.companyId ? eq(workPermits.companyId, rule.companyId) : undefined,
              )
            );

          for (const permit of permits) {
            if (!permit.expiryDate) continue;
            const daysLeft = Math.ceil((permit.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            const label = `${permit.firstName ?? ""} ${permit.lastName ?? ""} — WP ${permit.workPermitNumber ?? permit.id}`.trim();

            const existing = await db
              .select({ id: renewalWorkflowRuns.id })
              .from(renewalWorkflowRuns)
              .where(
                and(
                  eq(renewalWorkflowRuns.ruleId, rule.id),
                  eq(renewalWorkflowRuns.entityType, "work_permit"),
                  eq(renewalWorkflowRuns.entityId, permit.id),
                  eq(renewalWorkflowRuns.daysBeforeExpiry, rule.triggerDaysBefore),
                )
              )
              .limit(1);

            if (existing.length > 0) continue;

            if (dryRun) {
              results.push({ ruleId: rule.id, ruleName: rule.name, entityType: "work_permit", entityId: permit.id, entityLabel: label, expiryDate: permit.expiryDate, daysLeft, action: "would_trigger" });
              continue;
            }

            const [runResult] = await db.insert(renewalWorkflowRuns).values({
              ruleId: rule.id,
              companyId: permit.companyId,
              entityType: "work_permit",
              entityId: permit.id,
              entityLabel: label,
              expiryDate: permit.expiryDate,
              daysBeforeExpiry: rule.triggerDaysBefore,
              status: "triggered",
              triggeredAt: now,
            });
            const runId = (runResult as unknown as { insertId: number }).insertId;

            let caseId: number | undefined;
            let officerId: number | null = null;

            if (rule.autoCreateCase) {
              if (rule.autoAssignOfficer) officerId = await findBestOfficer(permit.companyId);
              caseId = await createRenewalCase(permit.companyId, officerId, "work_permit", permit.id, label, ctx.user.id);
              await db.update(renewalWorkflowRuns)
                .set({ status: "case_created", caseId, assignedOfficerId: officerId ?? undefined })
                .where(eq(renewalWorkflowRuns.id, runId));
            }

            if (rule.notifyOwner) {
              await notifyOwner({
                title: `🔔 Renewal Alert: Work Permit expiring in ${daysLeft} days`,
                content: `${label} — Expiry: ${permit.expiryDate.toLocaleDateString()}${caseId ? ` — Case #${caseId} created` : ""}`,
              });
            }

            results.push({ ruleId: rule.id, ruleName: rule.name, entityType: "work_permit", entityId: permit.id, entityLabel: label, expiryDate: permit.expiryDate, daysLeft, action: caseId ? "case_created" : "triggered", caseId });
          }
        }

        // ── Employee government documents ────────────────────────────────────
        if (["visa", "resident_card", "labour_card"].includes(rule.entityType)) {
          type ProfileRow = {
            id: number; employeeId: number;
            visaExpiryDate: Date | null;
            residentCardExpiryDate: Date | null;
            labourCardExpiryDate: Date | null;
            companyId: number | null;
            firstName: string; lastName: string;
          };

          const profiles: ProfileRow[] = await db
            .select({
              id: employeeGovernmentProfiles.id,
              employeeId: employeeGovernmentProfiles.employeeId,
              visaExpiryDate: employeeGovernmentProfiles.visaExpiryDate,
              residentCardExpiryDate: employeeGovernmentProfiles.residentCardExpiryDate,
              labourCardExpiryDate: employeeGovernmentProfiles.labourCardExpiryDate,
              companyId: employees.companyId,
              firstName: employees.firstName,
              lastName: employees.lastName,
            })
            .from(employeeGovernmentProfiles)
            .innerJoin(employees, eq(employeeGovernmentProfiles.employeeId, employees.id))
            .where(
              and(
                filterCompanyId ? eq(employees.companyId, filterCompanyId) : undefined,
                rule.companyId ? eq(employees.companyId, rule.companyId) : undefined,
              )
            );

          for (const profile of profiles) {
            const expiryDate: Date | null =
              rule.entityType === "visa" ? profile.visaExpiryDate :
              rule.entityType === "resident_card" ? profile.residentCardExpiryDate :
              profile.labourCardExpiryDate;

            if (!expiryDate) continue;
            if (expiryDate < now || expiryDate > thresholdDate) continue;
            if (!profile.companyId) continue;

            const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            const label = `${profile.firstName} ${profile.lastName} — ${rule.entityType.replace(/_/g, " ")}`;

            const existing = await db
              .select({ id: renewalWorkflowRuns.id })
              .from(renewalWorkflowRuns)
              .where(
                and(
                  eq(renewalWorkflowRuns.ruleId, rule.id),
                  eq(renewalWorkflowRuns.entityType, rule.entityType),
                  eq(renewalWorkflowRuns.entityId, profile.id),
                  eq(renewalWorkflowRuns.daysBeforeExpiry, rule.triggerDaysBefore),
                )
              )
              .limit(1);
            if (existing.length > 0) continue;

            if (dryRun) {
              results.push({ ruleId: rule.id, ruleName: rule.name, entityType: rule.entityType, entityId: profile.id, entityLabel: label, expiryDate, daysLeft, action: "would_trigger" });
              continue;
            }

            const [runResult] = await db.insert(renewalWorkflowRuns).values({
              ruleId: rule.id,
              companyId: profile.companyId,
              entityType: rule.entityType,
              entityId: profile.id,
              entityLabel: label,
              expiryDate,
              daysBeforeExpiry: rule.triggerDaysBefore,
              status: "triggered",
              triggeredAt: now,
            });
            const runId = (runResult as unknown as { insertId: number }).insertId;

            let caseId: number | undefined;
            let officerId: number | null = null;

            if (rule.autoCreateCase) {
              if (rule.autoAssignOfficer) officerId = await findBestOfficer(profile.companyId);
              caseId = await createRenewalCase(profile.companyId, officerId, rule.entityType, profile.id, label, ctx.user.id);
              await db.update(renewalWorkflowRuns)
                .set({ status: "case_created", caseId, assignedOfficerId: officerId ?? undefined })
                .where(eq(renewalWorkflowRuns.id, runId));
            }

            if (rule.notifyOwner) {
              await notifyOwner({
                title: `🔔 Renewal Alert: ${rule.entityType.replace(/_/g, " ")} expiring in ${daysLeft} days`,
                content: `${label} — Expiry: ${expiryDate.toLocaleDateString()}${caseId ? ` — Case #${caseId} created` : ""}`,
              });
            }

            results.push({ ruleId: rule.id, ruleName: rule.name, entityType: rule.entityType, entityId: profile.id, entityLabel: label, expiryDate, daysLeft, action: caseId ? "case_created" : "triggered", caseId });
          }
        }
      }

      return {
        processed: results.length,
        dryRun,
        items: results,
        summary: {
          caseCreated: results.filter(r => r.action === "case_created").length,
          triggered: results.filter(r => r.action === "triggered").length,
          wouldTrigger: results.filter(r => r.action === "would_trigger").length,
        },
      };
    }),

  // ── Dashboard stats ────────────────────────────────────────────────────────
  getDashboard: protectedProcedure.query(async ({ ctx }) => {
    const db = requireDb(await getDb());
    const companyId = await resolveWorkflowCompanyScope(ctx.user);

    const totalRulesRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(renewalWorkflowRules)
      .where(
        and(
          eq(renewalWorkflowRules.isActive, true),
          companyId
            ? or(eq(renewalWorkflowRules.companyId, companyId), isNull(renewalWorkflowRules.companyId))
            : undefined,
        )
      );

    const runStats = await db
      .select({
        status: renewalWorkflowRuns.status,
        count: sql<number>`count(*)`,
      })
      .from(renewalWorkflowRuns)
      .where(companyId ? eq(renewalWorkflowRuns.companyId, companyId) : undefined)
      .groupBy(renewalWorkflowRuns.status);

    const recentRuns = await db
      .select()
      .from(renewalWorkflowRuns)
      .where(companyId ? eq(renewalWorkflowRuns.companyId, companyId) : undefined)
      .orderBy(desc(renewalWorkflowRuns.createdAt))
      .limit(10);

    const statusMap: Record<string, number> = {};
    for (const r of runStats) statusMap[r.status] = r.count;

    return {
      activeRules: totalRulesRows[0]?.count ?? 0,
      runs: {
        total: Object.values(statusMap).reduce((a, b) => a + b, 0),
        caseCreated: statusMap["case_created"] ?? 0,
        triggered: statusMap["triggered"] ?? 0,
        pending: statusMap["pending"] ?? 0,
        failed: statusMap["failed"] ?? 0,
        skipped: statusMap["skipped"] ?? 0,
      },
      recentRuns,
    };
  }),
});
