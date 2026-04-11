/**
 * Derives per-shift attendance status for an employee's day.
 * Uses the same record-to-shift assignment logic (`assignAttendanceRecordsToShiftRows`) as the
 * HR Today Board, so portal and HR views are always consistent.
 */
import {
  assignAttendanceRecordsToShiftRows,
  attendanceOverlapShiftMinutes,
} from "./assignAttendanceRecordsToShifts";
import type { AttendanceRecordLike } from "./pickAttendanceRecordForShift";
import { muscatShiftWallEndMs } from "./attendanceBoardOverdue";
import { muscatWallDateTimeToUtc } from "./attendanceMuscatTime";

/**
 * Machine-readable status for one scheduled shift on a given calendar day.
 *
 * - `upcoming`    — shift window has not opened yet
 * - `window_open` — inside check-in window but employee has not scanned yet
 * - `checked_in`  — open session (no check-out)
 * - `checked_out` — closed session (full punch recorded)
 * - `missed`      — shift window ended with no attendance record
 */
export type ShiftStatusCode =
  | "upcoming"
  | "window_open"
  | "checked_in"
  | "checked_out"
  | "missed";

/** Human-readable label + intent colour for `ShiftStatusCode`. */
export const SHIFT_STATUS_LABEL: Record<
  ShiftStatusCode,
  { label: string; badgeClass: string }
> = {
  upcoming: {
    label: "Upcoming",
    badgeClass: "border-slate-300 text-slate-600 bg-slate-50",
  },
  window_open: {
    label: "Window open",
    badgeClass: "border-amber-300 text-amber-800 bg-amber-50",
  },
  checked_in: {
    label: "Active",
    badgeClass: "border-green-300 text-green-800 bg-green-50",
  },
  checked_out: {
    label: "Completed",
    badgeClass: "border-gray-300 text-gray-700 bg-gray-50",
  },
  missed: {
    label: "Missed",
    badgeClass: "border-red-300 text-red-700 bg-red-50",
  },
};

/** One shift's attendance entry as returned to the employee portal. */
export interface TodayShiftEntry {
  scheduleId: number;
  shiftName: string | null;
  shiftStart: string;
  shiftEnd: string;
  siteId: number | null;
  siteName: string | null;
  /** QR site token — present so portal can issue a check-in for this specific shift site. */
  siteToken: string | null;
  gracePeriodMinutes: number;
  status: ShiftStatusCode;
  checkIn: Date | null;
  checkOut: Date | null;
  /** Minutes of overlap between the attendance record and the scheduled shift window. */
  durationMinutes: number | null;
  attendanceRecordId: number | null;
  /** True when `now` is inside the check-in window (shiftStart - grace → shiftEnd). */
  isActiveWindow: boolean;
  /** True when check-in is structurally allowed: window open, no existing record, no other open session. */
  canCheckIn: boolean;
  /** True when there is an open check-in that can be closed. */
  canCheckOut: boolean;
}

interface InputShiftRow {
  scheduleId: number;
  shiftName: string | null;
  shiftStart: string;
  shiftEnd: string;
  siteId: number | null;
  siteName: string | null;
  siteToken: string | null;
  gracePeriodMinutes: number;
}

/**
 * Derives per-shift status for all of an employee's scheduled shifts on a given day.
 *
 * @param shifts    All working schedule rows for the employee on `businessDate`, sorted by shiftStart.
 * @param records   All attendance records whose check-in falls in the Muscat calendar day.
 * @param businessDate  YYYY-MM-DD Muscat calendar date.
 * @param nowMs     Current instant in milliseconds (for testability).
 * @param employeeId  employees.id (used as the map key for assignAttendanceRecordsToShiftRows).
 */
export function buildEmployeeDayShiftStatuses(params: {
  shifts: InputShiftRow[];
  records: (AttendanceRecordLike & { id: number })[];
  businessDate: string;
  nowMs: number;
  employeeId: number;
}): TodayShiftEntry[] {
  const { shifts, records, businessDate, nowMs, employeeId } = params;
  if (shifts.length === 0) return [];

  const shiftRowsForAssignment = shifts.map((s) => ({
    scheduleId: s.scheduleId,
    siteId: s.siteId ?? 0,
    employeeId,
    shiftStartTime: s.shiftStart,
    shiftEndTime: s.shiftEnd,
    gracePeriodMinutes: s.gracePeriodMinutes,
  }));

  const recordsByEmp = new Map([[employeeId, records]]);
  const recordByScheduleId = assignAttendanceRecordsToShiftRows(
    shiftRowsForAssignment,
    recordsByEmp,
    businessDate,
    nowMs
  );

  // If any session is still open, we cannot check in to another shift.
  const hasOpenSession = records.some((r) => r.checkOut == null);

  return shifts.map((shift) => {
    const record = recordByScheduleId.get(shift.scheduleId) ?? null;

    const shiftEndMs = muscatShiftWallEndMs(
      businessDate,
      shift.shiftStart,
      shift.shiftEnd
    );
    const shiftStartMs = muscatWallDateTimeToUtc(
      businessDate,
      `${shift.shiftStart}:00`
    ).getTime();
    const windowOpenMs = shiftStartMs - shift.gracePeriodMinutes * 60_000;

    const isActiveWindow = nowMs >= windowOpenMs && nowMs <= shiftEndMs;
    const hasShiftEnded = nowMs > shiftEndMs;

    const checkIn = record?.checkIn ?? null;
    const checkOut = record?.checkOut ?? null;

    let status: ShiftStatusCode;
    if (checkIn && checkOut) {
      status = "checked_out";
    } else if (checkIn && !checkOut) {
      status = "checked_in";
    } else if (hasShiftEnded) {
      status = "missed";
    } else if (isActiveWindow) {
      status = "window_open";
    } else {
      status = "upcoming";
    }

    const canCheckIn = isActiveWindow && !checkIn && !hasOpenSession;
    const canCheckOut = !!checkIn && !checkOut;

    const durationMinutes =
      record
        ? attendanceOverlapShiftMinutes(
            record.checkIn,
            record.checkOut ?? null,
            businessDate,
            shift.shiftStart,
            shift.shiftEnd,
            nowMs
          )
        : null;

    return {
      scheduleId: shift.scheduleId,
      shiftName: shift.shiftName,
      shiftStart: shift.shiftStart,
      shiftEnd: shift.shiftEnd,
      siteId: shift.siteId,
      siteName: shift.siteName,
      siteToken: shift.siteToken,
      gracePeriodMinutes: shift.gracePeriodMinutes,
      status,
      checkIn,
      checkOut,
      durationMinutes: (durationMinutes ?? 0) > 0 ? durationMinutes : null,
      attendanceRecordId: record?.id ?? null,
      isActiveWindow,
      canCheckIn,
      canCheckOut,
    };
  });
}
