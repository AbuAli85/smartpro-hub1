/**
 * Scheduling Router — Shift templates, employee schedules, holiday calendar,
 * today's attendance board, and monthly reports.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, gte, inArray, lte, or, isNull } from "drizzle-orm";
import { getDb, getUserCompany } from "../db";
import {
  shiftTemplates,
  employeeSchedules,
  companyHolidays,
  attendanceSites,
  attendanceRecords,
  employees,
  users,
} from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { requireActiveCompanyId } from "../_core/tenant";
import {
  computeAdminBoardRowStatus,
  arrivalDelayMinutesAfterGrace,
  minutesPastExpectedCheckIn,
} from "@shared/attendanceBoardStatus";
import { getShiftInstantBounds } from "@shared/employeePortalShift";
import { pickScheduleRowForNow } from "@shared/pickScheduleForAttendanceNow";
import {
  assignAttendanceRecordsToShiftRows,
  attendanceOverlapShiftMinutes,
} from "@shared/assignAttendanceRecordsToShifts";
import {
  muscatCalendarYmdFromUtcInstant,
  muscatCalendarWeekdaySun0,
  muscatCalendarYmdNow,
  muscatWallDateTimeToUtc,
} from "@shared/attendanceMuscatTime";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function muscatShiftWallStartMs(ymd: string, hhmm: string): number {
  return muscatWallDateTimeToUtc(ymd, `${hhmm}:00`).getTime();
}

/** Muscat wall end for this shift on `ymd` (overnight: end after midnight). */
function muscatShiftWallEndMs(ymd: string, startHhmm: string, endHhmm: string): number {
  const ss = muscatWallDateTimeToUtc(ymd, `${startHhmm}:00`).getTime();
  let se = muscatWallDateTimeToUtc(ymd, `${endHhmm}:00`).getTime();
  if (se <= ss) se += 86_400_000;
  return se;
}

/**
 * `employee_schedules.employee_user_id` may store `employees.id` (legacy / no portal user yet)
 * or `employees.userId` (login id). Prefer primary-key match first — same order as
 * `listEmployeeSchedules` / `getMyActiveSchedule`.
 */
function employeeRowFromScheduleRef<E extends { id: number; userId: number | null }>(
  rawId: number,
  empById: Map<number, E>,
  empByLoginUserId: Map<number, E>
): E | undefined {
  return empById.get(rawId) ?? empByLoginUserId.get(rawId);
}

function todayStr(): string {
  return muscatCalendarYmdNow();
}

function todayDow(): number {
  return muscatCalendarWeekdaySun0();
}

