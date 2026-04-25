/**
 * Attendance period lock state machine (Phase 5B).
 *
 * Pure module — no database, no React, no tRPC.
 * Defines the valid status transitions and the capability/readiness guards
 * that the server procedures enforce before mutating the DB row.
 *
 * State diagram:
 *
 *   (no row) ──default──▶  open
 *   open        ──lock──▶  locked       (readiness=ready + canLockAttendancePeriod)
 *   locked      ──export─▶ exported     (canExportAttendanceReports)
 *   locked      ──reopen─▶ reopened     (canLockAttendancePeriod + non-weak reason)
 *   exported    ──reopen─▶ reopened     (canLockAttendancePeriod + non-weak reason)
 *   reopened    ──lock──▶  locked       (readiness=ready + canLockAttendancePeriod)
 *
 * "open" is the virtual default — no DB row required for it.
 */

import type { ReconciliationReadinessStatus } from "./attendanceReconciliationSummary";
import {
  ATTENDANCE_PERIOD_NOT_READY,
  ATTENDANCE_PERIOD_ALREADY_LOCKED,
  ATTENDANCE_PERIOD_NOT_LOCKED,
  ATTENDANCE_PERIOD_REOPEN_REASON_REQUIRED,
} from "./attendanceTrpcReasons";
import { isWeakAuditReason } from "./attendanceManualValidation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AttendancePeriodStatus = "open" | "locked" | "exported" | "reopened";

/** Minimal snapshot of the DB row (or synthetic default) passed to validators. */
export interface PeriodLockState {
  status: AttendancePeriodStatus;
  year: number;
  month: number;
  companyId: number;
}

/** Capabilities the acting user must have for each transition. */
export interface PeriodLockCaps {
  canLockAttendancePeriod: boolean;
  canExportAttendanceReports: boolean;
}

/** Successful validation result. */
export interface PeriodLockValidOk {
  ok: true;
}

/** Failed validation result — the server procedure should throw a TRPCError. */
export interface PeriodLockValidError {
  ok: false;
  /** tRPC error code. */
  code: "BAD_REQUEST" | "FORBIDDEN" | "CONFLICT";
  /** Human-readable message for the error. */
  message: string;
  /** Stable reason code to attach to TRPCError.cause for client branching. */
  reason: string;
}

export type PeriodLockValidation = PeriodLockValidOk | PeriodLockValidError;

// ---------------------------------------------------------------------------
// Default state when no DB row exists
// ---------------------------------------------------------------------------

/** Synthesises a virtual "open" state so callers never have to null-check. */
export function defaultPeriodLockState(companyId: number, year: number, month: number): PeriodLockState {
  return { status: "open", year, month, companyId };
}

// ---------------------------------------------------------------------------
// Write-path guard: assert a period is open for mutation
// ---------------------------------------------------------------------------

/**
 * Returns a validation error when the period is locked or exported.
 * Returns { ok: true } when the period is open or reopened (writes allowed).
 *
 * Pure — no side effects. Used by the server-side `loadAndAssertPeriodNotLocked`
 * helper which loads the DB row then calls this.
 */
export function validatePeriodIsOpen(state: PeriodLockState): PeriodLockValidation {
  if (state.status === "locked" || state.status === "exported") {
    return {
      ok: false,
      code: "CONFLICT",
      message:
        `Period ${state.year}-${String(state.month).padStart(2, "0")} is ${state.status}. ` +
        "Reopen the period before making further attendance changes.",
      reason: ATTENDANCE_PERIOD_ALREADY_LOCKED,
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Transition: open | reopened → locked
// ---------------------------------------------------------------------------

/**
 * Validate that a period can be locked.
 *
 * Preconditions:
 *   - readinessStatus must be "ready"
 *   - actor must have canLockAttendancePeriod
 *   - current status must be "open" or "reopened" (idempotent rejection on "locked")
 */
export function validateLockPeriod(
  state: PeriodLockState,
  readinessStatus: ReconciliationReadinessStatus,
  caps: PeriodLockCaps,
): PeriodLockValidation {
  if (!caps.canLockAttendancePeriod) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "Locking an attendance period requires the canLockAttendancePeriod capability.",
      reason: "FORBIDDEN",
    };
  }

  if (state.status === "locked") {
    return {
      ok: false,
      code: "CONFLICT",
      message: `Period ${state.year}-${String(state.month).padStart(2, "0")} is already locked.`,
      reason: ATTENDANCE_PERIOD_ALREADY_LOCKED,
    };
  }

  if (state.status !== "open" && state.status !== "reopened") {
    return {
      ok: false,
      code: "BAD_REQUEST",
      message: `Cannot lock a period in status "${state.status}". Only "open" or "reopened" periods can be locked.`,
      reason: ATTENDANCE_PERIOD_NOT_READY,
    };
  }

  if (readinessStatus !== "ready") {
    return {
      ok: false,
      code: "BAD_REQUEST",
      message:
        `Period readiness is "${readinessStatus}" — all payroll-blocking items must be resolved before locking. ` +
        "Review the readiness summary and resolve blockers first.",
      reason: ATTENDANCE_PERIOD_NOT_READY,
    };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Transition: locked | exported → reopened
// ---------------------------------------------------------------------------

/**
 * Validate that a period can be reopened.
 *
 * Preconditions:
 *   - actor must have canLockAttendancePeriod
 *   - current status must be "locked" or "exported"
 *   - reason must be present, at least 10 chars, and not a weak placeholder
 */
export function validateReopenPeriod(
  state: PeriodLockState,
  reason: string | undefined,
  caps: PeriodLockCaps,
): PeriodLockValidation {
  if (!caps.canLockAttendancePeriod) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "Reopening an attendance period requires the canLockAttendancePeriod capability.",
      reason: "FORBIDDEN",
    };
  }

  if (state.status !== "locked" && state.status !== "exported") {
    return {
      ok: false,
      code: "BAD_REQUEST",
      message: `Cannot reopen a period in status "${state.status}". Only "locked" or "exported" periods can be reopened.`,
      reason: ATTENDANCE_PERIOD_REOPEN_REASON_REQUIRED,
    };
  }

  const trimmedReason = reason?.trim() ?? "";
  if (trimmedReason.length < 10) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      message: "A reason of at least 10 characters is required to reopen a locked attendance period.",
      reason: ATTENDANCE_PERIOD_REOPEN_REASON_REQUIRED,
    };
  }

  if (isWeakAuditReason(trimmedReason)) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      message: "Reopen reason is too generic. Describe who requested this and why the period needs correction.",
      reason: ATTENDANCE_PERIOD_REOPEN_REASON_REQUIRED,
    };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Transition: locked → exported
// ---------------------------------------------------------------------------

/**
 * Validate that a locked period can be marked as exported.
 *
 * Preconditions:
 *   - actor must have canExportAttendanceReports
 *   - current status must be "locked"
 */
export function validateExportPeriod(
  state: PeriodLockState,
  caps: PeriodLockCaps,
): PeriodLockValidation {
  if (!caps.canExportAttendanceReports) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "Exporting attendance requires the canExportAttendanceReports capability.",
      reason: "FORBIDDEN",
    };
  }

  if (state.status !== "locked") {
    return {
      ok: false,
      code: "BAD_REQUEST",
      message: `Cannot export a period in status "${state.status}". Only "locked" periods can be exported.`,
      reason: ATTENDANCE_PERIOD_NOT_LOCKED,
    };
  }

  return { ok: true };
}
