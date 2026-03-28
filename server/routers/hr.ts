import { z } from "zod";
import {
  createEmployee,
  createJobApplication,
  createJobPosting,
  createLeaveRequest,
  createPayrollRecord,
  createPerformanceReview,
  getEmployeeById,
  getEmployees,
  getJobApplications,
  getJobPostings,
  getLeaveRequests,
  getPayrollRecords,
  getPerformanceReviews,
  getUserCompany,
  updateEmployee,
  updateJobApplication,
  updateJobPosting,
  updateLeaveRequest,
  updatePayrollRecord,
} from "../db";
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

  getEmployee: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    return getEmployeeById(input.id);
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
      const membership = await getUserCompany(ctx.user.id);
      const companyId = membership?.company.id ?? 1;
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
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
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
      const membership = await getUserCompany(ctx.user.id);
      const companyId = membership?.company.id ?? 1;
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
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateJobPosting(id, data);
      return { success: true };
    }),

  // Applications (ATS)
  listApplications: protectedProcedure
    .input(z.object({ jobId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const membership = await getUserCompany(ctx.user.id);
      return getJobApplications(input.jobId, membership?.company.id);
    }),

  updateApplication: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        stage: z.enum(["applied", "screening", "interview", "assessment", "offer", "hired", "rejected"]).optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
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
      const membership = await getUserCompany(ctx.user.id);
      const companyId = membership?.company.id ?? 1;
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
      const membership = await getUserCompany(ctx.user.id);
      const companyId = membership?.company.id ?? 1;
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
    .mutation(async ({ input }) => {
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
      const membership = await getUserCompany(ctx.user.id);
      const companyId = membership?.company.id ?? 1;
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
});
