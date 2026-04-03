/**
 * Scheduling Router — Shift templates, employee schedules, holiday calendar,
 * today's attendance board, and monthly reports.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, gte, lte, or, isNull } from "drizzle-orm";
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

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function todayDow(): number {
  return new Date().getDay();
}

export const schedulingRouter = router({

  listShiftTemplates: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId);
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
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId);
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
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId);
      const db = await requireDb();
      const { id, companyId: _cid, ...updates } = input;
      await db.update(shiftTemplates).set(updates)
        .where(and(eq(shiftTemplates.id, id), eq(shiftTemplates.companyId, companyId)));
      return { success: true };
    }),

  deleteShiftTemplate: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId);
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
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId);
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
        const [emp] = await db.select({ id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl })
          .from(users).where(eq(users.id, s.employeeUserId)).limit(1);
        return { ...s, shift: shift ?? null, site: site ?? null, employee: emp ?? null };
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
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId);
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
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId);
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
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId);
      const db = await requireDb();
      await db.update(employeeSchedules).set({ isActive: false })
        .where(and(eq(employeeSchedules.id, input.id), eq(employeeSchedules.companyId, companyId)));
      return { success: true };
    }),

  listHolidays: protectedProcedure
    .input(z.object({ companyId: z.number().optional(), year: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId);
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
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId);
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
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId);
      const db = await requireDb();
      await db.delete(companyHolidays)
        .where(and(eq(companyHolidays.id, input.id), eq(companyHolidays.companyId, companyId)));
      return { success: true };
    }),

  seedOmanHolidays: protectedProcedure
    .input(z.object({ companyId: z.number().optional(), year: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId);
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
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId);
      const db = await requireDb();
      const today = todayStr();
      const dow = todayDow();

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
      const empByUserId = new Map(empRows.map(e => [e.userId, e]));

      const board = await Promise.all(todaySchedules.map(async (s) => {
        const [shift] = await db.select().from(shiftTemplates).where(eq(shiftTemplates.id, s.shiftTemplateId)).limit(1);
        const [site] = await db.select().from(attendanceSites).where(eq(attendanceSites.id, s.siteId)).limit(1);
        const [emp] = await db.select({ id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl })
          .from(users).where(eq(users.id, s.employeeUserId)).limit(1);

        const empRow = empByUserId.get(s.employeeUserId);
        const record = empRow
          ? allRecords.find(r => r.employeeId === empRow.id && r.siteId === s.siteId)
          : undefined;

        let status: "on_time" | "late" | "absent" | "holiday" | "checked_out" = "absent";
        if (holiday) {
          status = "holiday";
        } else if (record) {
          const checkInMins = record.checkIn.getHours() * 60 + record.checkIn.getMinutes();
          const shiftStartMins = timeToMinutes(shift?.startTime ?? "08:00");
          const grace = shift?.gracePeriodMinutes ?? 15;
          if (record.checkOut) status = "checked_out";
          else if (checkInMins <= shiftStartMins + grace) status = "on_time";
          else status = "late";
        }

        return {
          scheduleId: s.id,
          employee: emp ?? null,
          site: site ?? null,
          shift: shift ?? null,
          status,
          checkInAt: record?.checkIn ?? null,
          checkOutAt: record?.checkOut ?? null,
          attendanceRecordId: record?.id ?? null,
          holiday,
        };
      }));

      return {
        date: today,
        isHoliday: !!holiday,
        holidayName: holiday?.name ?? null,
        board,
        summary: {
          total: board.length,
          onTime: board.filter(b => b.status === "on_time").length,
          checkedOut: board.filter(b => b.status === "checked_out").length,
          late: board.filter(b => b.status === "late").length,
          absent: board.filter(b => b.status === "absent").length,
          holiday: board.filter(b => b.status === "holiday").length,
        },
      };
    }),

  getMyTodaySchedule: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId);
      const db = await requireDb();
      const today = todayStr();
      const dow = todayDow();

      const holidays = await db.select().from(companyHolidays)
        .where(and(eq(companyHolidays.companyId, companyId), eq(companyHolidays.holidayDate, today)));
      const holiday = holidays[0] ?? null;
      if (holiday) return { isHoliday: true, holiday, schedule: null, shift: null, site: null };

      const allMySchedules = await db.select().from(employeeSchedules)
        .where(and(
          eq(employeeSchedules.companyId, companyId),
          eq(employeeSchedules.employeeUserId, ctx.user.id),
          eq(employeeSchedules.isActive, true),
          lte(employeeSchedules.startDate, today),
          or(isNull(employeeSchedules.endDate), gte(employeeSchedules.endDate, today))
        ));

      const mySchedule = allMySchedules.find(s =>
        s.workingDays.split(",").map(Number).includes(dow)
      ) ?? null;

      if (!mySchedule) return { isHoliday: false, holiday: null, schedule: null, shift: null, site: null };

      const [shift] = await db.select().from(shiftTemplates).where(eq(shiftTemplates.id, mySchedule.shiftTemplateId)).limit(1);
      const [site] = await db.select().from(attendanceSites).where(eq(attendanceSites.id, mySchedule.siteId)).limit(1);

      return { isHoliday: false, holiday: null, schedule: mySchedule, shift: shift ?? null, site: site ?? null };
    }),

  getMonthlyReport: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      year: z.number(),
      month: z.number().min(1).max(12),
      employeeUserId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId);
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
      const empByUserId = new Map(empRows.map(e => [e.userId, e]));

      const recordMap = new Map<string, typeof records[0]>();
      for (const r of records) {
        const dateStr = r.checkIn.toISOString().slice(0, 10);
        recordMap.set(`${r.employeeId}-${dateStr}`, r);
      }

      const employeeUserIds = Array.from(new Set(allSchedules.map(s => s.employeeUserId)));
      const report = await Promise.all(employeeUserIds.map(async (empUserId) => {
        const [emp] = await db.select({ id: users.id, name: users.name, email: users.email })
          .from(users).where(eq(users.id, empUserId)).limit(1);
        const empRow = empByUserId.get(empUserId);
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
