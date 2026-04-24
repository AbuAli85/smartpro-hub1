/**
 * getDailyStates / getDailyDigest — read-only daily attendance state procedures (Phase 9A / 9C).
 *
 * Queries all data needed for one Muscat calendar date, calls
 * buildDailyAttendanceState() for every employee in scope, and returns the
 * list alongside aggregate summary counts.
 *
 * Tenant isolation: companyId is derived from the authenticated user's active
 * workspace — callers cannot supply an arbitrary companyId.
 *
 * Adoption plan:
 *   - Today's Board (scheduling.getTodayBoard) continues to work unchanged;
 *     this procedure adds a richer, phase-aware view of the same data.
 *   - Future: Today's Board can be migrated to consume DailyAttendanceState
 *     rows once the UI is ready for the new shape.
 *   - Reconciliation (Phase 5A): can run buildDailyAttendanceState() per row
 *     instead of its current ad-hoc flag logic once the snapshot table is added.
 *   - Monthly Report: can iterate dates × employees using this loader to
 *     replace the per-schedule aggregation it currently performs.
 */

import { TRPCError } from "@trpc/server";
import { and, eq, gte, inArray, isNull, lt, lte, or } from "drizzle-orm";
import { z } from "zod";
import {
  attendance,
  attendanceClientApprovalItems,
  attendanceCorrections,
  attendanceRecords,
  attendanceSessions,
  attendanceSites,
  companyHolidays,
  employeeSchedules,
  employees,
  leaveRequests,
  manualCheckinRequests,
  shiftTemplates,
} from "../../../drizzle/schema";
import { protectedProcedure, router } from "../../_core/trpc";
import {
  buildDailyAttendanceState,
  type DailyAttendanceState,
  type ResolvedScheduleEntry,
} from "@shared/attendanceDailyState";
import { buildAttendanceDailyDigest } from "@shared/attendanceDailyDigest";
import { muscatDayUtcRangeExclusiveEnd } from "@shared/attendanceMuscatTime";
import { requireAdminOrHR, requireDb } from "./helpers";
import type { User } from "../../../drizzle/schema";

// ---------------------------------------------------------------------------
// Summary shape (getDailyStates)
// ---------------------------------------------------------------------------

export interface DailyStateSummary {
  total: number;
  scheduled: number;
  notScheduled: number;
  conflicts: number;
  ready: number;
  blocked: number;
  needsReview: number;
  /** Total number of action items across all rows. */
  actionItems: number;
  /** Distinct employee ids that have at least one action item. */
  employeesAffected: number;
}

// ---------------------------------------------------------------------------
// Dual-lookup helper (mirrors scheduling.ts pattern)
// ---------------------------------------------------------------------------

function resolveEmployee<E extends { id: number; userId: number | null }>(
  rawId: number,
  byId: Map<number, E>,
  byUserId: Map<number, E>
): E | undefined {
  return byId.get(rawId) ?? byUserId.get(rawId);
}

// ---------------------------------------------------------------------------
// Internal data loader — shared by getDailyStates and getDailyDigest
// ---------------------------------------------------------------------------

/**
 * Load all data for one Muscat calendar date and build per-employee
 * DailyAttendanceState rows.  Returns the rows, an isHoliday flag, and a
 * site-name map (used by getDailyDigest for site breakdown labels).
 *
 * This is the single source of truth for the 9-query parallel load;
 * both getDailyStates and getDailyDigest delegate to it to avoid
 * duplicating the DB fan-out.
 */
