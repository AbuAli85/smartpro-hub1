import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { workPermits, employees } from "../../drizzle/schema";
import { sendEmployeeNotification } from "./employeePortal";
import { getDb } from "../db";
import {
  createAttendanceRecord,
  deleteAttendanceRecord,
  getAttendanceRecordById,
  getAttendanceStats,
  updateAttendanceRecord,
  createEmployee,
  createJobApplication,
  createJobPosting,
  createLeaveRequest,
  createPayrollRecord,
  createPerformanceReview,
  getAttendance,
  getEmployeeById,
  getEmployees,
  getJobApplicationById,
  getJobApplications,
  getJobPostingById,
  getJobPostings,
  getLeaveRequestById,
  getLeaveRequests,
  getPayrollRecordById,
  getPayrollRecords,
  getPerformanceReviews,
  getUserCompany,
  updateEmployee,
  updateJobApplication,
  updateJobPosting,
  updateLeaveRequest,
  updatePayrollRecord,
} from "../db";
import { assertRowBelongsToActiveCompany, requireActiveCompanyId } from "../_core/tenant";
import { getActiveCompanyMembership, requireNotAuditor } from "../_core/membership";
import { protectedProcedure, router } from "../_core/trpc";

export const hrRouter = router({
  // Employees
  listEmployees: protectedProcedure
    .input(z.object({ status: z.string().optional(), department: z.string().optional(), companyId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const { companyId: inputCid, ...filters } = input;
      const cid = await requireActiveCompanyId(ctx.user.id, inputCid).catch(() => null);
      if (!cid) return [];
      return getEmployees(cid, filters);
    }),

  getEmployee: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
    const emp = await getEmployeeById(input.id);
    if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
    await assertRowBelongsToActiveCompany(ctx.user, emp.companyId, "Employee");
    return emp;
  }),

  createEmployee: protectedProcedure
    .input(
      z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        firstNameAr: z.string().optional(),
        lastNameAr: z.string().optional(),
        email: z.string().email().optional().or(z.literal("")).transform(v => v || undefined),
        phone: z.string().optional(),
        nationality: z.string().optional(),
        passportNumber: z.string().optional(),
        nationalId: z.string().optional(),
        department: z.string().optional(),
        position: z.string().optional(),
        employmentType: z.enum(["full_time", "part_time", "contract", "intern"]).default("full_time"),
        salary: z.number().optional(),
        currency: z.string().default("OMR"),
        hireDate: z.string().optional(),
        employeeNumber: z.string().optional(),
        // Extended fields
        workPermitNumber: z.string().optional(),
        visaNumber: z.string().optional(),
        occupationCode: z.string().optional(),
        occupationName: z.string().optional(),
        workPermitExpiry: z.string().optional(),
        visaExpiry: z.string().optional(),
        passportExpiry: z.string().optional(),
        // New extended HR fields
        dateOfBirth: z.string().optional(),
        gender: z.enum(["male", "female"]).optional(),
        maritalStatus: z.enum(["single", "married", "divorced", "widowed"]).optional(),
        profession: z.string().optional(),
        visaExpiryDate: z.string().optional(),
        workPermitExpiryDate: z.string().optional(),
        pasiNumber: z.string().optional(),
        bankName: z.string().optional(),
        bankAccountNumber: z.string().optional(),
        emergencyContactName: z.string().optional(),
        emergencyContactPhone: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const membership = await getActiveCompanyMembership(ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "No company membership" });
      requireNotAuditor(membership.role, "External Auditors cannot create employees.");
      const companyId = membership.companyId;
      const { workPermitNumber, visaNumber, occupationCode, occupationName, workPermitExpiry, visaExpiry, passportExpiry,
        dateOfBirth, visaExpiryDate, workPermitExpiryDate, ...empData } = input;
      const emp = await createEmployee({
        ...empData,
        companyId,
        salary: empData.salary ? String(empData.salary) : undefined,
        hireDate: empData.hireDate ? new Date(empData.hireDate) : undefined,
        dateOfBirth: dateOfBirth || undefined,
        visaExpiryDate: visaExpiryDate || undefined,
        workPermitExpiryDate: workPermitExpiryDate || undefined,
      } as any);
      // If work permit number provided, create a work permit record
      if (workPermitNumber && emp) {
        const db = await getDb();
        if (db) {
          await db.insert(workPermits).values({
            companyId,
            employeeId: (emp as any).insertId ?? (emp as any).id ?? 0,
            workPermitNumber,
            labourAuthorisationNumber: visaNumber ?? null,
            occupationCode: occupationCode ?? null,
            occupationTitleEn: occupationName ?? null,
            issueDate: null,
            expiryDate: workPermitExpiry ? new Date(workPermitExpiry) : null,
            permitStatus: "active",
          }).catch(() => { /* ignore duplicate */ });
        }
      }
      return { success: true };
    }),

  updateEmployee: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        firstNameAr: z.string().optional(),
        lastNameAr: z.string().optional(),
        email: z.string().email().optional().or(z.literal("")).transform(v => v || undefined),
        phone: z.string().optional(),
        nationality: z.string().optional(),
        nationalId: z.string().optional(),
        passportNumber: z.string().optional(),
        department: z.string().optional(),
        position: z.string().optional(),
        employmentType: z.enum(["full_time", "part_time", "contract", "intern"]).optional(),
        status: z.enum(["active", "on_leave", "terminated", "resigned"]).optional(),
        salary: z.number().optional(),
        currency: z.string().optional(),
        hireDate: z.string().optional(),
        terminationDate: z.string().optional(),
        employeeNumber: z.string().optional(),
        // Work permit / visa fields
        workPermitNumber: z.string().optional(),
        visaNumber: z.string().optional(),
        occupationCode: z.string().optional(),
        occupationName: z.string().optional(),
        workPermitExpiry: z.string().optional(),
        visaExpiry: z.string().optional(),
        passportExpiry: z.string().optional(),
        // Extended HR fields
        dateOfBirth: z.string().optional(),
        gender: z.enum(["male", "female"]).optional(),
        maritalStatus: z.enum(["single", "married", "divorced", "widowed"]).optional(),
        profession: z.string().optional(),
        visaExpiryDate: z.string().optional(),
        workPermitExpiryDate: z.string().optional(),
        pasiNumber: z.string().optional(),
        bankName: z.string().optional(),
        bankAccountNumber: z.string().optional(),
        emergencyContactName: z.string().optional(),
        emergencyContactPhone: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const _auditorCheck = await getActiveCompanyMembership(ctx.user.id);
      if (_auditorCheck) requireNotAuditor(_auditorCheck.role, "External Auditors cannot update employees.");
      const { id, workPermitNumber, visaNumber, occupationCode, occupationName, workPermitExpiry, visaExpiry, passportExpiry,
        dateOfBirth, visaExpiryDate, workPermitExpiryDate, ...data } = input;
      const existing = await getEmployeeById(id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      await assertRowBelongsToActiveCompany(ctx.user, existing.companyId, "Employee");
      const updateData: any = { ...data };
      if (data.salary !== undefined) updateData.salary = String(data.salary);
      if (data.hireDate !== undefined) updateData.hireDate = data.hireDate ? new Date(data.hireDate) : null;
      if (data.terminationDate !== undefined) updateData.terminationDate = data.terminationDate ? new Date(data.terminationDate) : null;
      // Extended date fields (stored as DATE strings in MySQL)
      if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth || null;
      if (visaExpiryDate !== undefined) updateData.visaExpiryDate = visaExpiryDate || null;
      if (workPermitExpiryDate !== undefined) updateData.workPermitExpiryDate = workPermitExpiryDate || null;
      await updateEmployee(id, updateData);
      // Update or create work permit record if permit fields provided
      if (workPermitNumber !== undefined || visaNumber !== undefined || workPermitExpiry !== undefined) {
        const db = await getDb();
        if (db) {
          const existing_permits = await db.select({ id: workPermits.id })
            .from(workPermits)
            .where(eq(workPermits.employeeId, id))
            .limit(1);
          const permitUpdate: any = {};
          if (workPermitNumber !== undefined) permitUpdate.workPermitNumber = workPermitNumber;
          if (visaNumber !== undefined) permitUpdate.labourAuthorisationNumber = visaNumber;
          if (occupationCode !== undefined) permitUpdate.occupationCode = occupationCode;
          if (occupationName !== undefined) permitUpdate.occupationTitleEn = occupationName;
          if (workPermitExpiry !== undefined) permitUpdate.expiryDate = workPermitExpiry ? new Date(workPermitExpiry) : null;
          if (existing_permits.length > 0) {
            await db.update(workPermits).set(permitUpdate).where(eq(workPermits.id, existing_permits[0].id));
          } else if (workPermitNumber) {
            await db.insert(workPermits).values({
              companyId: existing.companyId,
              employeeId: id,
              workPermitNumber,
              labourAuthorisationNumber: visaNumber ?? null,
              occupationCode: occupationCode ?? null,
              occupationTitleEn: occupationName ?? null,
              expiryDate: workPermitExpiry ? new Date(workPermitExpiry) : null,
              permitStatus: "active",
            }).catch(() => { /* ignore */ });
          }
        }
      }
      return { success: true };
    }),

  // Get employee with linked work permit details
  getEmployeeWithPermit: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const emp = await getEmployeeById(input.id);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      await assertRowBelongsToActiveCompany(ctx.user, emp.companyId, "Employee");
      const db = await getDb();
      let permit = null;
      if (db) {
        const permits = await db.select().from(workPermits)
          .where(eq(workPermits.employeeId, input.id))
          .orderBy(desc(workPermits.expiryDate))
          .limit(1);
        permit = permits[0] ?? null;
      }
      return { ...emp, permit };
    }),

  // Job Postings
  listJobs: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return [];
    return getJobPostings(membership.company.id);
  }),

  createJob: protectedProcedure
    .input(
      z.object({
        title: z.string().min(2),
        department: z.string().optional(),
        location: z.string().optional(),
        type: z.enum(["full_time", "part_time", "contract", "intern"]).default("full_time"),
        description: z.string().optional(),
        requirements: z.string().optional(),
        salaryMin: z.number().optional(),
        salaryMax: z.number().optional(),
        applicationDeadline: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id);
      await createJobPosting({
        ...input,
        companyId,
        createdBy: ctx.user.id,
        status: "open",
        salaryMin: input.salaryMin ? String(input.salaryMin) : undefined,
        salaryMax: input.salaryMax ? String(input.salaryMax) : undefined,
        applicationDeadline: input.applicationDeadline ? new Date(input.applicationDeadline) : undefined,
      });
      return { success: true };
    }),

  updateJob: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().optional(),
        status: z.enum(["draft", "open", "closed", "on_hold"]).optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const job = await getJobPostingById(id);
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      await assertRowBelongsToActiveCompany(ctx.user, job.companyId, "Job");
      await updateJobPosting(id, data);
      return { success: true };
    }),

  // Applications (ATS)
  listApplications: protectedProcedure
    .input(z.object({ jobId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) return [];
      return getJobApplications(input.jobId, membership.company.id);
    }),

  updateApplication: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        stage: z.enum(["applied", "screening", "interview", "assessment", "offer", "hired", "rejected"]).optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const app = await getJobApplicationById(id);
      if (!app) throw new TRPCError({ code: "NOT_FOUND", message: "Application not found" });
      await assertRowBelongsToActiveCompany(ctx.user, app.companyId, "Application");
      await updateJobApplication(id, data);
      return { success: true };
    }),

  // Leave Requests
  listLeave: protectedProcedure
    .input(z.object({ employeeId: z.number().optional(), companyId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input.companyId).catch(() => null);
      if (!cid) return [];
      return getLeaveRequests(cid, input.employeeId);
    }),

  createLeave: protectedProcedure
    .input(
      z.object({
        employeeId: z.number(),
        leaveType: z.enum(["annual", "sick", "emergency", "maternity", "paternity", "unpaid", "other"]),
        startDate: z.string(),
        endDate: z.string(),
        days: z.number(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id);
      const emp = await getEmployeeById(input.employeeId);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      if (emp.companyId !== companyId) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      await createLeaveRequest({
        ...input,
        companyId,
        days: String(input.days),
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
      });
      return { success: true };
    }),

  updateLeave: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["pending", "approved", "rejected", "cancelled"]),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const row = await getLeaveRequestById(id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Leave request not found" });
      await assertRowBelongsToActiveCompany(ctx.user, row.companyId, "Leave request");
      await updateLeaveRequest(id, { ...data, approvedBy: ctx.user.id });
      // Notify the employee about the leave decision
      if (input.status === "approved" || input.status === "rejected") {
        const db = await getDb();
        if (db) {
          const [emp] = await db
            .select({ userId: employees.userId, firstName: employees.firstName, lastName: employees.lastName })
            .from(employees)
            .where(eq(employees.id, row.employeeId))
            .limit(1);
          if (emp?.userId) {
            const statusLabel = input.status === "approved" ? "Approved ✅" : "Rejected ❌";
            await sendEmployeeNotification({
              toUserId: emp.userId,
              companyId: row.companyId,
              type: "leave_decision",
              title: `Leave Request ${statusLabel}`,
              message: `Your ${(row.leaveType ?? "").replace("_", " ")} leave request has been ${input.status}.${input.notes ? " Note: " + input.notes : ""}`,
              link: "/my-portal",
            });
          }
        }
      }
      return { success: true };
    }),

  // Payroll
  listPayroll: protectedProcedure
    .input(z.object({ year: z.number().optional(), month: z.number().optional(), companyId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input.companyId).catch(() => null);
      if (!cid) return [];
      return getPayrollRecords(cid, input.year, input.month);
    }),

  createPayroll: protectedProcedure
    .input(
      z.object({
        employeeId: z.number(),
        periodMonth: z.number().min(1).max(12),
        periodYear: z.number(),
        basicSalary: z.number(),
        allowances: z.number().default(0),
        deductions: z.number().default(0),
        taxAmount: z.number().default(0),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id);
      const emp = await getEmployeeById(input.employeeId);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      if (emp.companyId !== companyId) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      const netSalary = input.basicSalary + input.allowances - input.deductions - input.taxAmount;
      await createPayrollRecord({
        ...input,
        companyId,
        basicSalary: String(input.basicSalary),
        allowances: String(input.allowances),
        deductions: String(input.deductions),
        taxAmount: String(input.taxAmount),
        netSalary: String(netSalary),
      });
      return { success: true };
    }),

  updatePayroll: protectedProcedure
    .input(z.object({ id: z.number(), status: z.enum(["draft", "approved", "paid"]) }))
    .mutation(async ({ input, ctx }) => {
      const row = await getPayrollRecordById(input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Payroll record not found" });
      await assertRowBelongsToActiveCompany(ctx.user, row.companyId, "Payroll record");
      const updateData: any = { status: input.status };
      if (input.status === "paid") updateData.paidAt = new Date();
      await updatePayrollRecord(input.id, updateData);
      // Notify the employee when their payslip is marked as paid
      if (input.status === "paid") {
        const db = await getDb();
        if (db) {
          const [emp] = await db
            .select({ userId: employees.userId, firstName: employees.firstName })
            .from(employees)
            .where(eq(employees.id, row.employeeId))
            .limit(1);
          if (emp?.userId) {
            await sendEmployeeNotification({
              toUserId: emp.userId,
              companyId: row.companyId,
              type: "payslip_ready",
              title: "💰 Payslip Ready",
              message: `Your salary for ${row.periodMonth}/${row.periodYear} has been processed and paid. View your payslip in My Portal.`,
              link: "/my-portal",
            });
          }
        }
      }
      return { success: true };
    }),

  // Performance Reviews
  listReviews: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return [];
    return getPerformanceReviews(membership.company.id);
  }),

  createReview: protectedProcedure
    .input(
      z.object({
        employeeId: z.number(),
        period: z.string(),
        overallScore: z.number().min(0).max(10).optional(),
        strengths: z.string().optional(),
        improvements: z.string().optional(),
        goals: z.string().optional(),
        comments: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id);
      const emp = await getEmployeeById(input.employeeId);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      if (emp.companyId !== companyId) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      await createPerformanceReview({
        ...input,
        companyId,
        reviewerId: ctx.user.id,
        overallScore: input.overallScore ? String(input.overallScore) : undefined,
      });
      return { success: true };
    }),

  departments: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input?.companyId).catch(() => null);
      if (!cid) return [];
      const emps = await getEmployees(cid);
      const depts = Array.from(new Set(emps.map((e) => e.department).filter(Boolean)));
      return depts;
    }),

  // ── Attendance ──────────────────────────────────────────────────────────────
  listAttendance: protectedProcedure
    .input(z.object({ month: z.string().optional(), companyId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input.companyId).catch(() => null);
      if (!cid) return [];
      return getAttendance(cid, input.month);
    }),

  createAttendance: protectedProcedure
    .input(z.object({
      employeeId: z.number(),
      date: z.string(),
      checkIn: z.string().optional(),
      checkOut: z.string().optional(),
      status: z.enum(["present", "absent", "late", "half_day", "remote"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id);
      const emp = await getEmployeeById(input.employeeId);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      if (emp.companyId !== companyId) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      await createAttendanceRecord({
        companyId,
        employeeId: input.employeeId,
        date: new Date(input.date),
        checkIn: input.checkIn ? new Date(input.checkIn) : undefined,
        checkOut: input.checkOut ? new Date(input.checkOut) : undefined,
        status: input.status,
        notes: input.notes,
      });
      return { success: true };
    }),

  updateAttendance: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["present", "absent", "late", "half_day", "remote"]).optional(),
      checkIn: z.string().optional(),
      checkOut: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, checkIn, checkOut, ...rest } = input;
      const row = await getAttendanceRecordById(id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Attendance record not found" });
      await assertRowBelongsToActiveCompany(ctx.user, row.companyId, "Attendance record");
      await updateAttendanceRecord(id, {
        ...rest,
        checkIn: checkIn ? new Date(checkIn) : undefined,
        checkOut: checkOut ? new Date(checkOut) : undefined,
      });
      return { success: true };
    }),

  deleteAttendance: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const row = await getAttendanceRecordById(input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Attendance record not found" });
      await assertRowBelongsToActiveCompany(ctx.user, row.companyId, "Attendance record");
      await deleteAttendanceRecord(input.id);
      return { success: true };
    }),

  attendanceStats: protectedProcedure
    .input(z.object({ month: z.string().optional(), companyId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input.companyId).catch(() => null);
      if (!cid) return { present: 0, absent: 0, late: 0, half_day: 0, remote: 0, byDay: [] };
      return getAttendanceStats(cid, input.month);
    }),

  // ── Leave Balance ─────────────────────────────────────────────────────────
  getLeaveBalance: protectedProcedure
    .input(z.object({ employeeId: z.number(), companyId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input.companyId).catch(() => null);
      if (!cid) throw new TRPCError({ code: "FORBIDDEN", message: "No company" });
      const allLeave = await getLeaveRequests(cid, input.employeeId);
      const ENTITLEMENTS: Record<string, number> = { annual: 30, sick: 10, emergency: 6, maternity: 50, paternity: 3, unpaid: 0, other: 0 };
      const usedByType: Record<string, number> = {};
      const pendingByType: Record<string, number> = {};
      for (const r of allLeave) {
        const t = r.leaveType ?? "annual";
        const days = parseFloat(r.days?.toString() ?? "0");
        if (r.status === "approved") usedByType[t] = (usedByType[t] ?? 0) + days;
        if (r.status === "pending") pendingByType[t] = (pendingByType[t] ?? 0) + days;
      }
      return Object.entries(ENTITLEMENTS).map(([type, entitled]) => ({
        type,
        entitled,
        used: usedByType[type] ?? 0,
        pending: pendingByType[type] ?? 0,
        remaining: Math.max(0, entitled - (usedByType[type] ?? 0)),
      }));
    }),

  getLeaveBalanceSummary: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
    const cid = await requireActiveCompanyId(ctx.user.id, input?.companyId).catch(() => null);
    if (!cid) return [];
    const emps = await getEmployees(cid);
    const activeEmps = emps.filter((e) => e.status === "active");
    const allLeave = await getLeaveRequests(cid);
    const ENTITLEMENTS: Record<string, number> = { annual: 30, sick: 10, emergency: 6 };
    return activeEmps.map((emp) => {
      const empLeave = allLeave.filter((r) => r.employeeId === emp.id);
      const usedByType: Record<string, number> = {};
      for (const r of empLeave) {
        if (r.status === "approved") {
          const t = r.leaveType ?? "annual";
          usedByType[t] = (usedByType[t] ?? 0) + parseFloat(r.days?.toString() ?? "0");
        }
      }
      return {
        employeeId: emp.id,
        name: `${emp.firstName} ${emp.lastName}`,
        department: emp.department ?? "",
        balances: Object.entries(ENTITLEMENTS).map(([type, entitled]) => ({
          type,
          entitled,
          used: usedByType[type] ?? 0,
          remaining: Math.max(0, entitled - (usedByType[type] ?? 0)),
        })),
      };
    });
  }),

  // ── Employee Profile Completeness ─────────────────────────────────────────
  getEmployeeCompleteness: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
    const cid = await requireActiveCompanyId(ctx.user.id, input?.companyId).catch(() => null);
    if (!cid) return [];
    const emps = await getEmployees(cid);
    const REQUIRED_FIELDS = ["firstName", "lastName", "email", "phone", "nationality", "department", "position", "hireDate", "salary"];
    const OPTIONAL_FIELDS = ["passportNumber", "nationalId", "dateOfBirth", "gender", "pasiNumber", "bankAccountNumber", "emergencyContactName", "workPermitNumber", "visaNumber"];
    return emps.map((emp) => {
      const reqFilled = REQUIRED_FIELDS.filter((f) => !!(emp as any)[f]).length;
      const optFilled = OPTIONAL_FIELDS.filter((f) => !!(emp as any)[f]).length;
      const score = Math.round(((reqFilled / REQUIRED_FIELDS.length) * 70) + ((optFilled / OPTIONAL_FIELDS.length) * 30));
      const missing = REQUIRED_FIELDS.filter((f) => !(emp as any)[f]);
      return {
        employeeId: emp.id,
        name: `${emp.firstName} ${emp.lastName}`,
        department: emp.department ?? "",
        score,
        missingRequired: missing,
        status: score >= 90 ? "complete" : score >= 60 ? "partial" : "incomplete",
      };
    });
  }),

  getStats: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
    const cid = await requireActiveCompanyId(ctx.user.id, input?.companyId).catch(() => null);
    if (!cid) return { total: 0, active: 0, onLeave: 0, terminated: 0, omani: 0, expat: 0, omanisationRate: 0, departments: 0, avgSalary: 0, totalPayroll: 0 };
    const emps = await getEmployees(cid);
    const active = emps.filter((e) => e.status === "active");
    const onLeave = emps.filter((e) => e.status === "on_leave");
    const terminated = emps.filter((e) => ["terminated", "resigned"].includes(e.status ?? ""));
    const omani = active.filter((e) => (e.nationality ?? "").toLowerCase().includes("oman"));
    const expat = active.filter((e) => !(e.nationality ?? "").toLowerCase().includes("oman"));
    const depts = new Set(active.map((e) => e.department).filter(Boolean));
    const salaries = active.filter((e) => e.salary).map((e) => parseFloat(e.salary ?? "0"));
    const avgSalary = salaries.length ? salaries.reduce((a, b) => a + b, 0) / salaries.length : 0;
    const totalPayroll = salaries.reduce((a, b) => a + b, 0);
    return {
      total: emps.length,
      active: active.length,
      onLeave: onLeave.length,
      terminated: terminated.length,
      omani: omani.length,
      expat: expat.length,
      omanisationRate: active.length > 0 ? Math.round((omani.length / active.length) * 100) : 0,
      departments: depts.size,
      avgSalary: Math.round(avgSalary * 1000) / 1000,
      totalPayroll: Math.round(totalPayroll * 1000) / 1000,
    };
  }),
});
