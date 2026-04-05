import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and, desc, or, isNull, inArray, gte, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import {
  employees, attendance, leaveRequests, payrollRecords,
  employeeDocuments, employeeTasks, announcements, announcementReads,
  notifications, companyMembers, users, attendanceRecords,
  employeeSchedules, companyHolidays, shiftTemplates, attendanceCorrections,
  workPermits,
} from "../../drizzle/schema";
import { getDb, getUserCompany } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { requireActiveCompanyId } from "../_core/tenant";
import { computePortalOperationalHints } from "@shared/employeePortalOperationalHints";
import { buildEmployeeWorkStatusSummary } from "@shared/employeePortalWorkStatusSummary";

/** Default annual entitlements (calendar year) — keep in sync with portal UI until per-company policies exist */
export const DEFAULT_LEAVE_ENTITLEMENTS = { annual: 30, sick: 15, emergency: 5 } as const;

const taskCompleterEmp = alias(users, "taskCompleterEmp");

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

/**
 * Reliably find the employee record for the logged-in user.
 * Priority order:
 *   1. employees.userId === ctx.user.id  (set when HR grants access via Team Access page)
 *   2. employees.email === ctx.user.email (fallback for employees added before userId linking)
 * Returns null if no match found.
 */
async function resolveMyEmployee(userId: number, userEmail: string, companyId: number) {
  const db = await getDb();
  if (!db) return null;

  // Priority 1: userId match (most reliable)
  const [byUserId] = await db
    .select()
    .from(employees)
    .where(and(
      eq(employees.companyId, companyId),
      eq(employees.userId, userId),
    ))
    .limit(1);
  if (byUserId) return byUserId;

  // Priority 2: email match (fallback)
  if (userEmail) {
    const [byEmail] = await db
      .select()
      .from(employees)
      .where(and(
        eq(employees.companyId, companyId),
        eq(employees.email, userEmail),
      ))
      .limit(1);
    if (byEmail) {
      // Auto-link: update userId so future lookups are fast and reliable
      await db.update(employees).set({ userId }).where(eq(employees.id, byEmail.id)).catch(() => {});
      return byEmail;
    }
  }

  return null;
}

/**
 * Send an in-app notification to a specific employee (by their userId).
 * Used when HR takes actions that the employee should know about.
 */
async function sendEmployeeNotification(params: {
  toUserId: number;
  companyId: number;
  type: string;
  title: string;
  message: string;
  link?: string;
}) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(notifications).values({
      userId: params.toUserId,
      companyId: params.companyId,
      type: params.type,
      title: params.title,
      message: params.message,
      link: params.link ?? null,
      isRead: false,
    });
  } catch {
    // Non-critical — don't fail the main action if notification fails
  }
}

export { sendEmployeeNotification };

/** Notify the user who assigned the task (typically HR) when someone else marks it complete. */
export async function notifyAssignerTaskCompleted(params: {
  assignedByUserId: number;
  completedByUserId: number;
  companyId: number;
  title: string;
}) {
  if (params.assignedByUserId === params.completedByUserId) return;
  await sendEmployeeNotification({
    toUserId: params.assignedByUserId,
    companyId: params.companyId,
    type: "task_completed",
    title: "Task completed",
    message: `"${params.title}" was marked complete.`,
    link: "/hr/tasks",
  });
}

