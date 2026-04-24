/**
 * Daily attendance state builder (Phase 9A).
 *
 * Combines schedule conflict detection, attendance evidence, day-type flags,
 * and pending action context into a single normalized DailyAttendanceState.
 *
 * Pure — no database calls. See server/routers/attendance/dailyState.router.ts
 * for the server-side data loading and the tRPC procedure that exposes this.
 *
 * Design decisions:
 *   - scheduleState is resolved before calling resolveAttendanceDayState(); it
 *     maps more directly to HR mental model (conflict, missing_shift, etc.).
 *   - For conflict: scheduleConflict flag is forwarded to the resolver so the
 *     blocked_schedule_conflict payroll readiness is produced correctly.
 *   - For missing_shift / missing_site: treated as scheduleExists=true but
 *     without valid shift times — the resolver will use default 09:00–17:00
 *     times, which is intentionally conservative so the status is still
 *     derivable (HR sees "absent" rather than "not_scheduled" for a broken
 *     schedule row).
 *   - inactive_employee maps to employeeActive=false — the resolver raises
 *     needs_review with high risk, which is correct for a suspended employee
 *     still generating punches.
 */

import {
  buildAttendanceActionItems,
  type AttendanceActionQueueItem,
} from "./attendanceActionQueue";
import {
  resolveAttendanceDayState,
  type AttendanceDayRiskLevel,
  type AttendanceDayStatus,
  type AttendancePayrollReadiness,
} from "./attendanceStatus";

// ---------------------------------------------------------------------------
// Schedule-level state (higher-level than resolveAttendanceDayState)
// ---------------------------------------------------------------------------

/**
 * The schedule-resolution outcome for one employee on one date.
 * Determined before the canonical status resolver runs.
 */
export type DailyScheduleState =
  /** Exactly one active schedule matched; shift template and site both resolved. */
  | "scheduled"
  /** No active schedule covers this employee/date/DOW combination. */
  | "not_scheduled"
  /** Two or more active schedules match this employee/date/DOW — payroll-blocking conflict. */
  | "conflict"
  /** Employee record is suspended, terminated, or resigned. */
  | "inactive_employee"
  /** Schedule row exists but the referenced shift template is missing or inactive. */
  | "missing_shift"
  /** Schedule row and shift exist but the referenced site is missing or inactive. */
  | "missing_site";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/**
 * A single schedule entry pre-resolved by the server loader.
 * Includes joined shift template data and a site-existence flag.
 * The caller is responsible for:
 *   - filtering by is_active = true and date range (start_date ≤ date ≤ end_date)
 *   - filtering by working-day DOW match
 */
export interface ResolvedScheduleEntry {
  /** employee_schedules.id */
  id: number;
  /** shift_templates.id, null if the template row was not found */
  shiftTemplateId: number | null;
  /** attendance_sites.id, null if missing from the DB row */
  siteId: number | null;
  /** shift_templates.start_time ("HH:MM"), null if template not found */
  shiftStartTime: string | null;
  /** shift_templates.end_time ("HH:MM"), null if template not found */
  shiftEndTime: string | null;
  /** shift_templates.grace_period_minutes, default 15 */
  gracePeriodMinutes: number;
  /** True when the site row was found in attendance_sites */
  siteExists: boolean;
}

export interface DailyAttendanceStateInput {
  companyId: number;
  employeeId: number;
  employeeName?: string;
  /** YYYY-MM-DD Muscat calendar date being evaluated. */
  attendanceDate: string;
  /** Override for "now" — defaults to new Date(). */
  now?: Date;

  /**
   * Active schedule rows that apply to this employee on this date.
   * Pre-filtered: is_active, date-range, and DOW match already applied.
   * An empty array means not_scheduled.
   * Two or more entries produce a conflict.
   */
  activeSchedules: ResolvedScheduleEntry[];

