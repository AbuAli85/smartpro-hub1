import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, sql, gte, lte, isNull, not } from "drizzle-orm";
import { z } from "zod";
import { getDb, getUserCompany } from "../db";
import {
  automationRules,
  automationLogs,
  workforceHealthSnapshots,
  employees,
  contracts,
} from "../../drizzle/schema";
import type { User } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import { requireActiveCompanyId } from "../_core/tenant";
import { requireAnyOperatorRole } from "../_core/policy";
import { optionalActiveWorkspace } from "../_core/workspaceInput";

// ─── Completeness scoring ─────────────────────────────────────────────────────
type EmpRow = typeof employees.$inferSelect;

function calcCompletenessScore(emp: EmpRow): number {
  const identity = [
    emp.firstName, emp.lastName, emp.firstNameAr, emp.lastNameAr,
    emp.email, emp.phone, emp.dateOfBirth, emp.gender, emp.nationality,
    emp.nationalId, emp.passportNumber,
  ];
  const employment = [
    emp.department, emp.position, emp.employmentType,
    emp.employeeNumber, emp.hireDate,
  ];
  const compliance = [
    emp.visaNumber, emp.visaExpiryDate, emp.workPermitNumber, emp.workPermitExpiryDate,
    emp.pasiNumber, emp.emergencyContactName, emp.emergencyContactPhone,
  ];
  const financial = [emp.salary, emp.bankName, emp.bankAccountNumber];
  const score = (fields: unknown[], weight: number) => {
    const filled = fields.filter((f) => f !== null && f !== undefined && f !== "").length;
    return (filled / fields.length) * weight;
  };
  return Math.round(
    score(identity, 30) + score(employment, 20) + score(compliance, 30) + score(financial, 20)
  );
}