export const employeePortalRouter = router({
  // ─── Get my employee profile ──────────────────────────────────────────────
  getMyProfile: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return null;
    const emp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", membership.company.id);
    return emp ?? null;
  }),

  // ─── Get my attendance for a given month ──────────────────────────────────
  getMyAttendance: protectedProcedure
    .input(z.object({ month: z.string() })) // YYYY-MM
    .query(async ({ input, ctx }) => {
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) return [];
      const myEmp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", membership.company.id);
      if (!myEmp) return [];
      const db = await requireDb();
      const [year, month] = input.month.split("-").map(Number);
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 1);
      const records = await db
        .select()
        .from(attendance)
        .where(and(
          eq(attendance.companyId, membership.company.id),
          eq(attendance.employeeId, myEmp.id),
        ))
        .orderBy(desc(attendance.date));
      return records.filter((r) => {
        const d = new Date(r.date);
        return d >= start && d < end;
      });
    }),

  // ─── Get my leave requests and balance ────────────────────────────────────
  getMyLeave: protectedProcedure.query(async ({ ctx }) => {
    const empty = {
      requests: [] as (typeof leaveRequests.$inferSelect)[],
      balance: { annual: 0, sick: 0, emergency: 0 },
      entitlements: { ...DEFAULT_LEAVE_ENTITLEMENTS },
    };
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return empty;
    const myEmp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", membership.company.id);
    if (!myEmp) return empty;
    const db = await requireDb();
    const requests = await db
      .select()
      .from(leaveRequests)
      .where(and(
        eq(leaveRequests.companyId, membership.company.id),
        eq(leaveRequests.employeeId, myEmp.id),
      ))
      .orderBy(desc(leaveRequests.createdAt));

    // Calculate leave balance for current year
    const currentYear = new Date().getFullYear();
    const approved = requests.filter(
      (r) => r.status === "approved" && new Date(r.startDate).getFullYear() === currentYear
    );
    const calcDays = (list: typeof approved) =>
      list.reduce((s, r) => s + Math.ceil((new Date(r.endDate).getTime() - new Date(r.startDate).getTime()) / 86400000) + 1, 0);

    const { annual: maxA, sick: maxS, emergency: maxE } = DEFAULT_LEAVE_ENTITLEMENTS;
    return {
      requests,
      entitlements: { ...DEFAULT_LEAVE_ENTITLEMENTS },
      balance: {
        annual: Math.max(0, maxA - calcDays(approved.filter((r) => r.leaveType === "annual"))),
        sick: Math.max(0, maxS - calcDays(approved.filter((r) => r.leaveType === "sick"))),
        emergency: Math.max(0, maxE - calcDays(approved.filter((r) => r.leaveType === "emergency"))),
      },
    };
  }),

  // ─── Submit a leave request ────────────────────────────────────────────────
  submitLeaveRequest: protectedProcedure
    .input(z.object({
      leaveType: z.enum(["annual", "sick", "emergency", "unpaid", "maternity", "paternity"]),
      startDate: z.string(),
      endDate: z.string(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      const myEmp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", membership.company.id);
      if (!myEmp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee record not found. Please contact HR to link your account." });
      const db = await requireDb();
      const [result] = await db.insert(leaveRequests).values({
        companyId: membership.company.id,
        employeeId: myEmp.id,
        leaveType: input.leaveType,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        reason: input.reason,
        status: "pending",
      });
      // Notify HR admins about the new leave request
      const hrAdmins = await db
        .select({ userId: companyMembers.userId })
        .from(companyMembers)
        .where(and(
          eq(companyMembers.companyId, membership.company.id),
          eq(companyMembers.isActive, true),
          inArray(companyMembers.role, ["company_admin", "hr_admin"]),
        ));
      for (const admin of hrAdmins) {
        await sendEmployeeNotification({
          toUserId: admin.userId,
          companyId: membership.company.id,
          type: "leave_request",
          title: `Leave Request — ${myEmp.firstName} ${myEmp.lastName}`,
          message: `${myEmp.firstName} ${myEmp.lastName} submitted a ${input.leaveType.replace("_", " ")} leave request (${input.startDate} to ${input.endDate}).`,
          link: "/hr/leave",
        });
      }
      return { id: (result as any).insertId, success: true };
    }),

  // ─── Get my tasks ─────────────────────────────────────────────────────────
  getMyTasks: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).default({}))
    .query(async ({ ctx, input }) => {
      let companyId: number;
      try {
        companyId = await requireActiveCompanyId(ctx.user.id, input.companyId);
      } catch {
        return [];
      }
      const myEmp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", companyId);
      if (!myEmp) return [];
      const db = await requireDb();
      const rows = await db
        .select({
          task: employeeTasks,
          completedByName: taskCompleterEmp.name,
        })
        .from(employeeTasks)
        .leftJoin(taskCompleterEmp, eq(employeeTasks.completedByUserId, taskCompleterEmp.id))
        .where(and(
          eq(employeeTasks.companyId, companyId),
          eq(employeeTasks.assignedToEmployeeId, myEmp.id),
        ))
        .orderBy(desc(employeeTasks.createdAt));
      return rows.map((r) => ({ ...r.task, completedByName: r.completedByName ?? null }));
    }),

  // ─── Mark task in progress (assignee only) ────────────────────────────────
  startTask: protectedProcedure
    .input(z.object({ taskId: z.number(), companyId: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId);
      const myEmp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", companyId);
      if (!myEmp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee record not found" });
      const db = await requireDb();
      const [task] = await db.select().from(employeeTasks).where(eq(employeeTasks.id, input.taskId));
      if (!task || task.companyId !== companyId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      }
      if (task.assignedToEmployeeId !== myEmp.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You are not assigned to this task" });
      }
      if (task.status !== "pending" && task.status !== "blocked") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only pending or blocked tasks can be started" });
      }
      const patch: { status: "in_progress"; startedAt?: Date } = { status: "in_progress" };
      if (!task.startedAt) {
        patch.startedAt = new Date();
      }
      await db.update(employeeTasks).set(patch).where(eq(employeeTasks.id, input.taskId));
      return { success: true };
    }),

  // ─── Mark my task as complete ─────────────────────────────────────────────
  completeTask: protectedProcedure
    .input(z.object({ taskId: z.number(), companyId: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId);
      const myEmp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", companyId);
      if (!myEmp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee record not found" });
      const db = await requireDb();
      const [task] = await db.select().from(employeeTasks).where(eq(employeeTasks.id, input.taskId));
      if (!task || task.companyId !== companyId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      }
      if (task.assignedToEmployeeId !== myEmp.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You are not assigned to this task" });
      }
      if (task.status === "completed" || task.status === "cancelled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Task is already closed" });
      }
      await db
        .update(employeeTasks)
        .set({
          status: "completed",
          completedAt: new Date(),
          completedByUserId: ctx.user.id,
        })
        .where(eq(employeeTasks.id, input.taskId));
      await notifyAssignerTaskCompleted({
        assignedByUserId: task.assignedByUserId,
        completedByUserId: ctx.user.id,
        companyId,
        title: task.title,
      });
      return { success: true };
    }),

  // ─── Toggle checklist item (assignee only; does not block task completion) ─
  toggleTaskChecklistItem: protectedProcedure
    .input(
      z.object({
        taskId: z.number(),
        index: z.number().int().min(0),
        completed: z.boolean(),
        companyId: z.number().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId);
      const myEmp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", companyId);
      if (!myEmp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee record not found" });
      const db = await requireDb();
      const [task] = await db.select().from(employeeTasks).where(eq(employeeTasks.id, input.taskId));
      if (!task || task.companyId !== companyId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      }
      if (task.assignedToEmployeeId !== myEmp.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You are not assigned to this task" });
      }
      if (task.status === "completed" || task.status === "cancelled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Task is closed" });
      }
      const raw = task.checklist;
      const list: { title: string; completed: boolean }[] = Array.isArray(raw)
        ? raw
            .filter((x: unknown): x is { title?: unknown; completed?: unknown } => !!x && typeof x === "object")
            .map((x) => ({
              title: typeof x.title === "string" ? x.title : "",
              completed: !!x.completed,
            }))
            .filter((x) => x.title.length > 0)
        : [];
      if (input.index >= list.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid checklist item" });
      }
      const next = list.map((item, i) =>
        i === input.index ? { title: item.title, completed: input.completed } : item,
      );
      await db.update(employeeTasks).set({ checklist: next }).where(eq(employeeTasks.id, input.taskId));
      return { success: true as const, checklist: next };
    }),

  // ─── Get my announcements ─────────────────────────────────────────────────
  getMyAnnouncements: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return [];
    const myEmp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", membership.company.id);
    if (!myEmp) return [];
    const db = await requireDb();
    const anns = await db
      .select()
      .from(announcements)
      .where(and(
        eq(announcements.companyId, membership.company.id),
        eq(announcements.isDeleted, false),
        or(
          eq(announcements.targetEmployeeId, myEmp.id),
          isNull(announcements.targetEmployeeId),
        ),
      ))
      .orderBy(desc(announcements.createdAt));

    const reads = await db
      .select({ announcementId: announcementReads.announcementId })
      .from(announcementReads)
      .where(eq(announcementReads.employeeId, myEmp.id));
    const readIds = new Set(reads.map((r) => r.announcementId));

    return anns.map((a) => ({ ...a, isRead: readIds.has(a.id) }));
  }),

  // ─── Mark announcement as read ────────────────────────────────────────────
  markAnnouncementRead: protectedProcedure
    .input(z.object({ announcementId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      const myEmp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", membership.company.id);
      if (!myEmp) throw new TRPCError({ code: "NOT_FOUND" });
      const db = await requireDb();
      // Upsert read record
      const [existing] = await db
        .select({ id: announcementReads.id })
        .from(announcementReads)
        .where(and(
          eq(announcementReads.announcementId, input.announcementId),
          eq(announcementReads.employeeId, myEmp.id),
        ))
        .limit(1);
      if (!existing) {
        await db.insert(announcementReads).values({
          announcementId: input.announcementId,
          employeeId: myEmp.id,
        });
      }
      return { success: true };
    }),

  // ─── Get my payslips ──────────────────────────────────────────────────────
  getMyPayslips: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return [];
    const myEmp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", membership.company.id);
    if (!myEmp) return [];
    const db = await requireDb();
    return db
      .select()
      .from(payrollRecords)
      .where(and(
        eq(payrollRecords.companyId, membership.company.id),
        eq(payrollRecords.employeeId, myEmp.id),
      ))
      .orderBy(desc(payrollRecords.periodYear), desc(payrollRecords.periodMonth));
  }),

  // ─── Get my payroll records ───────────────────────────────────────────────
  getMyPayroll: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return [];
    const myEmp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", membership.company.id);
    if (!myEmp) return [];
    const db = await requireDb();
    return db
      .select()
      .from(payrollRecords)
      .where(and(
        eq(payrollRecords.companyId, membership.company.id),
        eq(payrollRecords.employeeId, myEmp.id),
      ))
      .orderBy(desc(payrollRecords.periodYear), desc(payrollRecords.periodMonth));
  }),

  // ─── Get my documents ─────────────────────────────────────────────────────
  getMyDocuments: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return [];
    const myEmp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", membership.company.id);
    if (!myEmp) return [];
    const db = await requireDb();
    return db
      .select()
      .from(employeeDocuments)
      .where(and(
        eq(employeeDocuments.companyId, membership.company.id),
        eq(employeeDocuments.employeeId, myEmp.id),
      ))
      .orderBy(desc(employeeDocuments.createdAt));
  }),

  /**
   * Read-only “work status” strip for My Portal: permit signal, document expiry, assigned tasks.
   * Not the employer compliance dashboard — no scoring, WPS, or Omanisation.
   */
  getMyWorkStatusSummary: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).default({}))
    .query(async ({ ctx, input }) => {
      let companyId: number;
      try {
        companyId = await requireActiveCompanyId(ctx.user.id, input.companyId);
      } catch {
        return null;
      }
      const myEmp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", companyId);
      if (!myEmp) return null;
      const db = await requireDb();

      const permitRows = await db
        .select()
        .from(workPermits)
        .where(and(eq(workPermits.employeeId, myEmp.id), eq(workPermits.companyId, companyId)))
        .orderBy(desc(workPermits.updatedAt))
        .limit(25);

      const chosenPermit =
        permitRows.find((p) => p.permitStatus !== "cancelled" && p.permitStatus !== "transferred") ??
        permitRows[0] ??
        null;

      const permitInput = chosenPermit
        ? { permitStatus: chosenPermit.permitStatus, expiryDate: chosenPermit.expiryDate }
        : null;

      const docs = await db
        .select({ expiresAt: employeeDocuments.expiresAt })
        .from(employeeDocuments)
        .where(and(eq(employeeDocuments.companyId, companyId), eq(employeeDocuments.employeeId, myEmp.id)));

      const taskRows = await db
        .select({ status: employeeTasks.status, dueDate: employeeTasks.dueDate })
        .from(employeeTasks)
        .where(and(eq(employeeTasks.companyId, companyId), eq(employeeTasks.assignedToEmployeeId, myEmp.id)));

      return buildEmployeeWorkStatusSummary({
        nationality: myEmp.nationality,
        permit: permitInput,
        documents: docs,
        tasks: taskRows,
      });
    }),

  // ─── Get my in-app notifications ──────────────────────────────────────────
  getMyNotifications: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(20) }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const membership = await getUserCompany(ctx.user.id);
      const items = await db
        .select()
        .from(notifications)
        .where(and(
          eq(notifications.userId, ctx.user.id),
          membership ? eq(notifications.companyId, membership.company.id) : isNull(notifications.companyId),
        ))
        .orderBy(desc(notifications.createdAt))
        .limit(input.limit);
      const unreadCount = items.filter((n) => !n.isRead).length;
      return { notifications: items, unreadCount };
    }),

  // ─── Mark a notification as read ─────────────────────────────────────────
  markNotificationRead: protectedProcedure
    .input(z.object({ notificationId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(and(eq(notifications.id, input.notificationId), eq(notifications.userId, ctx.user.id)));
      return { success: true };
    }),

  // ─── Mark all notifications as read ──────────────────────────────────────
  markAllNotificationsRead: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await requireDb();
    const membership = await getUserCompany(ctx.user.id);
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(
        eq(notifications.userId, ctx.user.id),
        membership ? eq(notifications.companyId, membership.company.id) : isNull(notifications.companyId),
      ));
    return { success: true };
  }),

  // ─── Get attendance summary for a month ──────────────────────────────────
  getMyAttendanceSummary: protectedProcedure
    .input(z.object({ month: z.string() })) // YYYY-MM
    .query(async ({ input, ctx }) => {
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) return { records: [], summary: { present: 0, absent: 0, late: 0, halfDay: 0, remote: 0, total: 0 } };
      const myEmp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", membership.company.id);
      if (!myEmp) return { records: [], summary: { present: 0, absent: 0, late: 0, halfDay: 0, remote: 0, total: 0 } };
      const db = await requireDb();
      const [year, month] = input.month.split("-").map(Number);
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 1);
      const allRecords = await db
        .select()
        .from(attendance)
        .where(and(
          eq(attendance.companyId, membership.company.id),
          eq(attendance.employeeId, myEmp.id),
        ))
        .orderBy(desc(attendance.date));
      const records = allRecords.filter((r) => {
        const d = new Date(r.date);
        return d >= start && d < end;
      });
      const summary = records.reduce(
        (acc, r) => {
          acc.total++;
          if (r.status === "present") acc.present++;
          else if (r.status === "absent") acc.absent++;
          else if (r.status === "late") acc.late++;
          else if (r.status === "half_day") acc.halfDay++;
          else if (r.status === "remote") acc.remote++;
          return acc;
        },
        { present: 0, absent: 0, late: 0, halfDay: 0, remote: 0, total: 0 }
      );
      return { records, summary };
    }),

  // ─── Get my company info (name, industry, role) ─────────────────────────────
  getMyCompanyInfo: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return null;
    return {
      id: membership.company.id,
      name: membership.company.name,
      nameAr: (membership.company as any).nameAr ?? null,
      country: membership.company.country,
      industry: (membership.company as any).industry ?? null,
      role: membership.member.role ?? null,
    };
  }),

  // ─── Cancel a pending leave request ──────────────────────────────────────────
  cancelLeaveRequest: protectedProcedure
    .input(z.object({ leaveId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      const myEmp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", membership.company.id);
      if (!myEmp) throw new TRPCError({ code: "NOT_FOUND" });
      const db = await requireDb();
      const [req] = await db.select().from(leaveRequests)
        .where(and(
          eq(leaveRequests.id, input.leaveId),
          eq(leaveRequests.employeeId, myEmp.id),
          eq(leaveRequests.companyId, membership.company.id),
        ))
        .limit(1);
      if (!req) throw new TRPCError({ code: "NOT_FOUND", message: "Leave request not found" });
      if (req.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Only pending requests can be cancelled" });
      await db.update(leaveRequests)
        .set({ status: "cancelled" })
        .where(eq(leaveRequests.id, input.leaveId));
      return { success: true };
    }),

  // ─── Update my contact info (phone, emergency contact) ───────────────────────
  updateMyContactInfo: protectedProcedure
    .input(z.object({
      phone: z.string().optional(),
      emergencyContactName: z.string().optional(),
      emergencyContactPhone: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      const myEmp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", membership.company.id);
      if (!myEmp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee record not found" });
      const db = await requireDb();
      const updateData: Record<string, any> = {};
      if (input.phone !== undefined) updateData.phone = input.phone;
      if (input.emergencyContactName !== undefined) updateData.emergencyContactName = input.emergencyContactName;
      if (input.emergencyContactPhone !== undefined) updateData.emergencyContactPhone = input.emergencyContactPhone;
      if (Object.keys(updateData).length > 0) {
        await db.update(employees).set(updateData).where(eq(employees.id, myEmp.id));
      }
      return { success: true };
    }),

  // ─── Get my real-time attendance records (from attendanceRecords, not attendance) ─
  getMyAttendanceRecords: protectedProcedure
    .input(z.object({ month: z.string() })) // YYYY-MM
    .query(async ({ input, ctx }) => {
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) return { records: [], summary: { present: 0, late: 0, total: 0, hoursWorked: 0 } };
      const myEmp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", membership.company.id);
      if (!myEmp) return { records: [], summary: { present: 0, late: 0, total: 0, hoursWorked: 0 } };
      const db = await requireDb();
      const [year, month] = input.month.split("-").map(Number);
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 1);
      const records = await db
        .select()
        .from(attendanceRecords)
        .where(and(
          eq(attendanceRecords.employeeId, myEmp.id),
          gte(attendanceRecords.checkIn, start),
          lte(attendanceRecords.checkIn, end),
        ))
        .orderBy(desc(attendanceRecords.checkIn));
      let totalHours = 0;
      records.forEach((r) => {
        if (r.checkOut && r.checkIn) {
          totalHours += (new Date(r.checkOut).getTime() - new Date(r.checkIn).getTime()) / 3600000;
        }
      });
      return {
        records,
        summary: {
          total: records.length,
          hoursWorked: Math.round(totalHours * 10) / 10,
        },
      };
    }),

  /**
   * Server-owned operational hints for portal shift/attendance presentation (not HR policy).
   * Aligns with scheduling.getMyActiveSchedule date rules + attendance.myToday record.
   */
  getMyOperationalHints: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input?.companyId);
      const db = await requireDb();
      const myEmp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", companyId);
      if (!myEmp) return null;

      const now = new Date();
      const businessDate = now.toISOString().slice(0, 10);
      const dow = now.getDay();

      const holidays = await db
        .select()
        .from(companyHolidays)
        .where(and(eq(companyHolidays.companyId, companyId), eq(companyHolidays.holidayDate, businessDate)));
      const holiday = holidays[0] ?? null;

      const querySchedules = (empUserId: number) =>
        db
          .select()
          .from(employeeSchedules)
          .where(
            and(
              eq(employeeSchedules.companyId, companyId),
              eq(employeeSchedules.employeeUserId, empUserId),
              eq(employeeSchedules.isActive, true),
              lte(employeeSchedules.startDate, businessDate),
              or(isNull(employeeSchedules.endDate), gte(employeeSchedules.endDate, businessDate))
            )
          );

      let allMySchedules = await querySchedules(ctx.user.id);
      if (allMySchedules.length === 0) {
        const [empRow] = await db
          .select({ id: employees.id })
          .from(employees)
          .where(and(eq(employees.companyId, companyId), eq(employees.userId, ctx.user.id)))
          .limit(1);
        if (empRow) {
          allMySchedules = await querySchedules(empRow.id);
        }
      }

      let hasSchedule = false;
      let isWorkingDay = false;
      let shiftStart: string | null = null;
      let shiftEnd: string | null = null;
      let gracePeriodMinutes = 15;

      if (allMySchedules.length > 0) {
        hasSchedule = true;
        const todayScheduleRow = allMySchedules.find((s) =>
          s.workingDays.split(",").map(Number).includes(dow)
        );
        const mySchedule = todayScheduleRow ?? allMySchedules[0];
        isWorkingDay = !!todayScheduleRow && !holiday;
        const [st] = await db
          .select()
          .from(shiftTemplates)
          .where(eq(shiftTemplates.id, mySchedule.shiftTemplateId))
          .limit(1);
        if (st) {
          shiftStart = st.startTime;
          shiftEnd = st.endTime;
          gracePeriodMinutes = st.gracePeriodMinutes ?? 15;
        }
      }

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const [record] = await db
        .select()
        .from(attendanceRecords)
        .where(and(eq(attendanceRecords.employeeId, myEmp.id), gte(attendanceRecords.checkIn, todayStart)))
        .orderBy(desc(attendanceRecords.checkIn))
        .limit(1);

      const checkIn = record?.checkIn ? new Date(record.checkIn) : null;
      const checkOut = record?.checkOut ? new Date(record.checkOut) : null;

      const pendingRows = await db
        .select({ id: attendanceCorrections.id })
        .from(attendanceCorrections)
        .where(and(eq(attendanceCorrections.employeeUserId, ctx.user.id), eq(attendanceCorrections.status, "pending")));
      const pendingCorrectionCount = pendingRows.length;

      return computePortalOperationalHints({
        now,
        businessDate,
        startTime: shiftStart,
        endTime: shiftEnd,
        isHoliday: !!holiday,
        isWorkingDay,
        hasSchedule,
        hasShift: !!(shiftStart && shiftEnd),
        checkIn,
        checkOut,
        pendingCorrectionCount,
        gracePeriodMinutes,
      });
    }),
});
