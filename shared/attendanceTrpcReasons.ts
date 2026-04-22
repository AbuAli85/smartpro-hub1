/**
 * Stable machine-readable markers on tRPC error `data` (via root `errorFormatter` + `TRPCError.cause`).
 * Use for client branching — do not match on free-text `message`.
 */
export const ATTENDANCE_SESSIONS_TABLE_REQUIRED_REASON = "ATTENDANCE_SESSIONS_TABLE_REQUIRED" as const;
