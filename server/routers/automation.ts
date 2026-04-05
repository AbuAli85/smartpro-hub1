import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, getUserCompany } from "../db";
import {
  automationRules,
  automationLogs,
  workforceHealthSnapshots,
  employees,
} from "../../drizzle/schema";
import type { User } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { requireActiveCompanyId } from "../_core/tenant";

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
  const financial = [
    emp.salary, emp.bankName, emp.bankAccountNumber,
  ];
  const score = (fields: unknown[], weight: number) => {
    const filled = fields.filter((f) => f !== null && f !== undefined && f !== "").length;
    return (filled / fields.length) * weight;
  };
  return Math.round(
    score(identity, 30) +
    score(employment, 20) +
    score(compliance, 30) +
    score(financial, 20)
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
          results.push({
            employeeId: emp.id,
            message: `${fullName(emp)}'s visa expires in ${days} day(s)`,
            metadata: { daysUntilExpiry: days, field: "visaExpiryDate", expiryDate: emp.visaExpiryDate },
          });
        }
        break;
      }
      case "work_permit_expiry": {
        const days = getDaysUntilExpiry(emp.workPermitExpiryDate);
        if (days !== null && days >= 0 && days <= threshold) {
          results.push({
            employeeId: emp.id,
            message: `${fullName(emp)}'s work permit expires in ${days} day(s)`,
            metadata: { daysUntilExpiry: days, field: "workPermitExpiryDate", expiryDate: emp.workPermitExpiryDate },
          });
        }
        break;
      }
      case "passport_expiry": {
        const days = getDaysUntilExpiry(emp.passportNumber ? (emp as any).passportExpiry : null);
        if (days !== null && days >= 0 && days <= threshold) {
          results.push({
            employeeId: emp.id,
            message: `${fullName(emp)}'s passport expires in ${days} day(s)`,
            metadata: { daysUntilExpiry: days, field: "passportExpiry" },
          });
        }
        break;
      }
      case "completeness_below": {
        const score = calcCompletenessScore(emp);
        if (score < threshold) {
          results.push({
            employeeId: emp.id,
            message: `${fullName(emp)}'s profile completeness is ${score}% (below ${threshold}%)`,
            metadata: { completenessScore: score, threshold },
          });
        }
        break;
      }
      case "no_department": {
        if (!emp.department) {
          results.push({
            employeeId: emp.id,
            message: `${fullName(emp)} has no department assigned`,
            metadata: { field: "department" },
          });
        }
        break;
      }
    }
  }
  return results;
}

