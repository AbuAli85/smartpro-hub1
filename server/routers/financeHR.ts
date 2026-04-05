import { z } from "zod";
import { and, desc, eq, gte, lte, sum, count } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  expenseClaims, trainingRecords, employeeSelfReviews,
  employees, payrollRuns, payrollLineItems, companyMembers,
} from "../../drizzle/schema";
import type { User } from "../../drizzle/schema";
import { requireActiveCompanyId } from "../_core/tenant";
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
import {
  fetchPerformanceOverview,
  fetchTrainingOverview,
  fetchSelfReviewOverview,
  fetchPerformanceLeaderboardSummary,
} from "../hrPerformanceReadModels";

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

async function assertCanReadSelfReviews(user: User, companyId: number): Promise<void> {
  if (await hasCompanyPermission(user, companyId, "hr.performance.read")) return;
  if (await hasCompanyPermission(user, companyId, "hr.self_reviews.read")) return;
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
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const companyId = await requireActiveCompanyId(ctx.user.id);
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
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const companyId = await requireActiveCompanyId(ctx.user.id);
      const emp = await resolveEmployee(ctx.user.id, companyId);
      const empUserId = emp?.id ?? ctx.user.id;
      const conditions = [eq(expenseClaims.companyId, companyId), eq(expenseClaims.employeeUserId, empUserId)];
      if (input?.status && input.status !== "all") {
        conditions.push(eq(expenseClaims.expenseStatus, input.status as "pending" | "approved" | "rejected" | "cancelled"));
      }
      return db.select().from(expenseClaims).where(and(...conditions)).orderBy(desc(expenseClaims.createdAt));
    }),

  cancelExpense: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const companyId = await requireActiveCompanyId(ctx.user.id);
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
      const companyId = input?.companyId ?? await requireActiveCompanyId(ctx.user.id);
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
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const companyId = await requireActiveCompanyId(ctx.user.id);
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
      const companyId = input?.companyId ?? await requireActiveCompanyId(ctx.user.id);
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
      const companyId = input?.companyId ?? await requireActiveCompanyId(ctx.user.id);
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
  myTraining: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const companyId = await requireActiveCompanyId(ctx.user.id);
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
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const companyId = await requireActiveCompanyId(ctx.user.id);
      const emp = await resolveEmployee(ctx.user.id, companyId);
      const empUserId = emp?.id ?? ctx.user.id;
      await db.update(trainingRecords)
        .set({
          trainingStatus: input.status,
          completedAt: input.status === "completed" ? new Date() : undefined,
        })
        .where(and(
          eq(trainingRecords.id, input.id),
          eq(trainingRecords.employeeUserId, empUserId),
        ));
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
      const companyId = input.companyId ?? await requireActiveCompanyId(ctx.user.id);
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
      const companyId = input?.companyId ?? await requireActiveCompanyId(ctx.user.id);
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
  mySelfReviews: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const companyId = await requireActiveCompanyId(ctx.user.id);
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
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const companyId = await requireActiveCompanyId(ctx.user.id);
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
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const companyId = await requireActiveCompanyId(ctx.user.id);
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
      const companyId = input?.companyId ?? await requireActiveCompanyId(ctx.user.id);
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
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const companyId = await requireActiveCompanyId(ctx.user.id);
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

  // ─── HR performance overview (server-authoritative read models, PR-4) ───
  getPerformanceOverview: protectedProcedure
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
      const companyId = input?.companyId ?? (await requireActiveCompanyId(ctx.user.id));
      await assertCanReadHrPerformanceOverview(ctx.user, companyId);
      const year = input?.year ?? new Date().getFullYear();
      const month = input?.month ?? new Date().getMonth() + 1;
      return fetchPerformanceOverview(db, companyId, { year, month });
    }),

  getTrainingOverview: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const companyId = input?.companyId ?? (await requireActiveCompanyId(ctx.user.id));
      await assertCanReadHrPerformanceOverview(ctx.user, companyId);
      return fetchTrainingOverview(db, companyId);
    }),

  getSelfReviewOverview: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const companyId = input?.companyId ?? (await requireActiveCompanyId(ctx.user.id));
      await assertCanReadHrPerformanceOverview(ctx.user, companyId);
      return fetchSelfReviewOverview(db, companyId);
    }),

  getPerformanceLeaderboardSummary: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const companyId = input?.companyId ?? (await requireActiveCompanyId(ctx.user.id));
      await assertCanReadHrPerformanceOverview(ctx.user, companyId);
      return fetchPerformanceLeaderboardSummary(db, companyId);
    }),
});
