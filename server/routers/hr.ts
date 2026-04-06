import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and, desc, gte, lte, count, sum } from "drizzle-orm";
import {
  workPermits,
  employees,
  attendanceRecords,
  attendance,
  leaveRequests,
  kpiTargets,
  kpiAchievements,
  payrollRuns,
  departments,
  positions,
  payrollRecords,
  performanceReviews,
} from "../../drizzle/schema";
import { sendEmployeeNotification } from "./employeePortal";
import {
  createAttendanceRecordTx,
  getAttendanceRecordById,
  getAttendanceStats,
  createEmployee,
  createJobApplication,
  createJobPosting,
  createLeaveRequest,
  createPayrollRecord,
  createPerformanceReview,
  getAttendance,
  getDb,
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
  updateEmployee,
  updateJobApplication,
  updateJobPosting,
  updateLeaveRequest,
  updatePayrollRecord,
} from "../db";
import { assertRowBelongsToActiveCompany, requireActiveCompanyId } from "../_core/tenant";
import { getActiveCompanyMembership, requireNotAuditor } from "../_core/membership";
import { protectedProcedure, router } from "../_core/trpc";
import {
  ATTENDANCE_AUDIT_ACTION,
  ATTENDANCE_AUDIT_ENTITY,
  ATTENDANCE_AUDIT_SOURCE,
} from "@shared/attendanceAuditTaxonomy";
import { attendancePayloadJson, insertAttendanceAuditRow } from "../attendanceAudit";

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
        companyId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const membership = await getActiveCompanyMembership(ctx.user.id, input.companyId);
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
  listJobs: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const m = await getActiveCompanyMembership(ctx.user.id, input?.companyId);
      if (!m) return [];
      return getJobPostings(m.companyId);
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
        companyId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId);
      const { companyId: _omit, ...jobData } = input;
      await createJobPosting({
        ...jobData,
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
    .input(z.object({ jobId: z.number().optional(), companyId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const m = await getActiveCompanyMembership(ctx.user.id, input.companyId);
      if (!m) return [];
      return getJobApplications(input.jobId, m.companyId);
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
        companyId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId);
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
        companyId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId);
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
  listReviews: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const m = await getActiveCompanyMembership(ctx.user.id, input?.companyId);
      if (!m) return [];
      return getPerformanceReviews(m.companyId);
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
        companyId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId);
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
      /** Required audit trail for manual HR entries */
      notes: z.string().min(10, "Enter a reason for this entry (min 10 characters) for the audit log"),
      companyId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId);
      const membership = await getActiveCompanyMembership(ctx.user.id, companyId);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "No company membership" });
      requireNotAuditor(membership.role);
      const emp = await getEmployeeById(input.employeeId);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      if (emp.companyId !== companyId) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      const auditPrefix = `[HR audit userId=${ctx.user.id} at ${new Date().toISOString()}] `;
      const fullNotes = auditPrefix + input.notes.trim();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.transaction(async (tx) => {
        const hrId = await createAttendanceRecordTx(tx, {
          companyId,
          employeeId: input.employeeId,
          date: new Date(input.date),
          checkIn: input.checkIn ? new Date(input.checkIn) : undefined,
          checkOut: input.checkOut ? new Date(input.checkOut) : undefined,
          status: input.status,
          notes: fullNotes,
        });
        await insertAttendanceAuditRow(tx, {
          companyId,
          employeeId: input.employeeId,
          hrAttendanceId: hrId,
          actorUserId: ctx.user.id,
          actorRole: membership.role,
          actionType: ATTENDANCE_AUDIT_ACTION.HR_ATTENDANCE_CREATE,
          entityType: ATTENDANCE_AUDIT_ENTITY.HR_ATTENDANCE,
          entityId: hrId,
          afterPayload:
            attendancePayloadJson({
              id: hrId,
              companyId,
              employeeId: input.employeeId,
              date: input.date,
              checkIn: input.checkIn ?? null,
              checkOut: input.checkOut ?? null,
              status: input.status,
              notes: fullNotes,
            }) ?? undefined,
          reason: input.notes.trim(),
          source: ATTENDANCE_AUDIT_SOURCE.HR_PANEL,
        });
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
      const membership = await getActiveCompanyMembership(ctx.user.id, row.companyId);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "No company membership" });
      requireNotAuditor(membership.role);
      const beforePayload = attendancePayloadJson(row);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.transaction(async (tx) => {
        await tx
          .update(attendance)
          .set({
            ...rest,
            checkIn: checkIn ? new Date(checkIn) : undefined,
            checkOut: checkOut ? new Date(checkOut) : undefined,
          })
          .where(eq(attendance.id, id));
        const [afterRow] = await tx.select().from(attendance).where(eq(attendance.id, id)).limit(1);
        await insertAttendanceAuditRow(tx, {
          companyId: row.companyId,
          employeeId: row.employeeId,
          hrAttendanceId: id,
          actorUserId: ctx.user.id,
          actorRole: membership.role,
          actionType: ATTENDANCE_AUDIT_ACTION.HR_ATTENDANCE_UPDATE,
          entityType: ATTENDANCE_AUDIT_ENTITY.HR_ATTENDANCE,
          entityId: id,
          beforePayload: beforePayload ?? undefined,
          afterPayload: attendancePayloadJson(afterRow) ?? undefined,
          reason: input.notes?.trim(),
          source: ATTENDANCE_AUDIT_SOURCE.HR_PANEL,
        });
      });
      return { success: true };
    }),

  deleteAttendance: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const row = await getAttendanceRecordById(input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Attendance record not found" });
      await assertRowBelongsToActiveCompany(ctx.user, row.companyId, "Attendance record");
      const membership = await getActiveCompanyMembership(ctx.user.id, row.companyId);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "No company membership" });
      requireNotAuditor(membership.role);
      const beforePayload = attendancePayloadJson(row);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.transaction(async (tx) => {
        await tx.delete(attendance).where(eq(attendance.id, input.id));
        await insertAttendanceAuditRow(tx, {
          companyId: row.companyId,
          employeeId: row.employeeId,
          hrAttendanceId: input.id,
          actorUserId: ctx.user.id,
          actorRole: membership.role,
          actionType: ATTENDANCE_AUDIT_ACTION.HR_ATTENDANCE_DELETE,
          entityType: ATTENDANCE_AUDIT_ENTITY.HR_ATTENDANCE,
          entityId: input.id,
          beforePayload: beforePayload ?? undefined,
          source: ATTENDANCE_AUDIT_SOURCE.HR_PANEL,
        });
      });
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

  // ─── Document Expiry Dashboard ────────────────────────────────────────────
  getExpiringDocuments: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      warnDays: z.number().int().min(1).max(365).default(30),
      docType: z.enum(["all", "visa", "work_permit"]).default("all"),
      status: z.enum(["all", "expired", "expiring_soon"]).default("all"),
    }))
    .query(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input.companyId).catch(() => null);
      if (!cid) return { rows: [], stats: { total: 0, expired: 0, expiringSoon: 0 } };
      const db = await getDb();
      if (!db) return { rows: [], stats: { total: 0, expired: 0, expiringSoon: 0 } };

      const allEmps = await db.select().from(employees)
        .where(and(eq(employees.companyId, cid), eq(employees.status, "active")));

      const now = new Date();

      type DocRow = {
        employeeId: number;
        employeeName: string;
        employeeNumber: string | null;
        department: string | null;
        nationality: string | null;
        docType: "visa" | "work_permit";
        docNumber: string | null;
        expiryDate: string | null;
        daysUntilExpiry: number | null;
        status: "expired" | "expiring_soon";
      };

      const rows: DocRow[] = [];

      for (const emp of allEmps) {
        const fullName = [emp.firstName, emp.lastName].filter(Boolean).join(" ");

        const addDoc = (docType: "visa" | "work_permit", docNumber: string | null, expiryDate: Date | string | null) => {
          if (!expiryDate) return;
          const expDate = new Date(expiryDate);
          const daysUntil = Math.ceil((expDate.getTime() - now.getTime()) / 86400000);
          const docStatus: "expired" | "expiring_soon" =
            daysUntil < 0 ? "expired" : "expiring_soon";
          if (daysUntil > input.warnDays) return; // skip valid docs

          if (input.status === "expired" && docStatus !== "expired") return;
          if (input.status === "expiring_soon" && docStatus !== "expiring_soon") return;
          if (input.docType !== "all" && docType !== input.docType) return;

          rows.push({
            employeeId: emp.id,
            employeeName: fullName,
            employeeNumber: emp.employeeNumber ?? null,
            department: emp.department ?? null,
            nationality: emp.nationality ?? null,
            docType,
            docNumber: docNumber ?? null,
            expiryDate: expDate.toISOString().split("T")[0],
            daysUntilExpiry: daysUntil,
            status: docStatus,
          });
        };

        addDoc("visa", (emp as any).visaNumber ?? null, (emp as any).visaExpiryDate ?? null);
        addDoc("work_permit", (emp as any).workPermitNumber ?? null, (emp as any).workPermitExpiryDate ?? null);
      }

      // Sort: expired first, then expiring_soon by days ascending
      rows.sort((a, b) => {
        if (a.status === "expired" && b.status !== "expired") return -1;
        if (a.status !== "expired" && b.status === "expired") return 1;
        return (a.daysUntilExpiry ?? 999) - (b.daysUntilExpiry ?? 999);
      });

      return {
        rows,
        stats: {
          total: rows.length,
          expired: rows.filter((r) => r.status === "expired").length,
          expiringSoon: rows.filter((r) => r.status === "expiring_soon").length,
        },
      };
    }),

  // ─── HR Dashboard Stats (for main Dashboard page) ─────────────────────────
  getDashboardStats: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input?.companyId).catch(() => null);
      const emptyResult = {
        todayPresent: 0, todayAbsent: 0, todayTotal: 0,
        pendingLeave: 0, kpiTargetsCount: 0, kpiAvgPct: 0,
        kpiTopPerformer: null as string | null,
        payrollStatus: null as string | null, payrollMonth: null as string | null,
        activeEmployees: 0,
      };
      if (!cid) return emptyResult;
      const db = await getDb();
      if (!db) return emptyResult;

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      // Today's check-ins from attendance_records
      const [todayRow] = await db.select({ cnt: count() })
        .from(attendanceRecords)
        .where(and(
          eq(attendanceRecords.companyId, cid),
          gte(attendanceRecords.checkIn, todayStart),
          lte(attendanceRecords.checkIn, todayEnd),
        ));
      const todayTotal = Number(todayRow?.cnt ?? 0);

      // Pending leave requests
      const [pendingLeaveRow] = await db.select({ cnt: count() })
        .from(leaveRequests)
        .where(and(eq(leaveRequests.companyId, cid), eq(leaveRequests.status, "pending")));
      const pendingLeave = Number(pendingLeaveRow?.cnt ?? 0);

      // Active employees count
      const emps = await getEmployees(cid);
      const activeEmployees = emps.filter((e) => e.status === "active").length;

      // KPI targets this month
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const [kpiTargetsRow] = await db.select({ cnt: count() })
        .from(kpiTargets)
        .where(and(
          eq(kpiTargets.companyId, cid),
          eq(kpiTargets.periodYear, year),
          eq(kpiTargets.periodMonth, month),
        ));
      const kpiTargetsCount = Number(kpiTargetsRow?.cnt ?? 0);

      // KPI average achievement this month
      const kpiAchRows = await db.select({
        employeeUserId: kpiAchievements.employeeUserId,
        totalPct: sum(kpiAchievements.achievementPct),
      })
        .from(kpiAchievements)
        .where(and(
          eq(kpiAchievements.companyId, cid),
          eq(kpiAchievements.periodYear, year),
          eq(kpiAchievements.periodMonth, month),
        ))
        .groupBy(kpiAchievements.employeeUserId);

      const kpiAvgPct = kpiAchRows.length > 0
        ? Math.round(kpiAchRows.reduce((s, r) => s + parseFloat(r.totalPct ?? "0"), 0) / kpiAchRows.length)
        : 0;

      // Top KPI performer
      let kpiTopPerformer: string | null = null;
      if (kpiAchRows.length > 0) {
        const topRow = [...kpiAchRows].sort((a, b) => parseFloat(b.totalPct ?? "0") - parseFloat(a.totalPct ?? "0"))[0];
        if (topRow) {
          const emp = emps.find((e) => e.userId === topRow.employeeUserId);
          if (emp) kpiTopPerformer = `${emp.firstName} ${emp.lastName}`.trim();
        }
      }

      // Payroll status this month
      const [payrollRow] = await db.select({ status: payrollRuns.status, periodMonth: payrollRuns.periodMonth, periodYear: payrollRuns.periodYear })
        .from(payrollRuns)
        .where(and(
          eq(payrollRuns.companyId, cid),
          eq(payrollRuns.periodYear, year),
          eq(payrollRuns.periodMonth, month),
        ))
        .orderBy(desc(payrollRuns.createdAt))
        .limit(1);

      const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

      return {
        todayPresent: todayTotal,
        todayAbsent: Math.max(0, activeEmployees - todayTotal),
        todayTotal,
        pendingLeave,
        kpiTargetsCount,
        kpiAvgPct,
        kpiTopPerformer,
        payrollStatus: payrollRow?.status ?? null,
        payrollMonth: payrollRow ? `${MONTH_NAMES[(payrollRow.periodMonth ?? 1) - 1]} ${payrollRow.periodYear}` : null,
        activeEmployees,
      };
    }),

  // ── Departments & Positions ────────────────────────────────────────────────
  // Assign one or more employees to a department (or remove them)
  assignDepartment: protectedProcedure
    .input(z.object({
      employeeIds: z.array(z.number()).min(1),
      departmentName: z.string().nullable(), // null = unassign
      companyId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      for (const empId of input.employeeIds) {
        const [emp] = await db.select({ id: employees.id, companyId: employees.companyId })
          .from(employees).where(eq(employees.id, empId));
        if (!emp || emp.companyId !== cid) continue;
        await db.update(employees).set({ department: input.departmentName ?? "" }).where(eq(employees.id, empId));
      }
      return { success: true, updated: input.employeeIds.length };
    }),

  // List employees belonging to a specific department
  listDepartmentMembers: protectedProcedure
    .input(z.object({ departmentName: z.string(), companyId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input.companyId).catch(() => null);
      if (!cid) return [];
      const db = await getDb();
      if (!db) return [];
      return db.select({
        id: employees.id,
        firstName: employees.firstName,
        lastName: employees.lastName,
        position: employees.position,
        status: employees.status,
        employmentType: employees.employmentType,
        avatarUrl: employees.avatarUrl,
        department: employees.department,
      }).from(employees).where(
        and(
          eq(employees.companyId, cid),
          eq(employees.department, input.departmentName),
          eq(employees.status, "active")
        )
      );
    }),

  listDepartments: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input?.companyId).catch(() => null);
      if (!cid) return [];
      const db = await getDb();
      if (!db) return [];
      const depts = await db.select().from(departments).where(and(eq(departments.companyId, cid), eq(departments.isActive, true)));
      const emps = await getEmployees(cid);
      return depts.map((d) => ({
        ...d,
        employeeCount: emps.filter((e) => e.department === d.name && e.status === "active").length,
      }));
    }),

  createDepartment: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(128),
      nameAr: z.string().max(128).optional(),
      description: z.string().optional(),
      headEmployeeId: z.number().optional(),
      color: z.string().max(32).optional(),
      icon: z.string().max(32).optional(),
      companyId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [result] = await db.insert(departments).values({
        companyId: cid,
        name: input.name,
        nameAr: input.nameAr,
        description: input.description,
        headEmployeeId: input.headEmployeeId,
      });
      return { id: (result as any).insertId };
    }),

  updateDepartment: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(128).optional(),
      nameAr: z.string().max(128).optional(),
      description: z.string().optional(),
      headEmployeeId: z.number().nullable().optional(),
      color: z.string().max(32).optional(),
      icon: z.string().max(32).optional(),
      companyId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [existing] = await db.select().from(departments).where(and(eq(departments.id, input.id), eq(departments.companyId, cid)));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Department not found" });
      const updateData: any = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.nameAr !== undefined) updateData.nameAr = input.nameAr;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.headEmployeeId !== undefined) updateData.headEmployeeId = input.headEmployeeId;
      await db.update(departments).set(updateData).where(eq(departments.id, input.id));
      return { success: true };
    }),

  deleteDepartment: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [existing] = await db.select().from(departments).where(and(eq(departments.id, input.id), eq(departments.companyId, cid)));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Department not found" });
      await db.update(departments).set({ isActive: false }).where(eq(departments.id, input.id));
      return { success: true };
    }),

  listPositions: protectedProcedure
    .input(z.object({ departmentId: z.number().optional(), companyId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input?.companyId).catch(() => null);
      if (!cid) return [];
      const db = await getDb();
      if (!db) return [];
      const conditions: any[] = [eq(positions.companyId, cid), eq(positions.isActive, true)];
      if (input?.departmentId) conditions.push(eq(positions.departmentId, input.departmentId));
      return db.select().from(positions).where(and(...conditions));
    }),

  createPosition: protectedProcedure
    .input(z.object({
      title: z.string().min(1).max(128),
      departmentId: z.number().optional(),
      description: z.string().optional(),
      companyId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [result] = await db.insert(positions).values({
        companyId: cid,
        title: input.title,
        departmentId: input.departmentId,
        description: input.description,
      });
      return { id: (result as any).insertId };
    }),

  deletePosition: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [existing] = await db.select().from(positions).where(and(eq(positions.id, input.id), eq(positions.companyId, cid)));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Position not found" });
      await db.update(positions).set({ isActive: false }).where(eq(positions.id, input.id));
      return { success: true };
    }),

  // ── Org Chart ─────────────────────────────────────────────────────────────────
  getOrgChart: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input?.companyId).catch(() => null);
      if (!cid) return { departments: [], unassigned: [] };
      const db = await getDb();
      if (!db) return { departments: [], unassigned: [] };

      // Load all active departments
      const depts = await db.select().from(departments)
        .where(and(eq(departments.companyId, cid), eq(departments.isActive, true)))
        .orderBy(departments.name);

      // Load all active employees
      const emps = await db.select({
        id: employees.id,
        firstName: employees.firstName,
        lastName: employees.lastName,
        department: employees.department,
        position: employees.position,
        managerId: employees.managerId,
        employmentType: employees.employmentType,
        nationality: employees.nationality,
        avatarUrl: employees.avatarUrl,
      }).from(employees)
        .where(and(eq(employees.companyId, cid), eq(employees.status, "active")));

      // Load all active positions per department
      const posRows = await db.select().from(positions)
        .where(and(eq(positions.companyId, cid), eq(positions.isActive, true)));

      // Build department nodes
      const deptNodes = depts.map((d) => {
        const members = emps.filter((e) => e.department === d.name);
        const head = d.headEmployeeId ? emps.find((e) => e.id === d.headEmployeeId) ?? null : null;
        const deptPositions = posRows.filter((p) => p.departmentId === d.id);
        return {
          id: d.id,
          name: d.name,
          nameAr: d.nameAr,
          description: d.description,
          color: (d as any).color ?? null,
          icon: (d as any).icon ?? null,
          headEmployeeId: d.headEmployeeId,
          head: head ? { id: head.id, firstName: head.firstName, lastName: head.lastName, position: head.position } : null,
          memberCount: members.length,
          members: members.map((e) => ({
            id: e.id,
            firstName: e.firstName,
            lastName: e.lastName,
            position: e.position,
            managerId: e.managerId,
            employmentType: e.employmentType,
            nationality: e.nationality,
            avatarUrl: e.avatarUrl,
          })),
          positions: deptPositions.map((p) => ({ id: p.id, title: p.title, description: p.description })),
        };
      });

      // Employees not assigned to any department
      const assignedNames = new Set(depts.map((d) => d.name));
      const unassigned = emps
        .filter((e) => !e.department || !assignedNames.has(e.department))
        .map((e) => ({
          id: e.id,
          firstName: e.firstName,
          lastName: e.lastName,
          position: e.position,
          department: e.department,
          employmentType: e.employmentType,
          nationality: e.nationality,
        }));

      return { departments: deptNodes, unassigned };
    }),

  // ─── Employee Lifecycle Timeline ─────────────────────────────────────────
  getEmployeeTimeline: protectedProcedure
    .input(z.object({ employeeId: z.number(), companyId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const emp = await getEmployeeById(input.employeeId);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      await assertRowBelongsToActiveCompany(ctx.user, emp.companyId, "Employee");
      const db = await getDb();
      if (!db) return [];

      type TimelineEvent = {
        id: string;
        type: "joined" | "department" | "position" | "status" | "salary" | "document" | "leave" | "payroll" | "performance" | "compliance";
        title: string;
        description: string;
        date: Date;
        icon: string;
        color: string;
      };
      const events: TimelineEvent[] = [];

      // Joined event
      if (emp.hireDate) {
        events.push({ id: "joined", type: "joined", title: "Joined Company",
          description: `${emp.firstName} ${emp.lastName} joined as ${emp.position ?? "employee"} in ${emp.department ?? "the company"}`,
          date: new Date(emp.hireDate), icon: "UserCheck", color: "emerald" });
      } else {
        events.push({ id: "created", type: "joined", title: "Employee Record Created",
          description: `Profile created for ${emp.firstName} ${emp.lastName}`,
          date: new Date(emp.createdAt), icon: "UserPlus", color: "blue" });
      }

      // Department/position set
      if (emp.department) {
        events.push({ id: "dept", type: "department", title: "Department Assigned",
          description: `Assigned to ${emp.department}${emp.position ? ` as ${emp.position}` : ""}`,
          date: new Date(emp.createdAt), icon: "Building2", color: "purple" });
      }

      // Salary set
      if (emp.salary) {
        events.push({ id: "salary", type: "salary", title: "Salary Configured",
          description: `Base salary set to ${emp.currency ?? "OMR"} ${parseFloat(String(emp.salary)).toFixed(3)} per month`,
          date: new Date(emp.createdAt), icon: "DollarSign", color: "orange" });
      }

      // Visa / work permit compliance events
      if ((emp as any).visaNumber) {
        events.push({ id: "visa", type: "compliance", title: "Visa Recorded",
          description: `Visa number ${(emp as any).visaNumber} recorded${(emp as any).visaExpiryDate ? `, expires ${(emp as any).visaExpiryDate}` : ""}`,
          date: new Date(emp.createdAt), icon: "Shield", color: "blue" });
      }
      if ((emp as any).workPermitNumber) {
        events.push({ id: "permit", type: "compliance", title: "Work Permit Recorded",
          description: `Work permit ${(emp as any).workPermitNumber} recorded${(emp as any).workPermitExpiryDate ? `, expires ${(emp as any).workPermitExpiryDate}` : ""}`,
          date: new Date(emp.createdAt), icon: "FileText", color: "indigo" });
      }

      // Leave requests
      const leaves = await db.select().from(leaveRequests)
        .where(eq(leaveRequests.employeeId, input.employeeId))
        .orderBy(desc(leaveRequests.createdAt)).limit(5);
      for (const lr of leaves) {
        events.push({ id: `leave-${lr.id}`, type: "leave", title: `Leave Request — ${lr.leaveType.replace(/_/g, " ")}`,
          description: `${lr.days ?? "?"} day(s) ${lr.status === "approved" ? "approved" : lr.status === "rejected" ? "rejected" : "pending"} from ${lr.startDate ? new Date(lr.startDate).toLocaleDateString() : "?"}`,
          date: new Date(lr.createdAt), icon: "Calendar", color: lr.status === "approved" ? "emerald" : lr.status === "rejected" ? "red" : "amber" });
      }

      // Payroll records
      const payrolls = await db.select().from(payrollRecords)
        .where(eq(payrollRecords.employeeId, input.employeeId))
        .orderBy(desc(payrollRecords.createdAt)).limit(6);
      for (const pr of payrolls) {
        events.push({ id: `payroll-${pr.id}`, type: "payroll", title: `Payroll — ${pr.periodMonth}/${pr.periodYear}`,
          description: `Net salary ${pr.currency ?? "OMR"} ${parseFloat(String(pr.netSalary)).toFixed(3)} — ${pr.status}`,
          date: new Date(pr.createdAt), icon: "Banknote", color: pr.status === "paid" ? "emerald" : "gray" });
      }

      // Performance reviews
      const reviews = await db.select().from(performanceReviews)
        .where(eq(performanceReviews.employeeId, input.employeeId))
        .orderBy(desc(performanceReviews.createdAt)).limit(5);
      for (const rv of reviews) {
        events.push({ id: `perf-${rv.id}`, type: "performance", title: `Performance Review — ${rv.period}`,
          description: `Score: ${rv.overallScore ?? "Pending"} — ${rv.status}`,
          date: new Date(rv.createdAt), icon: "TrendingUp", color: "purple" });
      }

      // Termination event
      if (emp.terminationDate) {
        events.push({ id: "terminated", type: "status", title: "Employment Ended",
          description: `Status changed to ${emp.status ?? "terminated"}`,
          date: new Date(emp.terminationDate), icon: "UserX", color: "red" });
      }

      // Sort newest first
      events.sort((a, b) => b.date.getTime() - a.date.getTime());
      return events;
    }),

  // ─── Workforce Health Summary (for Dashboard widget) ─────────────────────
  getWorkforceHealth: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input?.companyId).catch(() => null);
      if (!cid) return {
        total: 0, critical: 0, warning: 0, incomplete: 0, healthy: 0,
        criticalEmployees: [] as Array<{ id: number; name: string; reason: string }>,
        warningEmployees: [] as Array<{ id: number; name: string; reason: string }>,
        incompleteEmployees: [] as Array<{ id: number; name: string; score: number; missing: string[] }>,
        overallScore: 0,
      };
      const emps = await getEmployees(cid);
      const today = new Date();
      const warnDays = 30;

      const REQUIRED_FIELDS = ["firstName", "lastName", "email", "phone", "nationality",
        "department", "position", "hireDate", "salary"];
      const OPTIONAL_FIELDS = ["passportNumber", "nationalId", "dateOfBirth", "gender",
        "pasiNumber", "bankAccountNumber", "emergencyContactName", "workPermitNumber", "visaNumber"];

      function calcScore(emp: typeof emps[0]) {
        const reqFilled = REQUIRED_FIELDS.filter((f) => !!(emp as any)[f]).length;
        const optFilled = OPTIONAL_FIELDS.filter((f) => !!(emp as any)[f]).length;
        return Math.round(((reqFilled / REQUIRED_FIELDS.length) * 70) + ((optFilled / OPTIONAL_FIELDS.length) * 30));
      }

      function daysLeft(d: string | Date | null | undefined): number | null {
        if (!d) return null;
        const dt = d instanceof Date ? d : new Date(String(d));
        if (isNaN(dt.getTime())) return null;
        return Math.floor((dt.getTime() - today.getTime()) / 86400000);
      }

      const criticalEmployees: Array<{ id: number; name: string; reason: string }> = [];
      const warningEmployees: Array<{ id: number; name: string; reason: string }> = [];
      const incompleteEmployees: Array<{ id: number; name: string; score: number; missing: string[] }> = [];
      const seenCritical = new Set<number>();
      const seenWarning = new Set<number>();

      for (const emp of emps) {
        const name = `${emp.firstName} ${emp.lastName}`;
        const visaDays = daysLeft((emp as any).visaExpiryDate);
        const permitDays = daysLeft((emp as any).workPermitExpiryDate);

        if (visaDays !== null && visaDays < 0 && !seenCritical.has(emp.id)) {
          criticalEmployees.push({ id: emp.id, name, reason: `Visa expired ${Math.abs(visaDays)}d ago` });
          seenCritical.add(emp.id);
        } else if (permitDays !== null && permitDays < 0 && !seenCritical.has(emp.id)) {
          criticalEmployees.push({ id: emp.id, name, reason: `Work permit expired ${Math.abs(permitDays)}d ago` });
          seenCritical.add(emp.id);
        } else if (visaDays !== null && visaDays >= 0 && visaDays <= warnDays && !seenWarning.has(emp.id)) {
          warningEmployees.push({ id: emp.id, name, reason: `Visa expires in ${visaDays}d` });
          seenWarning.add(emp.id);
        } else if (permitDays !== null && permitDays >= 0 && permitDays <= warnDays && !seenWarning.has(emp.id)) {
          warningEmployees.push({ id: emp.id, name, reason: `Work permit expires in ${permitDays}d` });
          seenWarning.add(emp.id);
        }

        const score = calcScore(emp);
        if (score < 60) {
          const missing = REQUIRED_FIELDS.filter((f) => !(emp as any)[f]);
          incompleteEmployees.push({ id: emp.id, name, score, missing });
        }
      }

      const scores = emps.map(calcScore);
      const overallScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

      const criticalSet = new Set(criticalEmployees.map((e) => e.id));
      const warningSet = new Set(warningEmployees.map((e) => e.id));
      const incompleteSet = new Set(incompleteEmployees.map((e) => e.id));
      const healthy = emps.filter((e) => !criticalSet.has(e.id) && !warningSet.has(e.id) && !incompleteSet.has(e.id)).length;

      return {
        total: emps.length,
        critical: criticalEmployees.length,
        warning: warningEmployees.length,
        incomplete: incompleteEmployees.length,
        healthy,
        criticalEmployees: criticalEmployees.slice(0, 5),
        warningEmployees: warningEmployees.slice(0, 5),
        incompleteEmployees: incompleteEmployees.slice(0, 5),
        overallScore,
      };
    }),
});
