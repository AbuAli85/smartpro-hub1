import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { mergeLeavePolicyCaps } from "../../shared/leavePolicyCaps";
import { normalizeWpsValidationPeriod, validateEmployeeWpsReadiness } from "../../shared/employeeWps";
import { eq, and, desc, asc, gte, lte, lt, count, sum, or, isNull, isNotNull, inArray } from "drizzle-orm";
import {
  companies,
  workPermits,
  employees,
  attendanceRecords,
  attendance,
  leaveRequests,
  kpiTargets,
  kpiAchievements,
  payrollRuns,
  payrollLineItems,
  departments,
  positions,
  payrollRecords,
  performanceReviews,
  companyHolidays,
  employeeSchedules,
  shiftTemplates,
  users,
  attendanceSites,
  companyMembers,
  employeeWpsValidations,
} from "../../drizzle/schema";
import { hasReportPermission } from "@shared/reportPermissions";
import { seedSuggestedDepartmentRows } from "../departments/seedSuggestedDepartmentRows";
import { sendEmployeeNotification } from "./employeePortal";
import {
  createAttendanceRecordTx,
  getAttendanceRecordById,
  getAttendanceStats,
  getUserCompanyById,
  createEmployee,
  createJobApplication,
  createJobPosting,
  createLeaveRequest,
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
  getPerformanceReviews,
  updateEmployee,
  updateJobApplication,
  updateJobPosting,
  updateLeaveRequest,
} from "../db";
import type { User } from "../../drizzle/schema";
import { assertRowBelongsToActiveCompany, requireActiveCompanyId } from "../_core/tenant";
import { requireNotAuditor, requireWorkspaceMembership, requireCapableMembership } from "../_core/membership";
import { requireCapabilityAndModule } from "../_core/capabilityGate";
import { protectedProcedure, router } from "../_core/trpc";
import {
  requireFinanceOrAdmin,
  requireHrOrAdmin,
  requireWorkspaceMemberForRead,
  resolveVisibilityScope,
  buildEmployeeScopeFilter,
  isInScope,
  redactEmployeeForScope,
} from "../_core/policy";
import { deriveCapabilities, applyEmployeePayloadPolicy } from "../_core/capabilities";
import {
  ATTENDANCE_AUDIT_ACTION,
  ATTENDANCE_AUDIT_ENTITY,
  ATTENDANCE_AUDIT_SOURCE,
} from "@shared/attendanceAuditTaxonomy";
import { attendancePayloadJson, insertAttendanceAuditRow } from "../attendanceAudit";
import {
  muscatCalendarWeekdaySun0ForYmd,
  muscatCalendarYmdFromUtcInstant,
  muscatMinutesSinceMidnight,
  muscatMonthUtcRangeExclusiveEnd,
  muscatDayUtcRangeExclusiveEnd,
} from "@shared/attendanceMuscatTime";
import { isWeakAuditReason } from "@shared/attendanceManualValidation";
import {
  DUPLICATE_MANUAL_ATTENDANCE,
  INVALID_ATTENDANCE_TIME_RANGE,
  WEAK_AUDIT_REASON,
} from "@shared/attendanceTrpcReasons";
import { findAttendanceForDate } from "../repositories/attendance.repository";

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function shiftSpanMinutes(startTime: string, endTime: string): number {
  const a = timeToMinutes(startTime);
  const b = timeToMinutes(endTime);
  let m = b - a;
  if (m < 0) m += 24 * 60;
  return m;
}

function employeeRowFromScheduleRef<E extends { id: number; userId: number | null }>(
  rawId: number,
  empById: Map<number, E>,
  empByLoginUserId: Map<number, E>,
): E | undefined {
  return empById.get(rawId) ?? empByLoginUserId.get(rawId);
}

// requireHrOrAdmin removed — use requireHrOrAdmin from _core/policy (includes platform-admin bypass)

function normalizeMemberPermissions(p: unknown): string[] {
  if (!Array.isArray(p)) return [];
  return p.filter((x): x is string => typeof x === "string");
}

/** HR admin, company admin, or delegated `view_reports` on company_members.permissions. */
async function requireHrAdminOrDelegatedReports(ctxUser: User, companyId?: number | null): Promise<number> {
  const cid = await requireActiveCompanyId(ctxUser.id, companyId, ctxUser);
  const db = await getDb();
  if (!db) {
    const row = await getUserCompanyById(ctxUser.id, cid);
    const role = row?.member?.role;
    if (role !== "company_admin" && role !== "hr_admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "HR Admin, Company Admin, or view_reports permission required",
      });
    }
    return cid;
  }
  const [callerMember] = await db
    .select({ role: companyMembers.role, permissions: companyMembers.permissions })
    .from(companyMembers)
    .where(
      and(
        eq(companyMembers.companyId, cid),
        eq(companyMembers.userId, ctxUser.id),
        eq(companyMembers.isActive, true),
      ),
    )
    .limit(1);
  const isAdminOrHR = callerMember?.role === "company_admin" || callerMember?.role === "hr_admin";
  const hasDelegatedAccess = hasReportPermission(
    normalizeMemberPermissions(callerMember?.permissions),
    "view_reports",
  );
  if (!isAdminOrHR && !hasDelegatedAccess) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "HR Admin, Company Admin, or view_reports permission required",
    });
  }
  return cid;
}

async function countScheduledWorkSlotsForCompanyMonth(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  companyId: number,
  monthYm: string,
): Promise<number> {
  const [yearStr, monthStr] = monthYm.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const mm = String(month).padStart(2, "0");
  const startDate = `${year}-${mm}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;

  const holidays = await db
    .select()
    .from(companyHolidays)
    .where(
      and(
        eq(companyHolidays.companyId, companyId),
        gte(companyHolidays.holidayDate, startDate),
        lte(companyHolidays.holidayDate, endDate),
      ),
    );
  const holidayDates = new Set(holidays.map((h) => h.holidayDate));

  const allSchedules = await db
    .select()
    .from(employeeSchedules)
    .where(
      and(
        eq(employeeSchedules.companyId, companyId),
        eq(employeeSchedules.isActive, true),
        lte(employeeSchedules.startDate, endDate),
        or(isNull(employeeSchedules.endDate), gte(employeeSchedules.endDate, startDate)),
      ),
    );

  let slots = 0;
  for (const s of allSchedules) {
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${year}-${mm}-${String(d).padStart(2, "0")}`;
      if (holidayDates.has(dateStr)) continue;
      const dow = muscatCalendarWeekdaySun0ForYmd(dateStr);
      if (!s.workingDays.split(",").map(Number).includes(dow)) continue;
      if (s.startDate > dateStr) continue;
      if (s.endDate != null && s.endDate < dateStr) continue;
      slots++;
    }
  }
  return slots;
}