  /** UTC instant of the earliest check-in for this date. */
  checkInAt?: Date | null;
  /** UTC instant of the check-out (null for open sessions). */
  checkOutAt?: Date | null;
  /** True when an open attendance_sessions row exists for this date. */
  hasOpenSession: boolean;
  /** True when a row exists in the legacy HR attendance table for this date. */
  hasOfficialRecord: boolean;

  isHoliday: boolean;
  isOnLeave: boolean;
  isRemote?: boolean;

  hasPendingCorrection: boolean;
  hasPendingManualCheckin: boolean;

  /** False when employee.status is not "active" or "on_leave". */
  employeeActive: boolean;

  /** Attendance record id for action-item generation. */
  attendanceRecordId?: number | null;
  /** Minutes since the issue started (for age display in the action queue). */
  ageMinutes?: number;
  ownerUserId?: number | null;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface DailyAttendanceState {
  companyId: number;
  employeeId: number;
  employeeName?: string;
  attendanceDate: string;

  // ── Schedule resolution ──────────────────────────────────────────────────
  scheduleState: DailyScheduleState;
  /** employee_schedules.id of the selected (or first-of-conflict) schedule. */
  scheduleId?: number;
  /** shift_templates.id used for shift boundary calculation. */
  shiftId?: number;
  /** attendance_sites.id this schedule is assigned to. */
  siteId?: number;
  /** Muscat wall-clock shift start "HH:MM". */
  shiftStartAt?: string;
  /** Muscat wall-clock shift end "HH:MM". */
  shiftEndAt?: string;

  // ── Attendance evidence ──────────────────────────────────────────────────
  /** ISO 8601 UTC string of earliest check-in for the date, if any. */
  checkInAt?: string;
  /** ISO 8601 UTC string of check-out for the date, if any. */
  checkOutAt?: string;
  hasOpenSession: boolean;
  hasOfficialRecord: boolean;

  // ── Pending actions ──────────────────────────────────────────────────────
  hasPendingCorrection: boolean;
  hasPendingManualCheckin: boolean;

  // ── Day-type flags ───────────────────────────────────────────────────────
  isHoliday: boolean;
  isOnLeave: boolean;

  // ── Canonical status (from resolveAttendanceDayState) ────────────────────
  canonicalStatus: AttendanceDayStatus;
  payrollReadiness: AttendancePayrollReadiness;
  riskLevel: AttendanceDayRiskLevel;
  reasonCodes: string[];

  // ── Action items (from buildAttendanceActionItems) ────────────────────────
  actionItems: AttendanceActionQueueItem[];
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Build a normalized DailyAttendanceState from pre-loaded inputs.
 *
 * Pure — no side effects. Calls resolveAttendanceDayState() to derive canonical
 * status/payrollReadiness/riskLevel, then buildAttendanceActionItems() to
 * produce the HR action queue entries.
 */
export function buildDailyAttendanceState(
  input: DailyAttendanceStateInput
): DailyAttendanceState {
  const now = input.now ?? new Date();

  // ── 1. Resolve schedule state ──────────────────────────────────────────────

  let scheduleState: DailyScheduleState;
  let scheduleId: number | undefined;
  let shiftId: number | undefined;
  let siteId: number | undefined;
  let shiftStartAt: string | undefined;
  let shiftEndAt: string | undefined;
  let gracePeriodMinutes = 15;

  if (!input.employeeActive) {
    scheduleState = "inactive_employee";
    // Still pick schedule data if available for display
    const s = input.activeSchedules[0];
    if (s) {
      scheduleId = s.id;
      shiftId = s.shiftTemplateId ?? undefined;
      siteId = s.siteId ?? undefined;
      shiftStartAt = s.shiftStartTime ?? undefined;
      shiftEndAt = s.shiftEndTime ?? undefined;
      gracePeriodMinutes = s.gracePeriodMinutes;
    }
  } else if (input.activeSchedules.length === 0) {
    scheduleState = "not_scheduled";
  } else if (input.activeSchedules.length > 1) {
    scheduleState = "conflict";
    // Use first entry for display; all are reported as conflicting
    const s = input.activeSchedules[0];
    scheduleId = s.id;
    shiftId = s.shiftTemplateId ?? undefined;
    siteId = s.siteId ?? undefined;
    shiftStartAt = s.shiftStartTime ?? undefined;
    shiftEndAt = s.shiftEndTime ?? undefined;
    gracePeriodMinutes = s.gracePeriodMinutes;
  } else {
    const s = input.activeSchedules[0];
    scheduleId = s.id;
    shiftId = s.shiftTemplateId ?? undefined;
    siteId = s.siteId ?? undefined;
    shiftStartAt = s.shiftStartTime ?? undefined;
    shiftEndAt = s.shiftEndTime ?? undefined;
    gracePeriodMinutes = s.gracePeriodMinutes;

    if (!s.shiftTemplateId || !s.shiftStartTime || !s.shiftEndTime) {
      scheduleState = "missing_shift";
    } else if (!s.siteId || !s.siteExists) {
      scheduleState = "missing_site";
    } else {
      scheduleState = "scheduled";
    }
  }

  // ── 2. Map scheduleState to resolver flags ─────────────────────────────────

  // A schedule "exists" for the resolver as long as there is at least one row,
  // even if it is broken (missing_shift / missing_site). This lets the resolver
  // produce informative statuses (late, absent, etc.) instead of not_scheduled.
  const scheduleExists =
    scheduleState === "scheduled" ||
    scheduleState === "conflict" ||
    scheduleState === "missing_shift" ||
    scheduleState === "missing_site";

  const scheduleConflict = scheduleState === "conflict";

  // inactive_employee → employeeActive: false to let the resolver raise needs_review
  const resolverEmployeeActive = scheduleState !== "inactive_employee";

  // ── 3. Call canonical resolver ─────────────────────────────────────────────

  const resolved = resolveAttendanceDayState({
    attendanceDate: input.attendanceDate,
    now,
    scheduleExists,
    shiftStartTime: shiftStartAt,
    shiftEndTime: shiftEndAt,
    gracePeriodMinutes,
    checkInTime: input.checkInAt ?? null,
    checkOutTime: input.checkOutAt ?? null,
    holidayFlag: input.isHoliday,
    leaveFlag: input.isOnLeave,
    remoteFlag: input.isRemote ?? false,
    correctionPending: input.hasPendingCorrection,
    manualCheckinPending: input.hasPendingManualCheckin,
    scheduleConflict,
    employeeActive: resolverEmployeeActive,
    rawSessionExists: input.hasOpenSession,
    officialHrRecordExists: input.hasOfficialRecord,
  });

  // ── 4. Build action items ──────────────────────────────────────────────────

  const actionItems = buildAttendanceActionItems({
    resolvedState: resolved,
    attendanceDate: input.attendanceDate,
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    attendanceRecordId: input.attendanceRecordId,
    scheduleId,
    ageMinutes: input.ageMinutes,
    ownerUserId: input.ownerUserId,
  });

  // ── 5. Assemble output ─────────────────────────────────────────────────────

  return {
    companyId: input.companyId,
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    attendanceDate: input.attendanceDate,
    scheduleState,
    scheduleId,
    shiftId,
    siteId,
    shiftStartAt,
    shiftEndAt,
    checkInAt: input.checkInAt ? input.checkInAt.toISOString() : undefined,
    checkOutAt: input.checkOutAt ? input.checkOutAt.toISOString() : undefined,
    hasOpenSession: input.hasOpenSession,
    hasOfficialRecord: input.hasOfficialRecord,
    hasPendingCorrection: input.hasPendingCorrection,
    hasPendingManualCheckin: input.hasPendingManualCheckin,
    isHoliday: input.isHoliday,
    isOnLeave: input.isOnLeave,
    canonicalStatus: resolved.status,
    payrollReadiness: resolved.payrollReadiness,
    riskLevel: resolved.riskLevel,
    reasonCodes: resolved.reasonCodes,
    actionItems,
  };
}
