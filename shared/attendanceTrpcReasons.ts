/**
 * Stable machine-readable markers on tRPC error `data` (via root `errorFormatter` + `TRPCError.cause`).
 * Use for client branching — do not match on free-text `message`.
 */
export const ATTENDANCE_SESSIONS_TABLE_REQUIRED_REASON = "ATTENDANCE_SESSIONS_TABLE_REQUIRED" as const;

/** Returned when a manual attendance record already exists for the same companyId + employeeId + calendar date (Muscat). */
export const DUPLICATE_MANUAL_ATTENDANCE = "DUPLICATE_MANUAL_ATTENDANCE" as const;

/** Returned when the audit reason is a weak/meaningless word (e.g. "test", "ok", "done"). */
export const WEAK_AUDIT_REASON = "WEAK_AUDIT_REASON" as const;

/** Returned when checkOut is not strictly after checkIn. Overnight shifts are not supported for manual entries. */
export const INVALID_ATTENDANCE_TIME_RANGE = "INVALID_ATTENDANCE_TIME_RANGE" as const;

// ─── Period lock reason codes (Phase 5B) ─────────────────────────────────────

/** Period readiness is "blocked" or "needs_review"; lock cannot proceed until all blocking items are resolved. */
export const ATTENDANCE_PERIOD_NOT_READY = "ATTENDANCE_PERIOD_NOT_READY" as const;

/** Period is already in "locked" status; no-op or caller should check current state first. */
export const ATTENDANCE_PERIOD_ALREADY_LOCKED = "ATTENDANCE_PERIOD_ALREADY_LOCKED" as const;

/** Export attempted on a period that is not in "locked" status. */
export const ATTENDANCE_PERIOD_NOT_LOCKED = "ATTENDANCE_PERIOD_NOT_LOCKED" as const;

/** Reopen attempted without a mandatory non-empty, non-weak reason. */
export const ATTENDANCE_PERIOD_REOPEN_REASON_REQUIRED = "ATTENDANCE_PERIOD_REOPEN_REASON_REQUIRED" as const;