async function getMergedLeaveCapsForCompanyId(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  companyId: number,
) {
  const [row] = await db
    .select({ leavePolicyCaps: companies.leavePolicyCaps })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  return mergeLeavePolicyCaps(row?.leavePolicyCaps ?? null);
}

type DbConn = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** `departments` table is canonical; `employees.department` stores the active department English name (or empty). */
async function resolveCanonicalDepartmentWrite(db: DbConn, companyId: number, raw: string | undefined | null): Promise<string> {
  if (raw == null) return "";
  const t = raw.trim();
  if (t === "") return "";
  const [d] = await db
    .select({ name: departments.name })
    .from(departments)
    .where(and(eq(departments.companyId, companyId), eq(departments.name, t), eq(departments.isActive, true)))
    .limit(1);
  if (!d) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Unknown department "${t}". Use an active department from Settings → Departments.`,
    });
  }
  return d.name;
}

function mapPayrollRunStatusToLegacy(runStatus: (typeof payrollRuns.$inferSelect)["status"]): "draft" | "approved" | "paid" {
  if (runStatus === "paid") return "paid";
  if (
    runStatus === "approved" ||
    runStatus === "wps_generated" ||
    runStatus === "pending_execution" ||
    runStatus === "locked" ||
    runStatus === "ready_for_upload" ||
    runStatus === "processing"
  ) {
    return "approved";
  }
  return "draft";
}

export const hrRouter = router({
  // Employees
  listEmployees: protectedProcedure
    .input(z.object({ status: z.string().optional(), department: z.string().optional(), companyId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const { companyId: inputCid, ...filters } = input;
      // HR/Admin → company-wide. Manager (company_member with reports) → team. Everyone else → self.
      const { companyId: cid, role, permissions: _lp, enabledModules: _lm } = await requireCapableMembership(ctx.user as User, inputCid);
      // view_hr only blocks non-self-portal roles; company_member self-scope is always allowed.
      if (["hr_admin", "finance_admin", "company_admin", "reviewer", "external_auditor"].includes(role)) {
        requireCapabilityAndModule(role, _lp, _lm, "view_hr");
      }
      const scope = await resolveVisibilityScope(ctx.user as User, cid);

      const caps = deriveCapabilities(role, scope);
      if (!caps.canViewEmployeeList) {
        // self scope — return own record only
        const db = await getDb();
        if (!db || scope.type !== "self" || scope.selfEmployeeId == null) return [];
        const [self] = await db.select().from(employees).where(eq(employees.id, scope.selfEmployeeId)).limit(1);
        return self ? [applyEmployeePayloadPolicy(self as any, caps)] : [];
      }

      if (scope.type === "company") {
        const all = await getEmployees(cid, filters);
        return all.map((emp: any) => applyEmployeePayloadPolicy(emp, caps));
      }

      const db = await getDb();
      if (!db) return [];

      if (scope.type === "team") {
        const conds: ReturnType<typeof eq>[] = [
          eq(employees.companyId, cid),
          inArray(employees.id, scope.managedEmployeeIds),
        ];
        if (filters.status) conds.push(eq(employees.status, filters.status as any));
        if (filters.department) conds.push(eq(employees.department, filters.department));
        const rows = await db.select().from(employees).where(and(...conds));
        return rows.map((emp) => applyEmployeePayloadPolicy(emp as any, caps));
      }

      // department scope
      if (scope.type !== "department" && scope.type !== "self") return [];
      if (scope.selfEmployeeId == null) return [];
      const [self] = await db.select().from(employees).where(eq(employees.id, scope.selfEmployeeId)).limit(1);
      return self ? [applyEmployeePayloadPolicy(self as any, caps)] : [];
    }),

  getEmployee: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const emp = await getEmployeeById(input.id);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      // Resolve workspace — any authenticated member may attempt this; scope decides what they can see
      const { companyId: cid, role } = await requireWorkspaceMemberForRead(ctx.user as User, input.companyId ?? emp.companyId);
      if (emp.companyId !== cid)
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      const scope = await resolveVisibilityScope(ctx.user as User, cid);
      if (!isInScope(scope, emp.id))
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      const caps = deriveCapabilities(role, scope);
      return applyEmployeePayloadPolicy(emp as any, caps);
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
        ibanNumber: z.string().max(34).optional(),
        emergencyContactName: z.string().optional(),
        emergencyContactPhone: z.string().optional(),
        companyId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Only HR admin or company admin may create employees
      const { companyId, role: _cr, permissions: _cp, enabledModules: _cm } = await requireCapableMembership(ctx.user as User, input.companyId);
      if (!["company_admin", "hr_admin"].includes(_cr)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "HR Admin or Company Admin required." });
      }
      requireCapabilityAndModule(_cr, _cp, _cm, "manage_hr");
      const { workPermitNumber, visaNumber, occupationCode, occupationName, workPermitExpiry, visaExpiry, passportExpiry,
        dateOfBirth, visaExpiryDate, workPermitExpiryDate, ...empData } = input;
      const db = await getDb();
      if (db && empData.department !== undefined) {
        empData.department = await resolveCanonicalDepartmentWrite(db, companyId, empData.department);
      }
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
        const dbPermit = await getDb();
        if (dbPermit) {
          await dbPermit.insert(workPermits).values({
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
        ibanNumber: z.string().max(34).optional(),
        emergencyContactName: z.string().optional(),
        emergencyContactPhone: z.string().optional(),
        companyId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, companyId: inputCompanyId, workPermitNumber, visaNumber, occupationCode, occupationName, workPermitExpiry, visaExpiry, passportExpiry,
        dateOfBirth, visaExpiryDate, workPermitExpiryDate, ...data } = input;
      const existing = await getEmployeeById(id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      // Only HR admin or company admin may update employees
      const { companyId, role: _ur, permissions: _up, enabledModules: _um } = await requireCapableMembership(ctx.user as User, inputCompanyId ?? existing.companyId);
      if (!["company_admin", "hr_admin"].includes(_ur)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "HR Admin or Company Admin required." });
      }
      requireCapabilityAndModule(_ur, _up, _um, "manage_hr");
      if (existing.companyId !== companyId)
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      const updateData: any = { ...data };
      if (data.salary !== undefined) updateData.salary = String(data.salary);
      if (data.hireDate !== undefined) updateData.hireDate = data.hireDate ? new Date(data.hireDate) : null;
      if (data.terminationDate !== undefined) updateData.terminationDate = data.terminationDate ? new Date(data.terminationDate) : null;
      // Extended date fields (stored as DATE strings in MySQL)
      if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth || null;
      if (visaExpiryDate !== undefined) updateData.visaExpiryDate = visaExpiryDate || null;
      if (workPermitExpiryDate !== undefined) updateData.workPermitExpiryDate = workPermitExpiryDate || null;
      const db = await getDb();
      if (db && data.department !== undefined) {
        updateData.department = await resolveCanonicalDepartmentWrite(db, existing.companyId, data.department);
      }
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
    .input(z.object({ id: z.number(), companyId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const emp = await getEmployeeById(input.id);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      const { companyId: cid, role } = await requireWorkspaceMemberForRead(ctx.user as User, input.companyId ?? emp.companyId);
      if (emp.companyId !== cid)
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      const scope = await resolveVisibilityScope(ctx.user as User, cid);
      if (!isInScope(scope, emp.id))
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      const caps = deriveCapabilities(role, scope);
      const db = await getDb();
      let permit = null;
      if (db) {
        const permits = await db.select().from(workPermits)
          .where(eq(workPermits.employeeId, input.id))
          .orderBy(desc(workPermits.expiryDate))
          .limit(1);
        permit = permits[0] ?? null;
      }
      return { ...applyEmployeePayloadPolicy(emp as any, caps), permit };
    }),

  // Job Postings
  listJobs: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const { companyId } = await requireWorkspaceMembership(ctx.user as User, input?.companyId);
      return getJobPostings(companyId);
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
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
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
      await assertRowBelongsToActiveCompany(ctx.user, job.companyId, "Job", job.companyId);
      await updateJobPosting(id, data);
      return { success: true };
    }),

  // Applications (ATS)
  listApplications: protectedProcedure
    .input(z.object({ jobId: z.number().optional(), companyId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const { companyId } = await requireHrOrAdmin(ctx.user as User, input.companyId);
      return getJobApplications(input.jobId, companyId);
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
      await assertRowBelongsToActiveCompany(ctx.user, app.companyId, "Application", app.companyId);
      await updateJobApplication(id, data);
      return { success: true };
    }),

  // Leave Requests
  listLeave: protectedProcedure
    .input(z.object({ employeeId: z.number().optional(), companyId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const { companyId: cid } = await requireHrOrAdmin(ctx.user as User, input.companyId);
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
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
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
      await assertRowBelongsToActiveCompany(ctx.user, row.companyId, "Leave request", row.companyId);
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
              actorUserId: ctx.user.id,
            });
          }
        }
      }
      return { success: true };
    }),

  /**
   * @deprecated Prefer `payroll.listRuns` / `payroll.getRun`. Reads from `payroll_line_items` + `payroll_runs` (canonical engine).
   */
  listPayroll: protectedProcedure
    .input(
      z.object({
        year: z.number().optional(),
        month: z.number().optional(),
        companyId: z.number().optional(),
        employeeId: z.number().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { companyId: cid } = await requireFinanceOrAdmin(ctx.user as User, input.companyId);
      if (input.employeeId != null) {
        const emp = await getEmployeeById(input.employeeId);
        if (!emp || emp.companyId !== cid) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      }
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(payrollLineItems.companyId, cid)];
      if (input.year != null) conds.push(eq(payrollRuns.periodYear, input.year));
      if (input.month != null) conds.push(eq(payrollRuns.periodMonth, input.month));
      if (input.employeeId != null) conds.push(eq(payrollLineItems.employeeId, input.employeeId));
      const rows = await db
        .select({
          line: payrollLineItems,
          periodMonth: payrollRuns.periodMonth,
          periodYear: payrollRuns.periodYear,
          runStatus: payrollRuns.status,
        })
        .from(payrollLineItems)
        .innerJoin(payrollRuns, eq(payrollLineItems.payrollRunId, payrollRuns.id))
        .where(and(...conds))
        .orderBy(desc(payrollRuns.periodYear), desc(payrollRuns.periodMonth), desc(payrollLineItems.id))
        .limit(500);
      return rows.map((r) => {
        const allowances =
          Number(r.line.housingAllowance ?? 0) +
          Number(r.line.transportAllowance ?? 0) +
          Number(r.line.otherAllowances ?? 0) +
          Number(r.line.overtimePay ?? 0) +
          Number(r.line.commissionPay ?? 0);
        return {
          id: r.line.id,
          employeeId: r.line.employeeId,
          periodMonth: r.periodMonth,
          periodYear: r.periodYear,
          basicSalary: r.line.basicSalary,
          allowances: String(allowances),
          deductions: r.line.totalDeductions,
          taxAmount: r.line.incomeTax,
          netSalary: r.line.netSalary,
          status: mapPayrollRunStatusToLegacy(r.runStatus),
        };
      });
    }),

  /**
   * @deprecated Use `payroll.createRun` / `payroll.executeMonthly`. Legacy `payroll_records` writes are disabled.
   */
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
    .mutation(async () => {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Manual payroll entry here is retired. Use Payroll → Create run / Execute monthly (`payroll.createRun`, `payroll.executeMonthly`).",
      });
    }),

  /**
   * @deprecated Legacy `payroll_records` updates are disabled — use `payroll` run approval / mark paid flows.
   */
  updatePayroll: protectedProcedure
    .input(z.object({ id: z.number(), status: z.enum(["draft", "approved", "paid"]) }))
    .mutation(async () => {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Legacy payroll status updates are retired. Use the Payroll hub (`payroll` router) to approve runs or record payment.",
      });
    }),

  // Performance Reviews
  listReviews: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const { companyId } = await requireHrOrAdmin(ctx.user as User, input?.companyId);
      return getPerformanceReviews(companyId);
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
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
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

  /**
   * @deprecated Use `hr.listDepartments` — department names now come only from the `departments` table.
   * Kept temporarily for API stability; returns the same names as `listDepartments` (active rows only).
   */
  departments: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const { companyId: cid } = await requireHrOrAdmin(ctx.user as User, input?.companyId);
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select({ name: departments.name })
        .from(departments)
        .where(and(eq(departments.companyId, cid), eq(departments.isActive, true)))
        .orderBy(asc(departments.name));
      return rows.map((r) => r.name);
    }),

  // ── Attendance ──────────────────────────────────────────────────────────────
  listAttendance: protectedProcedure
    .input(z.object({ month: z.string().optional(), companyId: z.number().optional(), employeeId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const { companyId: cid } = await requireWorkspaceMemberForRead(ctx.user as User, input.companyId);
      const scope = await resolveVisibilityScope(ctx.user as User, cid);

      if (input.employeeId != null) {
        const emp = await getEmployeeById(input.employeeId);
        if (!emp || emp.companyId !== cid)
          throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
        if (!isInScope(scope, emp.id))
          throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
        return getAttendance(cid, input.month, input.employeeId);
      }

      // Company-scope (HR admin, company_admin) → full listing
      if (scope.type === "company") {
        return getAttendance(cid, input.month);
      }

      // Narrower scope: fetch attendance for each visible employee individually
      const visibleIds =
        scope.type === "department" ? scope.departmentEmployeeIds :
        scope.type === "team" ? scope.managedEmployeeIds :
        scope.selfEmployeeId != null ? [scope.selfEmployeeId] : [];

      if (!visibleIds.length) return [];
      const chunks = await Promise.all(visibleIds.map((id) => getAttendance(cid, input.month, id)));
      return chunks.flat();
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
      const { companyId, role } = await requireHrOrAdmin(ctx.user as User, input.companyId);
      const reasonTrimmed = input.notes.trim();
      if (isWeakAuditReason(reasonTrimmed)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Audit reason is too generic. Describe who requested this entry and why.",
          cause: { reason: WEAK_AUDIT_REASON },
        });
      }
      if (input.checkIn && input.checkOut) {
        const ci = new Date(input.checkIn);
        const co = new Date(input.checkOut);
        if (!isNaN(ci.getTime()) && !isNaN(co.getTime()) && co <= ci) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Check-out time must be after check-in time. Overnight shifts are not supported for manual entries.",
            cause: { reason: INVALID_ATTENDANCE_TIME_RANGE },
          });
        }
      }
      const emp = await getEmployeeById(input.employeeId);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      if (emp.companyId !== companyId) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      const { startUtc, endExclusiveUtc } = muscatDayUtcRangeExclusiveEnd(input.date);
      const existing = await findAttendanceForDate(companyId, input.employeeId, startUtc, endExclusiveUtc);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A manual attendance record already exists for this employee on this date.",
          cause: { reason: DUPLICATE_MANUAL_ATTENDANCE },
        });
      }
      const auditPrefix = `[HR audit userId=${ctx.user.id} at ${new Date().toISOString()}] `;
      const fullNotes = auditPrefix + reasonTrimmed;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.transaction(async (tx) => {
        const hrId = await createAttendanceRecordTx(tx, {
          companyId,
          employeeId: input.employeeId,
          date: startUtc,
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
          actorRole: role,
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
          reason: reasonTrimmed,
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
      /**
       * Required when status or notes change vs stored row — appended to audit reason and row notes for traceability.
       */
      changeAuditNote: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, checkIn, checkOut, changeAuditNote } = input;
      const row = await getAttendanceRecordById(id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Attendance record not found" });
      await assertRowBelongsToActiveCompany(ctx.user, row.companyId, "Attendance record", row.companyId);
      const membership = await requireWorkspaceMembership(ctx.user as User, row.companyId);
      requireNotAuditor(membership.role);
      const nextStatus = input.status ?? row.status;
      const nextNotesTrim = input.notes !== undefined ? input.notes.trim() : (row.notes ?? "").trim();
      const statusChanged = input.status !== undefined && input.status !== row.status;
      const notesChanged = input.notes !== undefined && nextNotesTrim !== (row.notes ?? "").trim();
      if (statusChanged || notesChanged) {
        const audit = (changeAuditNote ?? "").trim();
        if (audit.length < 10) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Describe why you changed status or notes for the audit log (at least 10 characters).",
          });
        }
      }
      const mergedNotes =
        statusChanged || notesChanged
          ? (() => {
              const base = input.notes !== undefined ? input.notes!.trim() : (row.notes ?? "").trim();
              const stamp = `[HR edit ${new Date().toISOString()} userId=${ctx.user.id}] ${(changeAuditNote ?? "").trim()}`;
              return base ? `${base}\n${stamp}` : stamp;
            })()
          : input.notes !== undefined
            ? input.notes
            : undefined;
      const beforePayload = attendancePayloadJson(row);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.transaction(async (tx) => {
        await tx
          .update(attendance)
          .set({
            status: nextStatus,
            ...(mergedNotes !== undefined ? { notes: mergedNotes } : {}),
            ...(checkIn ? { checkIn: new Date(checkIn) } : {}),
            ...(checkOut ? { checkOut: new Date(checkOut) } : {}),
          })
          .where(eq(attendance.id, id));
        const [afterRow] = await tx.select().from(attendance).where(eq(attendance.id, id)).limit(1);
        const auditReason =
          statusChanged || notesChanged
            ? (changeAuditNote ?? "").trim()
            : input.notes?.trim();
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
          reason: auditReason,
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
      await assertRowBelongsToActiveCompany(ctx.user, row.companyId, "Attendance record", row.companyId);
      const membership = await requireWorkspaceMembership(ctx.user as User, row.companyId);
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
      const cid = await requireHrAdminOrDelegatedReports(ctx.user as User, input.companyId);
      const base = await getAttendanceStats(cid, input.month);
      if (!input.month) {
        return {
          ...base,
          scheduledSlotsInMonth: null as number | null,
          attendanceRatePercent: null as number | null,
        };
      }
      const db = await getDb();
      if (!db) {
        return {
          ...base,
          scheduledSlotsInMonth: 0,
          attendanceRatePercent: 0,
        };
      }
      const slots = await countScheduledWorkSlotsForCompanyMonth(db, cid, input.month);
      const attended = base.present + base.late + base.half_day + base.remote;
      const attendanceRatePercent =
        slots > 0 ? Math.round(Math.min(100, (attended / slots) * 100)) : 0;
      return {
        ...base,
        scheduledSlotsInMonth: slots,
        attendanceRatePercent,
      };
    }),

  /**
   * Payroll-oriented monthly export: per-employee attendance vs schedule (clock records + shift templates).
   * Clock rows in the export use **Muscat calendar month** boundaries for the selected `YYYY-MM` (same basis as billing invoice summary).
   */
  exportMonthlyAttendance: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        month: z.string().regex(/^\d{4}-\d{2}$/),
        departmentId: z.number().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const cid = await requireHrAdminOrDelegatedReports(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [yStr, mStr] = input.month.split("-");
      const year = Number(yStr);
      const month = Number(mStr);
      const mm = String(month).padStart(2, "0");
      const startDate = `${year}-${mm}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;

      const holidays = await db
        .select()
        .from(companyHolidays)
        .where(
          and(
            eq(companyHolidays.companyId, cid),
            gte(companyHolidays.holidayDate, startDate),
            lte(companyHolidays.holidayDate, endDate),
          ),
        );
      const holidayDates = new Set(holidays.map((h) => h.holidayDate));

      let depFilter: string | null = null;
      if (input.departmentId != null) {
        const [dept] = await db
          .select()
          .from(departments)
          .where(and(eq(departments.id, input.departmentId), eq(departments.companyId, cid)))
          .limit(1);
        depFilter = dept?.name ?? "__none__";
      }

      const allSchedules = await db
        .select()
        .from(employeeSchedules)
        .where(
          and(
            eq(employeeSchedules.companyId, cid),
            eq(employeeSchedules.isActive, true),
            lte(employeeSchedules.startDate, endDate),
            or(isNull(employeeSchedules.endDate), gte(employeeSchedules.endDate, startDate)),
          ),
        );

      const schedSiteIds = [...new Set(allSchedules.map((s) => s.siteId).filter((id): id is number => id != null))];
      const schedSites = schedSiteIds.length
        ? await db
            .select({ id: attendanceSites.id, name: attendanceSites.name, clientName: attendanceSites.clientName })
            .from(attendanceSites)
            .where(inArray(attendanceSites.id, schedSiteIds))
        : [];
      const siteById = new Map(schedSites.map((s) => [s.id, s]));

      const { startUtc: punchWindowStartUtc, endExclusiveUtc: punchWindowEndExclusiveUtc } =
        muscatMonthUtcRangeExclusiveEnd(year, month);
      const records = await db
        .select()
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.companyId, cid),
            gte(attendanceRecords.checkIn, punchWindowStartUtc),
            lt(attendanceRecords.checkIn, punchWindowEndExclusiveUtc),
          ),
        );

      const empWhere =
        depFilter != null && depFilter !== "__none__"
          ? and(eq(employees.companyId, cid), eq(employees.department, depFilter))
          : eq(employees.companyId, cid);
      const empRows = await db.select().from(employees).where(empWhere);

      const recordMap = new Map<string, (typeof records)[0]>();
      for (const r of records) {
        const dateStr = muscatCalendarYmdFromUtcInstant(new Date(r.checkIn));
        recordMap.set(`${r.employeeId}-${dateStr}`, r);
      }

      const employeeUserIds = Array.from(new Set(allSchedules.map((s) => s.employeeUserId)));
      const empById = new Map(empRows.map((e) => [e.id, e]));
      const empByLoginUserId = new Map(
        empRows.filter((e) => e.userId != null).map((e) => [e.userId as number, e]),
      );

      const rows: Array<{
        employeeName: string;
        employeeId: number;
        daysPresent: number;
        daysAbsent: number;
        daysLate: number;
        totalWorkedMinutes: number;
        scheduledMinutes: number;
        attendanceRate: number;
        siteName: string | null;
        clientName: string | null;
        billableHours: number;
      }> = [];

      for (const empUserId of employeeUserIds) {
        const empRow = employeeRowFromScheduleRef(empUserId, empById, empByLoginUserId);
        if (!empRow) continue;

        let displayName = `${empRow.firstName} ${empRow.lastName}`.trim();
        if (empRow.userId != null) {
          const [u] = await db.select().from(users).where(eq(users.id, empRow.userId)).limit(1);
          if (u?.name?.trim()) displayName = u.name.trim();
        }

        const empSchedules = allSchedules.filter((s) => s.employeeUserId === empUserId);
        let scheduledDays = 0;
        let presentDays = 0;
        let lateDays = 0;
        let absentDays = 0;
        let totalWorkedMinutes = 0;
        let scheduledMinutes = 0;

        for (let d = 1; d <= lastDay; d++) {
          const dateStr = `${year}-${mm}-${String(d).padStart(2, "0")}`;
          const dow = muscatCalendarWeekdaySun0ForYmd(dateStr);
          if (holidayDates.has(dateStr)) continue;

          const daySched = empSchedules.find(
            (s) =>
              s.workingDays.split(",").map(Number).includes(dow) &&
              s.startDate <= dateStr &&
              (s.endDate === null || s.endDate >= dateStr),
          );
          if (!daySched) continue;

          scheduledDays++;
          const [shift] = await db
            .select()
            .from(shiftTemplates)
            .where(eq(shiftTemplates.id, daySched.shiftTemplateId))
            .limit(1);
          const span = shift ? shiftSpanMinutes(shift.startTime, shift.endTime) : 0;
          const br = shift?.breakMinutes ?? 0;
          scheduledMinutes += Math.max(0, span - br);

          const record = recordMap.get(`${empRow.id}-${dateStr}`);
          if (record) {
            presentDays++;
            const checkInMins = muscatMinutesSinceMidnight(new Date(record.checkIn));
            const shiftStartMins = timeToMinutes(shift?.startTime ?? "08:00");
            const grace = shift?.gracePeriodMinutes ?? 15;
            const isLate = checkInMins > shiftStartMins + grace;
            if (isLate) lateDays++;
            if (record.checkOut) {
              const gross = Math.max(
                0,
                Math.round((record.checkOut.getTime() - record.checkIn.getTime()) / 60000),
              );
              totalWorkedMinutes += Math.max(0, gross - br);
            }
          } else {
            absentDays++;
          }
        }

        const attendanceRate =
          scheduledDays > 0 ? Math.round((presentDays / scheduledDays) * 100) : 0;

        const primarySched = [...empSchedules]
          .filter((s) => s.siteId != null)
          .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
        const site = primarySched?.siteId != null ? siteById.get(primarySched.siteId) : null;

        rows.push({
          employeeName: displayName,
          employeeId: empRow.id,
          daysPresent: presentDays,
          daysAbsent: absentDays,
          daysLate: lateDays,
          totalWorkedMinutes,
          scheduledMinutes,
          attendanceRate,
          siteName: site?.name ?? null,
          clientName: site?.clientName ?? null,
          billableHours: Math.round((Math.min(totalWorkedMinutes, scheduledMinutes) / 60) * 10) / 10,
        });
      }

      return { month: input.month, rows };
    }),

  /**
   * Per-client / per-site invoice summary: billable days (distinct Muscat dates with closed punch)
   * × contracted daily_rate_omr, with per-promoter breakdown.
   *
   * Clock rows are filtered by **Muscat calendar month** for the given `YYYY-MM` label (Asia/Muscat midnight boundaries),
   * aligned with payroll attendance windows — not UTC midnight on the 1st/last.
   */
  getClientInvoiceSummary: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        month: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM
      }),
    )
    .query(async ({ ctx, input }) => {
      const cid = await requireHrAdminOrDelegatedReports(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [yStr, mStr] = input.month.split("-");
      const year = Number(yStr);
      const month = Number(mStr);
      const mm = String(month).padStart(2, "0");
      const startDate = `${year}-${mm}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;

      const { startUtc: punchWindowStartUtc, endExclusiveUtc: punchWindowEndExclusiveUtc } =
        muscatMonthUtcRangeExclusiveEnd(year, month);

      const records = await db
        .select({
          id: attendanceRecords.id,
          employeeId: attendanceRecords.employeeId,
          checkIn: attendanceRecords.checkIn,
          checkOut: attendanceRecords.checkOut,
          siteId: attendanceRecords.siteId,
        })
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.companyId, cid),
            gte(attendanceRecords.checkIn, punchWindowStartUtc),
            lt(attendanceRecords.checkIn, punchWindowEndExclusiveUtc),
            isNotNull(attendanceRecords.checkOut),
            isNotNull(attendanceRecords.siteId),
          ),
        );

      if (records.length === 0) {
        return { month: input.month, groups: [], grandTotalOmr: 0 };
      }

      const siteIds = [...new Set(records.map((r) => r.siteId).filter((id): id is number => id != null))];
      const sites = siteIds.length
        ? await db
            .select({
              id: attendanceSites.id,
              name: attendanceSites.name,
              clientName: attendanceSites.clientName,
              dailyRateOmr: attendanceSites.dailyRateOmr,
            })
            .from(attendanceSites)
            .where(inArray(attendanceSites.id, siteIds))
        : [];
      const siteById = new Map(sites.map((s) => [s.id, s]));

      const empIds = [...new Set(records.map((r) => r.employeeId))];
      const empRows = empIds.length
        ? await db
            .select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName })
            .from(employees)
            .where(and(eq(employees.companyId, cid), inArray(employees.id, empIds)))
        : [];
      const empById = new Map(empRows.map((e) => [e.id, e]));

      type EmpDayEntry = {
        employeeId: number;
        employeeName: string;
        dates: Set<string>;
        totalWorkedMinutes: number;
      };
      type SiteGroup = {
        siteId: number;
        siteName: string;
        clientName: string | null;
        dailyRateOmr: number;
        employees: Map<number, EmpDayEntry>;
      };

      const groupBySite = new Map<number, SiteGroup>();

      for (const rec of records) {
        if (rec.siteId == null) continue;
        const site = siteById.get(rec.siteId);
        if (!site) continue;

        const dateYmd = muscatCalendarYmdFromUtcInstant(new Date(rec.checkIn));

        if (!groupBySite.has(rec.siteId)) {
          groupBySite.set(rec.siteId, {
            siteId: rec.siteId,
            siteName: site.name,
            clientName: site.clientName ?? null,
            dailyRateOmr: Number(site.dailyRateOmr ?? 0),
            employees: new Map(),
          });
        }
        const siteGroup = groupBySite.get(rec.siteId)!;

        if (!siteGroup.employees.has(rec.employeeId)) {
          const emp = empById.get(rec.employeeId);
          siteGroup.employees.set(rec.employeeId, {
            employeeId: rec.employeeId,
            employeeName: emp
              ? `${emp.firstName} ${emp.lastName}`.trim()
              : `Employee #${rec.employeeId}`,
            dates: new Set(),
            totalWorkedMinutes: 0,
          });
        }
        const empEntry = siteGroup.employees.get(rec.employeeId)!;
        empEntry.dates.add(dateYmd);

        if (rec.checkOut) {
          const mins = Math.max(
            0,
            Math.round((new Date(rec.checkOut).getTime() - new Date(rec.checkIn).getTime()) / 60000),
          );
          empEntry.totalWorkedMinutes += mins;
        }
      }

      type InvoiceRow = {
        siteId: number;
        siteName: string;
        clientName: string | null;
        dailyRateOmr: number;
        totalBillableDays: number;
        totalBillableHours: number;
        totalAmountOmr: number;
        promoters: Array<{
          employeeId: number;
          employeeName: string;
          billableDays: number;
          billableHours: number;
          amountOmr: number;
        }>;
      };

      const groups: InvoiceRow[] = [];

      for (const [, sg] of Array.from(groupBySite)) {
        const promoters = Array.from(sg.employees.values())
          .map((e) => {
            const billableDays = e.dates.size;
            const billableHours = Math.round((e.totalWorkedMinutes / 60) * 10) / 10;
            const amountOmr = Math.round(billableDays * sg.dailyRateOmr * 1000) / 1000;
            return {
              employeeId: e.employeeId,
              employeeName: e.employeeName,
              billableDays,
              billableHours,
              amountOmr,
            };
          })
          .filter((p) => p.billableDays > 0)
          .sort((a, b) => a.employeeName.localeCompare(b.employeeName));

        if (promoters.length === 0) continue;

        const totalBillableDays = promoters.reduce((s, p) => s + p.billableDays, 0);
        const totalBillableHours = Math.round(promoters.reduce((s, p) => s + p.billableHours, 0) * 10) / 10;
        const totalAmountOmr = Math.round(totalBillableDays * sg.dailyRateOmr * 1000) / 1000;

        groups.push({
          siteId: sg.siteId,
          siteName: sg.siteName,
          clientName: sg.clientName,
          dailyRateOmr: sg.dailyRateOmr,
          totalBillableDays,
          totalBillableHours,
          totalAmountOmr,
          promoters,
        });
      }

      groups.sort((a, b) => {
        const ka = a.clientName ?? a.siteName;
        const kb = b.clientName ?? b.siteName;
        const c = ka.localeCompare(kb);
        return c !== 0 ? c : a.siteName.localeCompare(b.siteName);
      });

      const grandTotalOmr =
        Math.round(groups.reduce((s, g) => s + g.totalAmountOmr, 0) * 1000) / 1000;

      return { month: input.month, groups, grandTotalOmr };
    }),

  // ── Leave Balance ─────────────────────────────────────────────────────────
  getLeaveBalance: protectedProcedure
    .input(z.object({ employeeId: z.number(), companyId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const { companyId: cid } = await requireHrOrAdmin(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const caps = await getMergedLeaveCapsForCompanyId(db, cid);
      const allLeave = await getLeaveRequests(cid, input.employeeId);
      const ENTITLEMENTS: Record<string, number> = {
        ...caps,
        maternity: 50,
        paternity: 3,
        unpaid: 0,
        other: 0,
      };
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
    const { companyId: cid } = await requireHrOrAdmin(ctx.user as User, input?.companyId);
    const db = await getDb();
    if (!db) return { employees: [], policyCaps: mergeLeavePolicyCaps(null) };
    const policyCaps = await getMergedLeaveCapsForCompanyId(db, cid);
    const emps = await getEmployees(cid);
    const activeEmps = emps.filter((e) => e.status === "active");
    const allLeave = await getLeaveRequests(cid);
    const ENTITLEMENTS: Record<string, number> = { ...policyCaps };
    const rows = activeEmps.map((emp) => {
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
    return { employees: rows, policyCaps };
  }),

  // ── Employee Profile Completeness ─────────────────────────────────────────
  getEmployeeCompleteness: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
    const { companyId: cid } = await requireHrOrAdmin(ctx.user as User, input?.companyId);
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
    const { companyId: cid } = await requireHrOrAdmin(ctx.user as User, input?.companyId);
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
      const { companyId: cid } = await requireHrOrAdmin(ctx.user as User, input.companyId);
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
      const { companyId: cid } = await requireHrOrAdmin(ctx.user as User, input?.companyId);
      const emptyResult = {
        todayPresent: 0, todayAbsent: 0, todayTotal: 0,
        pendingLeave: 0, kpiTargetsCount: 0, kpiAvgPct: 0,
        kpiTopPerformer: null as string | null,
        payrollStatus: null as string | null, payrollMonth: null as string | null,
        activeEmployees: 0,
      };
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
      const cid = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      let deptWrite = "";
      if (input.departmentName != null && input.departmentName.trim() !== "") {
        deptWrite = await resolveCanonicalDepartmentWrite(db, cid, input.departmentName);
      }
      for (const empId of input.employeeIds) {
        const [emp] = await db.select({ id: employees.id, companyId: employees.companyId })
          .from(employees).where(eq(employees.id, empId));
        if (!emp || emp.companyId !== cid) continue;
        await db.update(employees).set({ department: deptWrite }).where(eq(employees.id, empId));
      }
      return { success: true, updated: input.employeeIds.length };
    }),

  // List employees belonging to a specific department
  listDepartmentMembers: protectedProcedure
    .input(z.object({ departmentName: z.string(), companyId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const { companyId: cid } = await requireHrOrAdmin(ctx.user as User, input.companyId);
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
      const { companyId: cid } = await requireHrOrAdmin(ctx.user as User, input?.companyId);
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
      const cid = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
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

  /** Inserts all suggested departments that do not already exist (by English name, case-insensitive). */
  seedSuggestedDepartments: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      return seedSuggestedDepartmentRows(db, cid);
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
      const cid = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
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
      // Keep employee.department string in sync when the canonical department name changes
      if (input.name !== undefined && input.name !== existing.name) {
        await db.update(employees).set({ department: input.name }).where(
          and(eq(employees.companyId, cid), eq(employees.department, existing.name)),
        );
      }
      return { success: true };
    }),

  deleteDepartment: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [existing] = await db.select().from(departments).where(and(eq(departments.id, input.id), eq(departments.companyId, cid)));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Department not found" });
      await db.update(departments).set({ isActive: false }).where(eq(departments.id, input.id));
      await db.update(employees).set({ department: null }).where(
        and(eq(employees.companyId, cid), eq(employees.department, existing.name)),
      );
      return { success: true };
    }),

  listPositions: protectedProcedure
    .input(z.object({ departmentId: z.number().optional(), companyId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const { companyId: cid } = await requireHrOrAdmin(ctx.user as User, input?.companyId);
      const db = await getDb();
      if (!db) return [];
      const conditions: any[] = [eq(positions.companyId, cid), eq(positions.isActive, true)];
      if (input?.departmentId) conditions.push(eq(positions.departmentId, input.departmentId));
      return db.select().from(positions).where(and(...conditions));
    }),

  createPosition: protectedProcedure
    .input(z.object({
      title: z.string().min(1).max(128),
      titleAr: z.string().max(128).optional(),
      departmentId: z.number().optional(),
      description: z.string().optional(),
      companyId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [result] = await db.insert(positions).values({
        companyId: cid,
        title: input.title,
        titleAr: input.titleAr,
        departmentId: input.departmentId,
        description: input.description,
      });
      return { id: (result as any).insertId };
    }),

  deletePosition: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
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
      const { companyId: cid } = await requireHrOrAdmin(ctx.user as User, input?.companyId);
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
      await assertRowBelongsToActiveCompany(ctx.user, emp.companyId, "Employee", input.companyId ?? emp.companyId);
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
      const { companyId: cid } = await requireHrOrAdmin(ctx.user as User, input?.companyId);
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

  // ── WPS Validation ──────────────────────────────────────────────────────────

  /**
   * Run WPS readiness check for a single employee.
   * Persists the result to employee_wps_validations and updates wps_status on the employee row.
   */
  validateWps: protectedProcedure
    .input(
      z
        .object({
          employeeId: z.number().int().positive(),
          companyId: z.number().optional(),
          periodYear: z.number().int().min(2000).max(2100).optional(),
          periodMonth: z.number().int().min(1).max(12).optional(),
        })
        .refine(
          (v) =>
            (v.periodYear === undefined && v.periodMonth === undefined) ||
            (v.periodYear !== undefined && v.periodMonth !== undefined),
          {
            message: "Provide both periodYear and periodMonth together.",
            path: ["periodYear"],
          },
        ),
    )
    .mutation(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const normalizedPeriod = normalizeWpsValidationPeriod({
        periodYear: input.periodYear,
        periodMonth: input.periodMonth,
      });

      const [emp] = await db
        .select()
        .from(employees)
        .where(and(eq(employees.id, input.employeeId), eq(employees.companyId, cid)))
        .limit(1);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });

      const result = validateEmployeeWpsReadiness({
        status: emp.status,
        employmentType: emp.employmentType,
        hireDate: emp.hireDate,
        ibanNumber: emp.ibanNumber,
        basicSalary: emp.basicSalary,
      });

      await db.insert(employeeWpsValidations).values({
        companyId: cid,
        employeeId: emp.id,
        validatedByUserId: ctx.user.id,
        ibanPresent: Boolean(emp.ibanNumber),
        ibanValidFormat: !result.issues.includes("invalid_iban_format") && Boolean(emp.ibanNumber),
        bankNamePresent: Boolean(emp.bankName),
        salaryPresent: result.parsedBasicSalary !== null,
        periodYear: normalizedPeriod.periodYear,
        periodMonth: normalizedPeriod.periodMonth,
        result: result.status === "ready" ? "ready" : result.status === "missing" ? "missing" : "invalid",
        failureReasons: result.issues,
      });

      await db
        .update(employees)
        .set({ wpsStatus: result.status, wpsLastValidatedAt: new Date() })
        .where(eq(employees.id, emp.id));

      return {
        employeeId: emp.id,
        status: result.status,
        isReady: result.isReady,
        issues: result.issues,
        normalizedIban: result.normalizedIban,
      };
    }),

  /**
   * Fetch WPS validation history for a single employee (latest 20 records).
   */
  wpsHistory: protectedProcedure
    .input(z.object({ employeeId: z.number().int().positive(), companyId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const { companyId: cid } = await requireFinanceOrAdmin(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(employeeWpsValidations)
        .where(and(eq(employeeWpsValidations.employeeId, input.employeeId), eq(employeeWpsValidations.companyId, cid)))
        .orderBy(desc(employeeWpsValidations.validatedAt))
        .limit(20);
    }),

  /**
   * Bulk WPS validation — run for all active employees in the company.
   */
  bulkValidateWps: protectedProcedure
    .input(
      z
        .object({
          companyId: z.number().optional(),
          periodYear: z.number().int().min(2000).max(2100).optional(),
          periodMonth: z.number().int().min(1).max(12).optional(),
        })
        .refine(
          (v) =>
            (v.periodYear === undefined && v.periodMonth === undefined) ||
            (v.periodYear !== undefined && v.periodMonth !== undefined),
          {
            message: "Provide both periodYear and periodMonth together.",
            path: ["periodYear"],
          },
        ),
    )
    .mutation(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const normalizedPeriod = normalizeWpsValidationPeriod({
        periodYear: input.periodYear,
        periodMonth: input.periodMonth,
      });

      const activeEmps = await db
        .select()
        .from(employees)
        .where(and(eq(employees.companyId, cid), eq(employees.status, "active")));

      let ready = 0, invalid = 0, missing = 0;
      for (const emp of activeEmps) {
        const result = validateEmployeeWpsReadiness({
          status: emp.status,
          employmentType: emp.employmentType,
          hireDate: emp.hireDate,
          ibanNumber: emp.ibanNumber,
          basicSalary: emp.basicSalary,
        });
        await db.insert(employeeWpsValidations).values({
          companyId: cid,
          employeeId: emp.id,
          validatedByUserId: ctx.user.id,
          ibanPresent: Boolean(emp.ibanNumber),
          ibanValidFormat: !result.issues.includes("invalid_iban_format") && Boolean(emp.ibanNumber),
          bankNamePresent: Boolean(emp.bankName),
          salaryPresent: result.parsedBasicSalary !== null,
          periodYear: normalizedPeriod.periodYear,
          periodMonth: normalizedPeriod.periodMonth,
          result: result.status === "ready" ? "ready" : result.status === "missing" ? "missing" : "invalid",
          failureReasons: result.issues,
        });
        await db
          .update(employees)
          .set({ wpsStatus: result.status, wpsLastValidatedAt: new Date() })
          .where(eq(employees.id, emp.id));
        if (result.status === "ready") ready++;
        else if (result.status === "missing") missing++;
        else invalid++;
      }

      return { total: activeEmps.length, ready, invalid, missing };
    }),
});