export const schedulingRouter = router({

  listShiftTemplates: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await requireDb();
      return db.select().from(shiftTemplates)
        .where(and(eq(shiftTemplates.companyId, companyId), eq(shiftTemplates.isActive, true)))
        .orderBy(shiftTemplates.name);
    }),

  createShiftTemplate: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      name: z.string().min(1).max(100),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
      gracePeriodMinutes: z.number().min(0).max(120).default(15),
      color: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await requireDb();
      const [result] = await db.insert(shiftTemplates).values({
        companyId,
        name: input.name,
        startTime: input.startTime,
        endTime: input.endTime,
        gracePeriodMinutes: input.gracePeriodMinutes,
        color: input.color ?? "#6366f1",
        isActive: true,
      });
      return { id: (result as { insertId: number }).insertId };
    }),

  updateShiftTemplate: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number().optional(),
      name: z.string().min(1).max(100).optional(),
      startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      gracePeriodMinutes: z.number().min(0).max(120).optional(),
      color: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await requireDb();
      const { id, companyId: _cid, ...updates } = input;
      await db.update(shiftTemplates).set(updates)
        .where(and(eq(shiftTemplates.id, id), eq(shiftTemplates.companyId, companyId)));
      return { success: true };
    }),

  deleteShiftTemplate: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await requireDb();
      await db.update(shiftTemplates).set({ isActive: false })
        .where(and(eq(shiftTemplates.id, input.id), eq(shiftTemplates.companyId, companyId)));
      return { success: true };
    }),

  listEmployeeSchedules: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      employeeUserId: z.number().optional(),
      siteId: z.number().optional(),
      activeOnly: z.boolean().default(true),
    }))
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await requireDb();
      const conds = [eq(employeeSchedules.companyId, companyId)] as Parameters<typeof and>;
      if (input.employeeUserId) conds.push(eq(employeeSchedules.employeeUserId, input.employeeUserId));
      if (input.siteId) conds.push(eq(employeeSchedules.siteId, input.siteId));
      if (input.activeOnly) conds.push(eq(employeeSchedules.isActive, true));

      const schedules = await db.select().from(employeeSchedules)
        .where(and(...conds)).orderBy(employeeSchedules.startDate);

      return Promise.all(schedules.map(async (s) => {
        const [shift] = await db.select().from(shiftTemplates).where(eq(shiftTemplates.id, s.shiftTemplateId)).limit(1);
        const [site] = await db.select().from(attendanceSites).where(eq(attendanceSites.id, s.siteId)).limit(1);
        // Try matching by employee record id first (common when dropdown uses e.id), then by userId
        const [empById] = await db.select({ id: employees.id, userId: employees.userId, firstName: employees.firstName, lastName: employees.lastName, email: employees.email, avatarUrl: employees.avatarUrl })
          .from(employees).where(and(eq(employees.companyId, companyId), eq(employees.id, s.employeeUserId))).limit(1);
        const [empByUserId] = empById ? [empById] : await db.select({ id: employees.id, userId: employees.userId, firstName: employees.firstName, lastName: employees.lastName, email: employees.email, avatarUrl: employees.avatarUrl })
          .from(employees).where(and(eq(employees.companyId, companyId), eq(employees.userId, s.employeeUserId))).limit(1);
        const emp = empById ?? empByUserId ?? null;
        return { ...s, shift: shift ?? null, site: site ?? null, employee: emp ? { ...emp, name: `${emp.firstName} ${emp.lastName}`.trim() } : null };
      }));
    }),

  assignSchedule: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      employeeUserId: z.number(),
      siteId: z.number(),
      shiftTemplateId: z.number(),
      workingDays: z.array(z.number().min(0).max(6)).min(1),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await requireDb();
      const [result] = await db.insert(employeeSchedules).values({
        companyId,
        employeeUserId: input.employeeUserId,
        siteId: input.siteId,
        shiftTemplateId: input.shiftTemplateId,
        workingDays: [...input.workingDays].sort().join(","),
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        isActive: true,
        notes: input.notes ?? null,
        createdByUserId: ctx.user.id,
      });
      return { id: (result as { insertId: number }).insertId };
    }),

  updateSchedule: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number().optional(),
      siteId: z.number().optional(),
      shiftTemplateId: z.number().optional(),
      workingDays: z.array(z.number().min(0).max(6)).min(1).optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      isActive: z.boolean().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await requireDb();
      const { id, companyId: _cid, workingDays, ...rest } = input;
      const updates: Record<string, unknown> = { ...rest };
      if (workingDays) updates.workingDays = [...workingDays].sort().join(",");
      await db.update(employeeSchedules).set(updates)
        .where(and(eq(employeeSchedules.id, id), eq(employeeSchedules.companyId, companyId)));
      return { success: true };
    }),

  deleteSchedule: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await requireDb();
      await db.update(employeeSchedules).set({ isActive: false })
        .where(and(eq(employeeSchedules.id, input.id), eq(employeeSchedules.companyId, companyId)));
      return { success: true };
    }),

  listHolidays: protectedProcedure
    .input(z.object({ companyId: z.number().optional(), year: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await requireDb();
      const year = input.year ?? new Date().getFullYear();
      return db.select().from(companyHolidays)
        .where(and(
          eq(companyHolidays.companyId, companyId),
          gte(companyHolidays.holidayDate, `${year}-01-01`),
          lte(companyHolidays.holidayDate, `${year}-12-31`)
        ))
        .orderBy(companyHolidays.holidayDate);
    }),

  addHoliday: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      name: z.string().min(1).max(200),
      holidayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      type: z.enum(["public", "company", "optional"]).default("public"),
      isRecurringYearly: z.boolean().default(false),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await requireDb();
      const [result] = await db.insert(companyHolidays).values({
        companyId,
        name: input.name,
        holidayDate: input.holidayDate,
        type: input.type,
        isRecurringYearly: input.isRecurringYearly,
        notes: input.notes ?? null,
      });
      return { id: (result as { insertId: number }).insertId };
    }),

  deleteHoliday: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await requireDb();
      await db.delete(companyHolidays)
        .where(and(eq(companyHolidays.id, input.id), eq(companyHolidays.companyId, companyId)));
      return { success: true };
    }),

  seedOmanHolidays: protectedProcedure
    .input(z.object({ companyId: z.number().optional(), year: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await requireDb();
      const y = input.year;
      const list = [
        { name: "New Year's Day", date: `${y}-01-01` },
        { name: "Renaissance Day", date: `${y}-07-23` },
        { name: "National Day", date: `${y}-11-18` },
        { name: "National Day Holiday", date: `${y}-11-19` },
        { name: "Prophet's Birthday (Mawlid)", date: `${y}-09-05` },
        { name: "Eid Al Fitr (Day 1)", date: `${y}-03-30` },
        { name: "Eid Al Fitr (Day 2)", date: `${y}-03-31` },
        { name: "Eid Al Fitr (Day 3)", date: `${y}-04-01` },
        { name: "Eid Al Adha (Day 1)", date: `${y}-06-06` },
        { name: "Eid Al Adha (Day 2)", date: `${y}-06-07` },
        { name: "Eid Al Adha (Day 3)", date: `${y}-06-08` },
        { name: "Islamic New Year (Hijri)", date: `${y}-06-27` },
      ];
      let seeded = 0;
      for (const h of list) {
        try {
          await db.insert(companyHolidays).values({
            companyId, name: h.name, holidayDate: h.date,
            type: "public", isRecurringYearly: false,
            notes: "Oman public holiday",
          });
          seeded++;
        } catch { /* skip duplicates */ }
      }
      return { seeded };
    }),

  getTodayBoard: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      /** Optional calendar date (YYYY-MM-DD); defaults to server “today” */
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await requireDb();
      const today = input.date ?? todayStr();
      const dow = input.date
        ? new Date(input.date + "T12:00:00").getDay()
        : todayDow();

      const holidays = await db.select().from(companyHolidays)
        .where(and(eq(companyHolidays.companyId, companyId), eq(companyHolidays.holidayDate, today)));
      const holiday = holidays[0] ?? null;

      const allSchedules = await db.select().from(employeeSchedules)
        .where(and(
          eq(employeeSchedules.companyId, companyId),
          eq(employeeSchedules.isActive, true),
          lte(employeeSchedules.startDate, today),
          or(isNull(employeeSchedules.endDate), gte(employeeSchedules.endDate, today))
        ));

      const todaySchedules = allSchedules.filter(s =>
        s.workingDays.split(",").map(Number).includes(dow)
      );

      const todayStart = new Date(today + "T00:00:00.000Z");
      const todayEnd = new Date(today + "T23:59:59.999Z");
      const allRecords = await db.select().from(attendanceRecords)
        .where(and(
          eq(attendanceRecords.companyId, companyId),
          gte(attendanceRecords.checkIn, todayStart),
          lte(attendanceRecords.checkIn, todayEnd)
        ));

      const empRows = await db.select().from(employees).where(eq(employees.companyId, companyId));
      const empById = new Map(empRows.map((e) => [e.id, e]));
      const empByLoginUserId = new Map(
        empRows.filter((e) => e.userId != null).map((e) => [e.userId as number, e])
      );

      const now = new Date();
      const [yy, mm, dd] = today.split("-").map((x) => parseInt(x, 10));
      const dayAnchor = new Date(yy, mm - 1, dd, 12, 0, 0, 0);

      type Draft = {
        schedule: (typeof todaySchedules)[number];
        shift: typeof shiftTemplates.$inferSelect | undefined;
        site: typeof attendanceSites.$inferSelect | undefined;
        empRow: ReturnType<typeof employeeRowFromScheduleRef> | undefined;
        emp: { id: number; name: string | null; email: string | null; avatarUrl: string | null } | null;
        startT: string;
        endT: string;
        grace: number;
      };

      const drafts: Draft[] = await Promise.all(
        todaySchedules.map(async (s) => {
          const [shift] = await db.select().from(shiftTemplates).where(eq(shiftTemplates.id, s.shiftTemplateId)).limit(1);
          const [site] = await db.select().from(attendanceSites).where(eq(attendanceSites.id, s.siteId)).limit(1);
          const empRow = employeeRowFromScheduleRef(s.employeeUserId, empById, empByLoginUserId);
          let emp: { id: number; name: string | null; email: string | null; avatarUrl: string | null } | null = null;
          if (empRow?.userId != null) {
            const [u] = await db
              .select({ id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl })
              .from(users)
              .where(eq(users.id, empRow.userId))
              .limit(1);
            emp = u ?? null;
          }
          const startT = shift?.startTime ?? "09:00";
          const endT = shift?.endTime ?? "17:00";
          const grace = shift?.gracePeriodMinutes ?? 15;
          return { schedule: s, shift, site, empRow, emp, startT, endT, grace };
        })
      );

      const recordsByEmployeeId = new Map<number, (typeof allRecords)[number][]>();
      for (const r of allRecords) {
        const arr = recordsByEmployeeId.get(r.employeeId) ?? [];
        arr.push(r);
        recordsByEmployeeId.set(r.employeeId, arr);
      }

      const shiftRowsForAssign = drafts
        .filter((d) => d.empRow != null)
        .map((d) => ({
          scheduleId: d.schedule.id,
          siteId: d.schedule.siteId,
          employeeId: d.empRow!.id,
          shiftStartTime: d.startT,
          shiftEndTime: d.endT,
          gracePeriodMinutes: d.grace,
        }));

      const recordByScheduleId = assignAttendanceRecordsToShiftRows(
        shiftRowsForAssign,
        recordsByEmployeeId,
        today,
        now.getTime()
      );

      const board = drafts.map((d) => {
        const { schedule: s, shift, site, empRow, emp, startT, endT, grace } = d;
        let record = empRow ? recordByScheduleId.get(s.id) : undefined;

        if (record?.checkOut && record.checkOut.getTime() <= record.checkIn.getTime()) {
          record = undefined;
        }
        if (record) {
          const strictOverlap = attendanceOverlapShiftMinutes(
            record.checkIn,
            record.checkOut ?? null,
            today,
            startT,
            endT,
            now.getTime()
          );
          if (strictOverlap === 0 && record.checkOut) {
            record = undefined;
          }
        }

        const status = computeAdminBoardRowStatus({
          now,
          businessDate: today,
          holiday: !!holiday,
          shiftStartTime: startT,
          shiftEndTime: endT,
          gracePeriodMinutes: grace,
          record: record
            ? { checkIn: record.checkIn, checkOut: record.checkOut ?? null }
            : null,
        });

        const { shiftStart } = getShiftInstantBounds(startT, endT, dayAnchor);

        let delayMinutes: number | null = null;
        if (status === "checked_in_late" && record) {
          delayMinutes = arrivalDelayMinutesAfterGrace(record.checkIn, shiftStart, grace);
        } else if (status === "late_no_checkin") {
          delayMinutes = minutesPastExpectedCheckIn(now, shiftStart, grace);
        }

        let durationMinutes: number | null = null;
        if (record) {
          durationMinutes = attendanceOverlapShiftMinutes(
            record.checkIn,
            record.checkOut ?? null,
            today,
            startT,
            endT,
            now.getTime()
          );
        }

        const employeeDisplayName =
          emp?.name?.trim() ||
          (empRow ? `${empRow.firstName} ${empRow.lastName}`.trim() : "") ||
          `Employee #${s.employeeUserId}`;

        const methodLabel =
          record?.method === "manual"
            ? "Manual request"
            : record?.method === "admin"
              ? "Admin"
              : record
                ? "QR / app"
                : null;

        /**
         * Check-in: always the stored punch (`check_in`).
         * Check-out: stored punch unless one session spans past this shift’s end into a later same-day shift
         * (e.g. morning row + single 10:00–22:00 record) — then show this shift’s **wall end** so the row does
         * not display the evening’s checkout as “morning checkout”. `punchCheckOutAt` keeps the raw DB time when capped.
         */
        const checkInAt: Date | null = record?.checkIn ?? null;
        let checkOutAt: Date | null = record?.checkOut ?? null;
        let punchCheckOutAt: Date | null = null;
        if (record?.checkOut != null && empRow != null) {
          const co = record.checkOut.getTime();
          const se = muscatShiftWallEndMs(today, startT, endT);
          if (co > se) {
            const sameEmpDrafts = drafts.filter((x) => x.empRow?.id === empRow.id);
            const thisStartMs = muscatShiftWallStartMs(today, startT);
            let nextShiftStartMs: number | null = null;
            for (const o of sameEmpDrafts) {
              const oms = muscatShiftWallStartMs(today, o.startT);
              if (oms > thisStartMs && (nextShiftStartMs === null || oms < nextShiftStartMs)) {
                nextShiftStartMs = oms;
              }
            }
            const multiShiftDay = sameEmpDrafts.length >= 2;
            const checkoutReachesOrPassesNextShiftStart =
              nextShiftStartMs != null && co >= nextShiftStartMs;
            const loneShiftButVeryLateCheckout =
              sameEmpDrafts.length === 1 && nextShiftStartMs === null && co > se + 2 * 60 * 60 * 1000;
            if ((multiShiftDay && checkoutReachesOrPassesNextShiftStart) || loneShiftButVeryLateCheckout) {
              punchCheckOutAt = record.checkOut;
              checkOutAt = new Date(se);
            }
          }
        }

        return {
          scheduleId: s.id,
          employeeId: empRow?.id ?? null,
          employee: emp ?? null,
          employeeDisplayName,
          site: site ?? null,
          shift: shift ?? null,
          status,
          checkInAt,
          checkOutAt,
          punchCheckOutAt,
          attendanceRecordId: record?.id ?? null,
          holiday,
          expectedStart: startT,
          expectedEnd: endT,
          delayMinutes,
          durationMinutes,
          methodLabel,
          siteName: record?.siteName ?? site?.name ?? null,
        };
      });

      type BoardRow = (typeof board)[number];
      const byEmployeeId = new Map<number, BoardRow[]>();
      for (const row of board) {
        if (row.employeeId == null) continue;
        const arr = byEmployeeId.get(row.employeeId) ?? [];
        arr.push(row);
        byEmployeeId.set(row.employeeId, arr);
      }

      const fullDaySummaries: {
        employeeId: number;
        employeeDisplayName: string;
        shiftCount: number;
        /** Shifts on this day that are fully checked out (matches table "Completed"). */
        shiftsCheckedOutCount: number;
        segments: {
          scheduleId: number;
          shiftName: string | null;
          expectedStart: string;
          expectedEnd: string;
          checkInAt: Date | null;
          checkOutAt: Date | null;
          punchCheckOutAt: Date | null;
          durationMinutes: number | null;
          status: string;
          methodLabel: string | null;
        }[];
        /** Sum of per-shift attributed minutes (0 for shifts not started; partial while checked in). */
        totalAttributedMinutes: number;
        dayFullyComplete: boolean;
      }[] = [];

      for (const [, rows] of byEmployeeId) {
        if (rows.length < 2) continue;
        const sorted = [...rows].sort((a, b) => a.expectedStart.localeCompare(b.expectedStart));
        const shiftsCheckedOutCount = sorted.filter((r) => r.status === "checked_out").length;
        const segments = sorted.map((r) => ({
          scheduleId: r.scheduleId,
          shiftName: (r.shift as { name?: string | null } | null)?.name ?? null,
          expectedStart: r.expectedStart,
          expectedEnd: r.expectedEnd,
          checkInAt: r.checkInAt,
          checkOutAt: r.checkOutAt,
          punchCheckOutAt: r.punchCheckOutAt,
          durationMinutes: r.durationMinutes,
          status: r.status,
          methodLabel: r.methodLabel,
        }));
        const totalAttributedMinutes = sorted.reduce((acc, r) => acc + (r.durationMinutes ?? 0), 0);
        const dayFullyComplete = sorted.every((r) => r.status === "checked_out");
        fullDaySummaries.push({
          employeeId: sorted[0]!.employeeId!,
          employeeDisplayName: sorted[0]!.employeeDisplayName,
          shiftCount: sorted.length,
          shiftsCheckedOutCount,
          segments,
          totalAttributedMinutes,
          dayFullyComplete,
        });
      }
      fullDaySummaries.sort((a, b) => a.employeeDisplayName.localeCompare(b.employeeDisplayName));

      const summary = {
        total: board.length,
        holiday: board.filter((b) => b.status === "holiday").length,
        upcoming: board.filter((b) => b.status === "upcoming").length,
        notCheckedIn: board.filter((b) => b.status === "not_checked_in").length,
        lateNoCheckin: board.filter((b) => b.status === "late_no_checkin").length,
        absent: board.filter((b) => b.status === "absent").length,
        checkedInOnTime: board.filter((b) => b.status === "checked_in_on_time").length,
        checkedInLate: board.filter((b) => b.status === "checked_in_late").length,
        checkedOut: board.filter((b) => b.status === "checked_out").length,
        /** Employees currently checked in (not checked out) */
        checkedInActive: board.filter((b) =>
          b.status === "checked_in_on_time" || b.status === "checked_in_late"
        ).length,
        /** Legacy-style rollups for charts/widgets */
        onTime: board.filter((b) => b.status === "checked_in_on_time" || b.status === "checked_out").length,
        late: board.filter((b) => b.status === "checked_in_late" || b.status === "late_no_checkin").length,
      };

      return {
        date: today,
        isHoliday: !!holiday,
        holidayName: holiday?.name ?? null,
        board,
        fullDaySummaries,
        summary,
      };
    }),

  getMyTodaySchedule: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await requireDb();
      const today = todayStr();
      const dow = todayDow();

      const holidays = await db.select().from(companyHolidays)
        .where(and(eq(companyHolidays.companyId, companyId), eq(companyHolidays.holidayDate, today)));
      const holiday = holidays[0] ?? null;
        if (holiday) return { isHoliday: true, holiday, schedule: null, shift: null, site: null };
      // Dual lookup: try by login user ID first, then by employee row ID
      const queryTodaySchedules = (empUserId: number) =>
        db.select().from(employeeSchedules)
          .where(and(
            eq(employeeSchedules.companyId, companyId),
            eq(employeeSchedules.employeeUserId, empUserId),
            eq(employeeSchedules.isActive, true),
            lte(employeeSchedules.startDate, today),
            or(isNull(employeeSchedules.endDate), gte(employeeSchedules.endDate, today))
          ));
      let allMySchedules = await queryTodaySchedules(ctx.user.id);
      if (allMySchedules.length === 0) {
        const [empRow] = await db.select({ id: employees.id })
          .from(employees)
          .where(and(eq(employees.companyId, companyId), eq(employees.userId, ctx.user.id)))
          .limit(1);
        if (empRow) allMySchedules = await queryTodaySchedules(empRow.id);
      }
      const workingToday = allMySchedules.filter((s) =>
        s.workingDays.split(",").map(Number).includes(dow)
      );
      if (workingToday.length === 0) {
        return { isHoliday: false, holiday: null, schedule: null, shift: null, site: null };
      }
      const templateIds = Array.from(new Set(allMySchedules.map((s) => s.shiftTemplateId)));
      const shiftRows =
        templateIds.length > 0
          ? await db.select().from(shiftTemplates).where(inArray(shiftTemplates.id, templateIds))
          : [];
      const shiftById = new Map(shiftRows.map((st) => [st.id, st]));
      const mySchedule = pickScheduleRowForNow({
        now: new Date(),
        businessDate: today,
        dow,
        isHoliday: false,
        scheduleRows: allMySchedules,
        getShift: (tid) => shiftById.get(tid),
      });
      if (!mySchedule) return { isHoliday: false, holiday: null, schedule: null, shift: null, site: null };

      const [shift] = await db.select().from(shiftTemplates).where(eq(shiftTemplates.id, mySchedule.shiftTemplateId)).limit(1);
      const [site] = await db.select().from(attendanceSites).where(eq(attendanceSites.id, mySchedule.siteId)).limit(1);

      return { isHoliday: false, holiday: null, schedule: mySchedule, shift: shift ?? null, site: site ?? null };
    }),

  // Returns the employee's active schedule regardless of today's day of week.
  // Shows schedule info even on days off (isWorkingDay = false).
  // DUAL LOOKUP: tries ctx.user.id first (userId-based), then falls back to employees.id
  // because some schedules were assigned using the employee row ID instead of the login user ID.
  getMyActiveSchedule: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await requireDb();
      const today = todayStr();
      const dow = todayDow();
      // Check holiday
      const holidays = await db.select().from(companyHolidays)
        .where(and(eq(companyHolidays.companyId, companyId), eq(companyHolidays.holidayDate, today)));
      const holiday = holidays[0] ?? null;
      // Helper to query schedules by a given employeeUserId value
      const querySchedules = (empUserId: number) =>
        db.select().from(employeeSchedules)
          .where(and(
            eq(employeeSchedules.companyId, companyId),
            eq(employeeSchedules.employeeUserId, empUserId),
            eq(employeeSchedules.isActive, true),
            lte(employeeSchedules.startDate, today),
            or(isNull(employeeSchedules.endDate), gte(employeeSchedules.endDate, today))
          ));
      // First try matching by login user ID (ctx.user.id)
      let allMySchedules = await querySchedules(ctx.user.id);
      // If nothing found, try matching by the employee row ID (employees.id)
      // This handles the case where admin assigned the schedule before linking the user account
      if (allMySchedules.length === 0) {
        const [empRow] = await db.select({ id: employees.id })
          .from(employees)
          .where(and(eq(employees.companyId, companyId), eq(employees.userId, ctx.user.id)))
          .limit(1);
        if (empRow) {
          allMySchedules = await querySchedules(empRow.id);
        }
      }
      if (allMySchedules.length === 0) {
        return { hasSchedule: false, isHoliday: !!holiday, holiday: holiday ?? null, isWorkingDay: false, schedule: null, shift: null, site: null, workingDays: [] as number[] };
      }
      const templateIds = Array.from(new Set(allMySchedules.map((s) => s.shiftTemplateId)));
      const shiftRows =
        templateIds.length > 0
          ? await db.select().from(shiftTemplates).where(inArray(shiftTemplates.id, templateIds))
          : [];
      const shiftById = new Map(shiftRows.map((st) => [st.id, st]));
      const mySchedule = pickScheduleRowForNow({
        now: new Date(),
        businessDate: today,
        dow,
        isHoliday: !!holiday,
        scheduleRows: allMySchedules,
        getShift: (tid) => shiftById.get(tid),
      });
      if (!mySchedule) {
        return { hasSchedule: false, isHoliday: !!holiday, holiday: holiday ?? null, isWorkingDay: false, schedule: null, shift: null, site: null, workingDays: [] as number[] };
      }
      const workingToday = allMySchedules.filter((s) =>
        s.workingDays.split(",").map(Number).includes(dow)
      );
      const isWorkingDay = workingToday.length > 0 && !holiday;
      const [shift] = await db.select().from(shiftTemplates).where(eq(shiftTemplates.id, mySchedule.shiftTemplateId)).limit(1);
      const [site] = await db.select().from(attendanceSites).where(eq(attendanceSites.id, mySchedule.siteId)).limit(1);
      const workingDays = mySchedule.workingDays.split(",").map(Number);
      return { hasSchedule: true, isHoliday: !!holiday, holiday: holiday ?? null, isWorkingDay, schedule: mySchedule, shift: shift ?? null, site: site ?? null, workingDays };
    }),

  getMonthlyReport: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      year: z.number(),
      month: z.number().min(1).max(12),
      employeeUserId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await requireDb();
      const { year, month } = input;
      const mm = String(month).padStart(2, "0");
      const startDate = `${year}-${mm}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;

      const holidays = await db.select().from(companyHolidays)
        .where(and(
          eq(companyHolidays.companyId, companyId),
          gte(companyHolidays.holidayDate, startDate),
          lte(companyHolidays.holidayDate, endDate)
        ));
      const holidayDates = new Set(holidays.map(h => h.holidayDate));

      const schedConds = [
        eq(employeeSchedules.companyId, companyId),
        eq(employeeSchedules.isActive, true),
        lte(employeeSchedules.startDate, endDate),
        or(isNull(employeeSchedules.endDate), gte(employeeSchedules.endDate, startDate)),
      ] as Parameters<typeof and>;
      if (input.employeeUserId) schedConds.push(eq(employeeSchedules.employeeUserId, input.employeeUserId));

      const allSchedules = await db.select().from(employeeSchedules).where(and(...schedConds));

      const monthStart = new Date(`${startDate}T00:00:00.000Z`);
      const monthEnd = new Date(`${endDate}T23:59:59.999Z`);
      const records = await db.select().from(attendanceRecords)
        .where(and(
          eq(attendanceRecords.companyId, companyId),
          gte(attendanceRecords.checkIn, monthStart),
          lte(attendanceRecords.checkIn, monthEnd)
        ));

      const empRows = await db.select().from(employees).where(eq(employees.companyId, companyId));
      const empById = new Map(empRows.map((e) => [e.id, e]));
      const empByLoginUserId = new Map(
        empRows.filter((e) => e.userId != null).map((e) => [e.userId as number, e])
      );

      const recordMap = new Map<string, typeof records[0]>();
      for (const r of records) {
        const dateStr = muscatCalendarYmdFromUtcInstant(new Date(r.checkIn));
        recordMap.set(`${r.employeeId}-${dateStr}`, r);
      }

      const employeeUserIds = Array.from(new Set(allSchedules.map(s => s.employeeUserId)));
      const report = await Promise.all(employeeUserIds.map(async (empUserId) => {
        const empRow = employeeRowFromScheduleRef(empUserId, empById, empByLoginUserId);
        let emp: { id: number; name: string | null; email: string | null } | null = null;
        if (empRow?.userId != null) {
          const [u] = await db
            .select({ id: users.id, name: users.name, email: users.email })
            .from(users)
            .where(eq(users.id, empRow.userId))
            .limit(1);
          emp = u ?? null;
        }
        const empSchedules = allSchedules.filter(s => s.employeeUserId === empUserId);

        let scheduledDays = 0, presentDays = 0, lateDays = 0, absentDays = 0, holidayDays = 0;
        const dailyDetails: Array<{ date: string; status: string; checkIn: string | null; checkOut: string | null; shiftName: string }> = [];

        for (let d = 1; d <= lastDay; d++) {
          const dateStr = `${year}-${mm}-${String(d).padStart(2, "0")}`;
          const dow = new Date(dateStr + "T12:00:00Z").getDay();

          if (holidayDates.has(dateStr)) {
            holidayDays++;
            const hol = holidays.find(h => h.holidayDate === dateStr);
            dailyDetails.push({ date: dateStr, status: "holiday", checkIn: null, checkOut: null, shiftName: hol?.name ?? "Holiday" });
            continue;
          }

          const daySched = empSchedules.find(s =>
            s.workingDays.split(",").map(Number).includes(dow) &&
            s.startDate <= dateStr && (s.endDate === null || s.endDate >= dateStr)
          );
          if (!daySched) continue;

          scheduledDays++;
          const [shift] = await db.select().from(shiftTemplates).where(eq(shiftTemplates.id, daySched.shiftTemplateId)).limit(1);
          const record = empRow ? recordMap.get(`${empRow.id}-${dateStr}`) : undefined;

          if (record) {
            presentDays++;
            const checkInMins = record.checkIn.getHours() * 60 + record.checkIn.getMinutes();
            const shiftStartMins = timeToMinutes(shift?.startTime ?? "08:00");
            const grace = shift?.gracePeriodMinutes ?? 15;
            const isLate = checkInMins > shiftStartMins + grace;
            if (isLate) lateDays++;
            dailyDetails.push({
              date: dateStr, status: isLate ? "late" : "present",
              checkIn: record.checkIn.toISOString(), checkOut: record.checkOut?.toISOString() ?? null,
              shiftName: shift?.name ?? "",
            });
          } else {
            absentDays++;
            dailyDetails.push({ date: dateStr, status: "absent", checkIn: null, checkOut: null, shiftName: shift?.name ?? "" });
          }
        }

        return {
          employee: emp ?? null,
          scheduledDays, presentDays, lateDays, absentDays, holidayDays,
          attendanceRate: scheduledDays > 0 ? Math.round((presentDays / scheduledDays) * 100) : 0,
          dailyDetails,
        };
      }));

      return { year, month, holidays, report };
    }),
});
