/**
 * Scheduling Router — Shift templates, employee schedules, holiday calendar,
 * today's attendance board, and monthly reports.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, count, eq, gte, inArray, lt, lte, or, isNull } from "drizzle-orm";
import { getDb } from "../db";
import {
  shiftTemplates,
  employeeSchedules,
  employeeScheduleGroups,
  companyHolidays,
  attendanceSites,
  attendanceRecords,
  attendanceOperationalIssues,
  employees,
  users,
} from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { requireActiveCompanyId } from "../_core/tenant";
import { requireHrOrAdmin } from "../_core/policy";
import type { User } from "../../drizzle/schema";
import {
  computeAdminBoardRowStatus,
  type AdminBoardRowStatus,
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
  muscatDayUtcRangeExclusiveEnd,
  muscatMinutesSinceMidnight,
  muscatMonthUtcRangeExclusiveEnd,
  muscatWallDateTimeToUtc,
} from "@shared/attendanceMuscatTime";
import { countOverdueOpenCheckoutsOnBoard, muscatShiftWallEndMs } from "@shared/attendanceBoardOverdue";
import { operationalIssueKey } from "@shared/attendanceOperationalIssueKeys";
import { syncAttendanceOperationalIssuesFromSnapshot } from "../attendanceOperationalIssueSync";
import {
  derivePayrollHintsFromBoardRow,
  operationalBandFromBoardStatus,
  riskLevelFromBoardStatus,
} from "@shared/attendanceIntelligence";
import {
  resolveAttendanceDayState,
  type AttendanceDayStatus,
  type AttendancePayrollReadiness,
  type AttendanceDayRiskLevel,
} from "@shared/attendanceStatus";
import { computeAndEnsureOverdueCheckoutIssues } from "../overdueCheckoutIssues.service";

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

/** Compute canonical Phase-3 fields for a board row using available shift data. */
function _boardRowCanonicalFields(
  attendanceDate: string,
  now: Date,
  shiftStartTime: string,
  shiftEndTime: string,
  gracePeriodMinutes: number,
  checkInTime: Date | null,
  checkOutTime: Date | null,
  holidayFlag: boolean,
): {
  canonicalStatus: AttendanceDayStatus;
  payrollReadiness: AttendancePayrollReadiness;
  canonicalRiskLevel: AttendanceDayRiskLevel;
  reasonCodes: string[];
  isPayrollBlocking: boolean;
} {
  const result = resolveAttendanceDayState({
    attendanceDate,
    now,
    scheduleExists: true,
    shiftStartTime,
    shiftEndTime,
    gracePeriodMinutes,
    checkInTime,
    checkOutTime,
    holidayFlag,
  });
  return {
    canonicalStatus: result.status,
    payrollReadiness: result.payrollReadiness,
    canonicalRiskLevel: result.riskLevel,
    reasonCodes: result.reasonCodes,
    isPayrollBlocking: result.payrollReadiness.startsWith("blocked_"),
  };
}

function todayDow(): number {
  return muscatCalendarWeekdaySun0();
}

// ─── Shift-overlap helpers ────────────────────────────────────────────────────

/** Convert "HH:MM" → minutes since midnight. */
function hhmm(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Returns true when two shift windows overlap.
 * Overnight shifts (endTime < startTime) are treated as ending +24 h.
 * A window that merely touches at a boundary (A ends when B starts) is NOT
 * considered an overlap so back-to-back shifts are allowed.
 */
function shiftsOverlap(
  a: { startTime: string; endTime: string },
  b: { startTime: string; endTime: string },
): boolean {
  let aS = hhmm(a.startTime);
  let aE = hhmm(a.endTime);
  let bS = hhmm(b.startTime);
  let bE = hhmm(b.endTime);
  if (aE <= aS) aE += 1440;
  if (bE <= bS) bE += 1440;
  return aS < bE && bS < aE;
}

/**
 * Validates a list of shift-template ids for within-group overlap / duplicates.
 * Returns a string error message, or null when valid.
 */
async function validateShiftSegments(
  db: Awaited<ReturnType<typeof requireDb>>,
  shiftTemplateIds: number[],
): Promise<string | null> {
  if (shiftTemplateIds.length === 0) return "At least one shift segment is required.";

  // Duplicate template ids
  const seen = new Set<number>();
  for (const id of shiftTemplateIds) {
    if (seen.has(id)) return "Duplicate shift template selected in the same roster assignment.";
    seen.add(id);
  }

  // Load times for all selected templates
  const rows = await db
    .select({ id: shiftTemplates.id, startTime: shiftTemplates.startTime, endTime: shiftTemplates.endTime, name: shiftTemplates.name })
    .from(shiftTemplates)
    .where(inArray(shiftTemplates.id, shiftTemplateIds));

  if (rows.length !== shiftTemplateIds.length) return "One or more shift templates not found.";

  // Check every pair for overlap
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      if (shiftsOverlap(rows[i]!, rows[j]!)) {
        return `Shifts "${rows[i]!.name}" (${rows[i]!.startTime}–${rows[i]!.endTime}) and "${rows[j]!.name}" (${rows[j]!.startTime}–${rows[j]!.endTime}) overlap.`;
      }
    }
  }

  return null;
}

