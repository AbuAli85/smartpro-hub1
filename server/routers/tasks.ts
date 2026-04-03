import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { employeeTasks, employees } from "../../drizzle/schema";
import { getDb, getUserCompany, getUserCompanyById } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

async function getMembership(userId: number, companyId?: number | null) {
  if (companyId) return getUserCompanyById(userId, companyId);
  return getUserCompany(userId);
}

const taskStatusEnum = z.enum(["pending", "in_progress", "completed", "cancelled"]);
const taskPriorityEnum = z.enum(["low", "medium", "high", "urgent"]);

export const tasksRouter = router({
  // List tasks — admin sees all, employee sees their own
  listTasks: protectedProcedure
    .input(z.object({
      employeeId: z.number().optional(),
      status: taskStatusEnum.optional(),
      priority: taskPriorityEnum.optional(),
      companyId: z.number().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const membership = await getMembership(ctx.user.id, input.companyId);
      if (!membership) return [];
      const db = await requireDb();

      const rows = await db
        .select({
          task: employeeTasks,
          employeeFirstName: employees.firstName,
          employeeLastName: employees.lastName,
          employeeDepartment: employees.department,
        })
        .from(employeeTasks)
        .leftJoin(employees, eq(employeeTasks.assignedToEmployeeId, employees.id))
        .where(eq(employeeTasks.companyId, membership.company.id))
        .orderBy(desc(employeeTasks.createdAt));

      let results = rows.map((r) => ({
        ...r.task,
        employeeName: `${r.employeeFirstName ?? ""} ${r.employeeLastName ?? ""}`.trim(),
        employeeDepartment: r.employeeDepartment,
      }));

      if (input.employeeId) results = results.filter((t) => t.assignedToEmployeeId === input.employeeId);
      if (input.status) results = results.filter((t) => t.status === input.status);
      if (input.priority) results = results.filter((t) => t.priority === input.priority);

      return results;
    }),

  getTask: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const membership = await getMembership(ctx.user.id, input.companyId);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await requireDb();
      const [row] = await db.select().from(employeeTasks).where(eq(employeeTasks.id, input.id));
      if (!row || row.companyId !== membership.company.id)
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      return row;
    }),

  createTask: protectedProcedure
    .input(z.object({
      assignedToEmployeeId: z.number(),
      title: z.string().min(1).max(255),
      description: z.string().optional(),
      priority: taskPriorityEnum.default("medium"),
      dueDate: z.string().optional(), // ISO date string YYYY-MM-DD
      notes: z.string().optional(),
      companyId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const membership = await getMembership(ctx.user.id, input.companyId);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await requireDb();
      const { companyId: _cid, ...rest } = input;
      const [result] = await db.insert(employeeTasks).values({
        companyId: membership.company.id,
        assignedToEmployeeId: rest.assignedToEmployeeId,
        assignedByUserId: ctx.user.id,
        title: rest.title,
        description: rest.description,
        priority: rest.priority,
        dueDate: rest.dueDate ? new Date(rest.dueDate) : undefined,
        notes: rest.notes,
        status: "pending",
      });
      return { id: (result as any).insertId };
    }),

  updateTask: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      priority: taskPriorityEnum.optional(),
      status: taskStatusEnum.optional(),
      dueDate: z.string().nullable().optional(),
      notes: z.string().optional(),
      companyId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const membership = await getMembership(ctx.user.id, input.companyId);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await requireDb();
      const [existing] = await db.select().from(employeeTasks).where(eq(employeeTasks.id, input.id));
      if (!existing || existing.companyId !== membership.company.id)
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      const { id, dueDate, companyId: _cid, ...rest } = input;
      const updateData: any = { ...rest };
      if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
      if (input.status === "completed") updateData.completedAt = new Date();
      await db.update(employeeTasks).set(updateData).where(eq(employeeTasks.id, id));
      return { success: true };
    }),

  deleteTask: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      const membership = await getMembership(ctx.user.id, input.companyId);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await requireDb();
      const [existing] = await db.select().from(employeeTasks).where(eq(employeeTasks.id, input.id));
      if (!existing || existing.companyId !== membership.company.id)
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      await db.delete(employeeTasks).where(eq(employeeTasks.id, input.id));
      return { success: true };
    }),

  getTaskStats: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const membership = await getMembership(ctx.user.id, input?.companyId);
      if (!membership) return { total: 0, pending: 0, inProgress: 0, completed: 0, overdue: 0 };
      const db = await requireDb();
      const tasks = await db
        .select({ status: employeeTasks.status, dueDate: employeeTasks.dueDate })
        .from(employeeTasks)
        .where(eq(employeeTasks.companyId, membership.company.id));
      const now = new Date();
      return {
        total: tasks.length,
        pending: tasks.filter((t) => t.status === "pending").length,
        inProgress: tasks.filter((t) => t.status === "in_progress").length,
        completed: tasks.filter((t) => t.status === "completed").length,
        overdue: tasks.filter((t) =>
          t.status !== "completed" && t.status !== "cancelled" &&
          t.dueDate && new Date(t.dueDate) < now
        ).length,
      };
    }),
});
