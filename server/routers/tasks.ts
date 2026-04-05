import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { employeeTasks, employees, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { requireActiveCompanyId } from "../_core/tenant";
import { sendEmployeeNotification, notifyAssignerTaskCompleted } from "./employeePortal";
import { assertAdminStatusTransition, statusUpdateSideEffects, type TaskStatus } from "../taskLifecycle";

const taskCompleter = alias(users, "taskCompleter");

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

const taskStatusEnum = z.enum(["pending", "in_progress", "completed", "cancelled", "blocked"]);
const taskPriorityEnum = z.enum(["low", "medium", "high", "urgent"]);

const taskChecklistRowsSchema = z
  .array(
    z.object({
      title: z.string().min(1).max(400),
      completed: z.boolean().optional(),
    }),
  )
  .max(25);

const taskChecklistSchema = taskChecklistRowsSchema.optional();

/** Accept raw rows; normalize to max 5 unique https URLs, trimmed labels. */
const taskAttachmentLinksSchema = z
  .array(
    z.object({
      name: z.string(),
      url: z.string(),
    }),
  )
  .max(24)
  .optional();

function normalizeAttachmentLinks(
  links: { name: string; url: string }[] | null | undefined,
): { name: string; url: string }[] | null {
  if (!links?.length) return null;
  const seen = new Set<string>();
  const out: { name: string; url: string }[] = [];
  for (const raw of links) {
    const name = raw.name.trim().slice(0, 60);
    let url = raw.url.trim().replace(/\s+/g, "");
    if (url.length > 500) url = url.slice(0, 500);
    if (!name || !url) continue;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    const key = parsed.href.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, url: parsed.href });
    if (out.length >= 5) break;
  }
  return out.length ? out : null;
}

function normalizeChecklist(
  items: { title: string; completed?: boolean }[] | undefined | null,
): { title: string; completed: boolean }[] | null {
  if (!items?.length) return null;
  return items.map((i) => ({ title: i.title.trim(), completed: i.completed ?? false }));
}

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
          completedByName: taskCompleter.name,
        })
        .from(employeeTasks)
        .leftJoin(employees, eq(employeeTasks.assignedToEmployeeId, employees.id))
        .leftJoin(taskCompleter, eq(employeeTasks.completedByUserId, taskCompleter.id))
        .where(eq(employeeTasks.companyId, companyId))
        .orderBy(desc(employeeTasks.createdAt));

      let results = rows.map((r) => ({
        ...r.task,
        employeeName: `${r.employeeFirstName ?? ""} ${r.employeeLastName ?? ""}`.trim(),
        employeeDepartment: r.employeeDepartment,
        completedByName: r.completedByName ?? null,
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
      estimatedDurationMinutes: z.number().int().min(5).max(43200).optional(),
      checklist: taskChecklistSchema,
      attachmentLinks: taskAttachmentLinksSchema,
      companyId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId);
      const db = await requireDb();
      const { companyId: _cid, ...rest } = input;
      const now = new Date();
      const [result] = await db.insert(employeeTasks).values({
        companyId,
        assignedToEmployeeId: rest.assignedToEmployeeId,
        assignedByUserId: ctx.user.id,
        assignedAt: now,
        title: rest.title,
        description: rest.description,
        priority: rest.priority,
        dueDate: rest.dueDate ? new Date(rest.dueDate) : undefined,
        estimatedDurationMinutes: rest.estimatedDurationMinutes ?? undefined,
        notes: rest.notes,
        checklist: normalizeChecklist(rest.checklist ?? null),
        attachmentLinks: normalizeAttachmentLinks(rest.attachmentLinks ?? undefined) ?? undefined,
        status: "pending",
        notifiedOverdue: false,
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
      blockedReason: z.string().nullable().optional(),
      estimatedDurationMinutes: z.number().int().min(5).max(43200).nullable().optional(),
      checklist: taskChecklistRowsSchema.nullish(),
      attachmentLinks: taskAttachmentLinksSchema.nullish(),
      assignedToEmployeeId: z.number().optional(),
      companyId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId);
      const db = await requireDb();
      const [existing] = await db.select().from(employeeTasks).where(eq(employeeTasks.id, input.id));
      if (!existing || existing.companyId !== companyId)
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      const {
        id,
        dueDate,
        companyId: _cid,
        assignedToEmployeeId,
        blockedReason,
        checklist,
        attachmentLinks,
        estimatedDurationMinutes,
        ...rest
      } = input;
      const updateData: any = { ...rest };
      if (estimatedDurationMinutes !== undefined) {
        updateData.estimatedDurationMinutes = estimatedDurationMinutes;
      }
      if (checklist !== undefined) {
        updateData.checklist = normalizeChecklist(checklist);
      }
      if (attachmentLinks !== undefined) {
        updateData.attachmentLinks = normalizeAttachmentLinks(attachmentLinks ?? undefined);
      }
      if (dueDate !== undefined) {
        updateData.dueDate = dueDate ? new Date(dueDate) : null;
        updateData.notifiedOverdue = false;
      }

      if (assignedToEmployeeId !== undefined && assignedToEmployeeId !== existing.assignedToEmployeeId) {
        const [emp] = await db
          .select({ id: employees.id, userId: employees.userId })
          .from(employees)
          .where(and(eq(employees.id, assignedToEmployeeId), eq(employees.companyId, companyId)));
        if (!emp)
          throw new TRPCError({ code: "BAD_REQUEST", message: "Employee not found in this company" });
        updateData.assignedToEmployeeId = assignedToEmployeeId;
        updateData.assignedAt = new Date();
        updateData.assignedByUserId = ctx.user.id;
        updateData.notifiedOverdue = false;
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

      if (input.status !== undefined && input.status !== "blocked") {
        updateData.blockedReason = null;
      }
      if (blockedReason !== undefined) {
        updateData.blockedReason = blockedReason;
      }

      const becameCompleted = input.status === "completed" && existing.status !== "completed";

      if (input.status !== undefined && input.status !== existing.status) {
        assertAdminStatusTransition(existing.status as TaskStatus, input.status as TaskStatus);
        Object.assign(
          updateData,
          statusUpdateSideEffects(
            { status: existing.status, startedAt: existing.startedAt },
            input.status as TaskStatus,
            input.status === "completed" ? { completedByUserId: ctx.user.id } : undefined,
          ),
        );
      }

      await db.update(employeeTasks).set(updateData).where(eq(employeeTasks.id, id));

      if (becameCompleted) {
        await notifyAssignerTaskCompleted({
          assignedByUserId: existing.assignedByUserId,
          completedByUserId: ctx.user.id,
          companyId,
          title: existing.title,
        });
      }

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
