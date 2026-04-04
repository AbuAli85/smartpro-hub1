import { z } from "zod";
import { and, desc, eq, gte, lte, sum, count } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  expenseClaims, trainingRecords, employeeSelfReviews,
  employees, payrollRuns, payrollLineItems, users
} from "../../drizzle/schema";
import { requireActiveCompanyId } from "../_core/tenant";

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
      await db.insert(trainingRecords).values({
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
});
