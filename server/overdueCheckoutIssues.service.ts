/**
 * Overdue checkout detection + operational issue persistence.
 * Shared by `scheduling.getOverdueCheckouts` and the background job so issues are not UI-only.
 */
import { and, eq, gte, inArray, isNull, lt, lte, or } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import {
  attendanceRecords,
  attendanceOperationalIssues,
  attendanceSites,
  companyHolidays,
  employeeSchedules,
  employees,
  shiftTemplates,
  users,
} from "../drizzle/schema";
import {
  muscatCalendarWeekdaySun0,
  muscatCalendarYmdNow,
  muscatDayUtcRangeExclusiveEnd,
} from "@shared/attendanceMuscatTime";
import { muscatShiftWallEndMs } from "@shared/attendanceBoardOverdue";
import { operationalIssueKey } from "@shared/attendanceOperationalIssueKeys";
import { ensureOverdueCheckoutOperationalIssuesOpen } from "./attendanceOperationalIssueSync";

function employeeRowFromScheduleRef<E extends { id: number; userId: number | null }>(
  rawId: number,
  empById: Map<number, E>,
  empByLoginUserId: Map<number, E>,
): E | undefined {
  return empById.get(rawId) ?? empByLoginUserId.get(rawId);
}

export type OverdueCheckoutEmployee = {
  employeeId: number | null;
  employeeUserId: number;
  employeeDisplayName: string;
  shiftName: string | null;
  siteName: string | null;
  expectedEnd: string;
  checkInAt: Date;
  minutesOverdue: number;
  attendanceRecordId: number;
  operationalIssue: {
    issueKey: string;
    status: string;
    assignedToUserId: number | null;
  } | null;
};

/**
 * Computes overdue open checkouts and persists `overdue_checkout` operational issues.
 * Returns payload suitable for `scheduling.getOverdueCheckouts` API.
 */
