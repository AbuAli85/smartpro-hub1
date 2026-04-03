import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and, desc, or, isNull, inArray } from "drizzle-orm";
import {
  employees, attendance, leaveRequests, payrollRecords,
  employeeDocuments, employeeTasks, announcements, announcementReads,
  notifications, companyMembers, users,
} from "../../drizzle/schema";
import { getDb, getUserCompany } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

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
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return { requests: [], balance: { annual: 0, sick: 0, emergency: 0 } };
    const myEmp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", membership.company.id);
    if (!myEmp) return { requests: [], balance: { annual: 0, sick: 0, emergency: 0 } };
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

    return {
      requests,
      balance: {
        annual: Math.max(0, 30 - calcDays(approved.filter((r) => r.leaveType === "annual"))),
        sick: Math.max(0, 15 - calcDays(approved.filter((r) => r.leaveType === "sick"))),
        emergency: Math.max(0, 5 - calcDays(approved.filter((r) => r.leaveType === "emergency"))),
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
  getMyTasks: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return [];
    const myEmp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", membership.company.id);
    if (!myEmp) return [];
    const db = await requireDb();
    return db
      .select()
      .from(employeeTasks)
      .where(and(
        eq(employeeTasks.companyId, membership.company.id),
        eq(employeeTasks.assignedToEmployeeId, myEmp.id),
      ))
      .orderBy(desc(employeeTasks.createdAt));
  }),

  // ─── Mark my task as complete ─────────────────────────────────────────────
  completeTask: protectedProcedure
    .input(z.object({ taskId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await requireDb();
      const [task] = await db.select().from(employeeTasks).where(eq(employeeTasks.id, input.taskId));
      if (!task || task.companyId !== membership.company.id)
        throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(employeeTasks).set({ status: "completed", completedAt: new Date() })
        .where(eq(employeeTasks.id, input.taskId));
      return { success: true };
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
});
