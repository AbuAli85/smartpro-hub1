/**
 * HR organisational audit helpers — departments, positions, department assignments, leave creation.
 *
 * All helpers are mandatory (awaited, not fire-and-forget): audit failure fails the mutation.
 *
 * Sensitive data policy:
 *  - No salary, banking, passport, or identity fields are logged here.
 *  - Department and position names, leave type, and date ranges are structural/operational
 *    and are safe to include.
 *  - assignDepartment emits one audit event per employee (inside the loop) so that
 *    entity-level queries for a specific employee return the assignment history.
 */

import { auditEvents } from "../drizzle/schema";

/** Drizzle-style client with `insert(auditEvents).values(...)`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbInsert = any;

export const HR_ORG_ENTITY = {
  DEPARTMENT: "department",
  POSITION: "position",
  EMPLOYEE: "employee",
  LEAVE_REQUEST: "leave_request",
} as const;

export const HR_ORG_ACTION = {
  DEPARTMENT_CREATED: "department_created",
  DEPARTMENT_UPDATED: "department_updated",
  DEPARTMENT_DELETED: "department_deleted",
  EMPLOYEE_DEPARTMENT_ASSIGNED: "employee_department_assigned",
  POSITION_CREATED: "position_created",
  POSITION_DELETED: "position_deleted",
  LEAVE_CREATED: "leave_created",
  EMPLOYEE_CREATED: "employee_created",
  EMPLOYEE_UPDATED: "employee_updated",
  EMPLOYEE_STATUS_CHANGED: "employee_status_changed",
} as const;

/**
 * Fields safe to include in employee audit payloads.
 * Excludes: salary, banking, passport/civil-ID numbers, contact PII,
 * PASI number, date of birth, marital status.
 */
const EMPLOYEE_SAFE_FIELDS = new Set([
  "firstName", "lastName", "firstNameAr", "lastNameAr",
  "employmentType", "department", "position", "status",
  "hireDate", "terminationDate", "employeeNumber", "gender",
]);

/** Extract only audit-safe fields from an employee record or update payload. */
export function pickSafeEmployeeFields(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of EMPLOYEE_SAFE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) out[key] = obj[key];
  }
  return out;
}

export async function recordDepartmentCreatedAudit(
  db: DbInsert,
  params: {
    companyId: number;
    actorUserId: number;
    departmentId: number;
    name: string;
    nameAr: string | null;
    headEmployeeId: number | null;
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    entityType: HR_ORG_ENTITY.DEPARTMENT,
    entityId: params.departmentId,
    action: HR_ORG_ACTION.DEPARTMENT_CREATED,
    beforeState: null,
    afterState: {
      name: params.name,
      nameAr: params.nameAr,
      headEmployeeId: params.headEmployeeId,
    },
    metadata: null,
  });
}

export async function recordDepartmentUpdatedAudit(
  db: DbInsert,
  params: {
    companyId: number;
    actorUserId: number;
    departmentId: number;
    previousName: string;
    previousNameAr: string | null;
    previousHeadEmployeeId: number | null;
    nextName: string;
    nextNameAr: string | null;
    nextHeadEmployeeId: number | null;
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    entityType: HR_ORG_ENTITY.DEPARTMENT,
    entityId: params.departmentId,
    action: HR_ORG_ACTION.DEPARTMENT_UPDATED,
    beforeState: {
      name: params.previousName,
      nameAr: params.previousNameAr,
      headEmployeeId: params.previousHeadEmployeeId,
    },
    afterState: {
      name: params.nextName,
      nameAr: params.nextNameAr,
      headEmployeeId: params.nextHeadEmployeeId,
    },
    metadata: null,
  });
}

export async function recordDepartmentDeletedAudit(
  db: DbInsert,
  params: {
    companyId: number;
    actorUserId: number;
    departmentId: number;
    name: string;
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    entityType: HR_ORG_ENTITY.DEPARTMENT,
    entityId: params.departmentId,
    action: HR_ORG_ACTION.DEPARTMENT_DELETED,
    beforeState: { name: params.name, isActive: true },
    afterState: { isActive: false },
    metadata: null,
  });
}

