// PREREQUISITE: apply drizzle/0049_shift_template_break_minutes.sql before
// deploying this job, or shift.breakMinutes will be undefined on old rows.

/**
 * Periodic background job: persist "absent" rows for missed shifts.
 *
 * WHAT IT DOES
 * ────────────
 * For every active employee schedule whose shift ended today (in Muscat
 * wall-clock time) with no attendance_records check-in, writes one row to
 * the legacy `attendance` table with status = 'absent'.
 *
 * This is the counterpart of syncCheckoutToLegacyAttendanceTx, which writes
 * 'present' rows on checkout.  Without this job the HR Records tab and
 * monthly payroll export would show no absent data even though the live board
 * correctly marks employees as absent.
 *
 * IDEMPOTENCY
 * ───────────
 * Uses INSERT … ON DUPLICATE KEY (or upsert via Drizzle onConflictDoNothing /
 * a SELECT-then-INSERT guard) so repeated runs are safe.
 * Skips days where an attendance row with ANY status already exists.
 *
 * SCOPE
 * ─────
 * Only marks a slot absent when ALL of the following are true:
 *   1. The employee has an active schedule (isActive=true, startDate<=today,
 *      endDate IS NULL or >=today).
 *   2. Today's DOW is in the schedule's workingDays CSV.
 *   3. The schedule's shift end time has passed in Muscat wall-clock time.
 *   4. No attendance_records row exists for that employee on today's Muscat
 *      business date (inside muscatDayUtcRangeExclusiveEnd).
 *   5. No attendance row already exists for that employee on that date.
 *   6. The business date is not a company holiday.
 *
 * ENVIRONMENT GATE
 * ────────────────
 * Set DISABLE_ABSENT_MARK_JOB=1 to skip (useful in local dev).
 */

import { and, eq, gte, isNull, lt, lte, or, inArray } from "drizzle-orm";
import { getDb } from "../db";
import {
  attendance,
  attendanceRecords,
  companyHolidays,
  employeeSchedules,
  employees,
  shiftTemplates,
} from "../../drizzle/schema";
import {
  muscatCalendarWeekdaySun0,
  muscatCalendarYmdNow,
  muscatDayUtcRangeExclusiveEnd,
  muscatWallDateTimeToUtc,
} from "@shared/attendanceMuscatTime";

export type MarkMissedShiftsResult = {
  scanned: number; // schedule slots evaluated
  marked: number; // new absent rows written
  skipped: number; // already had a row or shift hasn't ended
  errors: number;
};

/**
 * Entry point called by the server startup scheduler.
 *
 * Returns a stats object; callers should log it if `marked > 0` or
 * `errors > 0`.  A silent no-op run is normal.
 */
