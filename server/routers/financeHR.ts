import { z } from "zod";
import { and, desc, eq, gte, inArray, isNull, lte, sum, count } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  expenseClaims, trainingRecords, employeeSelfReviews,
  employees, payrollRuns, payrollLineItems, companyMembers,
  companyRevenueRecords, employeeCostRecords, employeeWpsValidations,
} from "../../drizzle/schema";
import { computeMargin, type FinancialEngineResult } from "../../shared/financialEngine";
import type { User } from "../../drizzle/schema";
import { optionalActiveWorkspace } from "../_core/workspaceInput";
import { requireActiveCompanyId } from "../_core/tenant";
import { requireFinanceOrAdmin } from "../_core/policy";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { HR_PERF, memberHasHrPerformancePermission } from "@shared/hrPerformancePermissions";
import {
  assertSelfReviewManagerUpdateAllowed,
  assertTrainingStatusTransition,
  type TrainingStatus,
} from "../hrPerformanceGuards";
import {
  insertHrPerformanceAuditEvent,
  selfReviewAuditSnapshot,
  trainingRecordAuditSnapshot,
} from "../hrPerformanceAudit";
import { fetchHrPerformanceDashboard } from "../hrPerformanceReadModels";

export type PnlDataQualityStatus = "complete" | "partial" | "needs_review";
export type WpsQualityScope = "period" | "company_fallback" | "none";

interface WpsValidationSummaryRow {
  id: number;
  employeeId: number;
  result: "ready" | "invalid" | "missing";
  validatedAt: Date;
}

interface WpsValidationQualitySummary {
  missingCount: number;
  invalidCount: number;
  employeeCount: number;
}

export interface DerivePnlDataQualityInput {
  revenueRecordCount: number;
  employeeCostRecordCount: number;
  overheadOmr: number;
  wpsMissingCount: number;
  wpsInvalidCount: number;
  wpsQualityScope: WpsQualityScope;
}

export interface DerivedPnlDataQuality {
  status: PnlDataQualityStatus;
  messages: string[];
}

function summarizeLatestWpsValidation(
  rows: WpsValidationSummaryRow[],
): WpsValidationQualitySummary {
  const latestByEmployee = new Map<number, WpsValidationSummaryRow>();
  for (const row of rows) {
    const existing = latestByEmployee.get(row.employeeId);
    if (
      !existing ||
      row.validatedAt.getTime() > existing.validatedAt.getTime() ||
      (row.validatedAt.getTime() === existing.validatedAt.getTime() && row.id > existing.id)
    ) {
      latestByEmployee.set(row.employeeId, row);
    }
  }

  let missingCount = 0;
  let invalidCount = 0;
  for (const row of latestByEmployee.values()) {
    if (row.result === "missing") missingCount += 1;
    if (row.result === "invalid") invalidCount += 1;
  }
  return { missingCount, invalidCount, employeeCount: latestByEmployee.size };
}

export function derivePnlDataQuality(input: DerivePnlDataQualityInput): DerivedPnlDataQuality {
  const messages: string[] = [];
  let status: PnlDataQualityStatus = "complete";

  if (input.revenueRecordCount === 0 && input.employeeCostRecordCount === 0) {
    return {
      status: "needs_review",
      messages: ["No revenue or employee cost records found for this period."],
    };
  }

  if (input.revenueRecordCount === 0) {
    status = "partial";
    messages.push("Revenue entries are missing for this period.");
  }
  if (input.employeeCostRecordCount === 0) {
    status = "partial";
    messages.push("Employee cost entries are missing for this period.");
  }
  if (input.overheadOmr <= 0) {
    status = "partial";
    messages.push("No overhead allocation is included in this period.");
  }

  const wpsIssues = input.wpsMissingCount + input.wpsInvalidCount;
  if (input.wpsQualityScope === "none") {
    status = "partial";
    messages.push("No WPS validation records were found for this period.");
  } else if (input.wpsQualityScope === "company_fallback") {
    status = "partial";
    messages.push("Using company-level WPS validation fallback; period-specific validation is unavailable.");
  }
  if (wpsIssues > 0) {
    status = "partial";
    messages.push(`WPS readiness issues found for ${wpsIssues} employee record(s).`);
  }

  return { status, messages };
}

/**
 * HR performance keys: role defaults ∪ company_members.permissions (see shared/hrPerformancePermissions.ts).
 */
