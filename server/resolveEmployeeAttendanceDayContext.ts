/**
 * Shared resolution of “today’s” schedule + attendance record for an employee.
 * Keeps employeePortal hints and `attendance.checkIn` aligned on **Muscat** `businessDate` and schedule rules.
 *
 * **Clock rows:** `attendance_records.check_in` / `check_out` are the employee’s real action times (UTC in DB).
 * **This file:** loads all punches whose check-in falls in the Muscat calendar day `businessDate`, then
 * `allWorkingShiftRowsHaveClosedAttendance` decides if every scheduled shift has a closed row assigned to it
 * (multi-shift: morning checkout does not block evening check-in).
 */
import { and, desc, eq, gte, inArray, isNull, lt, lte, or } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import {
  attendanceRecords,
  companyHolidays,
  employeeSchedules,
  employees,
  shiftTemplates,
} from "../drizzle/schema";
import { pickScheduleRowForNow } from "@shared/pickScheduleForAttendanceNow";
import { allWorkingShiftRowsHaveClosedAttendance } from "@shared/assignAttendanceRecordsToShifts";
import { pickAttendanceRecordForShift } from "@shared/pickAttendanceRecordForShift";
import { muscatDayUtcRangeExclusiveEnd } from "@shared/attendanceMuscatTime";

export interface EmployeeAttendanceDayContext {
  businessDate: string;
  dow: number;
  holiday: (typeof companyHolidays.$inferSelect) | null;
  hasSchedule: boolean;
  isWorkingDay: boolean;
  shiftStart: string | null;
  shiftEnd: string | null;
  gracePeriodMinutes: number;
  assignedSiteId: number | null;
  /**
   * Punches used for self-service eligibility (multi-shift: may be cleared while a prior shift
   * is closed so the next shift can still check in).
   */
  checkIn: Date | null;
  checkOut: Date | null;
  /** Every scheduled shift row for today has a closed attendance record assigned to it. */
  allShiftsHaveClosedAttendance: boolean;
  /**
   * Shift-matched check-in for the currently active/most-recent shift.
   * Unlike `checkIn` (which drives eligibility), this is always the record
   * that belongs to the active shift — safe to display in the UI.
   */
  shiftCheckIn: Date | null;
  /** Shift-matched check-out for the currently active/most-recent shift. */
  shiftCheckOut: Date | null;
  /** Distinct site ids from every schedule row that applies today (working day). For manual check-in site validation. */
  scheduledSiteIdsToday: number[];
  /**
   * The employee_schedules.id row that `pickScheduleRowForNow` selected for the current instant.
   * Written to `attendance_records.schedule_id` on self-service check-in.
   * Null when holiday, no working schedule, or no shift times.
   */
  activeScheduleId: number | null;
}

