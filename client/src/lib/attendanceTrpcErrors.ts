import { TRPCClientError } from "@trpc/client";
import { ATTENDANCE_SESSIONS_TABLE_REQUIRED_REASON } from "@shared/attendanceTrpcReasons";

export function isAttendanceSessionsTableRequiredClientError(error: unknown): boolean {
  return (
    error instanceof TRPCClientError &&
    typeof error.data === "object" &&
    error.data !== null &&
    (error.data as { reason?: unknown }).reason === ATTENDANCE_SESSIONS_TABLE_REQUIRED_REASON
  );
}
