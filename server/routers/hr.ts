import { TRPCError } from "@trpc/server";
import { z } from "zod";
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
    .input(z.object({ status: z.string().optional(), department: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) return [];
      return getEmployees(membership.company.id, input);
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
        email: z.string().email().optional(),
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
      })
    )
    .mutation(async ({ input, ctx }) => {
      const membership = await getActiveCompanyMembership(ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "No company membership" });
      requireNotAuditor(membership.role, "External Auditors cannot create employees.");
      const companyId = membership.companyId;
      await createEmployee({
        ...input,
        companyId,
        salary: input.salary ? String(input.salary) : undefined,
        hireDate: input.hireDate ? new Date(input.hireDate) : undefined,
      });
      return { success: true };
    }),

  updateEmployee: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        department: z.string().optional(),
        position: z.string().optional(),
        status: z.enum(["active", "on_leave", "terminated", "resigned"]).optional(),
        salary: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const _auditorCheck = await getActiveCompanyMembership(ctx.user.id);
      if (_auditorCheck) requireNotAuditor(_auditorCheck.role, "External Auditors cannot update employees.");
      const { id, ...data } = input;
      const existing = await getEmployeeById(id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      await assertRowBelongsToActiveCompany(ctx.user, existing.companyId, "Employee");
      const updateData: any = { ...data };
      if (data.salary !== undefined) updateData.salary = String(data.salary);
      await updateEmployee(id, updateData);
      return { success: true };
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
    .input(z.object({ employeeId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) return [];
      return getLeaveRequests(membership.company.id, input.employeeId);
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
      return { success: true };
    }),

  // Payroll
  listPayroll: protectedProcedure
    .input(z.object({ year: z.number().optional(), month: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) return [];
      return getPayrollRecords(membership.company.id, input.year, input.month);
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

  departments: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return [];
    const emps = await getEmployees(membership.company.id);
    const depts = Array.from(new Set(emps.map((e) => e.department).filter(Boolean)));
    return depts;
  }),

  // ── Attendance ──────────────────────────────────────────────────────────────
  listAttendance: protectedProcedure
    .input(z.object({ month: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) return [];
      return getAttendance(membership.company.id, input.month);
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
    .input(z.object({ month: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) return { present: 0, absent: 0, late: 0, half_day: 0, remote: 0, byDay: [] };
      return getAttendanceStats(membership.company.id, input.month);
    }),

  getStats: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return { total: 0, active: 0, onLeave: 0, terminated: 0, omani: 0, expat: 0, omanisationRate: 0, departments: 0, avgSalary: 0, totalPayroll: 0 };
    const emps = await getEmployees(membership.company.id);
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