// ─── Router ───────────────────────────────────────────────────────────────────
export const automationRouter = router({
  // List all automation rules for the company
  listRules: protectedProcedure.query(async ({ ctx }) => {
    const companyId = await requireActiveCompanyId(ctx.user.id);
    const db = await getDb();
    if (!db) return [];

    return db
      .select()
      .from(automationRules)
      .where(eq(automationRules.companyId, companyId))
      .orderBy(desc(automationRules.createdAt));
  }),

  // Create a new automation rule
  createRule: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        triggerType: z.enum([
          "visa_expiry",
          "work_permit_expiry",
          "passport_expiry",
          "completeness_below",
          "no_department",
        ]),
        conditionValue: z.string().optional(),
        actionType: z.enum(["notify_admin", "notify_employee", "create_task", "escalate"]),
        actionPayload: z.string().optional(),
        isActive: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id);
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
      });

      return { id: (result as any).insertId as number, success: true };
    }),

  // Update an automation rule
  updateRule: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        conditionValue: z.string().optional(),
        actionType: z.enum(["notify_admin", "notify_employee", "create_task", "escalate"]).optional(),
        actionPayload: z.string().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { id, ...updates } = input;
      await db
        .update(automationRules)
        .set(updates)
        .where(and(eq(automationRules.id, id), eq(automationRules.companyId, companyId)));

      return { success: true };
    }),

  // Delete an automation rule
  deleteRule: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .delete(automationRules)
        .where(and(eq(automationRules.id, input.id), eq(automationRules.companyId, companyId)));

      return { success: true };
    }),

  // Toggle a rule on/off
  toggleRule: protectedProcedure
    .input(z.object({ id: z.number(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .update(automationRules)
        .set({ isActive: input.isActive })
        .where(and(eq(automationRules.id, input.id), eq(automationRules.companyId, companyId)));

      return { success: true };
    }),

  // Run all active automation rules for the company
  runRules: protectedProcedure.mutation(async ({ ctx }) => {
    const companyId = await requireActiveCompanyId(ctx.user.id);
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
      matches: { employeeId: number; message: string; metadata: Record<string, unknown> }[];
    }[] = [];

    for (const rule of rules) {
      const matches = await evaluateRule(rule, emps);
      allLogs.push({
        ruleId: rule.id,
        ruleName: rule.name,
        triggerType: rule.triggerType,
        actionType: rule.actionType,
        matches,
      });

      if (matches.length > 0) {
        await db.insert(automationLogs).values(
          matches.map((m) => ({
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
      }

      await db
        .update(automationRules)
        .set({
          lastRunAt: new Date(),
          runCount: sql`${automationRules.runCount} + 1`,
        })
        .where(eq(automationRules.id, rule.id));
    }

    const totalMatches = allLogs.reduce((sum, l) => sum + l.matches.length, 0);
    return { rulesRun: rules.length, totalMatches, logs: allLogs };
  }),

  // Get recent automation logs
  getLogs: protectedProcedure
    .input(z.object({ limit: z.number().default(50), ruleId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id);
      const db = await getDb();
      if (!db) return [];

      const conditions = [eq(automationLogs.companyId, companyId)];
      if (input.ruleId) conditions.push(eq(automationLogs.ruleId, input.ruleId));

      return db
        .select()
        .from(automationLogs)
        .where(and(...conditions))
        .orderBy(desc(automationLogs.createdAt))
        .limit(input.limit);
    }),

  // ─── Workforce Health KPI ─────────────────────────────────────────────────

  getWorkforceKPI: protectedProcedure.query(async ({ ctx }) => {
    const companyId = await requireActiveCompanyId(ctx.user.id);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const emps = await db
      .select()
      .from(employees)
      .where(and(eq(employees.companyId, companyId), eq(employees.status, "active")));

    if (emps.length === 0) {
      return {
        totalEmployees: 0,
        avgCompletenessScore: 0,
        criticalCount: 0,
        warningCount: 0,
        incompleteCount: 0,
        healthyCount: 0,
        expiringDocsCount: 0,
        expiredDocsCount: 0,
        unassignedCount: 0,
        omanisationRate: 0,
        healthScore: 100,
        recommendations: [] as { priority: "critical" | "high" | "medium"; message: string; count: number }[],
        expiryTimeline: [] as { date: string; type: string; employeeName: string; daysLeft: number }[],
        departmentBreakdown: [] as { name: string; count: number; avgScore: number }[],
      };
    }

    const now = new Date();

    let criticalCount = 0;
    let warningCount = 0;
    let incompleteCount = 0;
    let expiringDocsCount = 0;
    let expiredDocsCount = 0;
    let unassignedCount = 0;
    let omaniCount = 0;
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
      const expiryFields = [
        { val: emp.visaExpiryDate, type: "Visa" },
        { val: emp.workPermitExpiryDate, type: "Work Permit" },
      ];

      for (const { val, type } of expiryFields) {
        if (!val) continue;
        const expDate = new Date(val);
        const daysLeft = Math.floor((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (daysLeft < 0) expiredDocsCount++;
        else if (daysLeft <= 30) expiringDocsCount++;

        if (daysLeft >= -30 && daysLeft <= 90) {
          expiryEvents.push({
            date: expDate.toISOString().slice(0, 10),
            type,
            employeeName: name,
            daysLeft,
          });
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

    // Department breakdown
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

    // Save daily snapshot
    const today = now.toISOString().slice(0, 10);
    try {
      await db
        .insert(workforceHealthSnapshots)
        .values({
          companyId,
          snapshotDate: today,
          totalEmployees: emps.length,
          avgCompletenessScore: String(avgScore),
          criticalCount,
          warningCount,
          incompleteCount,
          healthyCount,
          expiringDocsCount,
          expiredDocsCount,
          unassignedCount,
          omanisationRate: String(omanisationRate),
        });
    } catch {
      // Snapshot already exists for today — ignore duplicate
    }

    return {
      totalEmployees: emps.length,
      avgCompletenessScore: avgScore,
      criticalCount,
      warningCount,
      incompleteCount,
      healthyCount,
      expiringDocsCount,
      expiredDocsCount,
      unassignedCount,
      omanisationRate,
      healthScore,
      recommendations,
      expiryTimeline: expiryEvents.slice(0, 20),
      departmentBreakdown,
    };
  }),

  // Get historical health trend
  getHealthTrend: protectedProcedure.query(async ({ ctx }) => {
    const companyId = await requireActiveCompanyId(ctx.user.id);
    const db = await getDb();
    if (!db) return [];

    const snapshots = await db
      .select()
      .from(workforceHealthSnapshots)
      .where(eq(workforceHealthSnapshots.companyId, companyId))
      .orderBy(desc(workforceHealthSnapshots.snapshotDate))
      .limit(30);

    return snapshots.reverse();
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
      })
    )
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id);
      const db = await getDb();
      if (!db) return { valid: true, errors: [] };

      const errors: { field: string; message: string }[] = [];

      // IBAN validation (Oman: OM + 2 digits + 18 alphanumeric = 22 chars)
      if (input.iban) {
        const ibanClean = input.iban.replace(/\s/g, "").toUpperCase();
        if (!/^OM\d{2}[A-Z0-9]{18}$/.test(ibanClean)) {
          errors.push({ field: "iban", message: "Invalid Oman IBAN. Expected: OM + 2 digits + 18 alphanumeric (22 chars total)" });
        }
      }

      // PASI number validation (Oman: 10 digits)
      if (input.pasiNumber) {
        if (!/^\d{10}$/.test(input.pasiNumber)) {
          errors.push({ field: "pasiNumber", message: "PASI number must be exactly 10 digits" });
        }
      }

      // Civil ID validation (Oman: 8 digits)
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

      // No-past-date expiry validation
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const expiryChecks = [
        { key: "visaExpiry", label: "Visa expiry" },
        { key: "workPermitExpiry", label: "Work permit expiry" },
        { key: "passportExpiry", label: "Passport expiry" },
      ];
      for (const { key, label } of expiryChecks) {
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