export async function computeAndEnsureOverdueCheckoutIssues(
  db: MySql2Database<any>,
  companyId: number,
  now: Date = new Date(),
): Promise<{ date: string; overdueEmployees: OverdueCheckoutEmployee[] }> {
  const today = muscatCalendarYmdNow(now);
  const dow = muscatCalendarWeekdaySun0(now);
  const nowMs = now.getTime();

  const holidays = await db
    .select()
    .from(companyHolidays)
    .where(and(eq(companyHolidays.companyId, companyId), eq(companyHolidays.holidayDate, today)));
  if (holidays.length > 0) return { date: today, overdueEmployees: [] };

  const allSchedules = await db
    .select()
    .from(employeeSchedules)
    .where(
      and(
        eq(employeeSchedules.companyId, companyId),
        eq(employeeSchedules.isActive, true),
        lte(employeeSchedules.startDate, today),
        or(isNull(employeeSchedules.endDate), gte(employeeSchedules.endDate, today)),
      ),
    );
  const workingToday = allSchedules.filter((s) => s.workingDays.split(",").map(Number).includes(dow));
  if (workingToday.length === 0) return { date: today, overdueEmployees: [] };

  const shiftIds = Array.from(new Set(workingToday.map((s) => s.shiftTemplateId)));
  const siteIds = Array.from(new Set(workingToday.map((s) => s.siteId).filter(Boolean) as number[]));
  const empUserIds = Array.from(new Set(workingToday.map((s) => s.employeeUserId)));

  const [shiftsAll, sitesAll, empsAll, usersAll] = await Promise.all([
    shiftIds.length ? db.select().from(shiftTemplates).where(inArray(shiftTemplates.id, shiftIds)) : Promise.resolve([]),
    siteIds.length ? db.select().from(attendanceSites).where(inArray(attendanceSites.id, siteIds)) : Promise.resolve([]),
    db.select().from(employees).where(and(eq(employees.companyId, companyId), inArray(employees.userId, empUserIds))),
    db.select().from(users).where(inArray(users.id, empUserIds)),
  ]);
  const shiftById = new Map(shiftsAll.map((s) => [s.id, s]));
  const siteById = new Map(sitesAll.map((s) => [s.id, s]));
  const empByUserId = new Map(empsAll.map((e) => [e.userId ?? -1, e]));
  const userById = new Map(usersAll.map((u) => [u.id, u]));

  const { startUtc: dayStartUtc, endExclusiveUtc: dayEndExclusiveUtc } = muscatDayUtcRangeExclusiveEnd(today);
  const openRecords = await db
    .select()
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.companyId, companyId),
        gte(attendanceRecords.checkIn, dayStartUtc),
        lt(attendanceRecords.checkIn, dayEndExclusiveUtc),
        isNull(attendanceRecords.checkOut),
      ),
    );

  const openByEmployeeId = new Map<number, (typeof openRecords)[number]>();
  for (const r of openRecords) {
    const existing = openByEmployeeId.get(r.employeeId);
    if (!existing || r.checkIn > existing.checkIn) openByEmployeeId.set(r.employeeId, r);
  }

  const overdueMap = new Map<
    number,
    {
      employeeId: number | null;
      employeeUserId: number;
      employeeDisplayName: string;
      shiftName: string | null;
      siteName: string | null;
      expectedEnd: string;
      checkInAt: Date;
      minutesOverdue: number;
      attendanceRecordId: number;
    }
  >();

  for (const s of workingToday) {
    const shift = shiftById.get(s.shiftTemplateId);
    if (!shift) continue;
    const shiftEndMs = muscatShiftWallEndMs(today, shift.startTime, shift.endTime);
    if (nowMs <= shiftEndMs) continue;
    const empRow = empByUserId.get(s.employeeUserId);
    const resolvedEmpId = empRow?.id;
    const record = resolvedEmpId != null ? openByEmployeeId.get(resolvedEmpId) : undefined;
    if (!record) continue;
    if (overdueMap.has(s.employeeUserId)) continue;
    const user = userById.get(s.employeeUserId);
    const site = s.siteId ? siteById.get(s.siteId) : null;
    const displayName =
      user?.name?.trim() ||
      (empRow ? `${empRow.firstName} ${empRow.lastName}`.trim() : "") ||
      `Employee #${s.employeeUserId}`;
    overdueMap.set(s.employeeUserId, {
      employeeId: empRow?.id ?? null,
      employeeUserId: s.employeeUserId,
      employeeDisplayName: displayName,
      shiftName: shift.name,
      siteName: site?.name ?? null,
      expectedEnd: shift.endTime,
      checkInAt: record.checkIn,
      minutesOverdue: Math.floor((nowMs - shiftEndMs) / 60_000),
      attendanceRecordId: record.id,
    });
  }

  let overdueEmployees = Array.from(overdueMap.values()).sort((a, b) => b.minutesOverdue - a.minutesOverdue);

  await ensureOverdueCheckoutOperationalIssuesOpen(db, {
    companyId,
    businessDateYmd: today,
    items: overdueEmployees.map((e) => ({
      attendanceRecordId: e.attendanceRecordId,
      employeeId: e.employeeId,
    })),
  });

  const recordIds = overdueEmployees.map((e) => e.attendanceRecordId);
  if (recordIds.length > 0) {
    const keys = recordIds.map((id) => operationalIssueKey({ kind: "overdue_checkout", attendanceRecordId: id }));
    const issueRows = await db
      .select()
      .from(attendanceOperationalIssues)
      .where(and(eq(attendanceOperationalIssues.companyId, companyId), inArray(attendanceOperationalIssues.issueKey, keys)));
    const issueByKey = new Map(issueRows.map((r) => [r.issueKey, r]));
    overdueEmployees = overdueEmployees.map((row) => {
      const key = operationalIssueKey({ kind: "overdue_checkout", attendanceRecordId: row.attendanceRecordId });
      const oi = issueByKey.get(key);
      return {
        ...row,
        operationalIssue: oi
          ? {
              issueKey: oi.issueKey,
              status: oi.status,
              assignedToUserId: oi.assignedToUserId ?? null,
            }
          : null,
      };
    });
  } else {
    overdueEmployees = overdueEmployees.map((row) => ({ ...row, operationalIssue: null as null }));
  }

  return { date: today, overdueEmployees: overdueEmployees as OverdueCheckoutEmployee[] };
}