/**
 * One audit event per employee — emitted inside the assignDepartment loop so that
 * per-employee audit queries capture assignment history correctly.
 */
export async function recordEmployeeDepartmentAssignedAudit(
  db: DbInsert,
  params: {
    companyId: number;
    actorUserId: number;
    employeeId: number;
    departmentName: string | null;
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    entityType: HR_ORG_ENTITY.EMPLOYEE,
    entityId: params.employeeId,
    action: HR_ORG_ACTION.EMPLOYEE_DEPARTMENT_ASSIGNED,
    beforeState: null,
    afterState: { department: params.departmentName },
    metadata: null,
  });
}

export async function recordPositionCreatedAudit(
  db: DbInsert,
  params: {
    companyId: number;
    actorUserId: number;
    positionId: number;
    title: string;
    departmentId: number | null;
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    entityType: HR_ORG_ENTITY.POSITION,
    entityId: params.positionId,
    action: HR_ORG_ACTION.POSITION_CREATED,
    beforeState: null,
    afterState: { title: params.title, departmentId: params.departmentId },
    metadata: null,
  });
}

export async function recordPositionDeletedAudit(
  db: DbInsert,
  params: {
    companyId: number;
    actorUserId: number;
    positionId: number;
    title: string;
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    entityType: HR_ORG_ENTITY.POSITION,
    entityId: params.positionId,
    action: HR_ORG_ACTION.POSITION_DELETED,
    beforeState: { title: params.title, isActive: true },
    afterState: { isActive: false },
    metadata: null,
  });
}

export async function recordEmployeeCreatedAudit(
  db: DbInsert,
  params: {
    companyId: number;
    actorUserId: number;
    employeeId: number;
    employmentType: string;
    department: string | null;
    position: string | null;
    hireDate: string | null;
    employeeNumber: string | null;
    providedFields: string[];
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    entityType: HR_ORG_ENTITY.EMPLOYEE,
    entityId: params.employeeId,
    action: HR_ORG_ACTION.EMPLOYEE_CREATED,
    beforeState: null,
    afterState: {
      employmentType: params.employmentType,
      department: params.department,
      position: params.position,
      hireDate: params.hireDate,
      employeeNumber: params.employeeNumber,
    },
    metadata: { providedFields: params.providedFields },
  });
}

export async function recordEmployeeUpdatedAudit(
  db: DbInsert,
  params: {
    companyId: number;
    actorUserId: number;
    employeeId: number;
    changedFields: string[];
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    entityType: HR_ORG_ENTITY.EMPLOYEE,
    entityId: params.employeeId,
    action: HR_ORG_ACTION.EMPLOYEE_UPDATED,
    beforeState: params.before,
    afterState: params.after,
    metadata: { changedFields: params.changedFields },
  });
}

export async function recordEmployeeStatusChangedAudit(
  db: DbInsert,
  params: {
    companyId: number;
    actorUserId: number;
    employeeId: number;
    previousStatus: string | null;
    nextStatus: string;
    terminationDate?: string | null;
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    entityType: HR_ORG_ENTITY.EMPLOYEE,
    entityId: params.employeeId,
    action: HR_ORG_ACTION.EMPLOYEE_STATUS_CHANGED,
    beforeState: { status: params.previousStatus },
    afterState: {
      status: params.nextStatus,
      ...(params.terminationDate !== undefined ? { terminationDate: params.terminationDate } : {}),
    },
    metadata: null,
  });
}

/**
 * Real audit event for admin-side leave creation.
 * Replaces the note-prefix pattern (which only appears in createAttendance, not here).
 * Logs structural leave data (type, dates, days) — no salary or identity fields.
 */
export async function recordLeaveCreatedAudit(
  db: DbInsert,
  params: {
    companyId: number;
    actorUserId: number;
    employeeId: number;
    leaveType: string;
    startDate: string;
    endDate: string;
    days: number;
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    entityType: HR_ORG_ENTITY.LEAVE_REQUEST,
    entityId: params.employeeId,
    action: HR_ORG_ACTION.LEAVE_CREATED,
    beforeState: null,
    afterState: {
      leaveType: params.leaveType,
      startDate: params.startDate,
      endDate: params.endDate,
      days: params.days,
    },
    metadata: null,
  });
}
