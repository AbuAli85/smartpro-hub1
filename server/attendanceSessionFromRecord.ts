/**
 * Keeps `attendance_sessions` aligned with `attendance_records` for payroll-sensitive paths
 * (e.g. HR-approved corrections). Dual-write on QR/manual remains the primary insert path;
 * this module repairs / updates session rows when clock rows change without a matching session write.
 */
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { ATTENDANCE_SESSIONS_TABLE_REQUIRED_REASON } from "@shared/attendanceTrpcReasons";
import { attendanceRecords, attendanceSessions } from "../drizzle/schema";
import { muscatCalendarYmdFromUtcInstant } from "@shared/attendanceMuscatTime";

export function isAttendanceSessionsTableMissingError(err: unknown): boolean {
  return /Table.*doesn't exist|Unknown table/i.test(String((err as { message?: string })?.message ?? err));
}

/**
 * **Default (unset / false):** missing `attendance_sessions` is a **hard error** — session dual-write and
 * payroll alignment cannot be guaranteed.
 *
 * Set `ALLOW_MISSING_ATTENDANCE_SESSIONS_TABLE=1` (or `true` / `yes`) **only** on brownfield DBs that have
 * not yet applied the sessions migration; this restores the legacy warn-and-continue behaviour.
 */
export function allowMissingAttendanceSessionsTable(): boolean {
  const v = process.env.ALLOW_MISSING_ATTENDANCE_SESSIONS_TABLE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Human-readable deployment guidance (also used in tRPC `message` for admin UIs). */
export const ATTENDANCE_SESSIONS_TABLE_REQUIRED_MESSAGE =
  "The payroll session table `attendance_sessions` is missing from this database. Apply the sessions migration (repo: drizzle/0034_attendance_sessions.sql, or your deployment equivalent), then restart. Until then, clock-in/out and session sync cannot complete in strict mode. Brownfield only, until migrated: set environment variable ALLOW_MISSING_ATTENDANCE_SESSIONS_TABLE=1 to temporarily relax checks — remove after migration; do not use for production payroll.";

/** Throws a tRPC error so clients show a clear admin message instead of a generic 500. */
export function throwAttendanceSessionsTableRequired(): never {
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: ATTENDANCE_SESSIONS_TABLE_REQUIRED_MESSAGE,
    cause: { reason: ATTENDANCE_SESSIONS_TABLE_REQUIRED_REASON },
  });
}

export function logAttendanceSessionsStructured(
  level: "warn" | "error",
  context: string,
  meta: Record<string, unknown>,
): void {
  const line = JSON.stringify({ level, component: "attendance_sessions", context, ...meta });
  if (level === "error") console.error(line);
  else console.warn(line);
}

/**
 * Upsert session row(s) for one attendance record inside a transaction.
 * - Missing DB table: **throws** unless `ALLOW_MISSING_ATTENDANCE_SESSIONS_TABLE` is set (migration escape hatch).
 * - Any other failure: throws so the caller cannot commit payroll-drifting clock changes silently.
 *
 * `tx` is `any` so Drizzle `MySqlTransaction` can be passed without circular typing to `../db`.
 */
export async function syncAttendanceSessionsFromAttendanceRecordTx(
  tx: any,
  record: typeof attendanceRecords.$inferSelect,
): Promise<void> {
  const checkIn = new Date(record.checkIn);
  const businessDate = muscatCalendarYmdFromUtcInstant(checkIn);
  const hasOut = record.checkOut != null;
  const status = hasOut ? ("closed" as const) : ("open" as const);

  const sessionPayload = {
    companyId: record.companyId,
    employeeId: record.employeeId,
    scheduleId: record.scheduleId ?? null,
    businessDate,
    status,
    checkInAt: checkIn,
    checkOutAt: record.checkOut ? new Date(record.checkOut) : null,
    siteId: record.siteId ?? null,
    promoterAssignmentId: record.promoterAssignmentId ?? null,
    siteName: record.siteName ?? null,
    method: record.method,
    source: "admin_panel" as const,
    checkInLat: record.checkInLat ?? null,
    checkInLng: record.checkInLng ?? null,
    checkOutLat: record.checkOutLat ?? null,
    checkOutLng: record.checkOutLng ?? null,
    notes: record.notes ?? null,
    sourceRecordId: record.id,
  };

  try {
    const rows = (await tx
      .select()
      .from(attendanceSessions)
      .where(eq(attendanceSessions.sourceRecordId, record.id))) as (typeof attendanceSessions.$inferSelect)[];

    if (rows.length > 0) {
      await tx.update(attendanceSessions).set(sessionPayload).where(eq(attendanceSessions.sourceRecordId, record.id));
    } else {
      await tx.insert(attendanceSessions).values(sessionPayload);
    }
  } catch (err) {
    if (isAttendanceSessionsTableMissingError(err)) {
      if (allowMissingAttendanceSessionsTable()) {
        logAttendanceSessionsStructured("warn", "sync_from_record_skipped_missing_table", {
          attendanceRecordId: record.id,
          message: String((err as { message?: string })?.message ?? err),
        });
        return;
      }
      logAttendanceSessionsStructured("error", "sync_from_record_blocked_missing_table", {
        attendanceRecordId: record.id,
        message: String((err as { message?: string })?.message ?? err),
      });
      throwAttendanceSessionsTableRequired();
    }
    logAttendanceSessionsStructured("error", "sync_from_record_failed", {
      attendanceRecordId: record.id,
      message: String((err as { message?: string })?.message ?? err),
    });
    throw err;
  }
}
