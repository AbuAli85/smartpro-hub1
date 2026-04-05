import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { employeeTasks, employees } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { requireActiveCompanyId } from "../_core/tenant";
import { sendEmployeeNotification } from "./employeePortal";
import { assertAdminStatusTransition, statusUpdateSideEffects, type TaskStatus } from "../taskLifecycle";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

const taskStatusEnum = z.enum(["pending", "in_progress", "completed", "cancelled", "blocked"]);
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
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId);
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
        .where(eq(employeeTasks.companyId, companyId))
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
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId);
      const db = await requireDb();
      const [row] = await db.select().from(employeeTasks).where(eq(employeeTasks.id, input.id));
      if (!row || row.companyId !== companyId)
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
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId);
      const db = await requireDb();
      const { companyId: _cid, ...rest } = input;
      const [result] = await db.insert(employeeTasks).values({
        companyId,
        assignedToEmployeeId: rest.assignedToEmployeeId,
        assignedByUserId: ctx.user.id,
        title: rest.title,
        description: rest.description,
        priority: rest.priority,
        dueDate: rest.dueDate ? new Date(rest.dueDate) : undefined,
        notes: rest.notes,
        status: "pending",
      });
      const insertId = (result as any).insertId as number;
      const [assignee] = await db
        .select({ userId: employees.userId })
        .from(employees)
        .where(eq(employees.id, rest.assignedToEmployeeId));
      if (assignee?.userId) {
        await sendEmployeeNotification({
          toUserId: assignee.userId,
          companyId,
          type: "task_assigned",
          title: "New task assigned",
          message: `You have been assigned: ${rest.title.trim()}`,
          link: "/my-portal",
        });
      }
      return { id: insertId };
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
      assignedToEmployeeId: z.number().optional(),
      companyId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId);
      const db = await requireDb();
      const [existing] = await db.select().from(employeeTasks).where(eq(employeeTasks.id, input.id));
      if (!existing || existing.companyId !== companyId)
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      const { id, dueDate, companyId: _cid, assignedToEmployeeId, ...rest } = input;
      const updateData: any = { ...rest };
      if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;

      if (assignedToEmployeeId !== undefined && assignedToEmployeeId !== existing.assignedToEmployeeId) {
        const [emp] = await db
          .select({ id: employees.id, userId: employees.userId })
          .from(employees)
          .where(and(eq(employees.id, assignedToEmployeeId), eq(employees.companyId, companyId)));
        if (!emp)
          throw new TRPCError({ code: "BAD_REQUEST", message: "Employee not found in this company" });
        updateData.assignedToEmployeeId = assignedToEmployeeId;
        if (emp.userId) {
          await sendEmployeeNotification({
            toUserId: emp.userId,
            companyId,
            type: "task_assigned",
            title: "Task reassigned to you",
            message: `You have been assigned: ${existing.title}`,
            link: "/my-portal",
          });
        }
      }

      if (input.status !== undefined && input.status !== existing.status) {
        assertAdminStatusTransition(existing.status as TaskStatus, input.status as TaskStatus);
        Object.assign(
          updateData,
          statusUpdateSideEffects(
            { status: existing.status, startedAt: existing.startedAt },
            input.status as TaskStatus,
          ),
        );
      }

      await db.update(employeeTasks).set(updateData).where(eq(employeeTasks.id, id));
      return { success: true };
    }),

  deleteTask: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId);
      const db = await requireDb();
      const [existing] = await db.select().from(employeeTasks).where(eq(employeeTasks.id, input.id));
      if (!existing || existing.companyId !== companyId)
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      await db.delete(employeeTasks).where(eq(employeeTasks.id, input.id));
      return { success: true };
    }),

  getTaskStats: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input?.companyId);
      const db = await requireDb();
      const tasks = await db
        .select({ status: employeeTasks.status, dueDate: employeeTasks.dueDate })
        .from(employeeTasks)
        .where(eq(employeeTasks.companyId, companyId));
      const now = new Date();
      return {
        total: tasks.length,
        pending: tasks.filter((t) => t.status === "pending").length,
        inProgress: tasks.filter((t) => t.status === "in_progress").length,
        blocked: tasks.filter((t) => t.status === "blocked").length,
        completed: tasks.filter((t) => t.status === "completed").length,
        overdue: tasks.filter((t) =>
          t.status !== "completed" && t.status !== "cancelled" &&
          t.dueDate && new Date(t.dueDate) < now
        ).length,
      };
    }),
});