export async function runMarkMissedShiftsAbsent(): Promise<MarkMissedShiftsResult> {
  const db = await getDb();
  if (!db) {
    console.warn("[absent-job] Database unavailable — skipping.");
    return { scanned: 0, marked: 0, skipped: 0, errors: 0 };
  }

  const result: MarkMissedShiftsResult = { scanned: 0, marked: 0, skipped: 0, errors: 0 };
  const todayYmd = muscatCalendarYmdNow();
  const nowUtc = new Date();
  const dow = muscatCalendarWeekdaySun0(nowUtc);
  const { startUtc: dayStartUtc, endExclusiveUtc: dayEndUtc } = muscatDayUtcRangeExclusiveEnd(todayYmd);

  const schedules = await db
    .select()
    .from(employeeSchedules)
    .where(
      and(
        eq(employeeSchedules.isActive, true),
        lte(employeeSchedules.startDate, todayYmd),
        or(isNull(employeeSchedules.endDate), gte(employeeSchedules.endDate, todayYmd)),
      ),
    );

  const todaySchedules = schedules.filter((s) => s.workingDays.split(",").map(Number).includes(dow));

  if (todaySchedules.length === 0) return result;

  const templateIds = [...new Set(todaySchedules.map((s) => s.shiftTemplateId))];
  const shifts = templateIds.length
    ? await db.select().from(shiftTemplates).where(inArray(shiftTemplates.id, templateIds))
    : [];
  const shiftById = new Map(shifts.map((s) => [s.id, s]));

  const companyIds = [...new Set(todaySchedules.map((s) => s.companyId))];
  const todayHolidays = companyIds.length
    ? await db
        .select()
        .from(companyHolidays)
        .where(
          and(
            inArray(companyHolidays.companyId, companyIds),
            eq(companyHolidays.holidayDate, todayYmd),
          ),
        )
    : [];
  const holidayCompanyIds = new Set(todayHolidays.map((h) => h.companyId));

  for (const sched of todaySchedules) {
    result.scanned++;
    try {
      if (holidayCompanyIds.has(sched.companyId)) {
        result.skipped++;
        continue;
      }

      const shift = shiftById.get(sched.shiftTemplateId);
      if (!shift) {
        result.skipped++;
        continue;
      }

      const shiftEndWall = shift.endTime.length <= 5 ? `${shift.endTime}:00` : shift.endTime;
      const shiftEndUtc = muscatWallDateTimeToUtc(todayYmd, shiftEndWall);
      if (nowUtc < shiftEndUtc) {
        result.skipped++;
        continue;
      }

      const [resolvedEmployee] = await db
        .select({
          id: employees.id,
          firstName: employees.firstName,
          lastName: employees.lastName,
        })
        .from(employees)
        .where(
          and(
            eq(employees.companyId, sched.companyId),
            or(eq(employees.userId, sched.employeeUserId), eq(employees.id, sched.employeeUserId)),
          ),
        )
        .limit(1);

      if (!resolvedEmployee) {
        result.skipped++;
        continue;
      }

      const hrEmployeeId = resolvedEmployee.id;

      const [existingPunch] = await db
        .select({ id: attendanceRecords.id })
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.employeeId, hrEmployeeId),
            eq(attendanceRecords.companyId, sched.companyId),
            gte(attendanceRecords.checkIn, dayStartUtc),
            lt(attendanceRecords.checkIn, dayEndUtc),
          ),
        )
        .limit(1);

      if (existingPunch) {
        result.skipped++;
        continue;
      }

      const [existingAttRow] = await db
        .select({ id: attendance.id })
        .from(attendance)
        .where(
          and(
            eq(attendance.employeeId, hrEmployeeId),
            eq(attendance.companyId, sched.companyId),
            gte(attendance.date, dayStartUtc),
            lt(attendance.date, dayEndUtc),
          ),
        )
        .limit(1);

      if (existingAttRow) {
        result.skipped++;
        continue;
      }

      const midday = muscatWallDateTimeToUtc(todayYmd, "12:00:00");
      await db.insert(attendance).values({
        companyId: sched.companyId,
        employeeId: hrEmployeeId,
        date: midday,
        status: "absent",
        notes: `Auto-marked absent — no check-in by ${shift.endTime} (shift: ${shift.name}, schedule #${sched.id})`,
      });

      result.marked++;

      try {
        const { sendAttendanceAbsentAlert, isWhatsAppCloudCoreConfigured } =
          await import("../whatsappCloud");
        const managerPhone = process.env.ATTENDANCE_ALERT_MANAGER_PHONE ?? "";
        if (managerPhone && isWhatsAppCloudCoreConfigured()) {
          const empName =
            `${resolvedEmployee.firstName ?? ""} ${resolvedEmployee.lastName ?? ""}`.trim() ||
            `Employee #${hrEmployeeId}`;
          void sendAttendanceAbsentAlert({
            managerPhone,
            employeeName: empName,
            siteName: "scheduled site",
            shiftName: shift.name,
          }).catch((e) => console.warn("[whatsapp] absent alert failed:", e));
        }
      } catch {
        /* non-fatal */
      }
    } catch (err) {
      result.errors++;
      console.error("[absent-job] Error processing schedule", sched.id, err);
    }
  }

  return result;
}