async function hasCompanyPermission(
  user: Pick<User, "id" | "role" | "platformRole">,
  companyId: number,
  permission: string
): Promise<boolean> {
  if (canAccessGlobalAdminProcedures(user)) return true;
  const db = await getDb();
  if (!db) return false;
  const [member] = await db
    .select({ role: companyMembers.role, permissions: companyMembers.permissions })
    .from(companyMembers)
    .where(
      and(
        eq(companyMembers.userId, user.id),
        eq(companyMembers.companyId, companyId),
        eq(companyMembers.isActive, true)
      )
    )
    .limit(1);
  if (!member) return false;
  return memberHasHrPerformancePermission(member, permission);
}

/** List/detail self-review content — stricter than overview: requires `hr.self_reviews.read` and/or HR manage, not generic `hr.performance.read` alone (e.g. finance_admin). */
async function assertCanReadSelfReviews(user: User, companyId: number): Promise<void> {
  if (await hasCompanyPermission(user, companyId, HR_PERF.SELF_READ)) return;
  if (await hasCompanyPermission(user, companyId, HR_PERF.MANAGE)) return;
  throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to view self-reviews." });
}

async function assertCanReviewSelfReviews(user: User, companyId: number): Promise<void> {
  if (await hasCompanyPermission(user, companyId, "hr.performance.manage")) return;
  if (await hasCompanyPermission(user, companyId, "hr.self_reviews.review")) return;
  throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to update self-reviews." });
}

async function assertCanManageTraining(user: User, companyId: number): Promise<void> {
  if (await hasCompanyPermission(user, companyId, "hr.performance.manage")) return;
  if (await hasCompanyPermission(user, companyId, "hr.training.manage")) return;
  throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to manage training records." });
}

/** Read models for HR performance dashboards (aggregates; not raw entity lists). */
async function assertCanReadHrPerformanceOverview(user: User, companyId: number): Promise<void> {
  if (await hasCompanyPermission(user, companyId, HR_PERF.READ)) return;
  if (await hasCompanyPermission(user, companyId, HR_PERF.SELF_READ)) return;
  if (await hasCompanyPermission(user, companyId, HR_PERF.TRAINING_MANAGE)) return;
  if (await hasCompanyPermission(user, companyId, HR_PERF.MANAGE)) return;
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "You do not have permission to view HR performance overview.",
  });
}

async function resolveEmployee(userId: number, companyId: number) {
  const db = await getDb();
  if (!db) return null;
  const [emp] = await db.select().from(employees)
    .where(and(eq(employees.userId, userId), eq(employees.companyId, companyId))).limit(1);
  return emp ?? null;
}

