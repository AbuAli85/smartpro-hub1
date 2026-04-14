import { z } from "zod";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { workLogs, employees } from "../../drizzle/schema";
import { optionalActiveWorkspace } from "../_core/workspaceInput";
import { requireActiveCompanyId } from "../_core/tenant";

async function resolveEmpUserId(userId: number, companyId: number): Promise<number> {
  const db = await getDb();
  if (!db) return userId;
  const emp = await db.select({ id: employees.id }).from(employees)
    .where(and(eq(employees.userId, userId), eq(employees.companyId, companyId))).limit(1);
  return emp.length > 0 ? emp[0].id : userId;
}

export const workLogsRouter = router({
  submit: protectedProcedure
    .input(z.object({
      logDate: z.string(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      hoursWorked: z.string().optional(),
      projectName: z.string().optional(),
      taskDescription: z.string().min(3),
      category: z.enum(["development", "meeting", "admin", "support", "training", "other"]).default("other"),
    }).merge(optionalActiveWorkspace))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const empUserId = await resolveEmpUserId(ctx.user.id, companyId);
      await db.insert(workLogs).values({
        companyId,
        employeeUserId: empUserId,
        logDate: input.logDate,
        startTime: input.startTime,
        endTime: input.endTime,
        hoursWorked: input.hoursWorked,
        projectName: input.projectName,
        taskDescription: input.taskDescription,
        logCategory: input.category,
        logStatus: "submitted",
      });
      return { success: true };
    }),

  listMine: protectedProcedure
    .input(z.object({ fromDate: z.string().optional(), toDate: z.string().optional() }).merge(optionalActiveWorkspace).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const companyId = await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user);
      const empUserId = await resolveEmpUserId(ctx.user.id, companyId);
      const conditions = [eq(workLogs.companyId, companyId), eq(workLogs.employeeUserId, empUserId)];
      if (input?.fromDate) conditions.push(gte(workLogs.logDate, input.fromDate));
      if (input?.toDate) conditions.push(lte(workLogs.logDate, input.toDate));
      return db.select().from(workLogs).where(and(...conditions)).orderBy(desc(workLogs.logDate));
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      logDate: z.string().optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      hoursWorked: z.string().optional(),
      projectName: z.string().optional(),
      taskDescription: z.string().optional(),
      category: z.enum(["development", "meeting", "admin", "support", "training", "other"]).optional(),
    }).merge(optionalActiveWorkspace))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const empUserId = await resolveEmpUserId(ctx.user.id, companyId);
      const { id, category, ...rest } = input;
      const updates: Record<string, unknown> = { ...rest };
      if (category) updates.logCategory = category;
      await db.update(workLogs).set(updates).where(and(eq(workLogs.id, id), eq(workLogs.employeeUserId, empUserId)));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }).merge(optionalActiveWorkspace))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const empUserId = await resolveEmpUserId(ctx.user.id, companyId);
      await db.delete(workLogs).where(and(eq(workLogs.id, input.id), eq(workLogs.employeeUserId, empUserId)));
      return { success: true };
    }),

  weeklySummary: protectedProcedure
    .input(z.object({ weekStart: z.string() }).merge(optionalActiveWorkspace))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const empUserId = await resolveEmpUserId(ctx.user.id, companyId);
      const start = new Date(input.weekStart);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const endStr = end.toISOString().split("T")[0];
      return db.select().from(workLogs).where(and(
        eq(workLogs.companyId, companyId),
        eq(workLogs.employeeUserId, empUserId),
        gte(workLogs.logDate, input.weekStart),
        lte(workLogs.logDate, endStr),
      )).orderBy(workLogs.logDate);
    }),
});
