/**
 * Canonical attendance day status and payroll-readiness model (Phase 3).
 *
 * All status derivation is pure — no database calls. Callers supply normalized
 * inputs already resolved from DB; this module returns machine-readable results
 * that can be safely serialized and sent to the client.
 *
 * Server remains source of truth. Do not rely on browser timezone.
 * Muscat (Asia/Muscat, UTC+4, no DST) is the default calendar zone.
 *
 * Semantic decisions made here:
 *   - holiday → excluded from payroll (no deduction, no credit)
 *   - leave   → excluded from payroll (leave module owns pay impact)
 *   - missing checkout after shift end → blocked_missing_checkout (blocking)
 *   - pending correction → blocked_pending_correction (stronger than missing checkout)
 *   - unscheduled attendance → needs_review (HR must categorize before payroll)
 *   - suspended employee → needs_review status, high risk
 */

import { muscatWallDateTimeToUtc } from "./attendanceMuscatTime";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Canonical machine-readable status for one employee's attendance on one day.
 * Represents the single source of truth across HR board, portal, and payroll.
 */
export type AttendanceDayStatus =
  /** Has a future schedule but not yet the attendance date. */
  | "scheduled"
  /** Shift date is today but check-in window has not opened. */
  | "upcoming"
  /** Check-in window is open; no check-in recorded yet (within grace period). */
  | "awaiting_check_in"
  /** Checked in within the grace window (on time). */
  | "checked_in_on_time"
  /** Checked in after the grace window expired (late arrival). */
  | "checked_in_late"
  /** Has both check-in and check-out (status depends on completion policy). */
  | "checked_out"
  /** Grace period expired, shift ongoing, no check-in yet. */
  | "late_no_arrival"
  /** Shift has started with no check-in but shift has not ended yet. */
  | "absent_pending"
  /** Shift ended with no check-in recorded. */
  | "absent_confirmed"
  /** Designated public holiday — no attendance expected. */
  | "holiday"
  /** Employee is on approved leave — attendance not expected. */
  | "leave"
  /** Employee is working remotely (HR-marked). */
  | "remote"
  /** Attendance record exists but no schedule was found for this day. */
  | "unscheduled_attendance"
  /** Unclear state requiring HR review (suspended employee, conflicting data, etc.). */
  | "needs_review";

/**
 * Payroll processing readiness for this attendance day.
 * A day must be "ready" (or "excluded") for payroll to proceed cleanly.
 */
export type AttendancePayrollReadiness =
  /** Day is correctly closed and can be included in payroll. */
  | "ready"
  /** Attention recommended but not strictly blocking (e.g., late arrival). */
  | "needs_review"
  /** Employee checked in but no checkout recorded after shift end. */
  | "blocked_missing_checkout"
  /** A time correction is awaiting HR approval. */
  | "blocked_pending_correction"
  /** A manual check-in request is awaiting HR approval. */
  | "blocked_pending_manual_checkin"
  /** A schedule conflict prevents unambiguous payroll assignment. */
  | "blocked_schedule_conflict"
  /** Day is excluded from payroll processing (holiday / leave / untracked). */
  | "excluded";

/**
 * Severity of the attendance day state.
 * Finer-grained than the existing AttendanceRiskLevel in attendanceIntelligence.ts
 * which uses critical/warning/normal. Use the mapping below when bridging to the
 * existing OperationalBand system.
 *
 *   Mapping: none → normal, low → normal, medium → warning,
 *            high → warning, critical → critical
 */
