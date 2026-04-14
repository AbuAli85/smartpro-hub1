/**
 * Single source of truth for `attendance_audit` string fields (must match MySQL enums / conventions).
 * Use these constants from routers instead of ad hoc literals to avoid spelling drift.
 */
export const ATTENDANCE_AUDIT_ACTION = {
  HR_ATTENDANCE_CREATE: "hr_attendance_create",
  HR_ATTENDANCE_UPDATE: "hr_attendance_update",
  HR_ATTENDANCE_DELETE: "hr_attendance_delete",
  CORRECTION_APPROVE: "correction_approve",
  CORRECTION_REJECT: "correction_reject",
  /** Employee submitted a time correction request (pending HR review). */
  CORRECTION_SUBMITTED: "correction_submitted",
  MANUAL_CHECKIN_APPROVE: "manual_checkin_approve",
  MANUAL_CHECKIN_REJECT: "manual_checkin_reject",
  SELF_CHECKIN_ALLOWED: "self_checkin_allowed",
  SELF_CHECKIN_DENIED: "self_checkin_denied",
  SELF_CHECKOUT: "self_checkout",
  MANUAL_CHECKIN_SUBMIT: "manual_checkin_submit",
  /** HR closed an open punch at an explicit time (compliance). */
  FORCE_CHECKOUT: "force_checkout",
  OPERATIONAL_ISSUE_ACKNOWLEDGE: "operational_issue_acknowledge",
  OPERATIONAL_ISSUE_RESOLVE: "operational_issue_resolve",
  OPERATIONAL_ISSUE_ASSIGN: "operational_issue_assign",
} as const;

export type AttendanceAuditActionType =
  (typeof ATTENDANCE_AUDIT_ACTION)[keyof typeof ATTENDANCE_AUDIT_ACTION];

/** `entity_type` column (varchar) — stable labels for queries and exports. */
export const ATTENDANCE_AUDIT_ENTITY = {
  HR_ATTENDANCE: "hr_attendance",
  ATTENDANCE_RECORD: "attendance_record",
  MANUAL_CHECKIN_REQUEST: "manual_checkin_request",
  ATTENDANCE_CORRECTION: "attendance_correction",
  SELF_CHECKIN_ATTEMPT: "self_checkin_attempt",
} as const;

export type AttendanceAuditEntityType =
  (typeof ATTENDANCE_AUDIT_ENTITY)[keyof typeof ATTENDANCE_AUDIT_ENTITY];

export const ATTENDANCE_AUDIT_SOURCE = {
  HR_PANEL: "hr_panel",
  EMPLOYEE_PORTAL: "employee_portal",
  ADMIN_PANEL: "admin_panel",
  SYSTEM: "system",
} as const;

export type AttendanceAuditSource = (typeof ATTENDANCE_AUDIT_SOURCE)[keyof typeof ATTENDANCE_AUDIT_SOURCE];
