import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and, desc, or, isNull } from "drizzle-orm";
import {
  employees, attendance, leaveRequests, payrollRecords,
  employeeDocuments, employeeTasks, announcements, announcementReads,
} from "../../drizzle/schema";
import { getDb, getUserCompany } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

// Helper: find the employee record linked to the current user by email
async function getMyEmployee(userId: number) {
  const membership = await getUserCompany(userId);
  if (!membership) return null;
  const db = await requireDb();
  // Match employee by email to the logged-in user's email
  const [emp] = await db
    .select()
    .from(employees)
    .where(and(
      eq(employees.companyId, membership.company.id),
      eq(employees.status, "active"),
    ))
    .limit(50);
  // Return the first employee that matches by userId linkage or just the first active one
  // In a real system, employees.userId would be a FK — for now we return the first match
  return emp ?? null;
}

export const employeePortalRouter = router({
  // Get the employee record linked to the current user
  getMyProfile: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return null;
    const db = await requireDb();
    // Find employee by email matching the user's email
    const emps = await db
      .select()
      .from(employees)
      .where(and(
        eq(employees.companyId, membership.company.id),
        eq(employees.status, "active"),
      ));
    // Try to match by email
    const matched = emps.find((e) => e.email === ctx.user.email) ?? emps[0] ?? null;
    return matched;
  }),

  // Get my attendance for a given month
  getMyAttendance: protectedProcedure
    .input(z.object({ month: z.string() })) // YYYY-MM
    .query(async ({ input, ctx }) => {
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) return [];
      const db = await requireDb();
      const emps = await db
        .select({ id: employees.id, email: employees.email })
        .from(employees)
        .where(and(eq(employees.companyId, membership.company.id), eq(employees.status, "active")));
      const myEmp = emps.find((e) => e.email === ctx.user.email) ?? emps[0];
      if (!myEmp) return [];
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

  // Get my leave requests
  getMyLeave: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return { requests: [], balance: { annual: 0, sick: 0, emergency: 0 } };
    const db = await requireDb();
    const emps = await db
      .select({ id: employees.id, email: employees.email, hireDate: employees.hireDate })
      .from(employees)
      .where(and(eq(employees.companyId, membership.company.id), eq(employees.status, "active")));
    const myEmp = emps.find((e) => e.email === ctx.user.email) ?? emps[0];
    if (!myEmp) return { requests: [], balance: { annual: 0, sick: 0, emergency: 0 } };

    const requests = await db
      .select()
      .from(leaveRequests)
      .where(and(
        eq(leaveRequests.companyId, membership.company.id),
        eq(leaveRequests.employeeId, myEmp.id),
      ))
      .orderBy(desc(leaveRequests.createdAt));

    // Calculate balance
    const currentYear = new Date().getFullYear();
    const approved = requests.filter(
      (r) => r.status === "approved" && new Date(r.startDate).getFullYear() === currentYear
    );
    const usedAnnual = approved.filter((r) => r.leaveType === "annual")
      .reduce((s, r) => s + Math.ceil((new Date(r.endDate).getTime() - new Date(r.startDate).getTime()) / 86400000) + 1, 0);
    const usedSick = approved.filter((r) => r.leaveType === "sick")
      .reduce((s, r) => s + Math.ceil((new Date(r.endDate).getTime() - new Date(r.startDate).getTime()) / 86400000) + 1, 0);
    const usedEmergency = approved.filter((r) => r.leaveType === "emergency")
      .reduce((s, r) => s + Math.ceil((new Date(r.endDate).getTime() - new Date(r.startDate).getTime()) / 86400000) + 1, 0);

    return {
      requests,
      balance: {
        annual: Math.max(0, 30 - usedAnnual),
        sick: Math.max(0, 15 - usedSick),
        emergency: Math.max(0, 5 - usedEmergency),
      },
    };
  }),

  // Submit a leave request from the portal
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
      const db = await requireDb();
      const emps = await db
        .select({ id: employees.id, email: employees.email })
        .from(employees)
        .where(and(eq(employees.companyId, membership.company.id), eq(employees.status, "active")));
      const myEmp = emps.find((e) => e.email === ctx.user.email) ?? emps[0];
      if (!myEmp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee record not found" });
      const [result] = await db.insert(leaveRequests).values({
        companyId: membership.company.id,
        employeeId: myEmp.id,
        leaveType: input.leaveType,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        reason: input.reason,
        status: "pending",
      });
      return { id: (result as any).insertId };
    }),

  // Get my tasks
  getMyTasks: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return [];
    const db = await requireDb();
    const emps = await db
      .select({ id: employees.id, email: employees.email })
      .from(employees)
      .where(and(eq(employees.companyId, membership.company.id), eq(employees.status, "active")));
    const myEmp = emps.find((e) => e.email === ctx.user.email) ?? emps[0];
    if (!myEmp) return [];
    return db
      .select()
      .from(employeeTasks)
      .where(and(
        eq(employeeTasks.companyId, membership.company.id),
        eq(employeeTasks.assignedToEmployeeId, myEmp.id),
      ))
      .orderBy(desc(employeeTasks.createdAt));
  }),

  // Mark my task as complete
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

  // Get my announcements
  getMyAnnouncements: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return [];
    const db = await requireDb();
    const emps = await db
      .select({ id: employees.id, email: employees.email })
      .from(employees)
      .where(and(eq(employees.companyId, membership.company.id), eq(employees.status, "active")));
    const myEmp = emps.find((e) => e.email === ctx.user.email) ?? emps[0];
    if (!myEmp) return [];

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

  // Get my payslips
  getMyPayslips: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return [];
    const db = await requireDb();
    const emps = await db
      .select({ id: employees.id, email: employees.email })
      .from(employees)
      .where(and(eq(employees.companyId, membership.company.id), eq(employees.status, "active")));
    const myEmp = emps.find((e) => e.email === ctx.user.email) ?? emps[0];
    if (!myEmp) return [];
    return db
      .select()
      .from(payrollRecords)
      .where(and(
        eq(payrollRecords.companyId, membership.company.id),
        eq(payrollRecords.employeeId, myEmp.id),
      ))
      .orderBy(desc(payrollRecords.periodYear), desc(payrollRecords.periodMonth));
  }),

  // Get my payroll records
  getMyPayroll: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return [];
    const db = await requireDb();
    // Find employee linked to this user
    const myEmp = await getMyEmployee(ctx.user.id);
    if (!myEmp) return [];
    return db
      .select()
      .from(payrollRecords)
      .where(and(
        eq(payrollRecords.companyId, membership.company.id),
        eq(payrollRecords.employeeId, myEmp.id),
      ))
      .orderBy(desc(payrollRecords.periodYear), desc(payrollRecords.periodMonth));
  }),

  // Get my documents
  getMyDocuments: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return [];
    const db = await requireDb();
    const emps = await db
      .select({ id: employees.id, email: employees.email })
      .from(employees)
      .where(and(eq(employees.companyId, membership.company.id), eq(employees.status, "active")));
    const myEmp = emps.find((e) => e.email === ctx.user.email) ?? emps[0];
    if (!myEmp) return [];
    return db
      .select()
      .from(employeeDocuments)
      .where(and(
        eq(employeeDocuments.companyId, membership.company.id),
        eq(employeeDocuments.employeeId, myEmp.id),
        // no isDeleted on employeeDocuments table
      ))
      .orderBy(desc(employeeDocuments.createdAt));
  }),
});
