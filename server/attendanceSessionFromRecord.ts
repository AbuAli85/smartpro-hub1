/**
 * Keeps `attendance_sessions` aligned with `attendance_records` for payroll-sensitive paths
 * (e.g. HR-approved corrections). Dual-write on QR/manual remains the primary insert path;
 * this module repairs / updates session rows when clock rows change without a matching session write.
 */
import { eq } from "drizzle-orm";
import { attendanceRecords, attendanceSessions } from "../drizzle/schema";
import { muscatCalendarYmdFromUtcInstant } from "@shared/attendanceMuscatTime";

export function isAttendanceSessionsTableMissingError(err: unknown): boolean {
  return /Table.*doesn't exist|Unknown table/i.test(String((err as { message?: string })?.message ?? err));
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
 * - Missing DB table (migration): logs and returns (legacy behaviour).
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
      logAttendanceSessionsStructured("warn", "sync_from_record_skipped_missing_table", {
        attendanceRecordId: record.id,
        message: String((err as { message?: string })?.message ?? err),
      });
      return;
    }
    logAttendanceSessionsStructured("error", "sync_from_record_failed", {
      attendanceRecordId: record.id,
      message: String((err as { message?: string })?.message ?? err),
    });
    throw err;
  }
}
