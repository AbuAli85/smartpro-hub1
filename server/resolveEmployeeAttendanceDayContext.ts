/**
 * Shared resolution of “today’s” schedule + attendance record for an employee.
 * Keeps employeePortal hints and attendance.checkIn aligned on businessDate and schedule rules.
 */
import { and, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import {
  attendanceRecords,
  companyHolidays,
  employeeSchedules,
  employees,
  shiftTemplates,
} from "../drizzle/schema";

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
  checkIn: Date | null;
  checkOut: Date | null;
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

  if (allMySchedules.length > 0) {
    hasSchedule = true;
    const todayScheduleRow = allMySchedules.find((s) =>
      s.workingDays.split(",").map(Number).includes(dow)
    );
    const mySchedule = todayScheduleRow ?? allMySchedules[0];
    isWorkingDay = !!todayScheduleRow && !holiday;
    assignedSiteId = mySchedule.siteId ?? null;
    const [st] = await db
      .select()
      .from(shiftTemplates)
      .where(eq(shiftTemplates.id, mySchedule.shiftTemplateId))
      .limit(1);
    if (st) {
      shiftStart = st.startTime;
      shiftEnd = st.endTime;
      gracePeriodMinutes = st.gracePeriodMinutes ?? 15;
    }
  }

  const dayStart = new Date(businessDate + "T00:00:00.000Z");
  const dayEnd = new Date(businessDate + "T23:59:59.999Z");

  const [openSession] = await db
    .select()
    .from(attendanceRecords)
    .where(
      and(eq(attendanceRecords.employeeId, employeeId), isNull(attendanceRecords.checkOut))
    )
    .orderBy(desc(attendanceRecords.checkIn))
    .limit(1);

  const [recordRow] = await db
    .select()
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.employeeId, employeeId),
        gte(attendanceRecords.checkIn, dayStart),
        lte(attendanceRecords.checkIn, dayEnd)
      )
    )
    .orderBy(desc(attendanceRecords.checkIn))
    .limit(1);

  /** Any open check-out wins for eligibility (includes cross-day forgot-checkout). */
  const checkIn = openSession?.checkIn
    ? new Date(openSession.checkIn)
    : recordRow?.checkIn
      ? new Date(recordRow.checkIn)
      : null;
  const checkOut = openSession ? null : recordRow?.checkOut ? new Date(recordRow.checkOut) : null;

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
    checkIn,
    checkOut,
  };
}