export async function resolveEmployeeAttendanceDayContext(
  db: MySql2Database<any>,
  params: {
    companyId: number;
    userId: number;
    employeeId: number;
    /** YYYY-MM-DD; ISO calendar date — same source as getMyOperationalHints */
    businessDate: string;
  }
): Promise<EmployeeAttendanceDayContext> {
  const { companyId, userId, employeeId, businessDate } = params;
  const dow = new Date(businessDate + "T12:00:00").getDay();

  const holidays = await db
    .select()
    .from(companyHolidays)
    .where(and(eq(companyHolidays.companyId, companyId), eq(companyHolidays.holidayDate, businessDate)));
  const holiday = holidays[0] ?? null;

  const querySchedules = (empUserId: number) =>
    db
      .select()
      .from(employeeSchedules)
      .where(
        and(
          eq(employeeSchedules.companyId, companyId),
          eq(employeeSchedules.employeeUserId, empUserId),
          eq(employeeSchedules.isActive, true),
          lte(employeeSchedules.startDate, businessDate),
          or(isNull(employeeSchedules.endDate), gte(employeeSchedules.endDate, businessDate))
        )
      );

  let allMySchedules = await querySchedules(userId);
  if (allMySchedules.length === 0) {
    const [empRow] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.companyId, companyId), eq(employees.userId, userId)))
      .limit(1);
    if (empRow) {
      allMySchedules = await querySchedules(empRow.id);
    }
  }

  let hasSchedule = false;
  let isWorkingDay = false;
  let shiftStart: string | null = null;
  let shiftEnd: string | null = null;
  let gracePeriodMinutes = 15;
  let assignedSiteId: number | null = null;
  let activeScheduleId: number | null = null;
  let workingToday: typeof allMySchedules = [];
  let shiftById = new Map<number, (typeof shiftTemplates.$inferSelect)>();

  if (allMySchedules.length > 0) {
    hasSchedule = true;
    const templateIds = Array.from(new Set(allMySchedules.map((s) => s.shiftTemplateId)));
    const shiftRows =
      templateIds.length > 0
        ? await db.select().from(shiftTemplates).where(inArray(shiftTemplates.id, templateIds))
        : [];
    shiftById = new Map(shiftRows.map((st) => [st.id, st]));

    const now = new Date();
    const mySchedule = pickScheduleRowForNow({
      now,
      businessDate,
      dow,
      isHoliday: !!holiday,
      scheduleRows: allMySchedules,
      getShift: (tid) => shiftById.get(tid),
    });
    workingToday = allMySchedules.filter((s) => s.workingDays.split(",").map(Number).includes(dow));
    isWorkingDay = workingToday.length > 0 && !holiday;
    if (mySchedule) {
      activeScheduleId = mySchedule.id;
      assignedSiteId = mySchedule.siteId ?? null;
      const st = shiftById.get(mySchedule.shiftTemplateId);
      if (st) {
        shiftStart = st.startTime;
        shiftEnd = st.endTime;
        gracePeriodMinutes = st.gracePeriodMinutes ?? 15;
      }
    }
  }

  const { startUtc: dayStart, endExclusiveUtc: dayEndExclusive } = muscatDayUtcRangeExclusiveEnd(businessDate);

  const [openSession] = await db
    .select()
    .from(attendanceRecords)
    .where(and(eq(attendanceRecords.employeeId, employeeId), isNull(attendanceRecords.checkOut)))
    .orderBy(desc(attendanceRecords.checkIn))
    .limit(1);

  const dayRecords = await db
    .select()
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.employeeId, employeeId),
        gte(attendanceRecords.checkIn, dayStart),
        lt(attendanceRecords.checkIn, dayEndExclusive)
      )
    )
    .orderBy(desc(attendanceRecords.checkIn));

  const recordRow = dayRecords[0] ?? null;

  const shiftRowsForCoverage =
    workingToday.length > 0
      ? workingToday.map((s) => {
          const st = shiftById.get(s.shiftTemplateId);
          return {
            scheduleId: s.id,
            siteId: s.siteId,
            employeeId,
            shiftStartTime: st?.startTime ?? "09:00",
            shiftEndTime: st?.endTime ?? "17:00",
            gracePeriodMinutes: st?.gracePeriodMinutes ?? 15,
          };
        })
      : [];

  const allShiftsHaveClosedAttendance =
    shiftRowsForCoverage.length > 0
      ? allWorkingShiftRowsHaveClosedAttendance(shiftRowsForCoverage, employeeId, dayRecords, businessDate, Date.now())
      : false;

  let checkIn: Date | null = null;
  let checkOut: Date | null = null;
  if (openSession?.checkIn) {
    checkIn = new Date(openSession.checkIn);
    checkOut = null;
  } else if (recordRow?.checkIn && recordRow.checkOut && !allShiftsHaveClosedAttendance) {
    /** More shifts still need punches — do not treat the day as "fully recorded" for eligibility. */
    checkIn = null;
    checkOut = null;
  } else if (recordRow?.checkIn) {
    checkIn = new Date(recordRow.checkIn);
    checkOut = recordRow.checkOut ? new Date(recordRow.checkOut) : null;
  }

  // Shift-matched record for UI display — uses the active shift's window to pick the
  // correct punch, avoiding showing a different shift's record when multi-shift employees
  // have a prior shift already closed.
  let shiftCheckIn: Date | null = null;
  let shiftCheckOut: Date | null = null;
  if (openSession?.checkIn) {
    // An open session is always the current shift's record
    shiftCheckIn = new Date(openSession.checkIn);
    shiftCheckOut = null;
  } else if (shiftStart && shiftEnd && dayRecords.length > 0) {
    const matchedRecord = pickAttendanceRecordForShift(
      dayRecords,
      assignedSiteId ?? 0,
      businessDate,
      shiftStart,
      shiftEnd,
      gracePeriodMinutes,
      Date.now()
    );
    if (matchedRecord) {
      shiftCheckIn = new Date(matchedRecord.checkIn);
      shiftCheckOut = matchedRecord.checkOut ? new Date(matchedRecord.checkOut) : null;
    }
  } else if (recordRow?.checkIn) {
    // Single shift or no shift info — fall back to most recent record
    shiftCheckIn = new Date(recordRow.checkIn);
    shiftCheckOut = recordRow.checkOut ? new Date(recordRow.checkOut) : null;
  }

  const scheduledSiteIdsToday = Array.from(new Set(workingToday.map((s) => s.siteId)));

  return {
    businessDate,
    dow,
    holiday,
    hasSchedule,
    isWorkingDay,
    shiftStart,
    shiftEnd,
    gracePeriodMinutes,
    assignedSiteId,
    activeScheduleId,
    checkIn,
    checkOut,
    allShiftsHaveClosedAttendance,
    shiftCheckIn,
    shiftCheckOut,
    scheduledSiteIdsToday,
  };
}