export const schedulingRouter = router({

  listShiftTemplates: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await requireDb();
      const templates = await db.select().from(shiftTemplates)
        .where(and(eq(shiftTemplates.companyId, companyId), eq(shiftTemplates.isActive, true)))
        .orderBy(shiftTemplates.name);
      const usageRows = await db
        .select({
          shiftTemplateId: employeeSchedules.shiftTemplateId,
          n: count(),
        })
        .from(employeeSchedules)
        .where(and(eq(employeeSchedules.companyId, companyId), eq(employeeSchedules.isActive, true)))
        .groupBy(employeeSchedules.shiftTemplateId);
      const usageByTemplate = new Map(usageRows.map((u) => [u.shiftTemplateId, u.n]));
      return templates.map((t) => ({
        ...t,
        activeScheduleAssignmentCount: usageByTemplate.get(t.id) ?? 0,
      }));
    }),

  createShiftTemplate: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      name: z.string().min(1).max(100),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
      breakMinutes: z.number().min(0).max(120).default(0),
      gracePeriodMinutes: z.number().min(0).max(120).default(15),
      color: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { companyId } = await requireHrOrAdmin(ctx.user as User, input.companyId);
      const db = await requireDb();
      const [result] = await db.insert(shiftTemplates).values({
        companyId,
        name: input.name,
        startTime: input.startTime,
        endTime: input.endTime,
        breakMinutes: input.breakMinutes,
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
      breakMinutes: z.number().min(0).max(120).optional(),
      gracePeriodMinutes: z.number().min(0).max(120).optional(),
      color: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { companyId } = await requireHrOrAdmin(ctx.user as User, input.companyId);
      const db = await requireDb();
      const { id, companyId: _cid, ...updates } = input;
      await db.update(shiftTemplates).set(updates)
        .where(and(eq(shiftTemplates.id, id), eq(shiftTemplates.companyId, companyId)));
      return { success: true };
    }),

  deleteShiftTemplate: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { companyId } = await requireHrOrAdmin(ctx.user as User, input.companyId);
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

      if (schedules.length === 0) return [];

      // Batch-load all referenced shift templates, sites, and employees in 4
      // parallel queries instead of 3 queries × N schedule rows.
      const shiftIds = [...new Set(schedules.map((s) => s.shiftTemplateId))];
      const siteIds = [...new Set(schedules.map((s) => s.siteId))];
      const empRefIds = [...new Set(schedules.map((s) => s.employeeUserId))];

      const empCols = {
        id: employees.id,
        userId: employees.userId,
        firstName: employees.firstName,
        lastName: employees.lastName,
        email: employees.email,
        avatarUrl: employees.avatarUrl,
      };

      const [shiftRows, siteRows, empByIdRows, empByUserIdRows] = await Promise.all([
        db.select().from(shiftTemplates).where(inArray(shiftTemplates.id, shiftIds)),
        db.select().from(attendanceSites).where(inArray(attendanceSites.id, siteIds)),
        db.select(empCols).from(employees).where(and(eq(employees.companyId, companyId), inArray(employees.id, empRefIds))),
        db.select(empCols).from(employees).where(and(eq(employees.companyId, companyId), inArray(employees.userId, empRefIds))),
      ]);

      const shiftById = new Map(shiftRows.map((s) => [s.id, s]));
      const siteById = new Map(siteRows.map((s) => [s.id, s]));
      const empByIdMap = new Map(empByIdRows.map((e) => [e.id, e]));
      const empByUserIdMap = new Map(empByUserIdRows.map((e) => [e.userId as number, e]));

      return schedules.map((s) => {
        const shift = shiftById.get(s.shiftTemplateId) ?? null;
        const site = siteById.get(s.siteId) ?? null;
        const emp = empByIdMap.get(s.employeeUserId) ?? empByUserIdMap.get(s.employeeUserId) ?? null;
        return {
          ...s,
          groupId: s.groupId ?? null,
          shift,
          site,
          employee: emp ? { ...emp, name: `${emp.firstName} ${emp.lastName}`.trim() } : null,
        };
      });
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
      const { companyId } = await requireHrOrAdmin(ctx.user as User, input.companyId);
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
      const { companyId } = await requireHrOrAdmin(ctx.user as User, input.companyId);
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
      const { companyId } = await requireHrOrAdmin(ctx.user as User, input.companyId);
      const db = await requireDb();
      await db.update(employeeSchedules).set({ isActive: false })
        .where(and(eq(employeeSchedules.id, input.id), eq(employeeSchedules.companyId, companyId)));
      return { success: true };
    }),

  // ── Multi-shift group procedures ──────────────────────────────────────────

  /**
   * List all active schedule groups with their child shift rows.
   * Also surfaces legacy ungrouped rows as single-shift "pseudo-groups" so the
   * frontend has one unified data source.
   */
  listScheduleGroups: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      employeeUserId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await requireDb();

      // 1. Load all active groups
      const groupConds = [
        eq(employeeScheduleGroups.companyId, companyId),
        eq(employeeScheduleGroups.isActive, true),
      ] as Parameters<typeof and>;
      if (input.employeeUserId) groupConds.push(eq(employeeScheduleGroups.employeeUserId, input.employeeUserId));
      const groups = await db.select().from(employeeScheduleGroups).where(and(...groupConds));

      // 2. Load all active schedule rows (includes ungrouped)
      const schedConds = [
        eq(employeeSchedules.companyId, companyId),
        eq(employeeSchedules.isActive, true),
      ] as Parameters<typeof and>;
      if (input.employeeUserId) schedConds.push(eq(employeeSchedules.employeeUserId, input.employeeUserId));
      const allRows = await db.select().from(employeeSchedules).where(and(...schedConds));

      // 3. Bulk-load referenced shift templates and sites
      const templateIds = Array.from(new Set(allRows.map((r) => r.shiftTemplateId)));
      const siteIds = Array.from(new Set(
        (groups.map((g) => g.siteId) as number[]).concat(
          allRows.filter((r) => r.groupId == null).map((r) => r.siteId),
        ),
      ));

      const [shiftsAll, sitesAll, empsAll] = await Promise.all([
        templateIds.length ? db.select().from(shiftTemplates).where(inArray(shiftTemplates.id, templateIds)) : Promise.resolve([]),
        siteIds.length ? db.select().from(attendanceSites).where(inArray(attendanceSites.id, siteIds)) : Promise.resolve([]),
        db.select({ id: employees.id, userId: employees.userId, firstName: employees.firstName, lastName: employees.lastName, email: employees.email, avatarUrl: employees.avatarUrl })
          .from(employees).where(and(eq(employees.companyId, companyId))),
      ]);
      const shiftById = new Map(shiftsAll.map((s) => [s.id, s]));
      const siteById = new Map(sitesAll.map((s) => [s.id, s]));
      const empById = new Map(empsAll.map((e) => [e.id, e]));
      const empByUserId = new Map(empsAll.filter((e) => e.userId != null).map((e) => [e.userId as number, e]));

      function resolveEmp(empUserId: number) {
        const e = empById.get(empUserId) ?? empByUserId.get(empUserId);
        if (!e) return null;
        return { id: e.id, userId: e.userId, name: `${e.firstName} ${e.lastName}`.trim(), email: e.email ?? null, avatarUrl: e.avatarUrl ?? null };
      }

      // 4. Build group entries (rows with groupId != null)
      const rowsByGroupId = new Map<number, typeof allRows>();
      for (const r of allRows) {
        if (r.groupId == null) continue;
        const arr = rowsByGroupId.get(r.groupId) ?? [];
        arr.push(r);
        rowsByGroupId.set(r.groupId, arr);
      }

      const groupEntries = groups.map((g) => {
        const rows = (rowsByGroupId.get(g.id) ?? [])
          .filter((r) => r.isActive)
          .sort((a, b) => {
            const ta = shiftById.get(a.shiftTemplateId)?.startTime ?? "";
            const tb = shiftById.get(b.shiftTemplateId)?.startTime ?? "";
            return ta.localeCompare(tb);
          });
        const shifts = rows.map((r) => ({
          scheduleId: r.id,
          shiftTemplateId: r.shiftTemplateId,
          shift: shiftById.get(r.shiftTemplateId) ?? null,
        }));
        return {
          type: "group" as const,
          groupId: g.id,
          companyId: g.companyId,
          employeeUserId: g.employeeUserId,
          employee: resolveEmp(g.employeeUserId),
          siteId: g.siteId,
          site: siteById.get(g.siteId) ?? null,
          workingDays: g.workingDays,
          startDate: g.startDate,
          endDate: g.endDate ?? null,
          notes: g.notes ?? null,
          isActive: g.isActive,
          shifts,
        };
      });

      // 5. Build ungrouped legacy entries
      const ungroupedRows = allRows.filter((r) => r.groupId == null);
      const legacyEntries = ungroupedRows.map((r) => ({
        type: "legacy" as const,
        groupId: null,
        scheduleId: r.id,
        companyId: r.companyId,
        employeeUserId: r.employeeUserId,
        employee: resolveEmp(r.employeeUserId),
        siteId: r.siteId,
        site: siteById.get(r.siteId) ?? null,
        workingDays: r.workingDays,
        startDate: r.startDate,
        endDate: r.endDate ?? null,
        notes: r.notes ?? null,
        isActive: r.isActive,
        shifts: [{
          scheduleId: r.id,
          shiftTemplateId: r.shiftTemplateId,
          shift: shiftById.get(r.shiftTemplateId) ?? null,
        }],
      }));

      const allEntries = [...groupEntries, ...legacyEntries];
      // Sort by employee name
      allEntries.sort((a, b) =>
        (a.employee?.name ?? "").localeCompare(b.employee?.name ?? "", undefined, { sensitivity: "base" })
      );
      return allEntries;
    }),

  /**
   * Create a grouped multi-shift roster assignment.
   * Validates shift segments for overlap/duplicates before inserting.
   */
  assignScheduleGroup: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      employeeUserId: z.number(),
      siteId: z.number(),
      shiftTemplateIds: z.array(z.number()).min(1).max(10),
      workingDays: z.array(z.number().min(0).max(6)).min(1),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { companyId } = await requireHrOrAdmin(ctx.user as User, input.companyId);
      const db = await requireDb();

      const overlapErr = await validateShiftSegments(db, input.shiftTemplateIds);
      if (overlapErr) throw new TRPCError({ code: "BAD_REQUEST", message: overlapErr });

      const workingDaysStr = [...input.workingDays].sort().join(",");

      const [groupResult] = await db.insert(employeeScheduleGroups).values({
        companyId,
        employeeUserId: input.employeeUserId,
        siteId: input.siteId,
        workingDays: workingDaysStr,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        isActive: true,
        notes: input.notes ?? null,
        createdByUserId: ctx.user.id,
      });
      const groupId = (groupResult as { insertId: number }).insertId;

      const scheduleIds: number[] = [];
      for (const templateId of input.shiftTemplateIds) {
        const [r] = await db.insert(employeeSchedules).values({
          companyId,
          employeeUserId: input.employeeUserId,
          siteId: input.siteId,
          shiftTemplateId: templateId,
          groupId,
          workingDays: workingDaysStr,
          startDate: input.startDate,
          endDate: input.endDate ?? null,
          isActive: true,
          notes: input.notes ?? null,
          createdByUserId: ctx.user.id,
        });
        scheduleIds.push((r as { insertId: number }).insertId);
      }

      return { groupId, scheduleIds };
    }),

  /**
   * Update a schedule group: metadata (site, working days, dates, notes) + reconcile
   * the shift-template list. Old rows not in the new set are deactivated; new
   * templates get fresh rows inserted; unchanged rows keep their id (preserving
   * attendance attribution).
   */
  updateScheduleGroup: protectedProcedure
    .input(z.object({
      groupId: z.number(),
      companyId: z.number().optional(),
      employeeUserId: z.number().optional(),
      siteId: z.number().optional(),
      shiftTemplateIds: z.array(z.number()).min(1).max(10).optional(),
      workingDays: z.array(z.number().min(0).max(6)).min(1).optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { companyId } = await requireHrOrAdmin(ctx.user as User, input.companyId);
      const db = await requireDb();

      // Load existing group
      const [group] = await db.select().from(employeeScheduleGroups)
        .where(and(eq(employeeScheduleGroups.id, input.groupId), eq(employeeScheduleGroups.companyId, companyId)))
        .limit(1);
      if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Schedule group not found." });

      if (input.shiftTemplateIds) {
        const overlapErr = await validateShiftSegments(db, input.shiftTemplateIds);
        if (overlapErr) throw new TRPCError({ code: "BAD_REQUEST", message: overlapErr });
      }

      const workingDaysStr = input.workingDays ? [...input.workingDays].sort().join(",") : undefined;

      // Update group-level metadata
      const groupUpdates: Partial<typeof employeeScheduleGroups.$inferInsert> = {};
      if (input.siteId !== undefined) groupUpdates.siteId = input.siteId;
      if (workingDaysStr !== undefined) groupUpdates.workingDays = workingDaysStr;
      if (input.startDate !== undefined) groupUpdates.startDate = input.startDate;
      if (input.endDate !== undefined) groupUpdates.endDate = input.endDate ?? null;
      if (input.notes !== undefined) groupUpdates.notes = input.notes;
      if (input.employeeUserId !== undefined) groupUpdates.employeeUserId = input.employeeUserId;

      if (Object.keys(groupUpdates).length > 0) {
        await db.update(employeeScheduleGroups).set(groupUpdates)
          .where(and(eq(employeeScheduleGroups.id, input.groupId), eq(employeeScheduleGroups.companyId, companyId)));
      }

      if (input.shiftTemplateIds) {
        // Reconcile child rows
        const existingRows = await db.select()
          .from(employeeSchedules)
          .where(and(eq(employeeSchedules.groupId, input.groupId), eq(employeeSchedules.companyId, companyId), eq(employeeSchedules.isActive, true)));

        const existingTemplateIds = new Set(existingRows.map((r) => r.shiftTemplateId));
        const desiredTemplateIds = new Set(input.shiftTemplateIds);

        // Deactivate removed rows
        for (const row of existingRows) {
          if (!desiredTemplateIds.has(row.shiftTemplateId)) {
            await db.update(employeeSchedules).set({ isActive: false })
              .where(and(eq(employeeSchedules.id, row.id), eq(employeeSchedules.companyId, companyId)));
          }
        }

        // Effective values after update
        const effectiveSiteId = input.siteId ?? group.siteId;
        const effectiveWorkingDays = workingDaysStr ?? group.workingDays;
        const effectiveStartDate = input.startDate ?? group.startDate;
        const effectiveEndDate = input.endDate !== undefined ? (input.endDate ?? null) : group.endDate;
        const effectiveEmployeeUserId = input.employeeUserId ?? group.employeeUserId;

        // Update shared fields on kept rows
        for (const row of existingRows) {
          if (desiredTemplateIds.has(row.shiftTemplateId)) {
            await db.update(employeeSchedules).set({
              siteId: effectiveSiteId,
              workingDays: effectiveWorkingDays,
              startDate: effectiveStartDate,
              endDate: effectiveEndDate ?? null,
              employeeUserId: effectiveEmployeeUserId,
              notes: input.notes ?? row.notes,
            }).where(and(eq(employeeSchedules.id, row.id), eq(employeeSchedules.companyId, companyId)));
          }
        }

        // Insert new rows
        for (const templateId of input.shiftTemplateIds) {
          if (!existingTemplateIds.has(templateId)) {
            await db.insert(employeeSchedules).values({
              companyId,
              employeeUserId: effectiveEmployeeUserId,
              siteId: effectiveSiteId,
              shiftTemplateId: templateId,
              groupId: input.groupId,
              workingDays: effectiveWorkingDays,
              startDate: effectiveStartDate,
              endDate: effectiveEndDate ?? null,
              isActive: true,
              notes: input.notes ?? group.notes ?? null,
              createdByUserId: ctx.user.id,
            });
          }
        }
      }

      return { success: true };
    }),

  /**
   * Soft-delete a schedule group and all its child rows.
   */
  deleteScheduleGroup: protectedProcedure
    .input(z.object({ groupId: z.number(), companyId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { companyId } = await requireHrOrAdmin(ctx.user as User, input.companyId);
      const db = await requireDb();
      await db.update(employeeScheduleGroups).set({ isActive: false })
        .where(and(eq(employeeScheduleGroups.id, input.groupId), eq(employeeScheduleGroups.companyId, companyId)));
      await db.update(employeeSchedules).set({ isActive: false })
        .where(and(eq(employeeSchedules.groupId, input.groupId), eq(employeeSchedules.companyId, companyId)));
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
      const { companyId } = await requireHrOrAdmin(ctx.user as User, input.companyId);
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
      const { companyId } = await requireHrOrAdmin(ctx.user as User, input.companyId);
      const db = await requireDb();
      await db.delete(companyHolidays)
        .where(and(eq(companyHolidays.id, input.id), eq(companyHolidays.companyId, companyId)));
      return { success: true };
    }),

  seedOmanHolidays: protectedProcedure
    .input(z.object({ companyId: z.number().optional(), year: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { companyId } = await requireHrOrAdmin(ctx.user as User, input.companyId);
      const db = await requireDb();
      const y = input.year;
      /** Oman public holidays — Islamic dates vary; some entries are approximate per civil calendar seed. */
      const list = [
        { name: "New Year's Day", date: `${y}-01-01` },
        { name: "Isra Mi'raj (Prophet's Ascension)", date: `${y}-03-09` },
        { name: "Eid Al Fitr (Day 1)", date: `${y}-03-30` },
        { name: "Eid Al Fitr (Day 2)", date: `${y}-03-31` },
        { name: "Eid Al Fitr (Day 3)", date: `${y}-04-01` },
        { name: "Eid Al Adha (Day 1)", date: `${y}-06-15` },
        { name: "Eid Al Adha (Day 2)", date: `${y}-06-16` },
        { name: "Eid Al Adha (Day 3)", date: `${y}-06-17` },
        { name: "Islamic New Year", date: `${y}-07-16` },
        { name: "Renaissance Day", date: `${y}-07-23` },
        { name: "Prophet's Birthday", date: `${y}-09-24` },
        { name: "National Day (Eve)", date: `${y}-11-17` },
        { name: "National Day", date: `${y}-11-18` },
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

      const { startUtc: boardDayStart, endExclusiveUtc: boardDayEndExclusive } = muscatDayUtcRangeExclusiveEnd(today);
      const allRecords = await db
        .select()
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.companyId, companyId),
            gte(attendanceRecords.checkIn, boardDayStart),
            lt(attendanceRecords.checkIn, boardDayEndExclusive),
          ),
        );

      const empRows = await db.select().from(employees).where(eq(employees.companyId, companyId));
      const empById = new Map(empRows.map((e) => [e.id, e]));
      const empByLoginUserId = new Map(
        empRows.filter((e) => e.userId != null).map((e) => [e.userId as number, e])
      );

      const now = new Date();
      const [yy, mm, dd] = today.split("-").map((x) => parseInt(x, 10));
      const dayAnchor = new Date(yy, mm - 1, dd, 12, 0, 0, 0);

      type EmpRowFull = typeof empRows[number];
      type Draft = {
        schedule: (typeof todaySchedules)[number];
        shift: typeof shiftTemplates.$inferSelect | undefined;
        site: typeof attendanceSites.$inferSelect | undefined;
        empRow: EmpRowFull | undefined;
        emp: { id: number; name: string | null; email: string | null; avatarUrl: string | null } | null;
        startT: string;
        endT: string;
        grace: number;
      };

      // Batch-load all referenced shifts, sites, and user display rows at once
      // rather than issuing 3 queries per schedule row (N+1 pattern).
      const todayShiftIds = [...new Set(todaySchedules.map((s) => s.shiftTemplateId))];
      const todaySiteIds = [...new Set(todaySchedules.map((s) => s.siteId))];

      const empRowsForToday = todaySchedules.map((s) =>
        employeeRowFromScheduleRef(s.employeeUserId, empById, empByLoginUserId) as EmpRowFull | undefined
      );
      const userIdsNeeded = [
        ...new Set(
          empRowsForToday.flatMap((e) => (e?.userId != null ? [e.userId] : []))
        ),
      ];

      const [todayShiftRows, todaySiteRows, todayUserRows] = await Promise.all([
        todayShiftIds.length > 0
          ? db.select().from(shiftTemplates).where(inArray(shiftTemplates.id, todayShiftIds))
          : Promise.resolve([] as (typeof shiftTemplates.$inferSelect)[]),
        todaySiteIds.length > 0
          ? db.select().from(attendanceSites).where(inArray(attendanceSites.id, todaySiteIds))
          : Promise.resolve([] as (typeof attendanceSites.$inferSelect)[]),
        userIdsNeeded.length > 0
          ? db
              .select({ id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl })
              .from(users)
              .where(inArray(users.id, userIdsNeeded))
          : Promise.resolve([] as { id: number; name: string | null; email: string | null; avatarUrl: string | null }[]),
      ]);

      const todayShiftById = new Map(todayShiftRows.map((s) => [s.id, s]));
      const todaySiteById = new Map(todaySiteRows.map((s) => [s.id, s]));
      const todayUserById = new Map(todayUserRows.map((u) => [u.id, u]));

      const drafts: Draft[] = todaySchedules.map((s, i) => {
        const shift = todayShiftById.get(s.shiftTemplateId);
        const site = todaySiteById.get(s.siteId);
        const empRow = empRowsForToday[i];
        const emp = empRow?.userId != null ? (todayUserById.get(empRow.userId) ?? null) : null;
        const startT = shift?.startTime ?? "09:00";
        const endT = shift?.endTime ?? "17:00";
        const grace = shift?.gracePeriodMinutes ?? 15;
        return { schedule: s, shift, site, empRow, emp, startT, endT, grace };
      });

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

      let board = drafts.map((d) => {
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

        const { shiftStart } = getShiftInstantBounds(startT, endT, dayAnchor, today);
        const shiftEndMs = muscatShiftWallEndMs(today, startT, endT);
        const sameEmpDrafts = empRow ? drafts.filter((x) => x.empRow?.id === empRow.id) : [];
        const thisStartMs = muscatShiftWallStartMs(today, startT);
        let nextShiftStartMs: number | null = null;
        for (const o of sameEmpDrafts) {
          const oms = muscatShiftWallStartMs(today, o.startT);
          if (oms > thisStartMs && (nextShiftStartMs === null || oms < nextShiftStartMs)) {
            nextShiftStartMs = oms;
          }
        }
        const coMs = record?.checkOut?.getTime() ?? null;
        const longSessionSpansNextShift =
          !!record?.checkOut &&
          empRow != null &&
          sameEmpDrafts.length >= 2 &&
          nextShiftStartMs != null &&
          coMs != null &&
          coMs > shiftEndMs &&
          coMs >= nextShiftStartMs;

        let status: AdminBoardRowStatus;
        let delayMinutes: number | null = null;
        let durationMinutes: number | null = null;
        const checkInAt: Date | null = record?.checkIn ?? null;
        let checkOutAt: Date | null = record?.checkOut ?? null;
        let punchCheckOutAt: Date | null = null;

        if (longSessionSpansNextShift && record?.checkOut) {
          /**
           * One physical row runs from before/through this shift into the next block (e.g. 10:00–22:00 with
           * morning 10–13 and evening 18–22). Do **not** mark this shift “Completed” with full overlap minutes:
           * there was no separate checkout for this segment. Show segment checkout as empty; keep full session
           * end on `punchCheckOutAt` for HR visibility.
           */
          punchCheckOutAt = record.checkOut;
          checkOutAt = null;
          const nowT = now.getTime();
          const deadline = shiftStart.getTime() + grace * 60_000;
          const cin = record.checkIn.getTime();
          /** Minutes inside this shift window from actual check-in until min(now, session end, shift end) — not “full shift done”. */
          const segEndMs = Math.min(nowT, coMs as number, shiftEndMs);
          const segStartMs = Math.max(cin, thisStartMs);
          durationMinutes =
            segEndMs > segStartMs ? Math.max(0, Math.round((segEndMs - segStartMs) / 60000)) : null;

          if (nowT <= shiftEndMs) {
            status = cin <= deadline ? "checked_in_on_time" : "checked_in_late";
            if (status === "checked_in_late") {
              delayMinutes = arrivalDelayMinutesAfterGrace(record.checkIn, shiftStart, grace);
            }
          } else if (nowT < (coMs as number)) {
            /** Past this shift’s wall end but global session still open — not “late arrival”; only late if check-in was late. */
            status = cin <= deadline ? "checked_in_on_time" : "checked_in_late";
            if (status === "checked_in_late") {
              delayMinutes = arrivalDelayMinutesAfterGrace(record.checkIn, shiftStart, grace);
            }
          } else {
            /** Session closed in DB but this shift never had its own checkout — do not imply a closed segment with a duration. */
            status = "late_no_checkin";
            delayMinutes = null;
            durationMinutes = null;
          }
        } else {
          status = computeAdminBoardRowStatus({
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

          if (status === "checked_in_late" && record) {
            delayMinutes = arrivalDelayMinutesAfterGrace(record.checkIn, shiftStart, grace);
          } else if (status === "late_no_checkin") {
            delayMinutes = minutesPastExpectedCheckIn(now, shiftStart, grace);
          }

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

          if (record?.checkOut != null && empRow != null) {
            const co = record.checkOut.getTime();
            const se = shiftEndMs;
            if (co > se) {
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
          riskLevel: riskLevelFromBoardStatus(status),
          operationalBand: operationalBandFromBoardStatus(status),
          payrollHints: derivePayrollHintsFromBoardRow({
            status,
            durationMinutes,
            delayMinutes,
          }),
          ..._boardRowCanonicalFields(today, now, startT, endT, grace, checkInAt, checkOutAt, !!holiday),
        };
      });

      await syncAttendanceOperationalIssuesFromSnapshot(db, {
        companyId,
        businessDateYmd: today,
        boardRows: board.map((b) => ({
          scheduleId: b.scheduleId,
          status: b.status,
          employeeId: b.employeeId,
        })),
      });

      const absentKeys = board
        .filter((b) => b.status === "absent")
        .map((b) =>
          operationalIssueKey({ kind: "missed_shift", scheduleId: b.scheduleId, businessDateYmd: today }),
        );
      const missedIssueRows =
        absentKeys.length > 0
          ? await db
              .select()
              .from(attendanceOperationalIssues)
              .where(
                and(
                  eq(attendanceOperationalIssues.companyId, companyId),
                  inArray(attendanceOperationalIssues.issueKey, absentKeys),
                ),
              )
          : [];
      const missedByKey = new Map(missedIssueRows.map((r) => [r.issueKey, r]));

      const overdueIssueRows = await db
        .select()
        .from(attendanceOperationalIssues)
        .where(
          and(
            eq(attendanceOperationalIssues.companyId, companyId),
            eq(attendanceOperationalIssues.businessDateYmd, today),
            eq(attendanceOperationalIssues.issueKind, "overdue_checkout"),
          ),
        );
      const overdueByRecordId = new Map(
        overdueIssueRows
          .filter((r) => r.attendanceRecordId != null)
          .map((r) => [r.attendanceRecordId as number, r]),
      );

      board = board.map((row) => {
        let operationalIssue: {
          issueKey: string;
          status: string;
          assignedToUserId: number | null;
          acknowledgedByUserId: number | null;
          reviewedByUserId: number | null;
          reviewedAt: Date | null;
          resolutionNote: string | null;
        } | null = null;
        if (row.attendanceRecordId != null) {
          const oi = overdueByRecordId.get(row.attendanceRecordId);
          if (oi) {
            operationalIssue = {
              issueKey: oi.issueKey,
              status: oi.status,
              assignedToUserId: oi.assignedToUserId ?? null,
              acknowledgedByUserId: oi.acknowledgedByUserId ?? null,
              reviewedByUserId: oi.reviewedByUserId ?? null,
              reviewedAt: oi.reviewedAt ?? null,
              resolutionNote: oi.resolutionNote ?? null,
            };
          }
        }
        if (!operationalIssue && row.status === "absent") {
          const k = operationalIssueKey({
            kind: "missed_shift",
            scheduleId: row.scheduleId,
            businessDateYmd: today,
          });
          const oi = missedByKey.get(k);
          if (oi) {
            operationalIssue = {
              issueKey: oi.issueKey,
              status: oi.status,
              assignedToUserId: oi.assignedToUserId ?? null,
              acknowledgedByUserId: oi.acknowledgedByUserId ?? null,
              reviewedByUserId: oi.reviewedByUserId ?? null,
              reviewedAt: oi.reviewedAt ?? null,
              resolutionNote: oi.resolutionNote ?? null,
            };
          }
        }
        return { ...row, operationalIssue };
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

      for (const [, rows] of Array.from(byEmployeeId)) {
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

      const overdueOpenCheckoutCount = countOverdueOpenCheckoutsOnBoard(
        board.map((r) => ({
          checkInAt: r.checkInAt,
          checkOutAt: r.checkOutAt,
          expectedStart: r.expectedStart,
          expectedEnd: r.expectedEnd,
        })),
        today,
        now.getTime()
      );

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
        /** Muscat wall clock vs server `now` — matches board row open check-outs past shift end */
        overdueOpenCheckoutCount,
        /** Rows in the critical band (e.g. confirmed absent after shift end) */
        criticalExceptions: board.filter((b) => b.operationalBand === "critical").length,
        /** Late / grace / early checkout — needs HR or manager attention */
        needsAttention: board.filter((b) => b.operationalBand === "needs_attention").length,
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

      const { startUtc: monthRangeStart, endExclusiveUtc: monthRangeEndExclusive } = muscatMonthUtcRangeExclusiveEnd(
        year,
        month,
      );
      const records = await db
        .select()
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.companyId, companyId),
            gte(attendanceRecords.checkIn, monthRangeStart),
            lt(attendanceRecords.checkIn, monthRangeEndExclusive),
          ),
        );

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
        const dailyDetails: Array<{
          date: string;
          status: string;
          checkIn: string | null;
          checkOut: string | null;
          shiftName: string;
          workedMinutes?: number;
        }> = [];

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
            const checkInMins = muscatMinutesSinceMidnight(record.checkIn);
            const shiftStartMins = timeToMinutes(shift?.startTime ?? "08:00");
            const grace = shift?.gracePeriodMinutes ?? 15;
            const isLate = checkInMins > shiftStartMins + grace;
            if (isLate) lateDays++;
            const breakM = shift?.breakMinutes ?? 0;
            let grossDur = 0;
            if (record.checkOut) {
              grossDur = Math.max(
                0,
                Math.round((record.checkOut.getTime() - record.checkIn.getTime()) / 60000),
              );
            }
            const workedMinutes = record.checkOut ? Math.max(0, grossDur - breakM) : 0;
            dailyDetails.push({
              date: dateStr, status: isLate ? "late" : "present",
              checkIn: record.checkIn.toISOString(), checkOut: record.checkOut?.toISOString() ?? null,
              shiftName: shift?.name ?? "",
              workedMinutes,
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

  /**
   * Returns every employee who is currently clocked in (no check-out) but whose
   * scheduled shift end time has already passed for today.
   * Intended for manager / HR summary views.
   */
  getOverdueCheckouts: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await requireDb();
      return computeAndEnsureOverdueCheckoutIssues(db, companyId);
    }),

  /**
   * Sends an in-app check-out reminder notification to a specific employee
   * who is still clocked in after their shift ended.
   */
  sendOverdueCheckoutReminder: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      employeeUserId: z.number(),
      shiftName: z.string().nullable(),
      expectedEnd: z.string(),
      minutesOverdue: z.number(),
      customMessage: z.string().max(1000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { companyId } = await requireHrOrAdmin(ctx.user as User, input.companyId);
      const db = await requireDb();

      // Verify the employee belongs to this company
      const [emp] = await db.select({ id: employees.id, userId: employees.userId })
        .from(employees)
        .where(and(
          eq(employees.companyId, companyId),
          or(
            eq(employees.id, input.employeeUserId),
            eq(employees.userId, input.employeeUserId),
          ),
        ))
        .limit(1);

      // Resolve the actual login userId for the notification
      const targetUserId = emp?.userId ?? input.employeeUserId;

      const overdueLabel = input.minutesOverdue >= 60
        ? `${Math.floor(input.minutesOverdue / 60)}h ${input.minutesOverdue % 60}m`
        : `${input.minutesOverdue}m`;

      const shiftLabel = input.shiftName ? ` (${input.shiftName})` : "";

      const defaultMessage = `Your shift${shiftLabel} ended at ${input.expectedEnd} — you are ${overdueLabel} past the scheduled end time. Please check out when you are done.`;
      const finalMessage = input.customMessage?.trim() ? input.customMessage.trim() : defaultMessage;

      const { createNotification } = await import("../db");
      await createNotification(
        {
          userId: targetUserId,
          companyId,
          type: "overdue_checkout_reminder",
          title: "Reminder: Please check out",
          message: finalMessage,
          isRead: false,
          link: "/employee-portal",
        },
        { actorUserId: ctx.user.id },
      );

      return { sent: true, targetUserId };
    }),
});
