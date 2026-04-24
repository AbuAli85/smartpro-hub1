/**
 * Stable machine-readable markers on tRPC error `data` (via root `errorFormatter` + `TRPCError.cause`).
 * Use for client branching — do not match on free-text `message`.
 */
export const ATTENDANCE_SESSIONS_TABLE_REQUIRED_REASON = "ATTENDANCE_SESSIONS_TABLE_REQUIRED" as const;

/** Returned when a manual attendance record already exists for the same companyId + employeeId + calendar date (Muscat). */
export const DUPLICATE_MANUAL_ATTENDANCE = "DUPLICATE_MANUAL_ATTENDANCE" as const;

/** Returned when the audit reason is a weak/meaningless word (e.g. "test", "ok", "done"). */
export const WEAK_AUDIT_REASON = "WEAK_AUDIT_REASON" as const;