async function loadDailyRows(
  db: Awaited<ReturnType<typeof requireDb>>,
  cid: number,
  date: string,
  filters: { employeeId?: number; siteId?: number }
): Promise<{
  rows: DailyAttendanceState[];
  isHoliday: boolean;
  siteNames: Map<number, string>;
}> {
  // Day-of-week (0 = Sunday … 6 = Saturday)
  const dow = new Date(date + "T12:00:00").getDay();
  const { startUtc: dayStart, endExclusiveUtc: dayEnd } =
    muscatDayUtcRangeExclusiveEnd(date);

  // ── Parallel data loading ─────────────────────────────────────────────────

  const [
    empRows,
    holidayRows,
    allScheduleRows,
    dayRecords,
    openSessions,
    legacyRows,
    approvedLeaves,
    pendingCorrections,
    pendingManualReqs,
  ] = await Promise.all([

    // Employees (active and on-leave; terminated/resigned excluded)
    db
      .select({
        id: employees.id,
        userId: employees.userId,
        firstName: employees.firstName,
        lastName: employees.lastName,
        status: employees.status,
      })
      .from(employees)
      .where(
        and(
          eq(employees.companyId, cid),
          inArray(employees.status, ["active", "on_leave"])
        )
      ),

    // Holiday for the date
    db
      .select({ holidayDate: companyHolidays.holidayDate })
      .from(companyHolidays)
      .where(
        and(
          eq(companyHolidays.companyId, cid),
          eq(companyHolidays.holidayDate, date)
        )
      ),

    // Active schedules whose date range covers this date
    db
      .select({
        id: employeeSchedules.id,
        employeeUserId: employeeSchedules.employeeUserId,
        shiftTemplateId: employeeSchedules.shiftTemplateId,
        siteId: employeeSchedules.siteId,
        workingDays: employeeSchedules.workingDays,
      })
      .from(employeeSchedules)
      .where(
        and(
          eq(employeeSchedules.companyId, cid),
          eq(employeeSchedules.isActive, true),
          lte(employeeSchedules.startDate, date),
          or(isNull(employeeSchedules.endDate), gte(employeeSchedules.endDate, date))
        )
      ),

    // Attendance records for the Muscat day UTC window
    db
      .select({
        id: attendanceRecords.id,
        employeeId: attendanceRecords.employeeId,
        siteId: attendanceRecords.siteId,
        checkIn: attendanceRecords.checkIn,
        checkOut: attendanceRecords.checkOut,
      })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.companyId, cid),
          gte(attendanceRecords.checkIn, dayStart),
          lt(attendanceRecords.checkIn, dayEnd)
        )
      ),

    // Open attendance sessions for the business date
    db
      .select({ employeeId: attendanceSessions.employeeId })
      .from(attendanceSessions)
      .where(
        and(
          eq(attendanceSessions.companyId, cid),
          eq(attendanceSessions.businessDate, date),
          eq(attendanceSessions.status, "open")
        )
      ),

    // Legacy HR attendance rows for the date (official records)
    db
      .select({ employeeId: attendance.employeeId })
      .from(attendance)
      .where(
        and(
          eq(attendance.companyId, cid),
          gte(attendance.date, dayStart),
          lt(attendance.date, dayEnd)
        )
      ),

    // Approved leave requests overlapping this date
    db
      .select({ employeeId: leaveRequests.employeeId })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.companyId, cid),
          eq(leaveRequests.status, "approved"),
          lte(leaveRequests.startDate, dayEnd),
          gte(leaveRequests.endDate, dayStart)
        )
      ),

    // Pending correction requests for the date
    db
      .select({ employeeId: attendanceCorrections.employeeId })
      .from(attendanceCorrections)
      .where(
        and(
          eq(attendanceCorrections.companyId, cid),
          eq(attendanceCorrections.requestedDate, date),
          eq(attendanceCorrections.status, "pending")
        )
      ),

    // Pending manual check-in requests for the date
    db
      .select({ employeeUserId: manualCheckinRequests.employeeUserId })
      .from(manualCheckinRequests)
      .where(
        and(
          eq(manualCheckinRequests.companyId, cid),
          eq(manualCheckinRequests.status, "pending"),
          eq(manualCheckinRequests.requestedBusinessDate, date)
        )
      ),
  ]);

  // ── Build lookup maps ──────────────────────────────────────────────────────

  const isHoliday = holidayRows.length > 0;

  const empById = new Map(empRows.map((e) => [e.id, e]));
  const empByUserId = new Map(
    empRows.filter((e) => e.userId != null).map((e) => [e.userId as number, e])
  );

  // Batch-load shift templates and sites referenced by today's schedules
  const schedulesDowFiltered = allScheduleRows.filter((s) =>
    s.workingDays.split(",").map(Number).includes(dow)
  );

  const referencedShiftIds = [...new Set(schedulesDowFiltered.map((s) => s.shiftTemplateId))];
  const referencedSiteIds = [...new Set(schedulesDowFiltered.map((s) => s.siteId))];

  const [shiftRows, siteRows] = await Promise.all([
    referencedShiftIds.length > 0
      ? db
          .select({
            id: shiftTemplates.id,
            startTime: shiftTemplates.startTime,
            endTime: shiftTemplates.endTime,
            gracePeriodMinutes: shiftTemplates.gracePeriodMinutes,
          })
          .from(shiftTemplates)
          .where(inArray(shiftTemplates.id, referencedShiftIds))
      : Promise.resolve([] as { id: number; startTime: string; endTime: string; gracePeriodMinutes: number }[]),

    // Include name for digest siteBreakdown labels; getDailyStates ignores it.
    referencedSiteIds.length > 0
      ? db
          .select({ id: attendanceSites.id, name: attendanceSites.name })
          .from(attendanceSites)
          .where(
            and(
              inArray(attendanceSites.id, referencedSiteIds),
              eq(attendanceSites.isActive, true)
            )
          )
      : Promise.resolve([] as { id: number; name: string }[]),
  ]);

  const shiftById = new Map(shiftRows.map((s) => [s.id, s]));
  const activeSiteIds = new Set(siteRows.map((s) => s.id));
  // Site name map — used by getDailyDigest; ignored by getDailyStates.
  const siteNames = new Map(siteRows.map((s) => [s.id, s.name]));

  // Per-employee sets for O(1) lookups
  const empIdsWithOpenSession = new Set(openSessions.map((s) => s.employeeId));
  const empIdsWithLegacyRecord = new Set(legacyRows.map((r) => r.employeeId));
  const empIdsOnLeave = new Set(approvedLeaves.map((l) => l.employeeId));
  const empIdsWithPendingCorrection = new Set(pendingCorrections.map((c) => c.employeeId));

  // Manual check-in requests use employee_user_id (login userId), need dual-lookup
  const empIdsWithPendingManual = new Set<number>();
  for (const req of pendingManualReqs) {
    const emp = resolveEmployee(req.employeeUserId, empById, empByUserId);
    if (emp) empIdsWithPendingManual.add(emp.id);
  }

  // Records keyed by employeeId (pick earliest check-in for the day)
  const recordsByEmpId = new Map<number, { id: number; checkIn: Date; checkOut: Date | null }>();
  for (const r of dayRecords) {
    const existing = recordsByEmpId.get(r.employeeId);
    const checkIn = new Date(r.checkIn);
    if (!existing || checkIn < existing.checkIn) {
      recordsByEmpId.set(r.employeeId, {
        id: r.id,
        checkIn,
        checkOut: r.checkOut ? new Date(r.checkOut) : null,
      });
    }
  }

  // Schedules grouped by employeeUserId (raw ID — dual-lookup required)
  const schedulesByEmpRawId = new Map<number, typeof schedulesDowFiltered>();
  for (const s of schedulesDowFiltered) {
    const arr = schedulesByEmpRawId.get(s.employeeUserId) ?? [];
    arr.push(s);
    schedulesByEmpRawId.set(s.employeeUserId, arr);
  }

  // ── Build per-employee DailyAttendanceState ────────────────────────────────

  const now = new Date();
  const rows: DailyAttendanceState[] = [];

  for (const emp of empRows) {
    // Optional filters
    if (filters.employeeId != null && emp.id !== filters.employeeId) continue;

    // Resolve schedules for this employee via dual-lookup
    const rawSchedules =
      schedulesByEmpRawId.get(emp.id) ??
      (emp.userId != null ? schedulesByEmpRawId.get(emp.userId) ?? [] : []);

    // Optional site filter: only include employees whose schedule references this site
    if (filters.siteId != null) {
      const hasSite = rawSchedules.some((s) => s.siteId === filters.siteId);
      if (!hasSite) continue;
    }

    // Build resolved schedule entries with joined shift + site data
    const activeSchedules: ResolvedScheduleEntry[] = rawSchedules.map((s) => {
      const shift = shiftById.get(s.shiftTemplateId);
      return {
        id: s.id,
        shiftTemplateId: s.shiftTemplateId,
        siteId: s.siteId,
        shiftStartTime: shift?.startTime ?? null,
        shiftEndTime: shift?.endTime ?? null,
        gracePeriodMinutes: shift?.gracePeriodMinutes ?? 15,
        siteExists: s.siteId != null && activeSiteIds.has(s.siteId),
      };
    });

    const empRec = recordsByEmpId.get(emp.id);
    const empName = `${emp.firstName} ${emp.lastName}`.trim();
    const isActive = emp.status === "active" || emp.status === "on_leave";

    const state = buildDailyAttendanceState({
      companyId: cid,
      employeeId: emp.id,
      employeeName: empName,
      attendanceDate: date,
      now,
      activeSchedules,
      checkInAt: empRec?.checkIn ?? null,
      checkOutAt: empRec?.checkOut ?? null,
      hasOpenSession: empIdsWithOpenSession.has(emp.id),
      hasOfficialRecord: empIdsWithLegacyRecord.has(emp.id),
      isHoliday,
      isOnLeave: empIdsOnLeave.has(emp.id),
      hasPendingCorrection: empIdsWithPendingCorrection.has(emp.id),
      hasPendingManualCheckin: empIdsWithPendingManual.has(emp.id),
      employeeActive: isActive,
      attendanceRecordId: empRec?.id ?? null,
    });

    rows.push(state);
  }

  return { rows, isHoliday, siteNames };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const dailyStateRouter = router({
  /**
   * getDailyStates — fetch the resolved daily attendance state for all (or one)
   * employee(s) on a given Muscat calendar date.
   *
   * Input:
   *   date        YYYY-MM-DD  Muscat calendar date to evaluate
   *   employeeId  optional    restrict to a single employee (by employees.id)
   *   siteId      optional    restrict to employees whose schedule is for this site
   */
  getDailyStates: protectedProcedure
    .input(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
        employeeId: z.number().int().positive().optional(),
        siteId: z.number().int().positive().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const auth = await requireAdminOrHR(ctx.user as User);
      const db = await requireDb();
      const cid = auth.companyId;

      const { rows, isHoliday } = await loadDailyRows(db, cid, input.date, {
        employeeId: input.employeeId,
        siteId: input.siteId,
      });

      // ── Aggregate summary ────────────────────────────────────────────────────

      let scheduledCount = 0;
      let notScheduledCount = 0;
      let conflictCount = 0;
      let readyCount = 0;
      let blockedCount = 0;
      let needsReviewCount = 0;
      let totalActionItems = 0;
      const affectedEmpIds = new Set<number>();

      for (const row of rows) {
        if (row.scheduleState === "scheduled" || row.scheduleState === "missing_shift" || row.scheduleState === "missing_site") {
          scheduledCount++;
        } else if (row.scheduleState === "not_scheduled") {
          notScheduledCount++;
        } else if (row.scheduleState === "conflict") {
          conflictCount++;
        }

        if (row.payrollReadiness === "ready" || row.payrollReadiness === "excluded") {
          readyCount++;
        } else if (row.payrollReadiness.startsWith("blocked_")) {
          blockedCount++;
        } else if (row.payrollReadiness === "needs_review") {
          needsReviewCount++;
        }

        totalActionItems += row.actionItems.length;
        if (row.actionItems.length > 0) {
          affectedEmpIds.add(row.employeeId);
        }
      }

      const summary: DailyStateSummary = {
        total: rows.length,
        scheduled: scheduledCount,
        notScheduled: notScheduledCount,
        conflicts: conflictCount,
        ready: readyCount,
        blocked: blockedCount,
        needsReview: needsReviewCount,
        actionItems: totalActionItems,
        employeesAffected: affectedEmpIds.size,
      };

      return { date: input.date, isHoliday, rows, summary };
    }),

  /**
   * getDailyDigest — return a compact attendance health summary for a date.
   *
   * Designed for admin dashboards and as the foundation for future notification
   * delivery (email / push / WhatsApp).  Reuses loadDailyRows() so the DB
   * fan-out is identical to getDailyStates — no extra queries.
   *
   * Input:
   *   date    YYYY-MM-DD  Muscat calendar date
   *   siteId  optional    restrict to one site (same semantics as getDailyStates)
   *
   * Capability: canViewAttendanceBoard (gated via requireAdminOrHR — all
   * company_admin and hr_admin roles have this capability).
   *
   * Future notification delivery:
   *   Pass the returned AttendanceDailyDigest to server/_core/notification.ts
   *   notifyOwner() or a future WhatsApp / email adapter.  The headlineKey,
   *   summaryLineKey, and topIssues fields are designed for concise payloads.
   */
  getDailyDigest: protectedProcedure
    .input(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
        siteId: z.number().int().positive().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const auth = await requireAdminOrHR(ctx.user as User);
      const db = await requireDb();
      const cid = auth.companyId;

      const { rows, siteNames } = await loadDailyRows(db, cid, input.date, {
        siteId: input.siteId,
      });

      const siteName =
        input.siteId != null ? (siteNames.get(input.siteId) ?? null) : null;

      return buildAttendanceDailyDigest(rows, {
        date: input.date,
        siteId: input.siteId != null ? String(input.siteId) : null,
        siteName,
        siteNameMap: siteNames,
      });
    }),

  /**
   * getDailyStatesForRange — fetch resolved daily attendance states for a date
   * range (up to 31 days), enriched with client approval status from
   * attendance_client_approval_items.
   *
   * Approval matching: companyId + employeeId + attendanceDate.
   * When multiple approval items exist for the same employee+date (across
   * different batches), the item with the highest id (most recently created)
   * wins.
   *
   * Limitation: approval status reflects the latest batch only. Items from
   * cancelled or superseded batches are included if no newer item exists.
   * Full site/client scoping can be added in UX-3C once batch-level site
   * tagging is more consistently populated.
   */
  getDailyStatesForRange: protectedProcedure
    .input(
      z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
        siteId: z.number().int().positive().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const auth = await requireAdminOrHR(ctx.user as User);
      const db = await requireDb();
      const cid = auth.companyId;

      // Validate range
      const startMs = new Date(input.startDate + "T12:00:00Z").getTime();
      const endMs = new Date(input.endDate + "T12:00:00Z").getTime();
      if (endMs < startMs) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "endDate must be on or after startDate",
        });
      }
      const diffDays = Math.round((endMs - startMs) / 86_400_000);
      if (diffDays > 30) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Date range cannot exceed 31 days",
        });
      }

      // Build ordered date list
      const dateList: string[] = [];
      const cur = new Date(input.startDate + "T12:00:00Z");
      const endBound = new Date(input.endDate + "T12:00:00Z");
      while (cur <= endBound) {
        dateList.push(cur.toISOString().slice(0, 10));
        cur.setUTCDate(cur.getUTCDate() + 1);
      }

      // Load rows in chunks of 7 to bound DB concurrency
      const CHUNK = 7;
      const allRows: DailyAttendanceState[] = [];
      for (let i = 0; i < dateList.length; i += CHUNK) {
        const chunk = dateList.slice(i, i + CHUNK);
        const results = await Promise.all(
          chunk.map((date) => loadDailyRows(db, cid, date, { siteId: input.siteId }))
        );
        for (const r of results) {
          allRows.push(...r.rows);
        }
      }

      // Fetch all approval items for the range in one query
      const approvalItems = await db
        .select({
          id: attendanceClientApprovalItems.id,
          employeeId: attendanceClientApprovalItems.employeeId,
          attendanceDate: attendanceClientApprovalItems.attendanceDate,
          status: attendanceClientApprovalItems.status,
          clientComment: attendanceClientApprovalItems.clientComment,
          batchId: attendanceClientApprovalItems.batchId,
        })
        .from(attendanceClientApprovalItems)
        .where(
          and(
            eq(attendanceClientApprovalItems.companyId, cid),
            gte(attendanceClientApprovalItems.attendanceDate, input.startDate),
            lte(attendanceClientApprovalItems.attendanceDate, input.endDate)
          )
        );

      // Latest item per employeeId:attendanceDate (highest id wins)
      const approvalMap = new Map<
        string,
        { status: string; clientComment: string | null; batchId: number; id: number }
      >();
      for (const item of approvalItems) {
        const key = `${item.employeeId}:${item.attendanceDate}`;
        const existing = approvalMap.get(key);
        if (!existing || item.id > existing.id) {
          approvalMap.set(key, {
            status: item.status,
            clientComment: item.clientComment ?? null,
            batchId: item.batchId,
            id: item.id,
          });
        }
      }

      // Enrich each row with approval data
      const enrichedRows = allRows.map((row) => {
        const key = `${row.employeeId}:${row.attendanceDate}`;
        const approval = approvalMap.get(key);
        return {
          ...row,
          clientApprovalStatus: (approval?.status ?? "not_submitted") as
            | "not_submitted"
            | "pending"
            | "approved"
            | "rejected"
            | "disputed",
          clientApprovalComment: approval?.clientComment ?? null,
          clientApprovalBatchId: approval?.batchId ?? null,
        };
      });

      return {
        startDate: input.startDate,
        endDate: input.endDate,
        rows: enrichedRows,
      };
    }),
});