export const financeHRRouter = router({
  // ─── Expense Claims (Employee) ────────────────────────────────────────────
  submitExpense: protectedProcedure
    .input(z.object({
      expenseDate: z.string(),  // maps to claimDate
      category: z.enum(["travel", "meals", "accommodation", "equipment", "communication", "training", "medical", "other"]),
      amount: z.string(),
      currency: z.string().default("OMR"),
      description: z.string().min(3),
      receiptUrl: z.string().optional(),
    }).merge(optionalActiveWorkspace))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const emp = await resolveEmployee(ctx.user.id, companyId);
      const empUserId = emp?.id ?? ctx.user.id;
      await db.insert(expenseClaims).values({
        companyId,
        employeeUserId: empUserId,
        claimDate: input.expenseDate,
        expenseCategory: input.category,
        amount: input.amount,
        currency: input.currency,
        description: input.description,
        receiptUrl: input.receiptUrl,
        expenseStatus: "pending",
      });
      return { success: true };
    }),

  myExpenses: protectedProcedure
    .input(z.object({ status: z.string().optional() }).merge(optionalActiveWorkspace).optional())
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user);
      const db = await getDb();
      if (!db) return [];
      const emp = await resolveEmployee(ctx.user.id, companyId);
      const empUserId = emp?.id ?? ctx.user.id;
      const conditions = [eq(expenseClaims.companyId, companyId), eq(expenseClaims.employeeUserId, empUserId)];
      if (input?.status && input.status !== "all") {
        conditions.push(eq(expenseClaims.expenseStatus, input.status as "pending" | "approved" | "rejected" | "cancelled"));
      }
      return db.select().from(expenseClaims).where(and(...conditions)).orderBy(desc(expenseClaims.createdAt));
    }),

  cancelExpense: protectedProcedure
    .input(z.object({ id: z.number() }).merge(optionalActiveWorkspace))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const emp = await resolveEmployee(ctx.user.id, companyId);
      const empUserId = emp?.id ?? ctx.user.id;
      await db.update(expenseClaims)
        .set({ expenseStatus: "cancelled" })
        .where(and(
          eq(expenseClaims.id, input.id),
          eq(expenseClaims.employeeUserId, empUserId),
          eq(expenseClaims.expenseStatus, "pending"),
        ));
      return { success: true };
    }),

  // ─── Expense Claims (Admin) ───────────────────────────────────────────────
  adminListExpenses: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      status: z.string().optional(),
      fromDate: z.string().optional(),
      toDate: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const { companyId } = await requireFinanceOrAdmin(ctx.user as User, input?.companyId);
      const conditions = [eq(expenseClaims.companyId, companyId)];
      if (input?.status && input.status !== "all") {
        conditions.push(eq(expenseClaims.expenseStatus, input.status as "pending" | "approved" | "rejected" | "cancelled"));
      }
      if (input?.fromDate) conditions.push(gte(expenseClaims.claimDate, input.fromDate));
      if (input?.toDate) conditions.push(lte(expenseClaims.claimDate, input.toDate));
      const rows = await db.select({
        claim: expenseClaims,
        empName: employees.firstName,
        empLastName: employees.lastName,
        empDept: employees.department,
      }).from(expenseClaims)
        .leftJoin(employees, eq(employees.id, expenseClaims.employeeUserId))
        .where(and(...conditions))
        .orderBy(desc(expenseClaims.createdAt));
      return rows.map(r => ({
        ...r.claim,
        employeeName: r.empName && r.empLastName ? `${r.empName} ${r.empLastName}` : r.empName ?? "Unknown",
        department: r.empDept ?? "",
      }));
    }),

  reviewExpense: protectedProcedure
    .input(z.object({
      id: z.number(),
      action: z.enum(["approved", "rejected"]),
      adminNotes: z.string().optional(),
    }).merge(optionalActiveWorkspace))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      await db.update(expenseClaims)
        .set({
          expenseStatus: input.action,
          adminNotes: input.adminNotes,
          reviewedByUserId: ctx.user.id,
          reviewedAt: new Date(),
        })
        .where(and(eq(expenseClaims.id, input.id), eq(expenseClaims.companyId, companyId)));
      return { success: true };
    }),

  expenseSummary: protectedProcedure
    .input(z.object({ companyId: z.number().optional(), year: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { total: 0, pending: 0, approved: 0, rejected: 0, byCategory: [] };
      const { companyId } = await requireFinanceOrAdmin(ctx.user as User, input?.companyId);
      const year = input?.year ?? new Date().getFullYear();
      const fromDate = `${year}-01-01`;
      const toDate = `${year}-12-31`;
      const rows = await db.select().from(expenseClaims)
        .where(and(
          eq(expenseClaims.companyId, companyId),
          gte(expenseClaims.claimDate, fromDate),
          lte(expenseClaims.claimDate, toDate),
        ));
      const total = rows.reduce((s, r) => s + parseFloat(r.amount), 0);
      const pending = rows.filter(r => r.expenseStatus === "pending").reduce((s, r) => s + parseFloat(r.amount), 0);
      const approved = rows.filter(r => r.expenseStatus === "approved").reduce((s, r) => s + parseFloat(r.amount), 0);
      const rejected = rows.filter(r => r.expenseStatus === "rejected").reduce((s, r) => s + parseFloat(r.amount), 0);
      const catMap: Record<string, number> = {};
      rows.filter(r => r.expenseStatus === "approved").forEach(r => {
        catMap[r.expenseCategory] = (catMap[r.expenseCategory] ?? 0) + parseFloat(r.amount);
      });
      const byCategory = Object.entries(catMap).map(([cat, amt]) => ({ category: cat, amount: amt }));
      return { total, pending, approved, rejected, byCategory };
    }),

  // ─── Finance Overview ─────────────────────────────────────────────────────
  financeOverview: protectedProcedure
    .input(z.object({ companyId: z.number().optional(), year: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const { companyId } = await requireFinanceOrAdmin(ctx.user as User, input?.companyId);
      const year = input?.year ?? new Date().getFullYear();
      // Payroll cost per month from payrollRuns
      const payrollData = await db.select().from(payrollRuns)
        .where(and(eq(payrollRuns.companyId, companyId), eq(payrollRuns.periodYear, year)));
      const payrollByMonth: Record<number, number> = {};
      for (const run of payrollData) {
        const month = run.periodMonth;
        const lineItems = await db.select().from(payrollLineItems).where(eq(payrollLineItems.payrollRunId, run.id));
        const total = lineItems.reduce((s, li) => s + parseFloat(li.netSalary ?? "0"), 0);
        payrollByMonth[month] = (payrollByMonth[month] ?? 0) + total;
      }
      // Expense claims approved per month
      const expenseData = await db.select().from(expenseClaims)
        .where(and(
          eq(expenseClaims.companyId, companyId),
          eq(expenseClaims.expenseStatus, "approved"),
          gte(expenseClaims.claimDate, `${year}-01-01`),
          lte(expenseClaims.claimDate, `${year}-12-31`),
        ));
      const expenseByMonth: Record<number, number> = {};
      expenseData.forEach(e => {
        const month = parseInt(e.claimDate.split("-")[1]);
        expenseByMonth[month] = (expenseByMonth[month] ?? 0) + parseFloat(e.amount);
      });
      const months = Array.from({ length: 12 }, (_, i) => i + 1);
      const monthlyData = months.map(m => ({
        month: m,
        payrollCost: payrollByMonth[m] ?? 0,
        expenseCost: expenseByMonth[m] ?? 0,
        totalCost: (payrollByMonth[m] ?? 0) + (expenseByMonth[m] ?? 0),
      }));
      const totalPayroll = Object.values(payrollByMonth).reduce((s, v) => s + v, 0);
      const totalExpenses = expenseData.reduce((s, e) => s + parseFloat(e.amount), 0);
      const pendingExpenses = await db.select().from(expenseClaims)
        .where(and(eq(expenseClaims.companyId, companyId), eq(expenseClaims.expenseStatus, "pending")));
      const pendingExpenseTotal = pendingExpenses.reduce((s, e) => s + parseFloat(e.amount), 0);
      const pendingExpenseCount = pendingExpenses.length;
      return {
        year,
        totalPayroll,
        totalExpenses,
        totalCost: totalPayroll + totalExpenses,
        pendingExpenseTotal,
        pendingExpenseCount,
        monthlyData,
        payrollRunCount: payrollData.length,
      };
    }),

  // ─── Training Records (Employee) ─────────────────────────────────────────
  myTraining: protectedProcedure
    .input(optionalActiveWorkspace.optional())
    .query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return [];
    const companyId = await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user);
    const emp = await resolveEmployee(ctx.user.id, companyId);
    const empUserId = emp?.id ?? ctx.user.id;
    return db.select().from(trainingRecords)
      .where(and(eq(trainingRecords.companyId, companyId), eq(trainingRecords.employeeUserId, empUserId)))
      .orderBy(desc(trainingRecords.createdAt));
  }),

  updateTrainingStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["assigned", "in_progress", "completed", "overdue"]),
    }).merge(optionalActiveWorkspace))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const emp = await resolveEmployee(ctx.user.id, companyId);
      const empUserId = emp?.id ?? ctx.user.id;
      const [row] = await db
        .select()
        .from(trainingRecords)
        .where(
          and(
            eq(trainingRecords.id, input.id),
            eq(trainingRecords.companyId, companyId),
            eq(trainingRecords.employeeUserId, empUserId)
          )
        )
        .limit(1);
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Training record not found" });
      }
      assertTrainingStatusTransition(row.trainingStatus as TrainingStatus, input.status);
      await db
        .update(trainingRecords)
        .set({
          trainingStatus: input.status,
          completedAt: input.status === "completed" ? new Date() : undefined,
        })
        .where(
          and(
            eq(trainingRecords.id, input.id),
            eq(trainingRecords.companyId, companyId),
            eq(trainingRecords.employeeUserId, empUserId)
          )
        );
      return { success: true };
    }),

  // ─── Training Records (Admin) ─────────────────────────────────────────────
  adminAssignTraining: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      employeeId: z.number(),
      title: z.string().min(2),
      provider: z.string().optional(),
      description: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      dueDate: z.string().optional(),
      durationHours: z.number().optional(),
      category: z.enum(["technical", "compliance", "leadership", "safety", "soft_skills", "other"]).default("other"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      await assertCanManageTraining(ctx.user, companyId);

      await db.transaction(async (tx) => {
        const insertResult = await tx.insert(trainingRecords).values({
          companyId,
          employeeUserId: input.employeeId,
          title: input.title,
          provider: input.provider,
          description: input.description,
          startDate: input.startDate,
          endDate: input.endDate,
          dueDate: input.dueDate,
          durationHours: input.durationHours,
          trainingCategory: input.category,
          trainingStatus: "assigned",
          assignedByUserId: ctx.user.id,
        });
        const newId = Number(insertResult[0].insertId);
        await insertHrPerformanceAuditEvent(tx, {
          companyId,
          actorUserId: ctx.user.id,
          entityType: "training_record",
          entityId: newId,
          action: "training.assigned",
          beforeState: null,
          afterState: {
            ...trainingRecordAuditSnapshot({
              trainingStatus: "assigned",
              score: null,
              certificateUrl: null,
              completedAt: null,
              employeeUserId: input.employeeId,
            }),
            title: input.title,
            provider: input.provider ?? null,
            trainingCategory: input.category,
          },
        });
      });
      return { success: true };
    }),

  adminListTraining: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const companyId = await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user);
      await assertCanReadHrPerformanceOverview(ctx.user, companyId);
      const rows = await db.select({
        training: trainingRecords,
        empName: employees.firstName,
        empLastName: employees.lastName,
        empDept: employees.department,
      }).from(trainingRecords)
        .leftJoin(employees, eq(employees.id, trainingRecords.employeeUserId))
        .where(eq(trainingRecords.companyId, companyId))
        .orderBy(desc(trainingRecords.createdAt));
      return rows.map(r => ({
        ...r.training,
        employeeName: r.empName && r.empLastName ? `${r.empName} ${r.empLastName}` : r.empName ?? "Unknown",
        department: r.empDept ?? "",
      }));
    }),

  // ─── Self Reviews ─────────────────────────────────────────────────────────
  mySelfReviews: protectedProcedure
    .input(optionalActiveWorkspace.optional())
    .query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return [];
    const companyId = await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user);
    const emp = await resolveEmployee(ctx.user.id, companyId);
    const empUserId = emp?.id ?? ctx.user.id;
    return db.select().from(employeeSelfReviews)
      .where(and(eq(employeeSelfReviews.companyId, companyId), eq(employeeSelfReviews.employeeUserId, empUserId)))
      .orderBy(desc(employeeSelfReviews.createdAt));
  }),

  submitSelfReview: protectedProcedure
    .input(z.object({
      reviewPeriod: z.string(),
      selfRating: z.number().min(1).max(5),
      selfAchievements: z.string().min(10),
      selfGoals: z.string().min(10),
    }).merge(optionalActiveWorkspace))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const emp = await resolveEmployee(ctx.user.id, companyId);
      const empUserId = emp?.id ?? ctx.user.id;
      await db.insert(employeeSelfReviews).values({
        companyId,
        employeeUserId: empUserId,
        reviewPeriod: input.reviewPeriod,
        selfRating: input.selfRating,
        selfAchievements: input.selfAchievements,
        selfGoals: input.selfGoals,
        reviewStatus: "submitted",
        submittedAt: new Date(),
      });
      return { success: true };
    }),

  adminUpdateTraining: protectedProcedure
    .input(z.object({
      id: z.number(),
      trainingStatus: z.enum(["assigned", "in_progress", "completed", "overdue"]).optional(),
      score: z.number().min(0).max(100).optional(),
      certificateUrl: z.string().max(1000).optional().nullable(),
    }).merge(optionalActiveWorkspace))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      await assertCanManageTraining(ctx.user, companyId);

      const [row] = await db.select().from(trainingRecords).where(eq(trainingRecords.id, input.id)).limit(1);
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Training record not found" });
      }
      if (row.companyId !== companyId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      const [emp] = await db
        .select()
        .from(employees)
        .where(and(eq(employees.id, row.employeeUserId), eq(employees.companyId, companyId)))
        .limit(1);
      if (!emp) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      if (input.trainingStatus !== undefined && input.trainingStatus !== row.trainingStatus) {
        assertTrainingStatusTransition(row.trainingStatus as TrainingStatus, input.trainingStatus);
      }

      const beforeSnapshot = trainingRecordAuditSnapshot(row);

      const afterMerged = {
        ...row,
        ...(input.trainingStatus !== undefined && {
          trainingStatus: input.trainingStatus,
          completedAt: input.trainingStatus === "completed" ? new Date() : null,
        }),
        ...(input.score !== undefined && { score: input.score }),
        ...(input.certificateUrl !== undefined && { certificateUrl: input.certificateUrl ?? null }),
      };

      await db.transaction(async (tx) => {
        await tx
          .update(trainingRecords)
          .set({
            ...(input.trainingStatus !== undefined && {
              trainingStatus: input.trainingStatus,
              completedAt: input.trainingStatus === "completed" ? new Date() : null,
            }),
            ...(input.score !== undefined && { score: input.score }),
            ...(input.certificateUrl !== undefined && { certificateUrl: input.certificateUrl ?? null }),
          })
          .where(eq(trainingRecords.id, input.id));

        await insertHrPerformanceAuditEvent(tx, {
          companyId,
          actorUserId: ctx.user.id,
          entityType: "training_record",
          entityId: row.id,
          action: "training.updated",
          beforeState: beforeSnapshot,
          afterState: trainingRecordAuditSnapshot(afterMerged),
        });
      });
      return { success: true };
    }),

  adminListSelfReviews: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const companyId = await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user);
      await assertCanReadSelfReviews(ctx.user, companyId);

      const rows = await db
        .select({
          review: employeeSelfReviews,
          empFirst: employees.firstName,
          empLast: employees.lastName,
          empDept: employees.department,
          empPosition: employees.position,
        })
        .from(employeeSelfReviews)
        .leftJoin(employees, eq(employees.id, employeeSelfReviews.employeeUserId))
        .where(eq(employeeSelfReviews.companyId, companyId))
        .orderBy(desc(employeeSelfReviews.createdAt));
      return rows.map((r) => ({
        ...r.review,
        employeeName: r.empFirst && r.empLast ? `${r.empFirst} ${r.empLast}` : (r.empFirst ?? "Unknown"),
        department: r.empDept ?? "",
        position: r.empPosition ?? "",
      }));
    }),

  adminUpdateSelfReview: protectedProcedure
    .input(z.object({
      id: z.number(),
      managerRating: z.number().min(1).max(5).optional(),
      managerFeedback: z.string().optional(),
      goalsNextPeriod: z.string().optional(),
      reviewStatus: z.enum(["draft", "submitted", "reviewed", "acknowledged"]).optional(),
    }).merge(optionalActiveWorkspace))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      await assertCanReviewSelfReviews(ctx.user, companyId);

      const [row] = await db.select().from(employeeSelfReviews).where(eq(employeeSelfReviews.id, input.id)).limit(1);
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Self-review not found" });
      }
      if (row.companyId !== companyId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      const [emp] = await db
        .select()
        .from(employees)
        .where(and(eq(employees.id, row.employeeUserId), eq(employees.companyId, companyId)))
        .limit(1);
      if (!emp) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      const { transitioningToReviewed } = assertSelfReviewManagerUpdateAllowed(row, input);

      const beforeSnapshot = selfReviewAuditSnapshot(row);

      const afterMerged = {
        ...row,
        ...(input.managerRating !== undefined && { managerRating: input.managerRating }),
        ...(input.managerFeedback !== undefined && { managerFeedback: input.managerFeedback }),
        ...(input.goalsNextPeriod !== undefined && { goalsNextPeriod: input.goalsNextPeriod }),
        ...(input.reviewStatus !== undefined && { reviewStatus: input.reviewStatus }),
        ...(transitioningToReviewed ? { reviewedAt: new Date(), reviewedByUserId: ctx.user.id } : {}),
      };

      await db.transaction(async (tx) => {
        await tx
          .update(employeeSelfReviews)
          .set({
            ...(input.managerRating !== undefined && { managerRating: input.managerRating }),
            ...(input.managerFeedback !== undefined && { managerFeedback: input.managerFeedback }),
            ...(input.goalsNextPeriod !== undefined && { goalsNextPeriod: input.goalsNextPeriod }),
            ...(input.reviewStatus !== undefined && { reviewStatus: input.reviewStatus }),
            ...(transitioningToReviewed ? { reviewedAt: new Date(), reviewedByUserId: ctx.user.id } : {}),
          })
          .where(eq(employeeSelfReviews.id, input.id));

        await insertHrPerformanceAuditEvent(tx, {
          companyId,
          actorUserId: ctx.user.id,
          entityType: "self_review",
          entityId: row.id,
          action: transitioningToReviewed ? "self_review.reviewed" : "self_review.updated",
          beforeState: beforeSnapshot,
          afterState: selfReviewAuditSnapshot(afterMerged),
        });
      });
      return { success: true };
    }),

  // ─── HR performance dashboard (composed read models, PR-4) ───────────────
  getHrPerformanceDashboard: protectedProcedure
    .input(
      z
        .object({
          companyId: z.number().optional(),
          year: z.number().optional(),
          month: z.number().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const companyId = await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user);
      await assertCanReadHrPerformanceOverview(ctx.user, companyId);
      const year = input?.year ?? new Date().getFullYear();
      const month = input?.month ?? new Date().getMonth() + 1;
      return fetchHrPerformanceDashboard(db, companyId, { year, month });
    }),

  // ── Financial Engine v1 ─────────────────────────────────────────────────────────

  /** Record a revenue entry for the company. */
  recordRevenue: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      periodYear: z.number().int().min(2020).max(2100),
      periodMonth: z.number().int().min(1).max(12),
      amountOmr: z.number().min(0),
      revenueType: z.enum(["subscription", "deployment_fee", "per_transaction", "setup_fee", "other"]).default("deployment_fee"),
      notes: z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.insert(companyRevenueRecords).values({
        companyId: cid,
        periodYear: input.periodYear,
        periodMonth: input.periodMonth,
        amountOmr: String(input.amountOmr),
        revenueType: input.revenueType,
        notes: input.notes ?? null,
        recordedByUserId: ctx.user.id,
      });
      return { ok: true };
    }),

  /** Record an employee cost entry. */
  recordEmployeeCost: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      employeeId: z.number(),
      periodYear: z.number().int().min(2020).max(2100),
      periodMonth: z.number().int().min(1).max(12),
      basicSalary: z.number().min(0),
      housingAllowance: z.number().min(0).default(0),
      transportAllowance: z.number().min(0).default(0),
      otherAllowances: z.number().min(0).default(0),
      pasiContribution: z.number().min(0).default(0),
      overheadAllocation: z.number().min(0).default(0),
      notes: z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const totalCost = input.basicSalary + input.housingAllowance + input.transportAllowance +
        input.otherAllowances + input.pasiContribution + input.overheadAllocation;
      await db.insert(employeeCostRecords).values({
        companyId: cid,
        employeeId: input.employeeId,
        periodYear: input.periodYear,
        periodMonth: input.periodMonth,
        basicSalary: String(input.basicSalary),
        housingAllowance: String(input.housingAllowance),
        transportAllowance: String(input.transportAllowance),
        otherAllowances: String(input.otherAllowances),
        pasiContribution: String(input.pasiContribution),
        overheadAllocation: String(input.overheadAllocation),
        totalCost: String(totalCost),
        notes: input.notes ?? null,
      });
      return { ok: true };
    }),

  /** Get the P&L summary for a company for a given period (year + month). */
  getPnlSummary: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      periodYear: z.number().int().optional(),
      periodMonth: z.number().int().min(1).max(12).optional(),
      platformOverheadOmr: z.number().min(0).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const { companyId: cid } = await requireFinanceOrAdmin(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) return null;
      const now = new Date();
      const periodYear = input.periodYear ?? now.getFullYear();
      const periodMonth = input.periodMonth ?? now.getMonth() + 1;
      const revConditions = [
        eq(companyRevenueRecords.companyId, cid),
        eq(companyRevenueRecords.periodYear, periodYear),
        eq(companyRevenueRecords.periodMonth, periodMonth),
      ];
      const costConditions = [
        eq(employeeCostRecords.companyId, cid),
        eq(employeeCostRecords.periodYear, periodYear),
        eq(employeeCostRecords.periodMonth, periodMonth),
      ];
      const [revRow] = await db
        .select({ total: sum(companyRevenueRecords.amountOmr) })
        .from(companyRevenueRecords)
        .where(and(...revConditions));
      const [costRow] = await db
        .select({ total: sum(employeeCostRecords.totalCost) })
        .from(employeeCostRecords)
        .where(and(...costConditions));
      const [overheadRow] = await db
        .select({ total: sum(employeeCostRecords.overheadAllocation) })
        .from(employeeCostRecords)
        .where(and(...costConditions));
      const [revCountRow] = await db
        .select({ total: count(companyRevenueRecords.id) })
        .from(companyRevenueRecords)
        .where(and(...revConditions));
      const [costCountRow] = await db
        .select({ total: count(employeeCostRecords.id) })
        .from(employeeCostRecords)
        .where(and(...costConditions));

      const scopedEmployeeRows = await db
        .select({ employeeId: employeeCostRecords.employeeId })
        .from(employeeCostRecords)
        .where(and(...costConditions))
        .groupBy(employeeCostRecords.employeeId);
      const scopedEmployeeIds = scopedEmployeeRows.map((row) => row.employeeId);

      const periodWpsWhere = [
        eq(employeeWpsValidations.companyId, cid),
        eq(employeeWpsValidations.periodYear, periodYear),
        eq(employeeWpsValidations.periodMonth, periodMonth),
      ];
      if (scopedEmployeeIds.length > 0) {
        periodWpsWhere.push(inArray(employeeWpsValidations.employeeId, scopedEmployeeIds));
      }
      const genericWpsWhere = [
        eq(employeeWpsValidations.companyId, cid),
        isNull(employeeWpsValidations.periodYear),
        isNull(employeeWpsValidations.periodMonth),
      ];
      if (scopedEmployeeIds.length > 0) {
        genericWpsWhere.push(inArray(employeeWpsValidations.employeeId, scopedEmployeeIds));
      }

      const periodWpsRows = await db
        .select({
          id: employeeWpsValidations.id,
          employeeId: employeeWpsValidations.employeeId,
          result: employeeWpsValidations.result,
          validatedAt: employeeWpsValidations.validatedAt,
        })
        .from(employeeWpsValidations)
        .where(and(...periodWpsWhere));

      const genericWpsRows = await db
        .select({
          id: employeeWpsValidations.id,
          employeeId: employeeWpsValidations.employeeId,
          result: employeeWpsValidations.result,
          validatedAt: employeeWpsValidations.validatedAt,
        })
        .from(employeeWpsValidations)
        .where(and(...genericWpsWhere));

      const periodWpsSummary = summarizeLatestWpsValidation(periodWpsRows);
      const genericWpsSummary = summarizeLatestWpsValidation(genericWpsRows);

      const effectiveWpsSummary =
        periodWpsSummary.employeeCount > 0 ? periodWpsSummary : genericWpsSummary;
      const wpsQualityScope: WpsQualityScope =
        periodWpsSummary.employeeCount > 0
          ? "period"
          : genericWpsSummary.employeeCount > 0
            ? "company_fallback"
            : "none";

      let wpsMissingCount = 0;
      let wpsInvalidCount = 0;
      wpsMissingCount = effectiveWpsSummary.missingCount;
      wpsInvalidCount = effectiveWpsSummary.invalidCount;

      const revenueOmr = Number(revRow?.total ?? 0);
      const recordedCostOmr = Number(costRow?.total ?? 0);
      const recordedOverheadOmr = Number(overheadRow?.total ?? 0);
      const platformOverheadOmr = input.platformOverheadOmr ?? recordedOverheadOmr;
      const employeeCostOmr = Math.max(0, recordedCostOmr - recordedOverheadOmr);
      const revenueRecordCount = Number(revCountRow?.total ?? 0);
      const employeeCostRecordCount = Number(costCountRow?.total ?? 0);

      const dataQuality = derivePnlDataQuality({
        revenueRecordCount,
        employeeCostRecordCount,
        overheadOmr: platformOverheadOmr,
        wpsMissingCount,
        wpsInvalidCount,
        wpsQualityScope,
      });

      const margin = computeMargin({
        revenueOmr,
        employeeCostOmr,
        platformOverheadOmr,
      });

      const periodLabel = new Date(periodYear, periodMonth - 1, 1).toLocaleString("en-GB", {
        month: "short",
        year: "numeric",
      });
      return {
        ...margin,
        periodYear,
        periodMonth,
        periodLabel,
        hasAnyData: revenueRecordCount > 0 || employeeCostRecordCount > 0,
        dataQualityStatus: dataQuality.status,
        dataQualityMessages: dataQuality.messages,
        wpsQualityScope,
        recordCounts: {
          revenue: revenueRecordCount,
          employeeCost: employeeCostRecordCount,
          wpsMissing: wpsMissingCount,
          wpsInvalid: wpsInvalidCount,
        },
      };
    }),

  /** Get monthly P&L trend for the last N months. */
  getPnlTrend: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      months: z.number().min(1).max(24).default(6),
      platformOverheadOmrPerMonth: z.number().min(0).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const { companyId: cid } = await requireFinanceOrAdmin(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) return [];
      const now = new Date();
      const results: Array<{ periodYm: string; periodLabel: string } & FinancialEngineResult> = [];
      for (let i = input.months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = d.getFullYear();
        const month = d.getMonth() + 1;
        const periodYm = `${year}-${String(month).padStart(2, "0")}`;
        const [revRow] = await db
          .select({ total: sum(companyRevenueRecords.amountOmr) })
          .from(companyRevenueRecords)
          .where(and(
            eq(companyRevenueRecords.companyId, cid),
            eq(companyRevenueRecords.periodYear, year),
            eq(companyRevenueRecords.periodMonth, month),
          ));
        const [costRow] = await db
          .select({ total: sum(employeeCostRecords.totalCost) })
          .from(employeeCostRecords)
          .where(and(
            eq(employeeCostRecords.companyId, cid),
            eq(employeeCostRecords.periodYear, year),
            eq(employeeCostRecords.periodMonth, month),
          ));
        const [overheadRow] = await db
          .select({ total: sum(employeeCostRecords.overheadAllocation) })
          .from(employeeCostRecords)
          .where(and(
            eq(employeeCostRecords.companyId, cid),
            eq(employeeCostRecords.periodYear, year),
            eq(employeeCostRecords.periodMonth, month),
          ));
        const recordedCostOmr = Number(costRow?.total ?? 0);
        const recordedOverheadOmr = Number(overheadRow?.total ?? 0);
        const platformOverheadOmr = input.platformOverheadOmrPerMonth ?? recordedOverheadOmr;
        const employeeCostOmr = Math.max(0, recordedCostOmr - recordedOverheadOmr);
        const periodLabel = d.toLocaleString("en-GB", { month: "short" });
        results.push({
          periodYm,
          periodLabel,
          ...computeMargin({
            revenueOmr: Number(revRow?.total ?? 0),
            employeeCostOmr,
            platformOverheadOmr,
          }),
        });
      }
      return results;
    }),
});