function getDaysUntilExpiry(dateVal: Date | string | null | undefined): number | null {
  if (!dateVal) return null;
  const expiry = new Date(dateVal);
  const now = new Date();
  return Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Trigger evaluation ───────────────────────────────────────────────────────
async function evaluateRule(
  rule: typeof automationRules.$inferSelect,
  emps: EmpRow[]
): Promise<{ employeeId: number; message: string; metadata: Record<string, unknown> }[]> {
  const threshold = parseInt(rule.conditionValue ?? "30", 10);
  const results: { employeeId: number; message: string; metadata: Record<string, unknown> }[] = [];
  const fullName = (emp: EmpRow) => [emp.firstName, emp.lastName].filter(Boolean).join(" ");

  for (const emp of emps) {
    switch (rule.triggerType) {
      case "visa_expiry": {
        const days = getDaysUntilExpiry(emp.visaExpiryDate);
        if (days !== null && days >= 0 && days <= threshold) {
          results.push({ employeeId: emp.id, message: `${fullName(emp)}'s visa expires in ${days} day(s)`, metadata: { daysUntilExpiry: days, field: "visaExpiryDate", expiryDate: emp.visaExpiryDate } });
        }
        break;
      }
      case "work_permit_expiry": {
        const days = getDaysUntilExpiry(emp.workPermitExpiryDate);
        if (days !== null && days >= 0 && days <= threshold) {
          results.push({ employeeId: emp.id, message: `${fullName(emp)}'s work permit expires in ${days} day(s)`, metadata: { daysUntilExpiry: days, field: "workPermitExpiryDate", expiryDate: emp.workPermitExpiryDate } });
        }
        break;
      }
      case "passport_expiry": {
        const days = getDaysUntilExpiry((emp as any).passportExpiry ?? null);
        if (days !== null && days >= 0 && days <= threshold) {
          results.push({ employeeId: emp.id, message: `${fullName(emp)}'s passport expires in ${days} day(s)`, metadata: { daysUntilExpiry: days, field: "passportExpiry" } });
        }
        break;
      }
      case "completeness_below": {
        const score = calcCompletenessScore(emp);
        if (score < threshold) {
          results.push({ employeeId: emp.id, message: `${fullName(emp)}'s profile completeness is ${score}% (below ${threshold}%)`, metadata: { completenessScore: score, threshold } });
        }
        break;
      }
      case "no_department": {
        if (!emp.department) {
          results.push({ employeeId: emp.id, message: `${fullName(emp)} has no department assigned`, metadata: { field: "department" } });
        }
        break;
      }
    }
  }
  return results;
}

// ─── Pre-built rule templates ─────────────────────────────────────────────────
export const RULE_TEMPLATES = [
  {
    key: "visa_30d",
    name: "Visa Expiry — 30 Days",
    description: "Alert when an employee's visa expires within 30 days",
    triggerType: "visa_expiry" as const,
    conditionValue: "30",
    actionType: "notify_admin" as const,
    severity: "high",
    leadTimeDays: 30,
    throttleHours: 24,
  },
  {
    key: "work_permit_15d",
    name: "Work Permit Expiry — 15 Days",
    description: "Alert when a work permit expires within 15 days",
    triggerType: "work_permit_expiry" as const,
    conditionValue: "15",
    actionType: "notify_admin" as const,
    severity: "critical",
    leadTimeDays: 15,
    throttleHours: 12,
  },
  {
    key: "new_hire_7d",
    name: "New Hire Incomplete — 7 Days",
    description: "Flag new employees whose profiles are still below 60% after 7 days",
    triggerType: "completeness_below" as const,
    conditionValue: "60",
    actionType: "create_task" as const,
    severity: "medium",
    leadTimeDays: 7,
    throttleHours: 48,
  },
  {
    key: "no_dept",
    name: "No Department Assigned",
    description: "Alert when an employee has no department after onboarding",
    triggerType: "no_department" as const,
    conditionValue: "0",
    actionType: "notify_admin" as const,
    severity: "medium",
    leadTimeDays: 0,
    throttleHours: 72,
  },
  {
    key: "completeness_60",
    name: "Profile Completeness Below 60%",
    description: "Flag employees with profile completeness below 60%",
    triggerType: "completeness_below" as const,
    conditionValue: "60",
    actionType: "escalate" as const,
    severity: "high",
    leadTimeDays: 0,
    throttleHours: 24,
  },
];

// ─── Router ───────────────────────────────────────────────────────────────────
export const automationRouter = router({
  // List all automation rules for the company (ordered by priority then creation)
  listRules: protectedProcedure
    .input(optionalActiveWorkspace.optional())
    .query(async ({ ctx, input }) => {
    const companyId = await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user);
    const db = await getDb();
    if (!db) return [];
    const rules = await db
      .select()
      .from(automationRules)
      .where(eq(automationRules.companyId, companyId))
      .orderBy(desc(automationRules.createdAt));
    // Augment with failure stats from logs
    try {
      const mysql = require("mysql2/promise");
      const conn = mysql.createPool(process.env.DATABASE_URL);
      const [failureRows] = await conn.query(
        `SELECT rule_id,
           SUM(CASE WHEN status='failure' THEN 1 ELSE 0 END) as failure_count,
           MAX(CASE WHEN status='failure' THEN created_at END) as last_failure_at,
           MAX(failure_category) as last_failure_category
         FROM automation_logs WHERE company_id = ? GROUP BY rule_id`,
        [companyId]
      );
      const failureMap = new Map((failureRows as any[]).map((r: any) => [r.rule_id, r]));
      return rules.map((r) => {
        const f = failureMap.get(r.id) as any;
        return {
          ...r,
          failureCount: f ? Number(f.failure_count) : 0,
          lastFailureAt: f?.last_failure_at ?? null,
          lastFailureCategory: f?.last_failure_category ?? null,
        };
      });
    } catch {
      return rules;
    }
  }),

  // Get pre-built rule templates
  getTemplates: protectedProcedure
    .input(optionalActiveWorkspace.optional())
    .query(async ({ ctx, input }) => {
    const companyId = await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user);
    const db = await getDb();
    if (!db) return RULE_TEMPLATES.map((t) => ({ ...t, installed: false }));

    // Check which templates are already installed
    const existing = await db
      .select({ name: automationRules.name })
      .from(automationRules)
      .where(eq(automationRules.companyId, companyId));

    const existingNames = new Set(existing.map((r) => r.name));
    return RULE_TEMPLATES.map((t) => ({ ...t, installed: existingNames.has(t.name) }));
  }),

  // Install a pre-built rule template
  installTemplate: protectedProcedure
    .input(z.object({ templateKey: z.string() }).merge(optionalActiveWorkspace))
    .mutation(async ({ ctx, input }) => {
      const { companyId } = await requireAnyOperatorRole(ctx.user as User, input?.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const template = RULE_TEMPLATES.find((t) => t.key === input.templateKey);
      if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });

      const [result] = await db.insert(automationRules).values({
        companyId,
        name: template.name,
        description: template.description,
        triggerType: template.triggerType,
        conditionValue: template.conditionValue,
        actionType: template.actionType,
        isActive: true,
      } as any);

       return { id: (result as any).insertId as number, success: true };
    }),

  // Create a new automation rule
  createRule: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        triggerType: z.enum(["visa_expiry", "work_permit_expiry", "passport_expiry", "completeness_below", "no_department", "contract_expiry", "booking_overdue", "payment_overdue", "client_inactive"]),
        conditionValue: z.string().optional(),
        actionType: z.enum(["notify_admin", "notify_employee", "create_task", "escalate", "send_email", "flag_review"]),
        actionPayload: z.string().optional(),
        isActive: z.boolean().default(true),
        severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
        leadTimeDays: z.number().default(30),
        throttleHours: z.number().default(24),
        dryRunMode: z.boolean().default(false),
        alertRecipients: z.enum(["all_admins", "hr_admin", "company_owner"]).default("all_admins"),
        priority: z.number().min(1).max(10).default(5),
        maxRetries: z.number().min(0).max(5).default(3),
        dependsOnRuleId: z.number().optional(),
      }).merge(optionalActiveWorkspace),
    )
    .mutation(async ({ ctx, input }) => {
      const { companyId } = await requireAnyOperatorRole(ctx.user as User, input?.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(automationRules).values({
        companyId,
        name: input.name,
        description: input.description ?? null,
        triggerType: input.triggerType,
        conditionValue: input.conditionValue ?? null,
        actionType: input.actionType,
        actionPayload: input.actionPayload ?? null,
        isActive: input.isActive,
        alertRecipients: input.alertRecipients,
      } as any);
      const newId = (result as any).insertId as number;
      // Store priority/maxRetries/dependsOnRuleId via raw SQL since schema columns were added post-migration
      try {
        const mysql = require("mysql2/promise");
        const conn = mysql.createPool(process.env.DATABASE_URL);
        await conn.query(
          `UPDATE automation_rules SET priority = ?, max_retries = ?, depends_on_rule_id = ? WHERE id = ?`,
          [input.priority, input.maxRetries, input.dependsOnRuleId ?? null, newId]
        );
      } catch { /* ignore */ }
      return { id: newId, success: true };
    }),

  // Update an automation rule
  updateRule: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        conditionValue: z.string().optional(),
        actionType: z.enum(["notify_admin", "notify_employee", "create_task", "escalate", "send_email", "flag_review"]).optional(),
        actionPayload: z.string().optional(),
        isActive: z.boolean().optional(),
        severity: z.enum(["low", "medium", "high", "critical"]).optional(),
        leadTimeDays: z.number().optional(),
        throttleHours: z.number().optional(),
        dryRunMode: z.boolean().optional(),
        alertRecipients: z.enum(["all_admins", "hr_admin", "company_owner"]).optional(),
        priority: z.number().min(1).max(10).optional(),
        maxRetries: z.number().min(0).max(5).optional(),
      }).merge(optionalActiveWorkspace),
    )
    .mutation(async ({ ctx, input }) => {
      const { companyId } = await requireAnyOperatorRole(ctx.user as User, input?.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { id, priority, maxRetries, ...updates } = input;
      const safeUpdates: Record<string, unknown> = {};
      if (updates.name !== undefined) safeUpdates.name = updates.name;
      if (updates.description !== undefined) safeUpdates.description = updates.description;
      if (updates.conditionValue !== undefined) safeUpdates.conditionValue = updates.conditionValue;
      if (updates.actionType !== undefined) safeUpdates.actionType = updates.actionType;
      if (updates.actionPayload !== undefined) safeUpdates.actionPayload = updates.actionPayload;
      if (updates.isActive !== undefined) safeUpdates.isActive = updates.isActive;
      if (updates.alertRecipients !== undefined) safeUpdates.alertRecipients = updates.alertRecipients;

      // Update priority/maxRetries via raw SQL
      if (priority !== undefined || maxRetries !== undefined) {
        try {
          const mysql = require("mysql2/promise");
          const conn = mysql.createPool(process.env.DATABASE_URL);
          const setParts: string[] = [];
          const vals: unknown[] = [];
          if (priority !== undefined) { setParts.push("priority = ?"); vals.push(priority); }
          if (maxRetries !== undefined) { setParts.push("max_retries = ?"); vals.push(maxRetries); }
          if (setParts.length > 0) {
            vals.push(id, companyId);
            await conn.query(`UPDATE automation_rules SET ${setParts.join(", ")} WHERE id = ? AND company_id = ?`, vals);
          }
        } catch { /* ignore */ }
      }

      await db
        .update(automationRules)
        .set(safeUpdates)
        .where(and(eq(automationRules.id, id), eq(automationRules.companyId, companyId)));

      return { success: true };
    }),

  // Delete an automation rule
  deleteRule: protectedProcedure
    .input(z.object({ id: z.number() }).merge(optionalActiveWorkspace))
    .mutation(async ({ ctx, input }) => {
      const { companyId } = await requireAnyOperatorRole(ctx.user as User, input?.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .delete(automationRules)
        .where(and(eq(automationRules.id, input.id), eq(automationRules.companyId, companyId)));

      return { success: true };
    }),

  // Toggle a rule on/off
  toggleRule: protectedProcedure
    .input(z.object({ id: z.number(), isActive: z.boolean() }).merge(optionalActiveWorkspace))
    .mutation(async ({ ctx, input }) => {
      const { companyId } = await requireAnyOperatorRole(ctx.user as User, input?.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .update(automationRules)
        .set({ isActive: input.isActive })
        .where(and(eq(automationRules.id, input.id), eq(automationRules.companyId, companyId)));

      return { success: true };
    }),

  // Dry-run: preview which employees would be affected without taking action
  dryRunRule: protectedProcedure
    .input(z.object({ id: z.number() }).merge(optionalActiveWorkspace))
    .mutation(async ({ ctx, input }) => {
      const { companyId } = await requireAnyOperatorRole(ctx.user as User, input?.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [rule] = await db
        .select()
        .from(automationRules)
        .where(and(eq(automationRules.id, input.id), eq(automationRules.companyId, companyId)))
        .limit(1);

      if (!rule) throw new TRPCError({ code: "NOT_FOUND" });

      const emps = await db
        .select()
        .from(employees)
        .where(and(eq(employees.companyId, companyId), eq(employees.status, "active")));

      const matches = await evaluateRule(rule, emps);
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        triggerType: rule.triggerType,
        dryRun: true,
        matchCount: matches.length,
        matches: matches.slice(0, 20), // preview first 20
      };
    }),

  // Mute a rule (suppress all notifications from it)
  muteRule: protectedProcedure
    .input(z.object({ id: z.number(), muted: z.boolean() }).merge(optionalActiveWorkspace))
    .mutation(async ({ ctx, input }) => {
      const { companyId } = await requireAnyOperatorRole(ctx.user as User, input?.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(automationRules)
        .set({ isMuted: input.muted } as any)
        .where(and(eq(automationRules.id, input.id), eq(automationRules.companyId, companyId)));
      return { success: true };
    }),

  // Snooze a rule until a specific time
  snoozeRule: protectedProcedure
    .input(z.object({ id: z.number(), snoozeUntil: z.number().nullable() }).merge(optionalActiveWorkspace))
    .mutation(async ({ ctx, input }) => {
      const { companyId } = await requireAnyOperatorRole(ctx.user as User, input?.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(automationRules)
        .set({ snoozeUntil: input.snoozeUntil } as any)
        .where(and(eq(automationRules.id, input.id), eq(automationRules.companyId, companyId)));
      return { success: true };
    }),

  // Snooze a notification
  snoozeNotification: protectedProcedure
    .input(z.object({ id: z.number(), snoozeUntil: z.number() }).merge(optionalActiveWorkspace))
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user);
      try {
        const mysql = require("mysql2/promise");
        const conn = mysql.createPool(process.env.DATABASE_URL);
        await conn.query(
          `UPDATE notifications SET snoozed_until = ? WHERE company_id = ? AND id = ?`,
          [input.snoozeUntil, companyId, input.id]
        );
        return { success: true };
      } catch { return { success: false }; }
    }),

  // Simulate a rule against the last 30 days of data (backtest)
  simulateRule: protectedProcedure
    .input(z.object({ id: z.number() }).merge(optionalActiveWorkspace))
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [rule] = await db
        .select()
        .from(automationRules)
        .where(and(eq(automationRules.id, input.id), eq(automationRules.companyId, companyId)))
        .limit(1);
      if (!rule) throw new TRPCError({ code: "NOT_FOUND" });

      const emps = await db
        .select()
        .from(employees)
        .where(and(eq(employees.companyId, companyId), eq(employees.status, "active")));

      // Simulate for each of the last 30 days
      const dailyResults: { date: string; triggerCount: number; employeeIds: number[] }[] = [];
      const now = Date.now();
      for (let i = 29; i >= 0; i--) {
        const dayOffset = i * 24 * 60 * 60 * 1000;
        const simDate = new Date(now - dayOffset);
        // For expiry-based rules, adjust the threshold relative to simDate
        const threshold = parseInt(rule.conditionValue ?? "30", 10);
        const simMatches: number[] = [];
        for (const emp of emps) {
          let triggered = false;
          if (rule.triggerType === "visa_expiry" && emp.visaExpiryDate) {
            const expiry = new Date(emp.visaExpiryDate);
            const days = Math.floor((expiry.getTime() - simDate.getTime()) / (1000 * 60 * 60 * 24));
            if (days >= 0 && days <= threshold) triggered = true;
          } else if (rule.triggerType === "work_permit_expiry" && emp.workPermitExpiryDate) {
            const expiry = new Date(emp.workPermitExpiryDate);
            const days = Math.floor((expiry.getTime() - simDate.getTime()) / (1000 * 60 * 60 * 24));
            if (days >= 0 && days <= threshold) triggered = true;
          } else if (rule.triggerType === "completeness_below") {
            const score = calcCompletenessScore(emp);
            if (score < threshold) triggered = true;
          } else if (rule.triggerType === "no_department") {
            if (!emp.department) triggered = true;
          }
          if (triggered) simMatches.push(emp.id);
        }
        dailyResults.push({
          date: simDate.toISOString().slice(0, 10),
          triggerCount: simMatches.length,
          employeeIds: simMatches,
        });
      }

      const totalTriggers = dailyResults.reduce((s, d) => s + d.triggerCount, 0);
      const avgPerDay = Math.round(totalTriggers / 30);
      const peakDay = dailyResults.reduce((max, d) => d.triggerCount > max.triggerCount ? d : max, dailyResults[0]);

      return {
        ruleId: rule.id,
        ruleName: rule.name,
        triggerType: rule.triggerType,
        conditionValue: rule.conditionValue,
        simulationDays: 30,
        totalTriggers,
        avgPerDay,
        peakDay: peakDay?.date ?? null,
        peakCount: peakDay?.triggerCount ?? 0,
        dailyResults,
      };
    }),

  // Get observability stats per rule (success/failure rates, avg duration)
  getRuleStats: protectedProcedure
    .input(optionalActiveWorkspace.optional())
    .query(async ({ ctx, input }) => {
    const companyId = await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user);
    try {
      const mysql = require("mysql2/promise");
      const conn = mysql.createPool(process.env.DATABASE_URL);
      const [rows] = await conn.query(
        `SELECT rule_id,
           COUNT(*) as total_runs,
           SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_runs,
           SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) as failure_runs,
           AVG(duration_ms) as avg_duration_ms,
           MAX(created_at) as last_run_at
         FROM automation_logs WHERE company_id = ? GROUP BY rule_id`,
        [companyId]
      );
      return (rows as any[]).map((r) => ({
        ruleId: r.rule_id as number,
        totalRuns: Number(r.total_runs),
        successRuns: Number(r.success_runs),
        failureRuns: Number(r.failure_runs),
        successRate: r.total_runs > 0 ? Math.round((r.success_runs / r.total_runs) * 100) : 100,
        avgDurationMs: r.avg_duration_ms ? Math.round(r.avg_duration_ms) : null,
        lastRunAt: r.last_run_at as number,
      }));
    } catch { return []; }
  }),

  // Get performance metrics (query cost, notification volume)
  getPerformanceMetrics: protectedProcedure
    .input(optionalActiveWorkspace.optional())
    .query(async ({ ctx, input }) => {
    const companyId = await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user);
    const startTime = Date.now();
    try {
      const mysql = require("mysql2/promise");
      const conn = mysql.createPool(process.env.DATABASE_URL);
      const [[empCount]] = await conn.query(`SELECT COUNT(*) as c FROM employees WHERE company_id = ? AND status = 'active'`, [companyId]);
      const [[ruleCount]] = await conn.query(`SELECT COUNT(*) as c FROM automation_rules WHERE company_id = ? AND is_active = 1`, [companyId]);
      const [[notifCount]] = await conn.query(`SELECT COUNT(*) as c FROM notifications WHERE company_id = ?`, [companyId]);
      const [[unreadCount]] = await conn.query(`SELECT COUNT(*) as c FROM notifications WHERE company_id = ? AND is_read = 0`, [companyId]);
      const [[logCount]] = await conn.query(`SELECT COUNT(*) as c FROM automation_logs WHERE company_id = ?`, [companyId]);
      const [[last24h]] = await conn.query(`SELECT COUNT(*) as c FROM notifications WHERE company_id = ? AND created_at > ?`, [companyId, Date.now() - 86400000]);
      const queryTime = Date.now() - startTime;
      return {
        activeEmployees: Number((empCount as any).c),
        activeRules: Number((ruleCount as any).c),
        totalNotifications: Number((notifCount as any).c),
        unreadNotifications: Number((unreadCount as any).c),
        totalLogEntries: Number((logCount as any).c),
        notificationsLast24h: Number((last24h as any).c),
        queryTimeMs: queryTime,
        estimatedRuleEvalCost: Number((empCount as any).c) * Number((ruleCount as any).c),
      };
    } catch { return null; }
  }),

  // Run all active automation rules for the company
  runRules: protectedProcedure
    .input(z.object({ dryRun: z.boolean().default(false) }).merge(optionalActiveWorkspace))
    .mutation(async ({ ctx, input }) => {
      const { companyId } = await requireAnyOperatorRole(ctx.user as User, input?.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const rules = await db
        .select()
        .from(automationRules)
        .where(and(eq(automationRules.companyId, companyId), eq(automationRules.isActive, true)));

      const emps = await db
        .select()
        .from(employees)
        .where(and(eq(employees.companyId, companyId), eq(employees.status, "active")));

      const allLogs: {
        ruleId: number;
        ruleName: string;
        triggerType: string;
        actionType: string;
        matchCount: number;
        dryRun: boolean;
        matches: { employeeId: number; message: string }[];
        durationMs?: number;
        successCount?: number;
        failureCount?: number;
      }[] = [];

      // Track which employees are already targeted by a rule (conflict detection)
      const targetedEmployees = new Map<number, string[]>();

      for (const rule of rules) {
        const matches = await evaluateRule(rule, emps);

        // Conflict detection: log if an employee is targeted by multiple rules
        const conflicts: number[] = [];
        for (const m of matches) {
          if (!targetedEmployees.has(m.employeeId)) {
            targetedEmployees.set(m.employeeId, []);
          }
          const existing = targetedEmployees.get(m.employeeId)!;
          if (existing.length > 0) conflicts.push(m.employeeId);
          existing.push(rule.name);
        }

        allLogs.push({
          ruleId: rule.id,
          ruleName: rule.name,
          triggerType: rule.triggerType,
          actionType: rule.actionType,
          matchCount: matches.length,
          dryRun: input.dryRun,
          matches: matches.slice(0, 10),
        });

        if (!input.dryRun && matches.length > 0) {
          const ruleStartTime = Date.now();
          // Skip muted rules
          if ((rule as any).isMuted) {
            allLogs[allLogs.length - 1].dryRun = true;
            continue;
          }
          // Skip snoozed rules
          if ((rule as any).snoozeUntil && (rule as any).snoozeUntil > Date.now()) {
            allLogs[allLogs.length - 1].dryRun = true;
            continue;
          }
          // Throttle check: skip if rule ran recently (within throttle window)
          const throttleHours = (rule as any).throttleHours ?? 24;
          if (rule.lastRunAt) {
            const lastRun = new Date(rule.lastRunAt);
            const hoursSince = (Date.now() - lastRun.getTime()) / (1000 * 60 * 60);
            if (hoursSince < throttleHours) {
              allLogs[allLogs.length - 1].dryRun = true; // mark as skipped
              continue;
            }
          }

          // Deduplication: only log employees not already logged for this rule in last 24h
          const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
          const recentLogs = await db
            .select({ employeeId: automationLogs.employeeId })
            .from(automationLogs)
            .where(
              and(
                eq(automationLogs.ruleId, rule.id),
                eq(automationLogs.companyId, companyId),
                gte(automationLogs.createdAt, recentCutoff)
              )
            );
          const recentEmployeeIds = new Set(recentLogs.map((l) => l.employeeId));
          const newMatches = matches.filter((m) => !recentEmployeeIds.has(m.employeeId));

          const ruleEndTime = Date.now();
          const durationMs = ruleEndTime - (allLogs[allLogs.length - 1] as any)._startTime || 0;
          allLogs[allLogs.length - 1].durationMs = durationMs;

          if (newMatches.length > 0) {
            let successCount = 0;
            let failureCount = 0;
            try {
              await db.insert(automationLogs).values(
                newMatches.map((m) => ({
                  ruleId: rule.id,
                  companyId,
                  employeeId: m.employeeId,
                  triggerType: rule.triggerType,
                  actionType: rule.actionType,
                  status: "success",
                  message: m.message,
                  metadata: JSON.stringify(m.metadata),
                }))
              );
              successCount = newMatches.length;
            } catch (err) {
              failureCount = newMatches.length;
            }
            allLogs[allLogs.length - 1].successCount = successCount;
            allLogs[allLogs.length - 1].failureCount = failureCount;

            // Create in-app notifications for notify_admin actions
            // Group by rule to prevent fatigue: max 5 notifications per rule per run
            if (rule.actionType === "notify_admin") {
              try {
                const conn = require("mysql2/promise").createPool(process.env.DATABASE_URL);
                const alertRecipients = (rule as any).alertRecipients ?? "all_admins";
                const groupKey = `rule_${rule.id}_${new Date().toISOString().slice(0, 10)}`;
                // Suppress duplicates: check if this group_key already has notifications today
                const [[existingGroup]] = await conn.query(
                  `SELECT COUNT(*) as c FROM notifications WHERE company_id = ? AND group_key = ?`,
                  [companyId, groupKey]
                );
                if (Number((existingGroup as any).c) === 0) {
                  // Create a single grouped notification instead of one per employee
                  const empNames = newMatches.slice(0, 3).map((m) => `Employee #${m.employeeId}`).join(", ");
                  const extraCount = newMatches.length > 3 ? ` (+${newMatches.length - 3} more)` : "";
                  await conn.query(
                    `INSERT INTO notifications (company_id, title, message, type, category, link, rule_id, affected_employee_id, group_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [companyId, `Automation Alert: ${rule.name}`, `${newMatches.length} employee(s) triggered: ${empNames}${extraCount}`, "warning", "automation", `/hr/workforce-intelligence`, rule.id, newMatches[0].employeeId, groupKey, Date.now()]
                  );
                }
              } catch { /* notifications table may not exist yet */ }
            }
          }

          await db
            .update(automationRules)
            .set({
              lastRunAt: new Date(),
              runCount: sql`${automationRules.runCount} + 1`,
            })
            .where(eq(automationRules.id, rule.id));
        }
      }

      const totalMatches = allLogs.reduce((sum, l) => sum + l.matchCount, 0);
      return { rulesRun: rules.length, totalMatches, dryRun: input.dryRun, logs: allLogs };
    }),

  // Get recent automation logs with failure details
  getLogs: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().default(50),
          ruleId: z.number().optional(),
          statusFilter: z.enum(["all", "success", "failure"]).default("all"),
        })
        .merge(optionalActiveWorkspace),
    )
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user);
      try {
        const mysql = require("mysql2/promise");
        const conn = mysql.createPool(process.env.DATABASE_URL);
        let where = `WHERE l.company_id = ?`;
        const params: unknown[] = [companyId];
        if (input.ruleId) { where += ` AND l.rule_id = ?`; params.push(input.ruleId); }
        if (input.statusFilter !== "all") { where += ` AND l.status = ?`; params.push(input.statusFilter); }
        params.push(input.limit);
        const [rows] = await conn.query(
          `SELECT l.*, r.name as rule_name, r.severity as rule_severity,
             l.retry_count, l.failure_category, l.error_detail, l.duration_ms
           FROM automation_logs l
           LEFT JOIN automation_rules r ON l.rule_id = r.id
           ${where} ORDER BY l.created_at DESC LIMIT ?`,
          params
        );
        return rows as any[];
      } catch {
        const db = await getDb();
        if (!db) return [];
        const conditions = [eq(automationLogs.companyId, companyId)];
        if (input.ruleId) conditions.push(eq(automationLogs.ruleId, input.ruleId));
        return db.select().from(automationLogs).where(and(...conditions)).orderBy(desc(automationLogs.createdAt)).limit(input.limit);
      }
    }),

  // Get failure summary: categorized failures, repeated failures, alert on high failure rate
  getFailureSummary: protectedProcedure
    .input(optionalActiveWorkspace.optional())
    .query(async ({ ctx, input }) => {
    const companyId = await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user);
    try {
      const mysql = require("mysql2/promise");
      const conn = mysql.createPool(process.env.DATABASE_URL);
      const [byCategory] = await conn.query(
        `SELECT failure_category, COUNT(*) as count FROM automation_logs
         WHERE company_id = ? AND status = 'failure' AND failure_category IS NOT NULL
         GROUP BY failure_category ORDER BY count DESC`,
        [companyId]
      );
      const [repeatedRules] = await conn.query(
        `SELECT rule_id, r.name as rule_name, COUNT(*) as failure_count,
           MAX(l.created_at) as last_failure
         FROM automation_logs l
         LEFT JOIN automation_rules r ON l.rule_id = r.id
         WHERE l.company_id = ? AND l.status = 'failure'
         GROUP BY rule_id HAVING failure_count >= 3
         ORDER BY failure_count DESC`,
        [companyId]
      );
      const [totalStats] = await conn.query(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN status='failure' THEN 1 ELSE 0 END) as failures,
           SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) as successes
         FROM automation_logs WHERE company_id = ?`,
        [companyId]
      );
      const stats = (totalStats as any[])[0] || { total: 0, failures: 0, successes: 0 };
      const failureRate = stats.total > 0 ? Math.round((stats.failures / stats.total) * 100) : 0;
      return {
        failureRate,
        totalRuns: Number(stats.total),
        totalFailures: Number(stats.failures),
        totalSuccesses: Number(stats.successes),
        byCategory: (byCategory as any[]).map((r: any) => ({ category: r.failure_category || "unknown", count: Number(r.count) })),
        repeatedFailureRules: (repeatedRules as any[]).map((r: any) => ({ ruleId: r.rule_id, ruleName: r.rule_name, failureCount: Number(r.failure_count), lastFailure: r.last_failure })),
        highFailureAlert: failureRate > 20,
      };
    } catch { return { failureRate: 0, totalRuns: 0, totalFailures: 0, totalSuccesses: 0, byCategory: [], repeatedFailureRules: [], highFailureAlert: false }; }
  }),

  // Emit an event (event-driven trigger)
  emitEvent: protectedProcedure
    .input(
      z
        .object({
          eventType: z.enum([
            "employee_updated",
            "doc_added",
            "new_hire",
            "contract_expiry_soon",
            "booking_overdue",
            "payment_overdue",
            "client_inactive",
          ]),
          entityType: z.enum(["employee", "contract", "booking", "payment", "client"]),
          entityId: z.number(),
          payload: z.record(z.string(), z.unknown()).optional(),
        })
        .merge(optionalActiveWorkspace),
    )
    .mutation(async ({ ctx, input }) => {
      const { companyId } = await requireAnyOperatorRole(ctx.user as User, input?.companyId);
      if (input.entityType === "employee") {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        const [emp] = await db
          .select({ id: employees.id })
          .from(employees)
          .where(and(eq(employees.id, input.entityId), eq(employees.companyId, companyId)))
          .limit(1);
        if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      }
      try {
        const mysql = require("mysql2/promise");
        const conn = mysql.createPool(process.env.DATABASE_URL);
        await conn.query(
          `INSERT INTO automation_events (company_id, event_type, entity_type, entity_id, payload, processed, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)`,
          [companyId, input.eventType, input.entityType, input.entityId, JSON.stringify(input.payload ?? {}), Date.now()]
        );
        return { success: true };
      } catch { return { success: false }; }
    }),

  // Process pending events (evaluate rules triggered by events)
  processEvents: protectedProcedure
    .input(optionalActiveWorkspace.optional())
    .mutation(async ({ ctx, input }) => {
    const { companyId } = await requireAnyOperatorRole(ctx.user as User, input?.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    try {
      const mysql = require("mysql2/promise");
      const conn = mysql.createPool(process.env.DATABASE_URL);
      const [events] = await conn.query(
        `SELECT * FROM automation_events WHERE company_id = ? AND processed = 0 ORDER BY created_at ASC LIMIT 50`,
        [companyId]
      );
      const eventList = events as any[];
      if (eventList.length === 0) return { processed: 0, triggered: 0 };

      // Map event types to rule trigger types
      const eventToTrigger: Record<string, string[]> = {
        employee_updated: ["completeness_below", "no_department"],
        doc_added: ["visa_expiry", "work_permit_expiry", "passport_expiry"],
        new_hire: ["completeness_below", "no_department"],
        contract_expiry_soon: ["contract_expiry"],
        booking_overdue: ["booking_overdue"],
        payment_overdue: ["payment_overdue"],
        client_inactive: ["client_inactive"],
      };

      const rules = await db.select().from(automationRules)
        .where(and(eq(automationRules.companyId, companyId), eq(automationRules.isActive, true)));

      let triggered = 0;
      for (const event of eventList) {
        const relevantTriggers = eventToTrigger[event.event_type] ?? [];
        const relevantRules = rules.filter((r) => relevantTriggers.includes(r.triggerType));

        if (event.entity_type === "employee" && relevantRules.length > 0) {
          const emps = await db.select().from(employees)
            .where(and(eq(employees.companyId, companyId), eq(employees.id, event.entity_id)));
          for (const rule of relevantRules) {
            const matches = await evaluateRule(rule, emps);
            if (matches.length > 0) {
              await db.insert(automationLogs).values(matches.map((m) => ({
                ruleId: rule.id, companyId, employeeId: m.employeeId,
                triggerType: rule.triggerType, actionType: rule.actionType,
                status: "success", message: `[Event: ${event.event_type}] ${m.message}`,
                metadata: JSON.stringify({ ...m.metadata, eventId: event.id }),
              })));
              triggered += matches.length;
            }
          }
        }
        await conn.query(`UPDATE automation_events SET processed = 1, processed_at = ? WHERE id = ?`, [Date.now(), event.id]);
      }
      return { processed: eventList.length, triggered };
    } catch (err) { return { processed: 0, triggered: 0 }; }
  }),

  // Export automation logs as CSV
  exportLogsCsv: protectedProcedure
    .input(z.object({ ruleId: z.number().optional(), days: z.number().default(30) }).merge(optionalActiveWorkspace))
    .mutation(async ({ ctx, input }) => {
      const { companyId } = await requireAnyOperatorRole(ctx.user as User, input?.companyId);
      try {
        const mysql = require("mysql2/promise");
        const conn = mysql.createPool(process.env.DATABASE_URL);
        const since = Date.now() - input.days * 24 * 60 * 60 * 1000;
        let where = `WHERE l.company_id = ? AND l.created_at > ?`;
        const params: unknown[] = [companyId, since];
        if (input.ruleId) { where += ` AND l.rule_id = ?`; params.push(input.ruleId); }
        const [rows] = await conn.query(
          `SELECT l.id, r.name as rule_name, l.trigger_type, l.action_type, l.status,
             l.message, l.failure_category, l.error_detail, l.retry_count, l.duration_ms, l.created_at
           FROM automation_logs l
           LEFT JOIN automation_rules r ON l.rule_id = r.id
           ${where} ORDER BY l.created_at DESC LIMIT 5000`,
          params
        );
        const logRows = rows as any[];
        const header = ["ID","Rule Name","Trigger Type","Action Type","Status","Message","Failure Category","Error Detail","Retry Count","Duration (ms)","Created At"];
        const csvLines = [header.join(",")];
        for (const r of logRows) {
          csvLines.push([
            r.id, `"${(r.rule_name||'').replace(/"/g,'""')}"`, r.trigger_type, r.action_type, r.status,
            `"${(r.message||'').replace(/"/g,'""')}"`, r.failure_category||'', `"${(r.error_detail||'').replace(/"/g,'""')}"`,
            r.retry_count||0, r.duration_ms||'', new Date(r.created_at).toISOString()
          ].join(","));
        }
        const csvContent = csvLines.join("\n");
        const fileKey = `automation-exports/${companyId}/logs-${Date.now()}.csv`;
        const { url } = await storagePut(fileKey, Buffer.from(csvContent, "utf-8"), "text/csv");
        return { url, filename: `automation-logs-${new Date().toISOString().slice(0,10)}.csv`, rowCount: logRows.length };
      } catch (err) { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: String(err) }); }
    }),

  // Export rule history as CSV
  exportRuleHistoryCsv: protectedProcedure
    .input(optionalActiveWorkspace.optional())
    .mutation(async ({ ctx, input }) => {
    const { companyId } = await requireAnyOperatorRole(ctx.user as User, input?.companyId);
    try {
      const mysql = require("mysql2/promise");
      const conn = mysql.createPool(process.env.DATABASE_URL);
      const [rows] = await conn.query(
        `SELECT r.id, r.name, r.trigger_type, r.action_type, r.condition_value, r.severity,
           r.is_active, r.run_count, r.last_run_at, r.throttle_hours, r.alert_recipients,
           r.priority, r.max_retries, r.created_at,
           SUM(CASE WHEN l.status='success' THEN 1 ELSE 0 END) as success_count,
           SUM(CASE WHEN l.status='failure' THEN 1 ELSE 0 END) as failure_count
         FROM automation_rules r
         LEFT JOIN automation_logs l ON r.id = l.rule_id
         WHERE r.company_id = ? GROUP BY r.id ORDER BY r.created_at DESC`,
        [companyId]
      );
      const ruleRows = rows as any[];
      const header = ["ID","Name","Trigger Type","Action Type","Condition","Severity","Active","Total Runs","Success","Failures","Last Run","Throttle Hours","Alert Recipients","Priority","Max Retries","Created At"];
      const csvLines = [header.join(",")];
      for (const r of ruleRows) {
        csvLines.push([
          r.id, `"${(r.name||'').replace(/"/g,'""')}"`, r.trigger_type, r.action_type,
          r.condition_value||'', r.severity||'', r.is_active ? 'Yes':'No',
          r.run_count||0, r.success_count||0, r.failure_count||0,
          r.last_run_at ? new Date(r.last_run_at).toISOString() : '',
          r.throttle_hours||24, r.alert_recipients||'all_admins', r.priority||5, r.max_retries||3,
          new Date(r.created_at).toISOString()
        ].join(","));
      }
      const csvContent = csvLines.join("\n");
      const fileKey = `automation-exports/${companyId}/rule-history-${Date.now()}.csv`;
      const { url } = await storagePut(fileKey, Buffer.from(csvContent, "utf-8"), "text/csv");
      return { url, filename: `rule-history-${new Date().toISOString().slice(0,10)}.csv`, rowCount: ruleRows.length };
    } catch (err) { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: String(err) }); }
  }),

  // Get platform-wide trigger summary (contracts, bookings, payments)
  getPlatformTriggerSummary: protectedProcedure
    .input(optionalActiveWorkspace.optional())
    .query(async ({ ctx, input }) => {
    const companyId = await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user);
    const db = await getDb();
    if (!db) return { contractsExpiringSoon: 0, pendingEvents: 0 };
    try {
      const mysql = require("mysql2/promise");
      const conn = mysql.createPool(process.env.DATABASE_URL);
      // Contracts expiring in 30 days
      const soon = Date.now() + 30 * 24 * 60 * 60 * 1000;
      const [[contractRow]] = await conn.query(
        `SELECT COUNT(*) as c FROM contracts WHERE company_id = ? AND status NOT IN ('signed','completed','cancelled') AND end_date IS NOT NULL AND end_date < ?`,
        [companyId, new Date(soon).toISOString()]
      );
      // Pending unprocessed events
      const [[eventRow]] = await conn.query(
        `SELECT COUNT(*) as c FROM automation_events WHERE company_id = ? AND processed = 0`,
        [companyId]
      );
      return {
        contractsExpiringSoon: Number((contractRow as any).c),
        pendingEvents: Number((eventRow as any).c),
      };
    } catch { return { contractsExpiringSoon: 0, pendingEvents: 0 }; }
  }),

  // ─── Notifications ────────────────────────────────────────────────────────

  // List in-app notifications for the current user/company
  listNotifications: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().default(30),
          unreadOnly: z.boolean().default(false),
        })
        .merge(optionalActiveWorkspace),
    )
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user);
      try {
        const mysql = require("mysql2/promise");
        const conn = mysql.createPool(process.env.DATABASE_URL);
        const whereClause = input.unreadOnly
          ? `WHERE company_id = ? AND is_read = 0 ORDER BY created_at DESC LIMIT ?`
          : `WHERE company_id = ? ORDER BY created_at DESC LIMIT ?`;
        const [rows] = await conn.query(`SELECT * FROM notifications ${whereClause}`, [companyId, input.limit]);
        return rows as {
          id: number; company_id: number; title: string; message: string;
          type: string; category: string; link: string; is_read: number;
          rule_id: number; affected_employee_id: number; created_at: number;
        }[];
      } catch { return []; }
    }),

  // Mark notification(s) as read
  markNotificationsRead: protectedProcedure
    .input(
      z
        .object({
          ids: z.array(z.number()).optional(),
          all: z.boolean().default(false),
        })
        .merge(optionalActiveWorkspace),
    )
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user);
      try {
        const mysql = require("mysql2/promise");
        const conn = mysql.createPool(process.env.DATABASE_URL);
        if (input.all) {
          await conn.query(`UPDATE notifications SET is_read = 1 WHERE company_id = ?`, [companyId]);
        } else if (input.ids && input.ids.length > 0) {
          const placeholders = input.ids.map(() => "?").join(",");
          await conn.query(`UPDATE notifications SET is_read = 1 WHERE company_id = ? AND id IN (${placeholders})`, [companyId, ...input.ids]);
        }
        return { success: true };
      } catch { return { success: false }; }
    }),

  // Get unread notification count (pass companyId when the user belongs to multiple companies)
  getUnreadCount: protectedProcedure
    .input(optionalActiveWorkspace.optional())
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user);
      try {
        const mysql = require("mysql2/promise");
        const conn = mysql.createPool(process.env.DATABASE_URL);
        const [[row]] = await conn.query(
          `SELECT COUNT(*) as count FROM notifications WHERE company_id = ? AND is_read = 0`,
          [companyId]
        );
        return { count: (row as any).count as number };
      } catch {
        return { count: 0 };
      }
    }),

  // ─── Workforce Health KPI ─────────────────────────────────────────────────

  getWorkforceKPI: protectedProcedure
    .input(optionalActiveWorkspace.optional())
    .query(async ({ ctx, input }) => {
    const companyId = await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const emps = await db
      .select()
      .from(employees)
      .where(and(eq(employees.companyId, companyId), eq(employees.status, "active")));

    if (emps.length === 0) {
      return {
        totalEmployees: 0, avgCompletenessScore: 0, criticalCount: 0, warningCount: 0,
        incompleteCount: 0, healthyCount: 0, expiringDocsCount: 0, expiredDocsCount: 0,
        unassignedCount: 0, omanisationRate: 0, healthScore: 100,
        recommendations: [] as { priority: "critical" | "high" | "medium"; message: string; count: number }[],
        expiryTimeline: [] as { date: string; type: string; employeeName: string; daysLeft: number }[],
        departmentBreakdown: [] as { name: string; count: number; avgScore: number }[],
      };
    }

    const now = new Date();
    let criticalCount = 0, warningCount = 0, incompleteCount = 0;
    let expiringDocsCount = 0, expiredDocsCount = 0, unassignedCount = 0, omaniCount = 0;
    const scores: number[] = [];
    const expiryEvents: { date: string; type: string; employeeName: string; daysLeft: number }[] = [];

    for (const emp of emps) {
      const score = calcCompletenessScore(emp);
      scores.push(score);
      if (score < 40) criticalCount++;
      else if (score < 70) warningCount++;
      else if (score < 90) incompleteCount++;
      if (!emp.department) unassignedCount++;
      if (emp.nationality === "Omani" || emp.nationality === "OM") omaniCount++;

      const name = [emp.firstName, emp.lastName].filter(Boolean).join(" ");
      for (const { val, type } of [
        { val: emp.visaExpiryDate, type: "Visa" },
        { val: emp.workPermitExpiryDate, type: "Work Permit" },
      ]) {
        if (!val) continue;
        const expDate = new Date(val);
        const daysLeft = Math.floor((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysLeft < 0) expiredDocsCount++;
        else if (daysLeft <= 30) expiringDocsCount++;
        if (daysLeft >= -30 && daysLeft <= 90) {
          expiryEvents.push({ date: expDate.toISOString().slice(0, 10), type, employeeName: name, daysLeft });
        }
      }
    }

    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const healthyCount = emps.length - criticalCount - warningCount - incompleteCount;
    const omanisationRate = Math.round((omaniCount / emps.length) * 100);
    const healthScore = Math.round(
      (healthyCount / emps.length) * 40 +
      (avgScore / 100) * 30 +
      Math.max(0, 1 - expiredDocsCount / emps.length) * 20 +
      Math.max(0, 1 - unassignedCount / emps.length) * 10
    );

    const recommendations: { priority: "critical" | "high" | "medium"; message: string; count: number }[] = [];
    if (criticalCount > 0) recommendations.push({ priority: "critical", message: `${criticalCount} employee(s) have critically incomplete profiles (<40%)`, count: criticalCount });
    if (expiredDocsCount > 0) recommendations.push({ priority: "critical", message: `${expiredDocsCount} document(s) have already expired — immediate action required`, count: expiredDocsCount });
    if (expiringDocsCount > 0) recommendations.push({ priority: "high", message: `${expiringDocsCount} document(s) expiring within 30 days`, count: expiringDocsCount });
    if (warningCount > 0) recommendations.push({ priority: "high", message: `${warningCount} employee(s) have low profile completeness (40–69%)`, count: warningCount });
    if (unassignedCount > 0) recommendations.push({ priority: "medium", message: `${unassignedCount} employee(s) are not assigned to any department`, count: unassignedCount });
    if (incompleteCount > 0) recommendations.push({ priority: "medium", message: `${incompleteCount} employee(s) have partially complete profiles (70–89%)`, count: incompleteCount });

    const deptMap = new Map<string, { count: number; totalScore: number }>();
    for (const emp of emps) {
      const dept = emp.department || "Unassigned";
      const score = calcCompletenessScore(emp);
      if (!deptMap.has(dept)) deptMap.set(dept, { count: 0, totalScore: 0 });
      const d = deptMap.get(dept)!;
      d.count++;
      d.totalScore += score;
    }
    const departmentBreakdown = Array.from(deptMap.entries())
      .map(([name, { count, totalScore }]) => ({ name, count, avgScore: Math.round(totalScore / count) }))
      .sort((a, b) => b.count - a.count);

    expiryEvents.sort((a, b) => a.daysLeft - b.daysLeft);

    // Save daily snapshot to health_snapshots table
    const today = now.toISOString().slice(0, 10);
    try {
      const mysql = require("mysql2/promise");
      const conn = mysql.createPool(process.env.DATABASE_URL);
      await conn.query(
        `INSERT INTO health_snapshots (company_id, snapshot_date, health_score, avg_completeness, total_employees, critical_count, warning_count, unassigned_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE health_score = VALUES(health_score), avg_completeness = VALUES(avg_completeness), critical_count = VALUES(critical_count)`,
        [companyId, today, healthScore, avgScore, emps.length, criticalCount, warningCount, unassignedCount, Date.now()]
      );
    } catch { /* ignore */ }

    return {
      totalEmployees: emps.length, avgCompletenessScore: avgScore, criticalCount, warningCount,
      incompleteCount, healthyCount, expiringDocsCount, expiredDocsCount, unassignedCount,
      omanisationRate, healthScore, recommendations,
      expiryTimeline: expiryEvents.slice(0, 20),
      departmentBreakdown,
    };
  }),

  // Get historical health trend (last 30 days)
  getHealthTrend: protectedProcedure
    .input(optionalActiveWorkspace.optional())
    .query(async ({ ctx, input }) => {
    const companyId = await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user);
    try {
      const mysql = require("mysql2/promise");
      const conn = mysql.createPool(process.env.DATABASE_URL);
      const [rows] = await conn.query(
        `SELECT snapshot_date, health_score, avg_completeness, total_employees, critical_count, warning_count, unassigned_count
         FROM health_snapshots WHERE company_id = ? ORDER BY snapshot_date ASC LIMIT 30`,
        [companyId]
      );
      return rows as { snapshot_date: string; health_score: number; avg_completeness: number; total_employees: number; critical_count: number; warning_count: number; unassigned_count: number }[];
    } catch { return []; }
  }),

  // Validate employee fields (IBAN, PASI, Civil ID, expiry dates)
  validateEmployeeFields: protectedProcedure
    .input(
      z.object({
        civilId: z.string().optional(),
        iban: z.string().optional(),
        pasiNumber: z.string().optional(),
        visaExpiry: z.string().optional(),
        workPermitExpiry: z.string().optional(),
        passportExpiry: z.string().optional(),
        excludeEmployeeId: z.number().optional(),
      }).merge(optionalActiveWorkspace),
    )
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user);
      const db = await getDb();
      if (!db) return { valid: true, errors: [] };

      const errors: { field: string; message: string }[] = [];

      if (input.iban) {
        const ibanClean = input.iban.replace(/\s/g, "").toUpperCase();
        if (!/^OM\d{2}[A-Z0-9]{18}$/.test(ibanClean)) {
          errors.push({ field: "iban", message: "Invalid Oman IBAN. Expected: OM + 2 digits + 18 alphanumeric (22 chars total)" });
        }
      }

      if (input.pasiNumber) {
        if (!/^\d{10}$/.test(input.pasiNumber)) {
          errors.push({ field: "pasiNumber", message: "PASI number must be exactly 10 digits" });
        }
      }

      if (input.civilId) {
        if (!/^\d{8}$/.test(input.civilId)) {
          errors.push({ field: "civilId", message: "Civil ID must be exactly 8 digits" });
        } else {
          const existing = await db
            .select({ id: employees.id })
            .from(employees)
            .where(and(eq(employees.companyId, companyId), eq(employees.nationalId, input.civilId)))
            .limit(1);
          if (existing.length > 0 && existing[0].id !== input.excludeEmployeeId) {
            errors.push({ field: "civilId", message: "This Civil ID is already registered for another employee" });
          }
        }
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      for (const { key, label } of [
        { key: "visaExpiry", label: "Visa expiry" },
        { key: "workPermitExpiry", label: "Work permit expiry" },
        { key: "passportExpiry", label: "Passport expiry" },
      ]) {
        const val = input[key as keyof typeof input] as string | undefined;
        if (val) {
          const date = new Date(val);
          if (date < today) {
            errors.push({ field: key, message: `${label} date is in the past. Please enter a valid future date.` });
          }
        }
      }

      return { valid: errors.length === 0, errors };
    }),
});
