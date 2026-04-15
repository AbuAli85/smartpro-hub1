import { and, desc, eq } from "drizzle-orm";
import {
  attendance,
  employees,
  jobApplications,
  jobPostings,
  leaveRequests,
  payrollRecords,
  performanceReviews,
} from "../../drizzle/schema";
import { getDb } from "../db.client";

// ─── Employees ────────────────────────────────────────────────────────────────

export async function getEmployees(
  companyId: number,
  filters?: { status?: string; department?: string; limit?: number; offset?: number },
) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(employees.companyId, companyId)];
  if (filters?.status) conditions.push(eq(employees.status, filters.status as any));
  if (filters?.department) conditions.push(eq(employees.department, filters.department));
  const q = db.select().from(employees).where(and(...conditions)).orderBy(employees.firstName);
  if (filters?.limit != null) {
    return q.limit(filters.limit).offset(filters.offset ?? 0);
  }
  return q;
}

export async function getEmployeeById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  return result[0] ?? null;
}

export async function createEmployee(data: typeof employees.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(employees).values(data);
  return result[0] ?? null;
}

export async function updateEmployee(id: number, data: Partial<typeof employees.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(employees).set(data).where(eq(employees.id, id));
}

// ─── Job Postings & Applications ─────────────────────────────────────────────

export async function getJobPostings(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(jobPostings)
    .where(eq(jobPostings.companyId, companyId))
    .orderBy(desc(jobPostings.createdAt));
}

export async function createJobPosting(data: typeof jobPostings.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(jobPostings).values(data);
  return result[0] ?? null;
}

export async function updateJobPosting(id: number, data: Partial<typeof jobPostings.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(jobPostings).set(data).where(eq(jobPostings.id, id));
}

export async function getJobPostingById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [r] = await db.select().from(jobPostings).where(eq(jobPostings.id, id)).limit(1);
  return r ?? null;
}

export async function getJobApplications(jobId?: number, companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (jobId) conditions.push(eq(jobApplications.jobId, jobId));
  if (companyId) conditions.push(eq(jobApplications.companyId, companyId));
  return db
    .select()
    .from(jobApplications)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(jobApplications.createdAt));
}

export async function createJobApplication(data: typeof jobApplications.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(jobApplications).values(data);
  return result[0] ?? null;
}

export async function updateJobApplication(id: number, data: Partial<typeof jobApplications.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(jobApplications).set(data).where(eq(jobApplications.id, id));
}

export async function getJobApplicationById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [r] = await db.select().from(jobApplications).where(eq(jobApplications.id, id)).limit(1);
  return r ?? null;
}

// ─── Leave Requests ───────────────────────────────────────────────────────────

export async function getLeaveRequests(companyId: number, employeeId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(leaveRequests.companyId, companyId)];
  if (employeeId) conditions.push(eq(leaveRequests.employeeId, employeeId));
  return db.select().from(leaveRequests).where(and(...conditions)).orderBy(desc(leaveRequests.createdAt));
}

export async function createLeaveRequest(data: typeof leaveRequests.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(leaveRequests).values(data);
  return result[0] ?? null;
}

export async function updateLeaveRequest(id: number, data: Partial<typeof leaveRequests.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(leaveRequests).set(data).where(eq(leaveRequests.id, id));
}

export async function getLeaveRequestById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [r] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id)).limit(1);
  return r ?? null;
}

// ─── Payroll ──────────────────────────────────────────────────────────────────

export async function getPayrollRecords(companyId: number, year?: number, month?: number, employeeId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(payrollRecords.companyId, companyId)];
  if (year != null) conditions.push(eq(payrollRecords.periodYear, year));
  if (month != null) conditions.push(eq(payrollRecords.periodMonth, month));
  if (employeeId != null) conditions.push(eq(payrollRecords.employeeId, employeeId));
  return db
    .select()
    .from(payrollRecords)
    .where(and(...conditions))
    .orderBy(desc(payrollRecords.periodYear), desc(payrollRecords.periodMonth));
}

export async function createPayrollRecord(data: typeof payrollRecords.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(payrollRecords).values(data);
  return result[0] ?? null;
}

export async function updatePayrollRecord(id: number, data: Partial<typeof payrollRecords.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(payrollRecords).set(data).where(eq(payrollRecords.id, id));
}

export async function getPayrollRecordById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [r] = await db.select().from(payrollRecords).where(eq(payrollRecords.id, id)).limit(1);
  return r ?? null;
}

// ─── Performance Reviews ──────────────────────────────────────────────────────

export async function getPerformanceReviews(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(performanceReviews)
    .where(eq(performanceReviews.companyId, companyId))
    .orderBy(desc(performanceReviews.createdAt));
}

export async function createPerformanceReview(data: typeof performanceReviews.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(performanceReviews).values(data);
  return result[0] ?? null;
}

export async function getPerformanceReviewById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [r] = await db.select().from(performanceReviews).where(eq(performanceReviews.id, id)).limit(1);
  return r ?? null;
}

// ─── Attendance (legacy simple reads — extended ops live in attendance.repository) ─

export async function getAttendanceRecordById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [r] = await db.select().from(attendance).where(eq(attendance.id, id)).limit(1);
  return r ?? null;
}