export type AttendanceDayRiskLevel = "none" | "low" | "medium" | "high" | "critical";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface ResolveAttendanceDayStateInput {
  /** YYYY-MM-DD calendar date being evaluated. */
  attendanceDate: string;
  /** Current wall-clock instant (UTC). Defaults to new Date() when omitted. */
  now?: Date;
  /** Company timezone. Defaults to Asia/Muscat (UTC+4, no DST). */
  companyTimezone?: string;

  // --- Schedule context ---
  /** True when a work schedule exists for this employee on attendanceDate. */
  scheduleExists: boolean;
  /** Wall-clock shift start HH:MM (Muscat) — required when scheduleExists. */
  shiftStartTime?: string;
  /** Wall-clock shift end HH:MM (Muscat) — required when scheduleExists. */
  shiftEndTime?: string;
  /** Grace period in minutes after shiftStart during which check-in is "on time". */
  gracePeriodMinutes?: number;

  // --- Attendance record ---
  /** Check-in instant (UTC). Null when the employee has not checked in. */
  checkInTime?: Date | null;
  /** Check-out instant (UTC). Null when the session is still open. */
  checkOutTime?: Date | null;

  // --- Day-type flags ---
  /** True when the day is a company/public holiday. */
  holidayFlag?: boolean;
  /** True when the employee has an approved leave on this day. */
  leaveFlag?: boolean;
  /** True when the employee is working remotely (HR-marked). */
  remoteFlag?: boolean;

  // --- Pending actions ---
  /** True when there is at least one pending correction request for this day. */
  correctionPending?: boolean;
  /** True when there is at least one pending manual check-in request for this day. */
  manualCheckinPending?: boolean;
  /** True when a schedule conflict is detected (e.g., overlapping shifts). */
  scheduleConflict?: boolean;

  // --- Employee state ---
  /** False when the employee is suspended or inactive. Defaults to true. */
  employeeActive?: boolean;

  // --- Data provenance ---
  /** True when a raw session/punch record exists for this day (attendance_records). */
  rawSessionExists?: boolean;
  /** True when an official HR attendance record exists for this day (attendance table). */
  officialHrRecordExists?: boolean;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface AttendanceDayStateResult {
  status: AttendanceDayStatus;
  payrollReadiness: AttendancePayrollReadiness;
  riskLevel: AttendanceDayRiskLevel;
  /** Machine-readable codes explaining the derivation. Stable for logging/debugging. */
  reasonCodes: string[];
  /** Suggested next HR action (informational only). */
  recommendedAction?: string;
}

// ---------------------------------------------------------------------------
// Reason code constants
// ---------------------------------------------------------------------------

export const ATTENDANCE_REASON = {
  HOLIDAY: "HOLIDAY",
  LEAVE: "LEAVE",
  REMOTE: "REMOTE",
  EMPLOYEE_SUSPENDED: "EMPLOYEE_SUSPENDED",
  NO_SCHEDULE: "NO_SCHEDULE",
  UNSCHEDULED_ATTENDANCE: "UNSCHEDULED_ATTENDANCE",
  SCHEDULE_FUTURE: "SCHEDULE_FUTURE",
  SHIFT_UPCOMING: "SHIFT_UPCOMING",
  WITHIN_GRACE: "WITHIN_GRACE",
  CHECKED_IN_ON_TIME: "CHECKED_IN_ON_TIME",
  CHECKED_IN_LATE: "CHECKED_IN_LATE",
  CHECKED_OUT: "CHECKED_OUT",
  PAST_GRACE_NO_CHECKIN: "PAST_GRACE_NO_CHECKIN",
  SHIFT_ENDED_NO_CHECKIN: "SHIFT_ENDED_NO_CHECKIN",
  MISSING_CHECKOUT: "MISSING_CHECKOUT",
  CORRECTION_PENDING: "CORRECTION_PENDING",
  MANUAL_CHECKIN_PENDING: "MANUAL_CHECKIN_PENDING",
  SCHEDULE_CONFLICT: "SCHEDULE_CONFLICT",
} as const;

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * Resolve canonical attendance day state from normalized inputs.
 *
 * Pure function — no DB calls, no side effects. Safe to run in any context.
 * All time comparisons use Muscat wall-clock boundaries computed from UTC instants.
 */
export function resolveAttendanceDayState(
  input: ResolveAttendanceDayStateInput
): AttendanceDayStateResult {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const reasons: string[] = [];

  const employeeActive = input.employeeActive ?? true;
  const gracePeriodMinutes = input.gracePeriodMinutes ?? 15;

  // -------------------------------------------------------------------------
  // 1. Suspended employee — highest priority sentinel
  // -------------------------------------------------------------------------
  if (!employeeActive) {
    reasons.push(ATTENDANCE_REASON.EMPLOYEE_SUSPENDED);
    if (input.checkInTime) reasons.push(ATTENDANCE_REASON.UNSCHEDULED_ATTENDANCE);
    return {
      status: "needs_review",
      payrollReadiness: "needs_review",
      riskLevel: "high",
      reasonCodes: reasons,
      recommendedAction: "Review employee status before processing attendance.",
    };
  }

  // -------------------------------------------------------------------------
  // 2. Holiday
  // -------------------------------------------------------------------------
  if (input.holidayFlag) {
    reasons.push(ATTENDANCE_REASON.HOLIDAY);
    return {
      status: "holiday",
      payrollReadiness: "excluded",
      riskLevel: "none",
      reasonCodes: reasons,
    };
  }

  // -------------------------------------------------------------------------
  // 3. Approved leave
  // -------------------------------------------------------------------------
  if (input.leaveFlag) {
    reasons.push(ATTENDANCE_REASON.LEAVE);
    return {
      status: "leave",
      payrollReadiness: "excluded",
      riskLevel: "none",
      reasonCodes: reasons,
    };
  }

  // -------------------------------------------------------------------------
  // 4. Remote work
  // -------------------------------------------------------------------------
  if (input.remoteFlag) {
    reasons.push(ATTENDANCE_REASON.REMOTE);
    // Remote is payroll-ready unless something else is blocking
    const payrollReadiness = _resolvePayrollReadinessModifiers(input, reasons);
    return {
      status: "remote",
      payrollReadiness: payrollReadiness === "excluded" ? "ready" : payrollReadiness,
      riskLevel: "none",
      reasonCodes: reasons,
    };
  }

  // -------------------------------------------------------------------------
  // 5. No schedule
  // -------------------------------------------------------------------------
  if (!input.scheduleExists) {
    if (input.checkInTime || input.rawSessionExists || input.officialHrRecordExists) {
      reasons.push(ATTENDANCE_REASON.NO_SCHEDULE);
      reasons.push(ATTENDANCE_REASON.UNSCHEDULED_ATTENDANCE);
      return {
        status: "unscheduled_attendance",
        payrollReadiness: "needs_review",
        riskLevel: "high",
        reasonCodes: reasons,
        recommendedAction: "Verify whether this attendance is valid or a system error.",
      };
    }
    // No schedule, no record → excluded (not tracked for this day)
    reasons.push(ATTENDANCE_REASON.NO_SCHEDULE);
    return {
      status: "scheduled",
      payrollReadiness: "excluded",
      riskLevel: "none",
      reasonCodes: reasons,
    };
  }

  // -------------------------------------------------------------------------
  // 6. Resolve shift boundaries from Muscat wall times
  //    Requires shiftStartTime and shiftEndTime when scheduleExists.
  // -------------------------------------------------------------------------
  const shiftStartTime = input.shiftStartTime ?? "09:00";
  const shiftEndTime = input.shiftEndTime ?? "17:00";

  const shiftStartMs = muscatWallDateTimeToUtc(
    input.attendanceDate,
    `${shiftStartTime}:00`
  ).getTime();
  let shiftEndMs = muscatWallDateTimeToUtc(
    input.attendanceDate,
    `${shiftEndTime}:00`
  ).getTime();
  // Overnight shift: if end ≤ start, the shift crosses midnight
  if (shiftEndMs <= shiftStartMs) shiftEndMs += 86_400_000;

  const graceDeadlineMs = shiftStartMs + gracePeriodMinutes * 60_000;

  // -------------------------------------------------------------------------
  // 7. Schedule exists — determine phase
  // -------------------------------------------------------------------------

  // The date being evaluated is in the future (entirely)
  if (nowMs < shiftStartMs - gracePeriodMinutes * 60_000) {
    // Check if today or a future date
    const isToday = input.attendanceDate === _muscatYmdFromMs(nowMs);
    if (isToday) {
      reasons.push(ATTENDANCE_REASON.SHIFT_UPCOMING);
      return {
        status: "upcoming",
        payrollReadiness: "excluded",
        riskLevel: "none",
        reasonCodes: reasons,
      };
    }
    reasons.push(ATTENDANCE_REASON.SCHEDULE_FUTURE);
    return {
      status: "scheduled",
      payrollReadiness: "excluded",
      riskLevel: "none",
      reasonCodes: reasons,
    };
  }

  const checkIn = input.checkInTime ?? null;
  const checkOut = input.checkOutTime ?? null;

  // -------------------------------------------------------------------------
  // 8. Check-in + check-out exist → checked_out
  // -------------------------------------------------------------------------
  if (checkIn && checkOut) {
    reasons.push(ATTENDANCE_REASON.CHECKED_OUT);
    const wasOnTime = checkIn.getTime() <= graceDeadlineMs;
    if (wasOnTime) reasons.push(ATTENDANCE_REASON.CHECKED_IN_ON_TIME);
    else reasons.push(ATTENDANCE_REASON.CHECKED_IN_LATE);

    const payrollReadiness = _resolvePayrollReadinessModifiers(input, reasons);
    return {
      status: "checked_out",
      payrollReadiness: payrollReadiness === "excluded" ? "ready" : payrollReadiness,
      riskLevel: wasOnTime ? "none" : "low",
      reasonCodes: reasons,
    };
  }

  // -------------------------------------------------------------------------
  // 9. Check-in exists, no check-out
  // -------------------------------------------------------------------------
  if (checkIn && !checkOut) {
    const onTime = checkIn.getTime() <= graceDeadlineMs;
    if (onTime) {
      reasons.push(ATTENDANCE_REASON.CHECKED_IN_ON_TIME);
    } else {
      reasons.push(ATTENDANCE_REASON.CHECKED_IN_LATE);
    }

    const shiftHasEnded = nowMs > shiftEndMs;
    if (shiftHasEnded) {
      reasons.push(ATTENDANCE_REASON.MISSING_CHECKOUT);
    }

    const payrollReadiness = _resolvePayrollReadinessModifiers(input, reasons);
    return {
      status: onTime ? "checked_in_on_time" : "checked_in_late",
      payrollReadiness,
      riskLevel: shiftHasEnded ? "high" : onTime ? "none" : "medium",
      reasonCodes: reasons,
      recommendedAction: shiftHasEnded
        ? "Force checkout or request correction — open session past shift end."
        : undefined,
    };
  }

  // -------------------------------------------------------------------------
  // 10. No check-in
  // -------------------------------------------------------------------------

  // Within grace window (shift started, not yet past grace)
  if (nowMs >= shiftStartMs && nowMs <= graceDeadlineMs) {
    reasons.push(ATTENDANCE_REASON.WITHIN_GRACE);
    const payrollReadiness = _resolvePayrollReadinessModifiers(input, reasons);
    return {
      status: "awaiting_check_in",
      payrollReadiness: payrollReadiness === "excluded" ? "needs_review" : payrollReadiness,
      riskLevel: "low",
      reasonCodes: reasons,
    };
  }

  // Past grace, before shift end → late_no_arrival (could still arrive)
  if (nowMs > graceDeadlineMs && nowMs <= shiftEndMs) {
    reasons.push(ATTENDANCE_REASON.PAST_GRACE_NO_CHECKIN);
    const modifiers = _resolvePayrollReadinessModifiers(input, reasons);
    return {
      status: "late_no_arrival",
      payrollReadiness: modifiers === "excluded" ? "needs_review" : modifiers,
      riskLevel: "high",
      reasonCodes: reasons,
      recommendedAction: "Contact employee — past check-in deadline with no arrival.",
    };
  }

  // Shift ended, no check-in → absent
  if (nowMs > shiftEndMs) {
    reasons.push(ATTENDANCE_REASON.SHIFT_ENDED_NO_CHECKIN);
    const isManualPending = input.manualCheckinPending ?? false;
    const payrollReadiness = _resolvePayrollReadinessModifiers(input, reasons);
    return {
      status: isManualPending ? "absent_pending" : "absent_confirmed",
      payrollReadiness: payrollReadiness === "excluded" ? "needs_review" : payrollReadiness,
      riskLevel: "critical",
      reasonCodes: reasons,
      recommendedAction: isManualPending
        ? "Review pending manual check-in request."
        : "Mark absent, approve manual check-in, or create HR attendance record.",
    };
  }

  // Shift has not started yet (inside today but before the window opened — shouldn't reach
  // here after the guard at step 7, but kept as safety fallback)
  reasons.push(ATTENDANCE_REASON.SHIFT_UPCOMING);
  return {
    status: "upcoming",
    payrollReadiness: "excluded",
    riskLevel: "none",
    reasonCodes: reasons,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Evaluate payroll readiness modifiers in priority order.
 * Stronger blocks take precedence over weaker ones.
 *
 * Priority (strongest → weakest):
 *   blocked_schedule_conflict
 *   blocked_pending_correction
 *   blocked_pending_manual_checkin
 *   blocked_missing_checkout
 *   needs_review
 *   ready
 */
function _resolvePayrollReadinessModifiers(
  input: ResolveAttendanceDayStateInput,
  reasons: string[]
): AttendancePayrollReadiness {
  if (input.scheduleConflict) {
    reasons.push(ATTENDANCE_REASON.SCHEDULE_CONFLICT);
    return "blocked_schedule_conflict";
  }
  if (input.correctionPending) {
    reasons.push(ATTENDANCE_REASON.CORRECTION_PENDING);
    return "blocked_pending_correction";
  }
  if (input.manualCheckinPending) {
    reasons.push(ATTENDANCE_REASON.MANUAL_CHECKIN_PENDING);
    return "blocked_pending_manual_checkin";
  }

  // Missing checkout: open session and shift has ended
  const checkIn = input.checkInTime ?? null;
  const checkOut = input.checkOutTime ?? null;
  if (checkIn && !checkOut && input.scheduleExists) {
    const shiftStartTime = input.shiftStartTime ?? "09:00";
    const shiftEndTime = input.shiftEndTime ?? "17:00";
    const now = input.now ?? new Date();
    const shiftStartMs = muscatWallDateTimeToUtc(
      input.attendanceDate,
      `${shiftStartTime}:00`
    ).getTime();
    let shiftEndMs = muscatWallDateTimeToUtc(
      input.attendanceDate,
      `${shiftEndTime}:00`
    ).getTime();
    if (shiftEndMs <= shiftStartMs) shiftEndMs += 86_400_000;
    if (now.getTime() > shiftEndMs) {
      reasons.push(ATTENDANCE_REASON.MISSING_CHECKOUT);
      return "blocked_missing_checkout";
    }
  }

  return "ready";
}

/** Derive Muscat YYYY-MM-DD from a UTC millisecond timestamp. */
function _muscatYmdFromMs(ms: number): string {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Muscat" });
}
