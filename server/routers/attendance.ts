import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and, desc, gte, like, lt, lte, isNull, ne, inArray, or, sql } from "drizzle-orm";
import {
  attendance,
  attendanceSites,
  attendanceRecords,
  attendanceSessions,
  attendanceCorrections,
  employees,
  manualCheckinRequests,
  attendanceAudit,
  attendanceOperationalIssues,
  shiftTemplates,
  employeeSchedules,
} from "../../drizzle/schema";
import { buildEmployeeDayShiftStatuses } from "@shared/employeeDayShiftStatus";
import { pickScheduleRowForNow } from "@shared/pickScheduleForAttendanceNow";
import { evaluateCheckoutOutcomeByShiftTimes } from "@shared/attendanceCheckoutPolicy";
import { createAttendanceRecordTx, getDb } from "../db";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { requireWorkspaceMembership } from "../_core/membership";
import { requireActiveCompanyId } from "../_core/tenant";
import { resolveVisibilityScope } from "../_core/policy";
import { deriveCapabilities } from "../_core/capabilities";
import type { User } from "../../drizzle/schema";
import { sitesRouter, SITE_TYPES, siteInputSchema } from "./attendance/sites.router";
import {
  haversineMetres,
  isWithinOperatingHours,
  normalizeCorrectionHms,
  requireAdminOrHR as _requireAdminOrHR,
} from "./attendance/helpers";
import {
  CheckInEligibilityReasonCode,
  evaluateSelfServiceCheckInEligibility,
  formatCheckInRejection,
} from "@shared/attendanceCheckInEligibility";
import {
  ATTENDANCE_AUDIT_ACTION,
  ATTENDANCE_AUDIT_ENTITY,
  ATTENDANCE_AUDIT_SOURCE,
  type AttendanceAuditActionType,
} from "@shared/attendanceAuditTaxonomy";
import { resolveEmployeeAttendanceDayContext } from "../resolveEmployeeAttendanceDayContext";
import { attendancePayloadJson, insertAttendanceAuditRow, logAttendanceAuditSafe } from "../attendanceAudit";
import {
  muscatCalendarYmdNow,
  muscatCalendarYmdFromUtcInstant,
  muscatCalendarWeekdaySun0,
  muscatDayUtcRangeExclusiveEnd,
  muscatWallDateTimeToUtc,
} from "@shared/attendanceMuscatTime";
import { operationalIssueKey, type OperationalIssueKind } from "@shared/attendanceOperationalIssueKeys";
import {
  resolveOperationalIssueForCorrectionTx,
  resolveOperationalIssueForManualTx,
} from "../attendanceOperationalIssueSync";
import {
  loadOperationalIssueHistoryBundle,
  loadOperationalIssueSummariesByKeys,
} from "../attendanceOperationalIssueQueries";
import {
  operationalIssueKindToIssueKeyLikePattern,
  OPERATIONAL_TRIAGE_AUDIT_ACTIONS,
  resolveOperationalAuditLensFilter,
} from "../attendanceAuditOperational";
import {
  linkAttendanceRecordToPromoterAssignment,
  type PromoterLinkageHint,
} from "../promoterAssignmentAttendanceLink";
import {
  allowMissingAttendanceSessionsTable,
  isAttendanceSessionsTableMissingError,
  logAttendanceSessionsStructured,
  syncAttendanceSessionsFromAttendanceRecordTx,
  throwAttendanceSessionsTableRequired,
} from "../attendanceSessionFromRecord";
import {
  evaluatePayrollPreflight,
  runAttendanceReconciliation,
} from "../attendanceReconciliation";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

// Alias imported helper so existing usages inside this file require no other changes.
const requireAdminOrHR = _requireAdminOrHR;

/** Capability-aware guard: replaces raw requireAdminOrHR with canApproveAttendance check. */
async function requireAttendanceAdmin(user: User, companyId?: number | null) {
  const result = await _requireAdminOrHR(user, companyId);
  const scope = await resolveVisibilityScope(user, result.companyId);
  const caps = deriveCapabilities(result.role, scope);
  if (!caps.canApproveAttendance)
    throw new TRPCError({ code: "FORBIDDEN", message: "Attendance management requires HR Admin or Company Admin" });
  return { ...result, caps };
}

// ── Dual-write helpers ────────────────────────────────────────────────────────
/**
 * Write a new open session row to `attendance_sessions` in parallel with the
 * existing `attendance_records` insert.
 *
 * - Missing table: **throws** unless `ALLOW_MISSING_ATTENDANCE_SESSIONS_TABLE` is set (migration hatch); then warn + `null` insertId.
 * - Any other failure: structured error log + **throw** so payroll cannot silently diverge.
 */
async function insertAttendanceSessionSafe(
  tx: Parameters<Parameters<Awaited<ReturnType<typeof requireDb>>["transaction"]>[0]>[0],
  data: typeof attendanceSessions.$inferInsert,
): Promise<number | null> {
  try {
    const [result] = await tx.insert(attendanceSessions).values(data);
    return (result as { insertId?: number }).insertId ?? null;
  } catch (err: unknown) {
    if (isAttendanceSessionsTableMissingError(err)) {
      if (allowMissingAttendanceSessionsTable()) {
        logAttendanceSessionsStructured("warn", "insert_session_skipped_missing_table", {
          message: String((err as { message?: string })?.message ?? err),
        });
        return null;
      }
      logAttendanceSessionsStructured("error", "insert_session_blocked_missing_table", {
        message: String((err as { message?: string })?.message ?? err),
      });
      throwAttendanceSessionsTableRequired();
    }
    logAttendanceSessionsStructured("error", "insert_session_failed", {
      message: String((err as { message?: string })?.message ?? err),
    });
    throw err;
  }
}

/**
 * Close the session row linked to `sourceRecordId` (set status='closed',
 * check_out_at, geo).
 *
 * - Missing table: **throws** unless `ALLOW_MISSING_ATTENDANCE_SESSIONS_TABLE` is set (migration hatch).
 * - Other errors: **throw** so check-out cannot commit without a matching session close when the table exists.
 */
async function closeAttendanceSessionSafe(
  tx: Parameters<Parameters<Awaited<ReturnType<typeof requireDb>>["transaction"]>[0]>[0],
  opts: {
    sourceRecordId: number;
    checkOutAt: Date;
    checkOutLat?: string | null;
    checkOutLng?: string | null;
  },
): Promise<void> {
  try {
    await tx
      .update(attendanceSessions)
      .set({
        status: "closed",
        checkOutAt: opts.checkOutAt,
        checkOutLat: opts.checkOutLat ?? null,
        checkOutLng: opts.checkOutLng ?? null,
      })
      .where(eq(attendanceSessions.sourceRecordId, opts.sourceRecordId));
  } catch (err: unknown) {
    if (isAttendanceSessionsTableMissingError(err)) {
      if (allowMissingAttendanceSessionsTable()) {
        logAttendanceSessionsStructured("warn", "close_session_skipped_missing_table", {
          sourceRecordId: opts.sourceRecordId,
          message: String((err as { message?: string })?.message ?? err),
        });
        return;
      }
      logAttendanceSessionsStructured("error", "close_session_blocked_missing_table", {
        sourceRecordId: opts.sourceRecordId,
        message: String((err as { message?: string })?.message ?? err),
      });
      throwAttendanceSessionsTableRequired();
    }
    logAttendanceSessionsStructured("error", "close_session_failed", {
      sourceRecordId: opts.sourceRecordId,
      message: String((err as { message?: string })?.message ?? err),
    });
    throw err;
  }
}

type LegacyAttendanceTx = Parameters<Parameters<Awaited<ReturnType<typeof requireDb>>["transaction"]>[0]>[0];

/**
 * Sync clock row → legacy `attendance` table (`hr.listAttendance` / HR Records grid).
 * Mirrors {@link approveCorrection} legacy block; failures are non-fatal for the caller.
 */
async function syncCheckoutToLegacyAttendanceTx(
  tx: LegacyAttendanceTx,
  params: {
    companyId: number;
    employeeId: number;
    clockRecordId: number;
    checkIn: Date;
    checkOut: Date | null;
    businessDateYmd: string;
  },
): Promise<void> {
  try {
    const { startUtc: legDayStart, endExclusiveUtc: legDayEnd } = muscatDayUtcRangeExclusiveEnd(
      params.businessDateYmd,
    );
    const [legacyRow] = await tx
      .select()
      .from(attendance)
      .where(
        and(
          eq(attendance.employeeId, params.employeeId),
          eq(attendance.companyId, params.companyId),
          gte(attendance.date, legDayStart),
          lt(attendance.date, legDayEnd),
        ),
      )
      .limit(1);
    const legacyNote = `QR clock record #${params.clockRecordId}`;
    const baseSet = {
      checkIn: params.checkIn,
      status: "present" as const,
      ...(params.checkOut != null ? { checkOut: params.checkOut } : {}),
    };
    if (legacyRow) {
      await tx
        .update(attendance)
        .set({
          ...baseSet,
          notes: legacyRow.notes ? `${legacyRow.notes} · ${legacyNote}` : legacyNote,
        })
        .where(eq(attendance.id, legacyRow.id));
    } else {
      await createAttendanceRecordTx(tx, {
        companyId: params.companyId,
        employeeId: params.employeeId,
        date: muscatWallDateTimeToUtc(params.businessDateYmd, "12:00:00"),
        checkIn: params.checkIn,
        checkOut: params.checkOut ?? undefined,
        status: "present",
        notes: legacyNote,
      });
    }
  } catch (syncErr) {
    console.error("[hr-sync] Failed to sync checkout to legacy attendance table:", syncErr);
  }
}

/**
 * Infer which `employee_schedules.id` a given timestamp belongs to, so manually-approved
 * attendance records get the same explicit shift attribution as self-service check-ins.
 *
 * Uses `pickScheduleRowForNow` at `requestedAt` against all active schedules on that day —
 * the same logic used by the self-service check-in gate.  Returns `null` when no working
 * schedule is found (holiday, off-day, no schedule) so the record stays unattributed.
 */
async function inferScheduleIdForTimestamp(
  db: Awaited<ReturnType<typeof requireDb>>,
  opts: { companyId: number; employeeUserId: number; requestedAt: Date }
): Promise<number | null> {
  const { companyId, employeeUserId, requestedAt } = opts;
  const businessDate = muscatCalendarYmdFromUtcInstant(requestedAt);
  const dow = muscatCalendarWeekdaySun0(muscatWallDateTimeToUtc(businessDate, "12:00:00"));

  const schedules = await db
    .select()
    .from(employeeSchedules)
    .where(
      and(
        eq(employeeSchedules.companyId, companyId),
        eq(employeeSchedules.employeeUserId, employeeUserId),
        eq(employeeSchedules.isActive, true),
        lte(employeeSchedules.startDate, businessDate),
        or(isNull(employeeSchedules.endDate), gte(employeeSchedules.endDate, businessDate))
      )
    );

  if (schedules.length === 0) return null;

  const templateIds = [...new Set(schedules.map((s) => s.shiftTemplateId))];
  const shiftRows =
    templateIds.length > 0
      ? await db.select().from(shiftTemplates).where(inArray(shiftTemplates.id, templateIds))
      : [];
  const shiftById = new Map(shiftRows.map((st) => [st.id, st]));

  const picked = pickScheduleRowForNow({
    now: requestedAt,
    businessDate,
    dow,
    isHoliday: false,
    scheduleRows: schedules,
    getShift: (tid) => shiftById.get(tid),
  });

  return picked?.id ?? null;
}

/** DB stores `HH:MM:SS`; API may send `HH:MM` — normalize for {@link muscatWallDateTimeToUtc}. */
// normalizeCorrectionHms is imported from ./attendance/helpers

async function resolveMyEmployee(userId: number, userEmail: string, companyId: number) {
  const db = await getDb();
  if (!db) return null;
  const [byUserId] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.userId, userId)))
    .limit(1);
  if (byUserId) return byUserId;
  if (userEmail) {
    const [byEmail] = await db
      .select()
      .from(employees)
      .where(and(eq(employees.companyId, companyId), eq(employees.email, userEmail)))
      .limit(1);
    return byEmail ?? null;
  }
  return null;
}

// haversineMetres, isWithinOperatingHours imported from ./attendance/helpers
// SITE_TYPES, siteInputSchema imported from ./attendance/sites.router

export const attendanceRouter = router({
  // ─── Sites sub-module ─────────────────────────────────────────────────────
  // Procedures: createSite · listSites · toggleSite · updateSite · getSiteByToken · siteTypes
  // Source: ./attendance/sites.router.ts
  ...sitesRouter._def.record,

  /**
   * Self-service clock (authoritative write path):
   * - Inserts one `attendance_records` row per check-in with `check_in` / `check_out` = **actual action time**
   *   (UTC in DB; UI shows Asia/Muscat).
   * - `businessDate` for eligibility is the **Muscat calendar date** so midnight near UTC does not split a Muscat day.
   * - Multi-shift days: after checkout, a new row is created on the next scan; board / hints map rows onto shift
   *   windows via overlap + check-in anchor (`assignAttendanceRecordsToShifts`).
   * - `siteId` / geo are stored for the scanning site (future client/site attestation can extend payloads without
   *   replacing this path). HR corrections and audit rows reference the same record ids.
   */
  // ─── Employee: Check in via QR scan ──────────────────────────────────────
  checkIn: protectedProcedure
    .input(z.object({
      siteToken: z.string(),
      lat: z.number().optional(),
      lng: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      // Resolve site
      const [site] = await db
        .select()
        .from(attendanceSites)
        .where(and(eq(attendanceSites.qrToken, input.siteToken), eq(attendanceSites.isActive, true)))
        .limit(1);
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "Invalid or inactive QR code" });

      // ── Geo-fence enforcement ──────────────────────────────────────────────
      if (site.enforceGeofence && site.lat && site.lng) {
        if (input.lat == null || input.lng == null) {
          const wire = formatCheckInRejection(
            CheckInEligibilityReasonCode.LOCATION_REQUIRED_FOR_SITE,
            "Location access is required to check in at this site. Please allow location access in your browser.",
          );
          await logAttendanceAuditSafe({
            companyId: site.companyId,
            actorUserId: ctx.user.id,
            actionType: ATTENDANCE_AUDIT_ACTION.SELF_CHECKIN_DENIED,
            entityType: ATTENDANCE_AUDIT_ENTITY.SELF_CHECKIN_ATTEMPT,
            entityId: site.id,
            afterPayload:
              attendancePayloadJson({
                outcome: "denied",
                reasonCode: CheckInEligibilityReasonCode.LOCATION_REQUIRED_FOR_SITE,
                wireMessage: wire,
                policyPath: "site_geofence",
                siteId: site.id,
              }) ?? undefined,
            reason: wire,
            source: ATTENDANCE_AUDIT_SOURCE.EMPLOYEE_PORTAL,
          });
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: wire,
          });
        }
        const distance = haversineMetres(
          parseFloat(site.lat),
          parseFloat(site.lng),
          input.lat,
          input.lng
        );
        if (distance > site.radiusMeters) {
          const wire = formatCheckInRejection(
            CheckInEligibilityReasonCode.SITE_GEOFENCE_VIOLATION,
            `You are ${Math.round(distance)}m away from ${site.name}. You must be within ${site.radiusMeters}m to check in.`,
          );
          await logAttendanceAuditSafe({
            companyId: site.companyId,
            actorUserId: ctx.user.id,
            actionType: ATTENDANCE_AUDIT_ACTION.SELF_CHECKIN_DENIED,
            entityType: ATTENDANCE_AUDIT_ENTITY.SELF_CHECKIN_ATTEMPT,
            entityId: site.id,
            afterPayload:
              attendancePayloadJson({
                outcome: "denied",
                reasonCode: CheckInEligibilityReasonCode.SITE_GEOFENCE_VIOLATION,
                wireMessage: wire,
                policyPath: "site_geofence",
                siteId: site.id,
                distanceMeters: Math.round(distance),
                radiusMeters: site.radiusMeters,
                lat: input.lat,
                lng: input.lng,
              }) ?? undefined,
            reason: wire,
            source: ATTENDANCE_AUDIT_SOURCE.EMPLOYEE_PORTAL,
          });
          throw new TRPCError({
            code: "FORBIDDEN",
            message: wire,
          });
        }
      }

      // ── Operating hours enforcement ────────────────────────────────────────
      if (site.enforceHours) {
        const withinHours = isWithinOperatingHours(
          site.operatingHoursStart,
          site.operatingHoursEnd,
          site.timezone
        );
        if (!withinHours) {
          const wire = formatCheckInRejection(
            CheckInEligibilityReasonCode.SITE_OPERATING_HOURS_CLOSED,
            `Check-in is only allowed between ${site.operatingHoursStart} and ${site.operatingHoursEnd} (${site.timezone}).`,
          );
          await logAttendanceAuditSafe({
            companyId: site.companyId,
            actorUserId: ctx.user.id,
            actionType: ATTENDANCE_AUDIT_ACTION.SELF_CHECKIN_DENIED,
            entityType: ATTENDANCE_AUDIT_ENTITY.SELF_CHECKIN_ATTEMPT,
            entityId: site.id,
            afterPayload:
              attendancePayloadJson({
                outcome: "denied",
                reasonCode: CheckInEligibilityReasonCode.SITE_OPERATING_HOURS_CLOSED,
                wireMessage: wire,
                policyPath: "site_operating_hours",
                siteId: site.id,
                operatingHoursStart: site.operatingHoursStart,
                operatingHoursEnd: site.operatingHoursEnd,
                timezone: site.timezone,
              }) ?? undefined,
            reason: wire,
            source: ATTENDANCE_AUDIT_SOURCE.EMPLOYEE_PORTAL,
          });
          throw new TRPCError({
            code: "FORBIDDEN",
            message: wire,
          });
        }
      }

      // Resolve employee — site defines the company workspace (not arbitrary first membership)
      let memberRole: string;
      try {
        const wm = await requireWorkspaceMembership(ctx.user as User, site.companyId);
      const db = await requireDb();
        memberRole = wm.role;
      } catch (err) {
        await logAttendanceAuditSafe({
          companyId: site.companyId,
          actorUserId: ctx.user.id,
          actionType: ATTENDANCE_AUDIT_ACTION.SELF_CHECKIN_DENIED,
          entityType: ATTENDANCE_AUDIT_ENTITY.SELF_CHECKIN_ATTEMPT,
          entityId: site.id,
          afterPayload:
            attendancePayloadJson({
              outcome: "denied",
              reasonCode: "NOT_COMPANY_MEMBER",
              policyPath: "membership",
              siteId: site.id,
            }) ?? undefined,
          reason: "You are not a member of this company",
          source: ATTENDANCE_AUDIT_SOURCE.EMPLOYEE_PORTAL,
        });
        throw err;
      }
      const emp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", site.companyId);
      if (!emp) {
        await logAttendanceAuditSafe({
          companyId: site.companyId,
          actorUserId: ctx.user.id,
          actorRole: memberRole,
          actionType: ATTENDANCE_AUDIT_ACTION.SELF_CHECKIN_DENIED,
          entityType: ATTENDANCE_AUDIT_ENTITY.SELF_CHECKIN_ATTEMPT,
          entityId: site.id,
          afterPayload:
            attendancePayloadJson({
              outcome: "denied",
              reasonCode: "NO_EMPLOYEE_RECORD",
              policyPath: "employee_resolution",
              siteId: site.id,
            }) ?? undefined,
          reason: "Employee record not found. Please contact HR.",
          source: ATTENDANCE_AUDIT_SOURCE.EMPLOYEE_PORTAL,
        });
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee record not found. Please contact HR." });
      }

      const businessDate = muscatCalendarYmdNow();
      const dayCtx = await resolveEmployeeAttendanceDayContext(db, {
        companyId: site.companyId,
        userId: ctx.user.id,
        employeeId: emp.id,
        businessDate,
      });

      const gate = evaluateSelfServiceCheckInEligibility({
        now: new Date(),
        businessDate: dayCtx.businessDate,
        startTime: dayCtx.shiftStart,
        endTime: dayCtx.shiftEnd,
        gracePeriodMinutes: dayCtx.gracePeriodMinutes,
        isHoliday: !!dayCtx.holiday,
        isWorkingDay: dayCtx.isWorkingDay,
        hasSchedule: dayCtx.hasSchedule,
        hasShift: !!(dayCtx.shiftStart && dayCtx.shiftEnd),
        checkIn: dayCtx.checkIn,
        checkOut: dayCtx.checkOut,
        allShiftsHaveClosedAttendance: dayCtx.allShiftsHaveClosedAttendance,
        assignedSiteId: dayCtx.assignedSiteId,
        scannedSiteId: site.id,
      });

      if (!gate.canCheckIn) {
        const code = gate.reasonCode;
        const wire = formatCheckInRejection(code, gate.message);
        await logAttendanceAuditSafe({
          companyId: site.companyId,
          employeeId: emp.id,
          actorUserId: ctx.user.id,
          actorRole: memberRole,
          actionType: ATTENDANCE_AUDIT_ACTION.SELF_CHECKIN_DENIED,
          entityType: ATTENDANCE_AUDIT_ENTITY.SELF_CHECKIN_ATTEMPT,
          entityId: site.id,
          afterPayload:
            attendancePayloadJson({
              outcome: "denied",
              reasonCode: code,
              wireMessage: wire,
              policyPath: "eligibility_gate",
              siteId: site.id,
              businessDate: dayCtx.businessDate,
              assignedSiteId: dayCtx.assignedSiteId,
              scannedSiteId: site.id,
              checkInOpensAt: gate.checkInOpensAt,
            }) ?? undefined,
          reason: wire,
          source: ATTENDANCE_AUDIT_SOURCE.EMPLOYEE_PORTAL,
        });
        throw new TRPCError({
          code: code === CheckInEligibilityReasonCode.ALREADY_CHECKED_IN ? "CONFLICT" : "FORBIDDEN",
          message: wire,
        });
      }

      // Belt-and-suspenders: if the active shift already has a closed attendance record
      // (e.g. the employee checked out early and is trying to re-check-in), block explicitly.
      // This catches edge cases where evaluateSelfServiceCheckInEligibility's allShiftsHaveClosedAttendance
      // might be false for unrelated reasons (e.g. cross-midnight assignment not matched).
      if (dayCtx.shiftCheckIn && dayCtx.shiftCheckOut) {
        const fmtHm = (d: Date) =>
          d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Muscat", hour12: false });
        const wire = formatCheckInRejection(
          CheckInEligibilityReasonCode.DAY_ALREADY_RECORDED,
          `This shift already has a check-out recorded at ${fmtHm(new Date(dayCtx.shiftCheckOut))}. Use "Fix attendance" if this record is incorrect.`,
        );
        await logAttendanceAuditSafe({
          companyId: site.companyId,
          employeeId: emp.id,
          actorUserId: ctx.user.id,
          actorRole: memberRole,
          actionType: ATTENDANCE_AUDIT_ACTION.SELF_CHECKIN_DENIED,
          entityType: ATTENDANCE_AUDIT_ENTITY.SELF_CHECKIN_ATTEMPT,
          entityId: site.id,
          afterPayload:
            attendancePayloadJson({
              outcome: "denied",
              reasonCode: CheckInEligibilityReasonCode.DAY_ALREADY_RECORDED,
              wireMessage: wire,
              policyPath: "shift_already_recorded",
              siteId: site.id,
              businessDate: dayCtx.businessDate,
              shiftCheckIn: dayCtx.shiftCheckIn,
              shiftCheckOut: dayCtx.shiftCheckOut,
            }) ?? undefined,
          reason: wire,
          source: ATTENDANCE_AUDIT_SOURCE.EMPLOYEE_PORTAL,
        });
        throw new TRPCError({ code: "CONFLICT", message: wire });
      }

      // ── Schedule-specific open-session guard ────────────────────────────────
      // If the active shift already has an open (unchecked-out) record, block the
      // new check-in even if the company-wide guard below would somehow miss it.
      // This is the primary application-level enforcement; the DB constraint on
      // `open_session_key` (migration 0033) is the last-resort safety net.
      if (dayCtx.activeScheduleId != null) {
        const [shiftOpenSession] = await db
          .select({ id: attendanceRecords.id })
          .from(attendanceRecords)
          .where(and(
            eq(attendanceRecords.employeeId, emp.id),
            eq(attendanceRecords.companyId, site.companyId),
            eq(attendanceRecords.scheduleId, dayCtx.activeScheduleId),
            isNull(attendanceRecords.checkOut),
          ))
          .limit(1);
        if (shiftOpenSession) {
          const wire = formatCheckInRejection(
            CheckInEligibilityReasonCode.ALREADY_CHECKED_IN,
            "You already have an open session for this shift. Check out first, or use Fix attendance if the record is incorrect.",
          );
          await logAttendanceAuditSafe({
            companyId: site.companyId,
            employeeId: emp.id,
            actorUserId: ctx.user.id,
            actorRole: memberRole,
            actionType: ATTENDANCE_AUDIT_ACTION.SELF_CHECKIN_DENIED,
            entityType: ATTENDANCE_AUDIT_ENTITY.SELF_CHECKIN_ATTEMPT,
            entityId: site.id,
            afterPayload:
              attendancePayloadJson({
                outcome: "denied",
                reasonCode: CheckInEligibilityReasonCode.ALREADY_CHECKED_IN,
                wireMessage: wire,
                policyPath: "shift_open_session_enforcement",
                siteId: site.id,
                scheduleId: dayCtx.activeScheduleId,
                openAttendanceRecordId: shiftOpenSession.id,
              }) ?? undefined,
            reason: wire,
            source: ATTENDANCE_AUDIT_SOURCE.EMPLOYEE_PORTAL,
          });
          throw new TRPCError({ code: "CONFLICT", message: wire });
        }
      }

      // ── Company-wide open-session guard (belt-and-suspenders) ───────────────
      const [openSession] = await db
        .select({ id: attendanceRecords.id, checkIn: attendanceRecords.checkIn, checkOut: attendanceRecords.checkOut, siteId: attendanceRecords.siteId })
        .from(attendanceRecords)
        .where(and(
          eq(attendanceRecords.employeeId, emp.id),
          eq(attendanceRecords.companyId, site.companyId),
          isNull(attendanceRecords.checkOut),
        ))
        .orderBy(desc(attendanceRecords.checkIn))
        .limit(1);
      if (openSession) {
        const wire = formatCheckInRejection(
          CheckInEligibilityReasonCode.ALREADY_CHECKED_IN,
          "You already have an active check-in. Check out before starting a new session.",
        );
        await logAttendanceAuditSafe({
          companyId: site.companyId,
          employeeId: emp.id,
          actorUserId: ctx.user.id,
          actorRole: memberRole,
          actionType: ATTENDANCE_AUDIT_ACTION.SELF_CHECKIN_DENIED,
          entityType: ATTENDANCE_AUDIT_ENTITY.SELF_CHECKIN_ATTEMPT,
          entityId: site.id,
          afterPayload:
            attendancePayloadJson({
              outcome: "denied",
              reasonCode: CheckInEligibilityReasonCode.ALREADY_CHECKED_IN,
              wireMessage: wire,
              policyPath: "open_session_enforcement",
              siteId: site.id,
              openAttendanceRecordId: openSession.id,
            }) ?? undefined,
          reason: wire,
          source: ATTENDANCE_AUDIT_SOURCE.EMPLOYEE_PORTAL,
        });
        throw new TRPCError({
          code: "CONFLICT",
          message: wire,
        });
      }

      const checkInTime = new Date();
      let record: (typeof attendanceRecords.$inferSelect) | undefined;
      let promoterLinkageHint: PromoterLinkageHint = null;
      await db.transaction(async (tx) => {
        const [result] = await tx.insert(attendanceRecords).values({
          companyId: site.companyId,
          employeeId: emp.id,
          scheduleId: dayCtx.activeScheduleId ?? undefined,
          siteId: site.id,
          siteName: site.name,
          checkIn: checkInTime,
          checkInLat: input.lat ? String(input.lat) : null,
          checkInLng: input.lng ? String(input.lng) : null,
          method: "qr_scan",
        });
        const recordId = (result as { insertId?: number }).insertId;
        if (!recordId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Check-in insert failed" });
        // Explicit columns to avoid selecting schedule_id which may not yet be in the DB.
        const [r] = await tx
          .select({
            id: attendanceRecords.id,
            companyId: attendanceRecords.companyId,
            employeeId: attendanceRecords.employeeId,
            siteId: attendanceRecords.siteId,
            siteName: attendanceRecords.siteName,
            checkIn: attendanceRecords.checkIn,
            checkOut: attendanceRecords.checkOut,
            method: attendanceRecords.method,
            notes: attendanceRecords.notes,
            createdAt: attendanceRecords.createdAt,
          })
          .from(attendanceRecords).where(eq(attendanceRecords.id, recordId)).limit(1);
        record = r as typeof attendanceRecords.$inferSelect;

        // ── Dual-write: attendance_sessions (P1 session model) ─────────────
        await insertAttendanceSessionSafe(tx, {
          companyId: site.companyId,
          employeeId: emp.id,
          scheduleId: dayCtx.activeScheduleId ?? undefined,
          businessDate: dayCtx.businessDate,
          status: "open",
          checkInAt: checkInTime,
          siteId: site.id,
          siteName: site.name,
          method: "qr_scan",
          source: "employee_portal",
          checkInLat: input.lat ? String(input.lat) : null,
          checkInLng: input.lng ? String(input.lng) : null,
          sourceRecordId: recordId,
        });

        await insertAttendanceAuditRow(tx, {
          companyId: site.companyId,
          employeeId: emp.id,
          attendanceRecordId: recordId,
          actorUserId: ctx.user.id,
          actorRole: memberRole,
          actionType: ATTENDANCE_AUDIT_ACTION.SELF_CHECKIN_ALLOWED,
          entityType: ATTENDANCE_AUDIT_ENTITY.ATTENDANCE_RECORD,
          entityId: recordId,
          afterPayload:
            attendancePayloadJson({
              outcome: "allowed",
              siteId: site.id,
              siteName: site.name,
              method: "qr_scan",
              checkInLat: input.lat ?? null,
              checkInLng: input.lng ?? null,
              businessDate: dayCtx.businessDate,
              assignedSiteId: dayCtx.assignedSiteId,
            }) ?? undefined,
          source: ATTENDANCE_AUDIT_SOURCE.EMPLOYEE_PORTAL,
        });

        try {
          promoterLinkageHint = await linkAttendanceRecordToPromoterAssignment(tx, {
            attendanceRecordId: recordId,
            employeeId: emp.id,
            companyId: site.companyId,
            siteId: site.id,
            businessDateYmd: dayCtx.businessDate,
            actorUserId: ctx.user.id,
          });
        } catch (linkErr) {
          console.warn("[promoterAssignmentLink] QR check-in", linkErr);
        }
      });

      // ── Non-fatal: WhatsApp late alert ────────────────────────────────────────────
      try {
        if (dayCtx.shiftStart) {
          const { arrivalDelayMinutesAfterGrace } = await import("@shared/attendanceBoardStatus");
          const shiftStartUtc = muscatWallDateTimeToUtc(dayCtx.businessDate, dayCtx.shiftStart);
          const lateMin = arrivalDelayMinutesAfterGrace(
            checkInTime,
            shiftStartUtc,
            dayCtx.gracePeriodMinutes ?? 15,
          );
          if (lateMin > 0) {
            const { sendAttendanceLateAlert } = await import("../whatsappCloud");
            const managerPhone = process.env.ATTENDANCE_ALERT_MANAGER_PHONE ?? "";
            if (managerPhone) {
              void sendAttendanceLateAlert({
                managerPhone,
                employeeName: `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim(),
                siteName: site.name,
                minutesLate: lateMin,
              }).catch((e) => console.warn("[whatsapp] late alert failed:", e));
            }
          }
        }
      } catch {
        /* non-fatal */
      }

      return { record: record!, promoterLinkageHint };
    }),

  // ─── Admin: manually trigger the absent-marking job ──────────────────────────
  triggerAbsentMarkJob: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .mutation(async ({ ctx }) => {
      if (ctx.user.platformRole !== "super_admin" && ctx.user.platformRole !== "platform_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Platform admin required" });
      }
      const { runMarkMissedShiftsAbsent } = await import("../jobs/markMissedShiftsAbsent");
      return runMarkMissedShiftsAbsent();
    }),

  // ─── Employee: Check out ──────────────────────────────────────────────────
  checkOut: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      siteToken: z.string().optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
      /**
       * Free-text reason when checking out early (before the shift completion threshold).
       * Stored in the audit log; does NOT block the checkout.
       */
      earlyCheckoutReason: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await requireDb();
      const emp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", membership.companyId);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee record not found" });

      const [existing] = await db
        .select({ id: attendanceRecords.id, checkIn: attendanceRecords.checkIn, checkOut: attendanceRecords.checkOut, siteId: attendanceRecords.siteId })
        .from(attendanceRecords)
        .where(and(
          eq(attendanceRecords.employeeId, emp.id),
          eq(attendanceRecords.companyId, membership.companyId),
          isNull(attendanceRecords.checkOut),
        ))
        .orderBy(desc(attendanceRecords.checkIn))
        .limit(1);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No active check-in found for today" });
      }

      const checkOutTime = new Date();

      // Best-effort checkout policy evaluation — stored in audit; does not block checkout.
      let checkoutPolicyMeta: Record<string, unknown> | null = null;
      try {
        const dayCtx = await resolveEmployeeAttendanceDayContext(db, {
          companyId: membership.companyId,
          userId: ctx.user.id,
          employeeId: emp.id,
          businessDate: muscatCalendarYmdNow(),
        });
        if (dayCtx.shiftStart && dayCtx.shiftEnd) {
          const policy = evaluateCheckoutOutcomeByShiftTimes({
            checkIn: existing.checkIn,
            checkOut: checkOutTime,
            businessDate: dayCtx.businessDate,
            shiftStartTime: dayCtx.shiftStart,
            shiftEndTime: dayCtx.shiftEnd,
          });
          checkoutPolicyMeta = {
            outcome: policy.outcome,
            workedMinutes: policy.workedMinutes,
            shiftMinutes: policy.shiftMinutes,
            completionPercent: policy.completionPercent,
            earlyMinutes: policy.earlyMinutes,
            earlyCheckoutReason: input.earlyCheckoutReason ?? null,
          };
        }
      } catch {
        // Non-fatal — checkout proceeds regardless of policy evaluation failures.
      }

      let updated: { id: number; checkIn: Date; checkOut: Date | null; siteId: number | null } | undefined;
      await db.transaction(async (tx) => {
        await tx
          .update(attendanceRecords)
          .set({
            checkOut: checkOutTime,
            checkOutLat: input.lat ? String(input.lat) : null,
            checkOutLng: input.lng ? String(input.lng) : null,
          })
          .where(eq(attendanceRecords.id, existing.id));
        const [u] = await tx
          .select({ id: attendanceRecords.id, checkIn: attendanceRecords.checkIn, checkOut: attendanceRecords.checkOut, siteId: attendanceRecords.siteId })
          .from(attendanceRecords).where(eq(attendanceRecords.id, existing.id)).limit(1);
        updated = u;

        // ── Dual-write: close the matching attendance_sessions row ─────────
        await closeAttendanceSessionSafe(tx, {
          sourceRecordId: existing.id,
          checkOutAt: checkOutTime,
          checkOutLat: input.lat ? String(input.lat) : null,
          checkOutLng: input.lng ? String(input.lng) : null,
        });

        const checkoutBusinessDate = muscatCalendarYmdFromUtcInstant(checkOutTime);
        await syncCheckoutToLegacyAttendanceTx(tx, {
          companyId: membership.companyId,
          employeeId: emp.id,
          clockRecordId: existing.id,
          checkIn: existing.checkIn,
          checkOut: checkOutTime,
          businessDateYmd: checkoutBusinessDate,
        });

        await insertAttendanceAuditRow(tx, {
          companyId: membership.companyId,
          employeeId: emp.id,
          attendanceRecordId: existing.id,
          actorUserId: ctx.user.id,
          actorRole: membership.role,
          actionType: ATTENDANCE_AUDIT_ACTION.SELF_CHECKOUT,
          entityType: ATTENDANCE_AUDIT_ENTITY.ATTENDANCE_RECORD,
          entityId: existing.id,
          beforePayload: attendancePayloadJson(existing) ?? undefined,
          afterPayload:
            attendancePayloadJson({
              record: u,
              checkoutPolicy: checkoutPolicyMeta,
              clientMeta: {
                checkOutLat: input.lat ?? null,
                checkOutLng: input.lng ?? null,
                siteTokenPresent: input.siteToken != null,
              },
            }) ?? undefined,
          source: ATTENDANCE_AUDIT_SOURCE.EMPLOYEE_PORTAL,
        });
      });
      return updated!;
    }),

  // ─── Employee: Get today's attendance record ──────────────────────────────
  myToday: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
    const membership = await requireWorkspaceMembership(ctx.user as User, input.companyId);
    const db = await requireDb();
    const emp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", membership.companyId);
    if (!emp) return null;

    const [open] = await db
      .select()
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.employeeId, emp.id), isNull(attendanceRecords.checkOut)))
      .orderBy(desc(attendanceRecords.checkIn))
      .limit(1);
    if (open) return open;

    const businessDate = muscatCalendarYmdNow();
    const { startUtc: dayStart, endExclusiveUtc } = muscatDayUtcRangeExclusiveEnd(businessDate);
    const [record] = await db
      .select()
      .from(attendanceRecords)
      .where(and(
        eq(attendanceRecords.employeeId, emp.id),
        gte(attendanceRecords.checkIn, dayStart),
        lt(attendanceRecords.checkIn, endExclusiveUtc),
      ))
      .orderBy(desc(attendanceRecords.checkIn))
        .limit(1);
    return record ?? null;
  }),

  // ─── Employee: Get all today's shifts with per-shift attendance status ───
  /**
   * Returns every scheduled shift for the employee's Muscat calendar today,
   * with per-shift status derived from the same record-to-shift assignment used by the HR board.
   * Used by the employee portal to show a shift-level attendance list.
   */
  myTodayShifts: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const membership = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await requireDb();
      const emp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", membership.companyId);
      if (!emp) return null;

      const businessDate = muscatCalendarYmdNow();
      const now = new Date();
      const dow = muscatCalendarWeekdaySun0(muscatWallDateTimeToUtc(businessDate, "12:00:00"));

      // ── Load schedules (same dual-lookup as resolveEmployeeAttendanceDayContext) ──
      const querySchedules = (empUserId: number) =>
        db
          .select()
          .from(employeeSchedules)
          .where(
            and(
              eq(employeeSchedules.companyId, membership.companyId),
              eq(employeeSchedules.employeeUserId, empUserId),
              eq(employeeSchedules.isActive, true),
              lte(employeeSchedules.startDate, businessDate),
              or(isNull(employeeSchedules.endDate), gte(employeeSchedules.endDate, businessDate))
            )
          );

      let allMySchedules = await querySchedules(ctx.user.id);
      if (allMySchedules.length === 0) {
        allMySchedules = await querySchedules(emp.id);
      }

      const workingToday = allMySchedules.filter((s) =>
        s.workingDays.split(",").map(Number).includes(dow)
      );

      if (workingToday.length === 0) {
        return { businessDate, activeScheduleId: null, shifts: [] };
      }

      // ── Load shift templates ────────────────────────────────────────────────
      const templateIds = [...new Set(workingToday.map((s) => s.shiftTemplateId))];
      const shiftRows =
        templateIds.length > 0
          ? await db.select().from(shiftTemplates).where(inArray(shiftTemplates.id, templateIds))
          : [];
      const shiftById = new Map(shiftRows.map((st) => [st.id, st]));

      // ── Load sites ─────────────────────────────────────────────────────────
      const siteIds = [
        ...new Set(
          workingToday.map((s) => s.siteId).filter((id): id is number => id != null)
        ),
      ];
      const siteRows =
        siteIds.length > 0
          ? await db.select().from(attendanceSites).where(inArray(attendanceSites.id, siteIds))
          : [];
      const siteById = new Map(siteRows.map((s) => [s.id, s]));

      // ── Active schedule row (for isActiveShift flag) ───────────────────────
      const activeScheduleRow = pickScheduleRowForNow({
        now,
        businessDate,
        dow,
        isHoliday: false,
        scheduleRows: workingToday,
        getShift: (tid) => shiftById.get(tid),
      });

      // ── Today's attendance records ─────────────────────────────────────────
      const { startUtc: dayStart, endExclusiveUtc: dayEndExclusive } =
        muscatDayUtcRangeExclusiveEnd(businessDate);
      const dayRecords = await db
        .select({ id: attendanceRecords.id, siteId: attendanceRecords.siteId, checkIn: attendanceRecords.checkIn, checkOut: attendanceRecords.checkOut })
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.employeeId, emp.id),
            gte(attendanceRecords.checkIn, dayStart),
            lt(attendanceRecords.checkIn, dayEndExclusive)
          )
        );

      // ── Build per-shift input rows sorted by shift start ───────────────────
      const inputShifts = workingToday
        .slice()
        .sort((a, b) => {
          const stA = shiftById.get(a.shiftTemplateId);
          const stB = shiftById.get(b.shiftTemplateId);
          if (!stA || !stB) return 0;
          return stA.startTime.localeCompare(stB.startTime);
        })
        .map((s) => {
          const st = shiftById.get(s.shiftTemplateId);
          const site = s.siteId != null ? siteById.get(s.siteId) : undefined;
          return {
            scheduleId: s.id,
            shiftName: st?.name ?? null,
            shiftStart: st?.startTime ?? "09:00",
            shiftEnd: st?.endTime ?? "17:00",
            siteId: s.siteId ?? null,
            siteName: site?.name ?? null,
            siteToken: site?.qrToken ?? null,
            gracePeriodMinutes: st?.gracePeriodMinutes ?? 15,
          };
        });

      const statuses = buildEmployeeDayShiftStatuses({
        shifts: inputShifts,
        records: dayRecords.map((r) => ({
          id: r.id,
          siteId: r.siteId ?? null,
          checkIn: new Date(r.checkIn),
          checkOut: r.checkOut ? new Date(r.checkOut) : null,
        })),
        businessDate,
        nowMs: now.getTime(),
        employeeId: emp.id,
      });

      const activeScheduleId = activeScheduleRow?.id ?? null;

      return {
        businessDate,
        activeScheduleId,
        shifts: statuses.map((s) => ({
          ...s,
          isActiveShift: s.scheduleId === activeScheduleId,
        })),
      };
    }),

  // ─── Employee: Get attendance history ────────────────────────────────────
  myHistory: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      limit: z.number().min(1).max(100).default(30),
    }))
    .query(async ({ ctx, input }) => {
      const membership = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await requireDb();
      const emp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", membership.companyId);
      if (!emp) return [];
      return db
        .select()
        .from(attendanceRecords)
        .where(eq(attendanceRecords.employeeId, emp.id))
        .orderBy(desc(attendanceRecords.checkIn))
        .limit(input.limit);
    }),

  // ─── Admin: Live attendance board ─────────────────────────────────────────
  adminBoard: protectedProcedure
    .input(z.object({ companyId: z.number().optional(), date: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const membership = await requireAttendanceAdmin(ctx.user as User, input.companyId);
      const companyId = membership.company.id;
      const db = await requireDb();

      const businessDateYmd = input.date ?? muscatCalendarYmdNow();
      const { startUtc: dayStart, endExclusiveUtc: dayEndExclusive } =
        muscatDayUtcRangeExclusiveEnd(businessDateYmd);

      const rows = await db
        .select({
          record: attendanceRecords,
          employee: {
            id: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
            position: employees.position,
            department: employees.department,
            avatarUrl: employees.avatarUrl,
          },
        })
        .from(attendanceRecords)
        .innerJoin(employees, eq(attendanceRecords.employeeId, employees.id))
        .where(and(
          eq(attendanceRecords.companyId, companyId),
          gte(attendanceRecords.checkIn, dayStart),
          lt(attendanceRecords.checkIn, dayEndExclusive),
        ))
        .orderBy(desc(attendanceRecords.checkIn));

      const nowMs = Date.now();
      return rows.map(({ record, employee }) => {
        const cin = new Date(record.checkIn).getTime();
        const cout = record.checkOut ? new Date(record.checkOut).getTime() : null;
        const endMs = cout ?? nowMs;
        const durationMinutes = Math.max(0, Math.round((endMs - cin) / 60000));
        const methodLabel =
          record.method === "manual" ? "Manual request" : record.method === "admin" ? "Admin" : "QR / app";
        const hasCheckInGeo = !!(record.checkInLat && record.checkInLng);
        const hasCheckOutGeo = !!(record.checkOutLat && record.checkOutLng);
        return {
          record,
          employee,
          durationMinutes,
          methodLabel,
          hasCheckInGeo,
          hasCheckOutGeo,
        };
      });
    }),

  // ─── Admin: Get attendance history for a specific employee ────────────────
  employeeHistory: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      employeeId: z.number(),
      limit: z.number().min(1).max(100).default(30),
    }))
    .query(async ({ ctx, input }) => {
      const membership = await requireAttendanceAdmin(ctx.user as User, input.companyId);
      const db = await requireDb();
      return db
        .select()
        .from(attendanceRecords)
        .where(and(
          eq(attendanceRecords.companyId, membership.company.id),
          eq(attendanceRecords.employeeId, input.employeeId),
        ))
        .orderBy(desc(attendanceRecords.checkIn))
        .limit(input.limit);
    }),

  // ─── Manual Check-in Requests ──────────────────────────────────────────────
  /**
   * Employee submits a manual check-in request when outside the geo-fence or otherwise blocked from self-service check-in.
   * Requires a justification note. HR admin must approve for attendance to be recorded.
   *
   * Provide either `siteToken` (QR flow) or `companyId` + `siteId` (employee portal — site must match today’s schedule).
   */
  submitManualCheckIn: protectedProcedure
    .input(z.object({
      siteToken: z.string().optional(),
      companyId: z.number().optional(),
      siteId: z.number().optional(),
      justification: z.string().min(10, "Please provide at least 10 characters of justification"),
      lat: z.number().optional(),
      lng: z.number().optional(),
      distanceMeters: z.number().optional(),
      /**
       * Explicit shift intent — supplied by the employee portal shift selector.
       * When present on approval, used directly as `attendance_records.schedule_id`
       * instead of inferring from timestamp proximity.
       */
      requestedBusinessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      requestedScheduleId: z.number().int().positive().optional(),
    }).superRefine((data, ctx) => {
      const hasToken = !!data.siteToken?.trim();
      const hasPair = data.companyId != null && data.siteId != null;
      if (hasToken === hasPair) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Provide either siteToken or both companyId and siteId",
        });
      }
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();

      let site: typeof attendanceSites.$inferSelect;

      if (input.siteToken?.trim()) {
        const [s] = await db
          .select()
          .from(attendanceSites)
          .where(and(
            eq(attendanceSites.qrToken, input.siteToken.trim()),
            eq(attendanceSites.isActive, true),
          ))
          .limit(1);
        if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "Invalid or inactive site" });
        site = s;
      } else {
        const cid = input.companyId!;
        const sid = input.siteId!;
        const [s] = await db
          .select()
          .from(attendanceSites)
          .where(and(
            eq(attendanceSites.id, sid),
            eq(attendanceSites.companyId, cid),
            eq(attendanceSites.isActive, true),
          ))
          .limit(1);
        if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "Invalid or inactive site" });

        await requireWorkspaceMembership(ctx.user as User, cid);

        const emp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", cid);
        if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee record not found" });

        const businessDate = muscatCalendarYmdNow();
        const dayCtx = await resolveEmployeeAttendanceDayContext(db, {
          companyId: cid,
          userId: ctx.user.id,
          employeeId: emp.id,
          businessDate,
        });
        if (!dayCtx.scheduledSiteIdsToday.includes(s.id)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "That site does not match your schedule for today — contact HR if this is wrong.",
          });
        }
        site = s;
      }

      const membership = await requireWorkspaceMembership(ctx.user as User, site.companyId);

      // Check for duplicate pending request today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const [existing] = await db
        .select({ id: manualCheckinRequests.id })
        .from(manualCheckinRequests)
        .where(and(
          eq(manualCheckinRequests.employeeUserId, ctx.user.id),
          eq(manualCheckinRequests.siteId, site.id),
          eq(manualCheckinRequests.status, "pending"),
          gte(manualCheckinRequests.requestedAt, todayStart),
        ))
        .limit(1);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "You already have a pending manual check-in request for today" });

      const emp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", membership.companyId);
      let newReqId = 0;
      await db.transaction(async (tx) => {
        // Attempt to insert with new shift-intent columns; fall back without them if the
        // migration adding those columns has not yet been applied to this environment.
        let req: { id: number };
        try {
          [req] = await tx
            .insert(manualCheckinRequests)
            .values({
              companyId: membership.companyId,
              employeeUserId: ctx.user.id,
              siteId: site.id,
              requestedBusinessDate: input.requestedBusinessDate ?? undefined,
              requestedScheduleId: input.requestedScheduleId ?? undefined,
              justification: input.justification,
              lat: input.lat != null ? String(input.lat) : undefined,
              lng: input.lng != null ? String(input.lng) : undefined,
              distanceMeters: input.distanceMeters,
              status: "pending",
            })
            .$returningId();
        } catch (insertErr: any) {
          if (String(insertErr?.message ?? "").includes("Unknown column")) {
            [req] = await tx
              .insert(manualCheckinRequests)
              .values({
                companyId: membership.companyId,
                employeeUserId: ctx.user.id,
                siteId: site.id,
                justification: input.justification,
                lat: input.lat != null ? String(input.lat) : undefined,
                lng: input.lng != null ? String(input.lng) : undefined,
                distanceMeters: input.distanceMeters,
                status: "pending",
              })
              .$returningId();
          } else {
            throw insertErr;
          }
        }
        newReqId = req.id;
        await insertAttendanceAuditRow(tx, {
          companyId: membership.companyId,
          employeeId: emp?.id,
          manualCheckinRequestId: req.id,
          actorUserId: ctx.user.id,
          actorRole: membership.role,
          actionType: ATTENDANCE_AUDIT_ACTION.MANUAL_CHECKIN_SUBMIT,
          entityType: ATTENDANCE_AUDIT_ENTITY.MANUAL_CHECKIN_REQUEST,
          entityId: req.id,
          afterPayload:
            attendancePayloadJson({
              siteId: site.id,
              siteName: site.name,
              status: "pending",
              requestedBusinessDate: input.requestedBusinessDate ?? null,
              requestedScheduleId: input.requestedScheduleId ?? null,
              lat: input.lat ?? null,
              lng: input.lng ?? null,
              distanceMeters: input.distanceMeters ?? null,
            }) ?? undefined,
          reason: input.justification,
          source: ATTENDANCE_AUDIT_SOURCE.EMPLOYEE_PORTAL,
        });
      });

      return { id: newReqId, status: "pending" as const };
    }),

  /**
   * Admin: list all manual check-in requests for the company, optionally filtered by status.
   */
  listManualCheckIns: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      status: z.enum(["pending", "approved", "rejected", "all"]).default("pending"),
      siteId: z.number().optional(),
      limit: z.number().min(1).max(200).default(50),
    }))
    .query(async ({ ctx, input }) => {
      const membership = await requireAttendanceAdmin(ctx.user as User, input.companyId);
      const db = await requireDb();

      const conditions = [eq(manualCheckinRequests.companyId, membership.company.id)];
      if (input.status !== "all") conditions.push(eq(manualCheckinRequests.status, input.status));
      if (input.siteId) conditions.push(eq(manualCheckinRequests.siteId, input.siteId));

      const rows = await db
        .select({
          req: {
            id: manualCheckinRequests.id,
            companyId: manualCheckinRequests.companyId,
            employeeUserId: manualCheckinRequests.employeeUserId,
            siteId: manualCheckinRequests.siteId,
            requestedAt: manualCheckinRequests.requestedAt,
            requestedBusinessDate: manualCheckinRequests.requestedBusinessDate,
            requestedScheduleId: manualCheckinRequests.requestedScheduleId,
            justification: manualCheckinRequests.justification,
            lat: manualCheckinRequests.lat,
            lng: manualCheckinRequests.lng,
            distanceMeters: manualCheckinRequests.distanceMeters,
            status: manualCheckinRequests.status,
            reviewedByUserId: manualCheckinRequests.reviewedByUserId,
            reviewedAt: manualCheckinRequests.reviewedAt,
            adminNote: manualCheckinRequests.adminNote,
            attendanceRecordId: manualCheckinRequests.attendanceRecordId,
            createdAt: manualCheckinRequests.createdAt,
            updatedAt: manualCheckinRequests.updatedAt,
          },
          site: { id: attendanceSites.id, name: attendanceSites.name, siteType: attendanceSites.siteType, clientName: attendanceSites.clientName },
          employee: {
            id: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
            email: employees.email,
          },
        })
        .from(manualCheckinRequests)
        .leftJoin(attendanceSites, eq(manualCheckinRequests.siteId, attendanceSites.id))
        .leftJoin(
          employees,
          and(
            eq(employees.companyId, membership.company.id),
            eq(employees.userId, manualCheckinRequests.employeeUserId),
          ),
        )
        .where(and(...conditions))
        .orderBy(desc(manualCheckinRequests.requestedAt))
        .limit(input.limit);

      const manualKeys = rows.map((r) =>
        operationalIssueKey({ kind: "manual_pending", manualCheckinRequestId: r.req.id }),
      );
      const manualIssueByKey = await loadOperationalIssueSummariesByKeys(db, membership.company.id, manualKeys);
      return rows.map((row) => ({
        ...row,
        operationalIssue:
          manualIssueByKey.get(
            operationalIssueKey({ kind: "manual_pending", manualCheckinRequestId: row.req.id }),
          ) ?? null,
      }));
    }),

  /**
   * Admin: approve a manual check-in request.
   * Creates an attendance record for the employee.
   */
  approveManualCheckIn: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      requestId: z.number(),
      adminNote: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await requireAttendanceAdmin(ctx.user as User, input.companyId);
      const db = await requireDb();

      // Try full select first; fall back to base columns if migration is pending.
      let req: (typeof manualCheckinRequests.$inferSelect) | undefined;
      try {
        const [r] = await db
          .select()
          .from(manualCheckinRequests)
          .where(and(
            eq(manualCheckinRequests.id, input.requestId),
            eq(manualCheckinRequests.companyId, membership.company.id),
            eq(manualCheckinRequests.status, "pending"),
          ))
          .limit(1);
        req = r;
      } catch (selErr: any) {
        if (String(selErr?.message ?? "").includes("Unknown column")) {
          const [r] = await db
            .select({
              id: manualCheckinRequests.id,
              companyId: manualCheckinRequests.companyId,
              employeeUserId: manualCheckinRequests.employeeUserId,
              siteId: manualCheckinRequests.siteId,
              requestedAt: manualCheckinRequests.requestedAt,
              requestedBusinessDate: sql<string | null>`NULL`.as("requested_business_date"),
              requestedScheduleId: sql<number | null>`NULL`.as("requested_schedule_id"),
              justification: manualCheckinRequests.justification,
              lat: manualCheckinRequests.lat,
              lng: manualCheckinRequests.lng,
              distanceMeters: manualCheckinRequests.distanceMeters,
              status: manualCheckinRequests.status,
              reviewedByUserId: manualCheckinRequests.reviewedByUserId,
              reviewedAt: manualCheckinRequests.reviewedAt,
              adminNote: manualCheckinRequests.adminNote,
              attendanceRecordId: manualCheckinRequests.attendanceRecordId,
              createdAt: manualCheckinRequests.createdAt,
              updatedAt: manualCheckinRequests.updatedAt,
            })
            .from(manualCheckinRequests)
            .where(and(
              eq(manualCheckinRequests.id, input.requestId),
              eq(manualCheckinRequests.companyId, membership.company.id),
              eq(manualCheckinRequests.status, "pending"),
            ))
            .limit(1);
          req = r as typeof manualCheckinRequests.$inferSelect;
        } else {
          throw selErr;
        }
      }
      if (!req) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found or already reviewed" });

      const [empRow] = await db
        .select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.companyId, membership.company.id), eq(employees.userId, req.employeeUserId)))
        .limit(1);
      if (!empRow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No employee row linked to this user — cannot create attendance record",
        });
      }

      // Resolve shift attribution for the attendance record:
      // 1) If the employee explicitly selected a schedule row (shift selector in portal), use it directly.
      // 2) Otherwise fall back to timestamp inference so legacy requests are still attributed.
      const inferredScheduleId: number | null =
        req.requestedScheduleId != null
          ? req.requestedScheduleId
          : await inferScheduleIdForTimestamp(db, {
              companyId: membership.company.id,
              employeeUserId: req.employeeUserId,
              // Prefer the explicit business date if the employee provided it (more accurate for
              // late submissions where requestedAt is the submission time, not the shift time).
              requestedAt: req.requestedBusinessDate
                ? new Date(`${req.requestedBusinessDate}T12:00:00`)
                : req.requestedAt,
            });

      const approvedBusinessDate =
        req.requestedBusinessDate ??
        muscatCalendarYmdFromUtcInstant(req.requestedAt);

      let recordIdOut = 0;
      let promoterLinkageHint: PromoterLinkageHint = null;
      await db.transaction(async (tx) => {
        const [record] = await tx
          .insert(attendanceRecords)
          .values({
            companyId: membership.company.id,
            employeeId: empRow.id,
            scheduleId: inferredScheduleId ?? undefined,
            siteId: req.siteId,
            checkIn: req.requestedAt,
            checkInLat: req.lat ?? undefined,
            checkInLng: req.lng ?? undefined,
            method: "manual" as const,
            notes: `Manual check-in approved. Justification: ${req.justification}`,
          })
          .$returningId();
        recordIdOut = record.id;

        // ── Dual-write: attendance_sessions (admin approval → open session) ──
        await insertAttendanceSessionSafe(tx, {
          companyId: membership.company.id,
          employeeId: empRow.id,
          scheduleId: inferredScheduleId ?? undefined,
          businessDate: approvedBusinessDate,
          status: "open",
          checkInAt: req.requestedAt,
          siteId: req.siteId ?? undefined,
          method: "manual",
          source: "admin_panel",
          checkInLat: req.lat ?? undefined,
          checkInLng: req.lng ?? undefined,
          notes: `Manual check-in approved. Justification: ${req.justification}`,
          sourceRecordId: record.id,
        });

        await syncCheckoutToLegacyAttendanceTx(tx, {
          companyId: membership.company.id,
          employeeId: empRow.id,
          clockRecordId: record.id,
          checkIn: req.requestedAt,
          checkOut: null,
          businessDateYmd: approvedBusinessDate,
        });

        await tx
          .update(manualCheckinRequests)
          .set({
            status: "approved",
            reviewedByUserId: ctx.user.id,
            reviewedAt: new Date(),
            adminNote: input.adminNote ?? null,
            attendanceRecordId: record.id,
          })
          .where(eq(manualCheckinRequests.id, input.requestId));
        await insertAttendanceAuditRow(tx, {
          companyId: membership.company.id,
          employeeId: empRow.id,
          attendanceRecordId: record.id,
          manualCheckinRequestId: input.requestId,
          actorUserId: ctx.user.id,
          actorRole: membership.member.role,
          actionType: ATTENDANCE_AUDIT_ACTION.MANUAL_CHECKIN_APPROVE,
          entityType: ATTENDANCE_AUDIT_ENTITY.MANUAL_CHECKIN_REQUEST,
          entityId: input.requestId,
          beforePayload: attendancePayloadJson(req) ?? undefined,
          afterPayload:
            attendancePayloadJson({
              status: "approved",
              attendanceRecordId: record.id,
              adminNote: input.adminNote ?? null,
              reviewedByUserId: ctx.user.id,
            }) ?? undefined,
          reason: input.adminNote?.trim() || req.justification,
          source: ATTENDANCE_AUDIT_SOURCE.ADMIN_PANEL,
        });

        await resolveOperationalIssueForManualTx(tx, {
          companyId: membership.company.id,
          requestId: input.requestId,
          requestedBusinessDateYmd: approvedBusinessDate,
          employeeUserId: req.employeeUserId,
          resolvedByUserId: ctx.user.id,
          resolutionNote: `Manual check-in approved. ${[input.adminNote?.trim(), req.justification].filter(Boolean).join(" · ")}`.slice(
            0,
            2000,
          ),
        });

        try {
          promoterLinkageHint = await linkAttendanceRecordToPromoterAssignment(tx, {
            attendanceRecordId: record.id,
            employeeId: empRow.id,
            companyId: membership.company.id,
            siteId: req.siteId ?? null,
            businessDateYmd: approvedBusinessDate,
            actorUserId: ctx.user.id,
          });
        } catch (linkErr) {
          console.warn("[promoterAssignmentLink] manual check-in", linkErr);
        }
      });

      return { success: true, attendanceRecordId: recordIdOut, promoterLinkageHint };
    }),

  /**
   * Admin: reject a manual check-in request.
   */
  rejectManualCheckIn: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      requestId: z.number(),
      adminNote: z.string().min(5, "Please provide a reason for rejection"),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await requireAttendanceAdmin(ctx.user as User, input.companyId);
      const db = await requireDb();

      const [req] = await db
        .select()
        .from(manualCheckinRequests)
        .where(and(
          eq(manualCheckinRequests.id, input.requestId),
          eq(manualCheckinRequests.companyId, membership.company.id),
          eq(manualCheckinRequests.status, "pending"),
        ))
        .limit(1);
      if (!req) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found or already reviewed" });

      const [empRow] = await db
        .select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.companyId, membership.company.id), eq(employees.userId, req.employeeUserId)))
        .limit(1);

      await db.transaction(async (tx) => {
        await tx
          .update(manualCheckinRequests)
          .set({
            status: "rejected",
            reviewedByUserId: ctx.user.id,
            reviewedAt: new Date(),
            adminNote: input.adminNote,
          })
          .where(eq(manualCheckinRequests.id, input.requestId));
        await insertAttendanceAuditRow(tx, {
          companyId: membership.company.id,
          employeeId: empRow?.id,
          manualCheckinRequestId: input.requestId,
          actorUserId: ctx.user.id,
          actorRole: membership.member.role,
          actionType: ATTENDANCE_AUDIT_ACTION.MANUAL_CHECKIN_REJECT,
          entityType: ATTENDANCE_AUDIT_ENTITY.MANUAL_CHECKIN_REQUEST,
          entityId: input.requestId,
          beforePayload: attendancePayloadJson(req) ?? undefined,
          afterPayload:
            attendancePayloadJson({
              status: "rejected",
              adminNote: input.adminNote,
              reviewedByUserId: ctx.user.id,
            }) ?? undefined,
          reason: input.adminNote,
          source: ATTENDANCE_AUDIT_SOURCE.ADMIN_PANEL,
        });

        const manualBd =
          req.requestedBusinessDate ?? muscatCalendarYmdFromUtcInstant(req.requestedAt);
        await resolveOperationalIssueForManualTx(tx, {
          companyId: membership.company.id,
          requestId: input.requestId,
          requestedBusinessDateYmd: manualBd,
          employeeUserId: req.employeeUserId,
          resolvedByUserId: ctx.user.id,
          resolutionNote: `Manual check-in rejected: ${input.adminNote}`,
        });
      });

      return { success: true };
    }),

  /**
   * Employee: get their own manual check-in requests (today and recent).
   *
   * Uses explicit column list (no requestedBusinessDate / requestedScheduleId) so the query
   * succeeds even when the pending migration that adds those columns has not yet been applied.
   * Wrapped in try/catch so a schema mismatch returns an empty list instead of a 500 that
   * crashes the attendance tab and causes repeated retry noise in the client console.
   */
  myManualCheckIns: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(10) }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      try {
        return await db
          .select({
            req: {
              id: manualCheckinRequests.id,
              companyId: manualCheckinRequests.companyId,
              employeeUserId: manualCheckinRequests.employeeUserId,
              siteId: manualCheckinRequests.siteId,
              requestedAt: manualCheckinRequests.requestedAt,
              justification: manualCheckinRequests.justification,
              lat: manualCheckinRequests.lat,
              lng: manualCheckinRequests.lng,
              distanceMeters: manualCheckinRequests.distanceMeters,
              status: manualCheckinRequests.status,
              reviewedByUserId: manualCheckinRequests.reviewedByUserId,
              reviewedAt: manualCheckinRequests.reviewedAt,
              adminNote: manualCheckinRequests.adminNote,
              attendanceRecordId: manualCheckinRequests.attendanceRecordId,
              createdAt: manualCheckinRequests.createdAt,
              updatedAt: manualCheckinRequests.updatedAt,
            },
            // Only select core site columns — siteType is omitted intentionally to avoid
            // a query failure if that column does not yet exist in the target DB.
            site: { id: attendanceSites.id, name: attendanceSites.name },
          })
          .from(manualCheckinRequests)
          .leftJoin(attendanceSites, eq(manualCheckinRequests.siteId, attendanceSites.id))
          .where(eq(manualCheckinRequests.employeeUserId, ctx.user.id))
          .orderBy(desc(manualCheckinRequests.requestedAt))
          .limit(input.limit);
      } catch (err) {
        // Non-fatal: return empty list so the attendance tab stays usable.
        // Likely cause: pending DB migration has not been applied yet.
        console.error("[myManualCheckIns] query failed (schema mismatch?):", (err as any)?.message ?? err);
        return [];
      }
    }),

  // ─── Employee: Submit a time correction request ─────────────────────────────
  submitCorrection: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      requestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      requestedCheckIn: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      requestedCheckOut: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      reason: z.string().min(10, "Please provide a reason (at least 10 characters)"),
      attendanceRecordId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await requireDb();
      const emp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", membership.companyId);
      if (!emp) throw new TRPCError({ code: "FORBIDDEN", message: "No employee record found" });

      let newId = 0;
      await db.transaction(async (tx) => {
        const [dup] = await tx
          .select({ id: attendanceCorrections.id })
          .from(attendanceCorrections)
          .where(and(
            eq(attendanceCorrections.employeeId, emp.id),
            eq(attendanceCorrections.requestedDate, input.requestedDate),
            eq(attendanceCorrections.status, "pending"),
          ))
          .limit(1);
        if (dup) {
          throw new TRPCError({ code: "CONFLICT", message: "You already have a pending correction request for this date" });
        }
        const [row] = await tx
          .insert(attendanceCorrections)
          .values({
            companyId: membership.companyId,
            employeeId: emp.id,
            employeeUserId: ctx.user.id,
            attendanceRecordId: input.attendanceRecordId ?? null,
            requestedDate: input.requestedDate,
            requestedCheckIn: input.requestedCheckIn ? input.requestedCheckIn + ":00" : null,
            requestedCheckOut: input.requestedCheckOut ? input.requestedCheckOut + ":00" : null,
            reason: input.reason,
            status: "pending",
          })
          .$returningId();
        newId = row.id;
        await insertAttendanceAuditRow(tx, {
          companyId: membership.companyId,
          employeeId: emp.id,
          correctionId: row.id,
          attendanceRecordId: input.attendanceRecordId ?? undefined,
          actorUserId: ctx.user.id,
          actorRole: membership.role,
          actionType: ATTENDANCE_AUDIT_ACTION.CORRECTION_SUBMITTED,
          entityType: ATTENDANCE_AUDIT_ENTITY.ATTENDANCE_CORRECTION,
          entityId: row.id,
          afterPayload:
            attendancePayloadJson({
              status: "pending",
              requestedDate: input.requestedDate,
              requestedCheckIn: input.requestedCheckIn ?? null,
              requestedCheckOut: input.requestedCheckOut ?? null,
              attendanceRecordId: input.attendanceRecordId ?? null,
            }) ?? undefined,
          reason: input.reason,
          source: ATTENDANCE_AUDIT_SOURCE.EMPLOYEE_PORTAL,
        });
      });
      return { id: newId, status: "pending" as const };
    }),

  // ─── Employee: List own correction requests ────────────────────────────────────────
  myCorrections: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      limit: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const conditions = [eq(attendanceCorrections.employeeUserId, ctx.user.id)];
      if (input.companyId != null) {
        conditions.push(eq(attendanceCorrections.companyId, input.companyId));
      }
      return db
        .select()
        .from(attendanceCorrections)
        .where(and(...conditions))
        .orderBy(desc(attendanceCorrections.createdAt))
        .limit(input.limit);
    }),

  // ─── Admin: List all correction requests for the company ──────────────────────
  listCorrections: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      status: z.enum(["pending", "approved", "rejected", "all"]).default("pending"),
      limit: z.number().min(1).max(200).default(50),
    }))
    .query(async ({ ctx, input }) => {
      const membership = await requireAttendanceAdmin(ctx.user as User, input.companyId);
      const db = await requireDb();
      const conditions = [eq(attendanceCorrections.companyId, membership.company.id)];
      if (input.status !== "all") conditions.push(eq(attendanceCorrections.status, input.status));
      const rows = await db
        .select({
          correction: attendanceCorrections,
          employee: {
            id: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
            email: employees.email,
            position: employees.position,
          },
        })
        .from(attendanceCorrections)
        .leftJoin(employees, eq(attendanceCorrections.employeeId, employees.id))
        .where(and(...conditions))
        .orderBy(desc(attendanceCorrections.createdAt))
        .limit(input.limit);
      const issueKeys = rows.map((r) =>
        operationalIssueKey({ kind: "correction_pending", correctionId: r.correction.id }),
      );
      const issueByKey = await loadOperationalIssueSummariesByKeys(db, membership.company.id, issueKeys);
      return rows.map((row) => ({
        ...row,
        operationalIssue:
          issueByKey.get(
            operationalIssueKey({ kind: "correction_pending", correctionId: row.correction.id }),
          ) ?? null,
      }));
    }),

  // ─── Admin: Approve a correction request ───────────────────────────────────────────
  approveCorrection: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      correctionId: z.number(),
      adminNote: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await requireAttendanceAdmin(ctx.user as User, input.companyId);
      const db = await requireDb();
      const [req] = await db
        .select()
        .from(attendanceCorrections)
        .where(and(
          eq(attendanceCorrections.id, input.correctionId),
          eq(attendanceCorrections.companyId, membership.company.id),
          eq(attendanceCorrections.status, "pending"),
        ))
        .limit(1);
      if (!req) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found or already reviewed" });

      let beforeArRow: (typeof attendanceRecords.$inferSelect) | null = null;
      if (req.attendanceRecordId) {
        const [ar] = await db
          .select()
          .from(attendanceRecords)
          .where(eq(attendanceRecords.id, req.attendanceRecordId))
          .limit(1);
        beforeArRow = ar ?? null;
      }

      const beforeCorrectionPayload = attendancePayloadJson({
        correction: req,
        attendanceRecord: beforeArRow,
      });

      let correctionLinkageHint: PromoterLinkageHint = null;
      await db.transaction(async (tx) => {
        let attendanceRecordIdForAudit: number | undefined = req.attendanceRecordId ?? undefined;

        if (req.attendanceRecordId && (req.requestedCheckIn || req.requestedCheckOut)) {
          const updates: Record<string, Date | null> = {};
          if (req.requestedCheckIn) {
            updates.checkIn = muscatWallDateTimeToUtc(
              req.requestedDate,
              normalizeCorrectionHms(req.requestedCheckIn),
            );
          }
          if (req.requestedCheckOut) {
            updates.checkOut = muscatWallDateTimeToUtc(
              req.requestedDate,
              normalizeCorrectionHms(req.requestedCheckOut),
            );
          }
          await tx.update(attendanceRecords).set(updates).where(eq(attendanceRecords.id, req.attendanceRecordId));
        } else if (!req.attendanceRecordId && req.requestedCheckIn) {
          const checkInDt = muscatWallDateTimeToUtc(
            req.requestedDate,
            normalizeCorrectionHms(req.requestedCheckIn),
          );
          let checkOutDt: Date | undefined;
          if (req.requestedCheckOut) {
            checkOutDt = muscatWallDateTimeToUtc(
              req.requestedDate,
              normalizeCorrectionHms(req.requestedCheckOut),
            );
          }
          const { startUtc, endExclusiveUtc } = muscatDayUtcRangeExclusiveEnd(req.requestedDate);
          const [existing] = await tx
            .select()
            .from(attendanceRecords)
            .where(
              and(
                eq(attendanceRecords.employeeId, req.employeeId),
                eq(attendanceRecords.companyId, membership.company.id),
                gte(attendanceRecords.checkIn, startUtc),
                lt(attendanceRecords.checkIn, endExclusiveUtc),
              ),
            )
            .orderBy(desc(attendanceRecords.checkIn))
            .limit(1);

          if (existing) {
            const updates: { checkIn?: Date; checkOut?: Date; notes?: string } = {
              checkIn: checkInDt,
            };
            if (checkOutDt != null) {
              updates.checkOut = checkOutDt;
            }
            const noteAdd = `Correction #${input.correctionId} approved: ${req.reason}`;
            updates.notes = existing.notes ? `${existing.notes} · ${noteAdd}` : noteAdd;
            await tx.update(attendanceRecords).set(updates).where(eq(attendanceRecords.id, existing.id));
            attendanceRecordIdForAudit = existing.id;
          } else {
            const [ins] = await tx
              .insert(attendanceRecords)
              .values({
                companyId: membership.company.id,
                employeeId: req.employeeId,
                checkIn: checkInDt,
                checkOut: checkOutDt,
                method: "manual" as const,
                notes: `Correction approved: ${req.reason}`,
              })
              .$returningId();
            const raw = ins as { insertId?: number; id?: number };
            const newId = Number(raw.insertId ?? raw.id);
            if (!Number.isFinite(newId) || newId <= 0) {
              throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Attendance insert failed" });
            }
            attendanceRecordIdForAudit = newId;
          }
          /** Remove extra same-day manual “Correction approved” rows so a second approval updates one clock row. */
          if (attendanceRecordIdForAudit != null) {
            await tx.delete(attendanceRecords).where(
              and(
                eq(attendanceRecords.employeeId, req.employeeId),
                eq(attendanceRecords.companyId, membership.company.id),
                gte(attendanceRecords.checkIn, startUtc),
                lt(attendanceRecords.checkIn, endExclusiveUtc),
                ne(attendanceRecords.id, attendanceRecordIdForAudit),
                eq(attendanceRecords.method, "manual"),
                like(attendanceRecords.notes, "%Correction%"),
              ),
            );
          }
        }
        await tx
          .update(attendanceCorrections)
          .set({
            status: "approved",
            reviewedByUserId: ctx.user.id,
            reviewedAt: new Date(),
            adminNote: input.adminNote ?? null,
            attendanceRecordId: attendanceRecordIdForAudit ?? req.attendanceRecordId ?? null,
          })
          .where(eq(attendanceCorrections.id, input.correctionId));

        let afterArRow: (typeof attendanceRecords.$inferSelect) | null = null;
        if (attendanceRecordIdForAudit != null) {
          const [ar2] = await tx
            .select()
            .from(attendanceRecords)
            .where(eq(attendanceRecords.id, attendanceRecordIdForAudit))
            .limit(1);
          afterArRow = ar2 ?? null;
        }

        if (attendanceRecordIdForAudit != null) {
          try {
            correctionLinkageHint = await linkAttendanceRecordToPromoterAssignment(tx, {
              attendanceRecordId: attendanceRecordIdForAudit,
              employeeId: req.employeeId,
              companyId: membership.company.id,
              siteId: afterArRow?.siteId ?? null,
              businessDateYmd: req.requestedDate,
              actorUserId: ctx.user.id,
            });
          } catch (linkErr) {
            console.warn("[promoterAssignmentLink] correction", linkErr);
          }
        }

        /** Legacy HR `attendance` month grid (`hr.listAttendance`) — keep in sync with approved clock row. */
        let hrAttendanceIdForAudit: number | undefined;
        if (afterArRow?.checkIn != null) {
          const { startUtc: legDayStart, endExclusiveUtc: legDayEnd } = muscatDayUtcRangeExclusiveEnd(
            req.requestedDate,
          );
          const [legacyRow] = await tx
            .select()
            .from(attendance)
            .where(
              and(
                eq(attendance.employeeId, req.employeeId),
                eq(attendance.companyId, membership.company.id),
                gte(attendance.date, legDayStart),
                lt(attendance.date, legDayEnd),
              ),
            )
            .limit(1);
          const legacyNote = `Clock row #${attendanceRecordIdForAudit} · correction #${input.correctionId}`;
          if (legacyRow) {
            await tx
              .update(attendance)
              .set({
                checkIn: afterArRow.checkIn,
                checkOut: afterArRow.checkOut ?? null,
                status: "present",
                notes: legacyRow.notes ? `${legacyRow.notes} · ${legacyNote}` : legacyNote,
              })
              .where(eq(attendance.id, legacyRow.id));
            hrAttendanceIdForAudit = legacyRow.id;
          } else {
            hrAttendanceIdForAudit = await createAttendanceRecordTx(tx, {
              companyId: membership.company.id,
              employeeId: req.employeeId,
              date: muscatWallDateTimeToUtc(req.requestedDate, "12:00:00"),
              checkIn: afterArRow.checkIn,
              checkOut: afterArRow.checkOut ?? undefined,
              status: "present",
              notes: legacyNote,
            });
          }
        }

        /** Payroll (`attendance_sessions`) must track HR-approved clock corrections. */
        if (afterArRow) {
          await syncAttendanceSessionsFromAttendanceRecordTx(tx as any, afterArRow);
        }

        const [corAfter] = await tx
          .select()
          .from(attendanceCorrections)
          .where(eq(attendanceCorrections.id, input.correctionId))
          .limit(1);

        await insertAttendanceAuditRow(tx, {
          companyId: membership.company.id,
          employeeId: req.employeeId,
          hrAttendanceId: hrAttendanceIdForAudit,
          attendanceRecordId: attendanceRecordIdForAudit,
          correctionId: input.correctionId,
          actorUserId: ctx.user.id,
          actorRole: membership.member.role,
          actionType: ATTENDANCE_AUDIT_ACTION.CORRECTION_APPROVE,
          entityType: ATTENDANCE_AUDIT_ENTITY.ATTENDANCE_CORRECTION,
          entityId: input.correctionId,
          beforePayload: beforeCorrectionPayload ?? undefined,
          afterPayload:
            attendancePayloadJson({
              correction: corAfter,
              attendanceRecord: afterArRow,
            }) ?? undefined,
          reason: input.adminNote?.trim() || req.reason,
          source: ATTENDANCE_AUDIT_SOURCE.ADMIN_PANEL,
        });

        await resolveOperationalIssueForCorrectionTx(tx, {
          companyId: membership.company.id,
          correctionId: input.correctionId,
          requestedDateYmd: req.requestedDate,
          resolvedByUserId: ctx.user.id,
          resolutionNote: `Correction approved. ${[input.adminNote?.trim(), req.reason].filter(Boolean).join(" · ")}`.slice(
            0,
            2000,
          ),
        });
      });

      return { success: true, promoterLinkageHint: correctionLinkageHint };
    }),

  // ─── Admin: Reject a correction request ────────────────────────────────────────────
  rejectCorrection: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      correctionId: z.number(),
      adminNote: z.string().min(5, "Please provide a reason"),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await requireAttendanceAdmin(ctx.user as User, input.companyId);
      const db = await requireDb();
      const [req] = await db
        .select()
        .from(attendanceCorrections)
        .where(and(
          eq(attendanceCorrections.id, input.correctionId),
          eq(attendanceCorrections.companyId, membership.company.id),
          eq(attendanceCorrections.status, "pending"),
        ))
        .limit(1);
      if (!req) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found or already reviewed" });
      const beforePayload = attendancePayloadJson(req);
      await db.transaction(async (tx) => {
        await tx
          .update(attendanceCorrections)
          .set({
            status: "rejected",
            reviewedByUserId: ctx.user.id,
            reviewedAt: new Date(),
            adminNote: input.adminNote,
          })
          .where(eq(attendanceCorrections.id, input.correctionId));
        const [corAfter] = await tx
          .select()
          .from(attendanceCorrections)
          .where(eq(attendanceCorrections.id, input.correctionId))
          .limit(1);
        await insertAttendanceAuditRow(tx, {
          companyId: membership.company.id,
          employeeId: req.employeeId,
          correctionId: input.correctionId,
          actorUserId: ctx.user.id,
          actorRole: membership.member.role,
          actionType: ATTENDANCE_AUDIT_ACTION.CORRECTION_REJECT,
          entityType: ATTENDANCE_AUDIT_ENTITY.ATTENDANCE_CORRECTION,
          entityId: input.correctionId,
          beforePayload: beforePayload ?? undefined,
          afterPayload: attendancePayloadJson(corAfter) ?? undefined,
          reason: input.adminNote,
          source: ATTENDANCE_AUDIT_SOURCE.ADMIN_PANEL,
        });

        await resolveOperationalIssueForCorrectionTx(tx, {
          companyId: membership.company.id,
          correctionId: input.correctionId,
          requestedDateYmd: req.requestedDate,
          resolvedByUserId: ctx.user.id,
          resolutionNote: `Correction rejected: ${input.adminNote}`,
        });
      });
      return { success: true };
    }),

  /**
   * Admin / HR: structural attendance audit trail for the company (investigations, compliance).
   * Prefer `actionType` values from `@shared/attendanceAuditTaxonomy` `ATTENDANCE_AUDIT_ACTION`.
   */
  listAttendanceAudit: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        employeeId: z.number().optional(),
        actionType: z.string().optional(),
        createdOnOrAfter: z.string().optional(),
        createdOnOrBefore: z.string().optional(),
        limit: z.number().min(1).max(200).default(100),
        /** When `operational`, restrict to triage audit actions (ack / resolve / assign). */
        auditLens: z.enum(["all", "operational"]).optional().default("all"),
        /** Only when `auditLens === "operational"`. */
        operationalAction: z.enum(["all", "acknowledge", "resolve", "assign"]).optional(),
        /** Filter operational audit rows by `afterPayload.issueKey` prefix (operational lens only). */
        operationalIssueKind: z
          .enum(["all", "overdue_checkout", "missed_shift", "correction_pending", "manual_pending"])
          .optional()
          .default("all"),
        /** Current issue row status (operational lens; requires join to `attendance_operational_issues`). */
        operationalIssueStatus: z.enum(["open", "acknowledged", "resolved"]).optional(),
        /** Filter by `attendance_operational_issues.assigned_to_user_id` (operational lens). */
        operationalAssigneeUserId: z.number().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const membership = await requireAttendanceAdmin(ctx.user as User, input.companyId);
      const db = await requireDb();

      const conditions = [eq(attendanceAudit.companyId, membership.company.id)];

      const lens = resolveOperationalAuditLensFilter({
        auditLens: input.auditLens,
        operationalAction: input.operationalAction,
        actionType: input.actionType,
      });
      if (lens.kind === "operational_all") {
        conditions.push(inArray(attendanceAudit.actionType, [...OPERATIONAL_TRIAGE_AUDIT_ACTIONS]));
      } else if (lens.kind === "operational_one") {
        conditions.push(eq(attendanceAudit.actionType, lens.action));
      } else if (lens.kind === "generic") {
        conditions.push(eq(attendanceAudit.actionType, lens.action as AttendanceAuditActionType));
      }

      if (input.employeeId != null) {
        conditions.push(eq(attendanceAudit.employeeId, input.employeeId));
      }
      if (input.createdOnOrAfter) {
        conditions.push(gte(attendanceAudit.createdAt, new Date(input.createdOnOrAfter + "T00:00:00.000Z")));
      }
      if (input.createdOnOrBefore) {
        conditions.push(lte(attendanceAudit.createdAt, new Date(input.createdOnOrBefore + "T23:59:59.999Z")));
      }

      if (
        input.auditLens === "operational" &&
        input.operationalIssueKind &&
        input.operationalIssueKind !== "all"
      ) {
        conditions.push(
          sql`JSON_UNQUOTE(JSON_EXTRACT(${attendanceAudit.afterPayload}, '$.issueKey')) LIKE ${operationalIssueKindToIssueKeyLikePattern(input.operationalIssueKind)}`,
        );
      }

      const needsOperationalIssueJoin =
        input.auditLens === "operational" &&
        (input.operationalIssueStatus != null || input.operationalAssigneeUserId != null);

      if (needsOperationalIssueJoin) {
        const joinOnParts = [
          eq(attendanceOperationalIssues.companyId, membership.company.id),
          or(
            and(
              eq(attendanceAudit.entityType, "attendance_operational_issue"),
              eq(attendanceAudit.entityId, attendanceOperationalIssues.id),
            ),
            sql`(${attendanceOperationalIssues.issueKey} = JSON_UNQUOTE(JSON_EXTRACT(${attendanceAudit.afterPayload}, '$.issueKey')))`,
          ),
        ];
        if (input.operationalIssueStatus != null) {
          joinOnParts.push(eq(attendanceOperationalIssues.status, input.operationalIssueStatus));
        }
        if (input.operationalAssigneeUserId != null) {
          joinOnParts.push(
            eq(attendanceOperationalIssues.assignedToUserId, input.operationalAssigneeUserId),
          );
        }
        const rows = await db
          .select({ audit: attendanceAudit })
          .from(attendanceAudit)
          .innerJoin(attendanceOperationalIssues, and(...joinOnParts))
          .where(and(...conditions))
          .orderBy(desc(attendanceAudit.createdAt))
          .limit(input.limit);
        return rows.map((r) => r.audit);
      }

      return db
        .select()
        .from(attendanceAudit)
        .where(and(...conditions))
        .orderBy(desc(attendanceAudit.createdAt))
        .limit(input.limit);
    }),

  // ─── P1: Session-based read queries ──────────────────────────────────────
  /**
   * Returns today's attendance sessions for the current employee (read from
   * `attendance_sessions`).  Falls back gracefully if the table is unavailable
   * (migration not yet applied).
   *
   * Prefer this over `myToday` once the table is confirmed stable — it is the
   * authoritative state-based view rather than the event-log-based heuristic.
   */
  myTodaySessions: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const membership = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await requireDb();
      const emp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", membership.companyId);
      if (!emp) return null;

      const businessDate = muscatCalendarYmdNow();
      try {
        const rows = await db
          .select()
          .from(attendanceSessions)
          .where(and(
            eq(attendanceSessions.companyId, membership.companyId),
            eq(attendanceSessions.employeeId, emp.id),
            eq(attendanceSessions.businessDate, businessDate),
          ))
          .orderBy(desc(attendanceSessions.checkInAt));
        return { businessDate, sessions: rows };
      } catch (err: any) {
        if (/Table.*doesn't exist|Unknown table/i.test(String(err?.message ?? ""))) {
          return { businessDate, sessions: [] };
        }
        throw err;
      }
    }),

  /**
   * Returns attendance sessions for the employee in the requested month.
   * Structurally equivalent to `employeePortal.getMyAttendanceRecords` but
   * reads from `attendance_sessions` instead of `attendance_records`, providing
   * explicit `business_date` and clean `status` for each row.
   */
  mySessionsByMonth: protectedProcedure
    .input(z.object({ month: z.string(), companyId: z.number().optional() })) // YYYY-MM
    .query(async ({ ctx, input }) => {
      const membership = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await requireDb();
      const emp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", membership.companyId);
      if (!emp) return { sessions: [], summary: { total: 0, hoursWorked: 0 } };

      const [year, month] = input.month.split("-").map(Number);
      const dateFrom = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year!, month!, 0).getDate();
      const dateTo = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      try {
        const rows = await db
          .select()
          .from(attendanceSessions)
          .where(and(
            eq(attendanceSessions.companyId, membership.companyId),
            eq(attendanceSessions.employeeId, emp.id),
            gte(attendanceSessions.businessDate, dateFrom),
            lte(attendanceSessions.businessDate, dateTo),
          ))
          .orderBy(desc(attendanceSessions.checkInAt));

        let totalHours = 0;
        for (const s of rows) {
          if (s.checkOutAt) {
            totalHours += (new Date(s.checkOutAt).getTime() - new Date(s.checkInAt).getTime()) / 3600000;
          }
        }

        return {
          sessions: rows,
          summary: {
            total: rows.length,
            hoursWorked: Math.round(totalHours * 10) / 10,
          },
        };
      } catch (err: any) {
        if (/Table.*doesn't exist|Unknown table/i.test(String(err?.message ?? ""))) {
          return { sessions: [], summary: { total: 0, hoursWorked: 0 } };
        }
        throw err;
      }
    }),

  // ─── P0: Duplicate-session cleanup (admin-only, idempotent) ───────────────
  /**
   * Detects and resolves duplicate open sessions for the same employee + schedule.
   *
   * Safe rule applied per duplicate group:
   *   • If any row has check_out IS NULL (open), keep the LATEST open row.
   *   • All earlier rows (open or closed) in the same (employee, schedule) group
   *     are given a synthetic check_out equal to the next row's check_in so the
   *     record remains meaningful in historical queries rather than being deleted.
   *
   * Returns a summary of how many groups were affected and how many rows were patched.
   * Dry-run mode (default) returns the would-be changes without writing anything.
   */
  deduplicateAttendanceRecords: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      dryRun: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await requireAttendanceAdmin(ctx.user as User, input.companyId);
      const db = await requireDb();

      // Find all (employeeId, scheduleId) pairs that have more than one open session.
      // Load all open, shift-attributed rows for the company, then group in JS.
      const openRows = await db
        .select({
          employeeId: attendanceRecords.employeeId,
          scheduleId: attendanceRecords.scheduleId,
        })
        .from(attendanceRecords)
        .where(and(
          eq(attendanceRecords.companyId, membership.company.id),
          isNull(attendanceRecords.checkOut),
        ));

      // Count open rows per (employee, schedule) pair using plain objects
      const pairMeta: Record<string, { employeeId: number; scheduleId: number }> = {};
      const pairCount: Record<string, number> = {};
      openRows.forEach((row) => {
        if (row.scheduleId == null) return;
        const key = `${row.employeeId}:${row.scheduleId}`;
        pairMeta[key] = { employeeId: row.employeeId, scheduleId: row.scheduleId };
        pairCount[key] = (pairCount[key] ?? 0) + 1;
      });

      const dupeRows = Object.keys(pairCount)
        .filter((k) => (pairCount[k] ?? 0) > 1)
        .map((k) => pairMeta[k]!);

      if (dupeRows.length === 0) {
        return { affectedGroups: 0, patchedRows: 0, dryRun: input.dryRun, groups: [] };
      }

      const summary: Array<{
        employeeId: number;
        scheduleId: number;
        openCount: number;
        keptRecordId: number;
        patchedIds: number[];
      }> = [];

      let totalPatched = 0;

      for (let di = 0; di < dupeRows.length; di++) {
        const dupePair = dupeRows[di]!;
        // Fetch all open rows for this (employee, schedule), newest first
        const rows = await db
          .select({
            id: attendanceRecords.id,
            checkIn: attendanceRecords.checkIn,
            checkOut: attendanceRecords.checkOut,
          })
          .from(attendanceRecords)
          .where(and(
            eq(attendanceRecords.companyId, membership.company.id),
            eq(attendanceRecords.employeeId, dupePair.employeeId),
            eq(attendanceRecords.scheduleId, dupePair.scheduleId),
            isNull(attendanceRecords.checkOut),
          ))
          .orderBy(desc(attendanceRecords.checkIn));

        if (rows.length <= 1) continue;

        // Keep the latest open row; patch all earlier ones
        const [keep, ...toClose] = rows;
        const patchedIds: number[] = [];

        for (let i = 0; i < toClose.length; i++) {
          const staleRow = toClose[i]!;
          // Synthetic checkout = 1 minute before the next newer row's check-in
          const syntheticCheckOut = i === 0
            ? new Date(keep!.checkIn.getTime() - 60_000)
            : new Date(toClose[i - 1]!.checkIn.getTime() - 60_000);

          if (!input.dryRun) {
            await db
              .update(attendanceRecords)
              .set({
                checkOut: syntheticCheckOut,
                notes: `[auto-dedup] Closed by deduplication run on ${new Date().toISOString()}. Original check_out was NULL.`,
              })
              .where(eq(attendanceRecords.id, staleRow.id));
          }
          patchedIds.push(staleRow.id);
          totalPatched++;
        }

        summary.push({
          employeeId: dupePair.employeeId,
          scheduleId: dupePair.scheduleId,
          openCount: rows.length,
          keptRecordId: keep!.id,
          patchedIds,
        });
      }

      return {
        affectedGroups: summary.length,
        patchedRows: totalPatched,
        dryRun: input.dryRun,
        groups: summary,
      };
    }),

  // ─── Operational issues & force checkout (HR / company admin) ─────────────
  listOperationalIssuesForBusinessDate: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        businessDateYmd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .query(async ({ ctx, input }) => {
      const membership = await requireAttendanceAdmin(ctx.user as User, input.companyId);
      const db = await requireDb();
      return db
        .select()
        .from(attendanceOperationalIssues)
        .where(
          and(
            eq(attendanceOperationalIssues.companyId, membership.companyId),
            eq(attendanceOperationalIssues.businessDateYmd, input.businessDateYmd),
          ),
        )
        .orderBy(desc(attendanceOperationalIssues.updatedAt));
    }),

  /** Batch-load triage rows for the action queue (keyed by `issue_key`). */
  listOperationalIssuesByIssueKeys: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        issueKeys: z.array(z.string()).max(200),
      }),
    )
    .query(async ({ ctx, input }) => {
      const membership = await requireAttendanceAdmin(ctx.user as User, input.companyId);
      const db = await requireDb();
      const uniq = [...new Set(input.issueKeys)];
      if (uniq.length === 0) return [];
      return db
        .select({
          issueKey: attendanceOperationalIssues.issueKey,
          status: attendanceOperationalIssues.status,
          assignedToUserId: attendanceOperationalIssues.assignedToUserId,
          acknowledgedByUserId: attendanceOperationalIssues.acknowledgedByUserId,
          reviewedByUserId: attendanceOperationalIssues.reviewedByUserId,
          reviewedAt: attendanceOperationalIssues.reviewedAt,
          resolutionNote: attendanceOperationalIssues.resolutionNote,
        })
        .from(attendanceOperationalIssues)
        .where(
          and(
            eq(attendanceOperationalIssues.companyId, membership.companyId),
            inArray(attendanceOperationalIssues.issueKey, uniq),
          ),
        );
    }),

  /**
   * HR drilldown: current operational issue row + merged audit timeline (triage + domain actions for linked entities).
   */
  getOperationalIssueHistory: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        issueKey: z.string().min(8).max(200),
      }),
    )
    .query(async ({ ctx, input }) => {
      const membership = await requireAttendanceAdmin(ctx.user as User, input.companyId);
      const db = await requireDb();
      const bundle = await loadOperationalIssueHistoryBundle(db, {
        companyId: membership.companyId,
        issueKey: input.issueKey,
      });
      if (!bundle) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Operational issue not found" });
      }
      return bundle;
    }),

  setOperationalIssueStatus: protectedProcedure
    .input(
      z
        .object({
          companyId: z.number().optional(),
          businessDateYmd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          kind: z.enum(["overdue_checkout", "missed_shift", "correction_pending", "manual_pending"]),
          attendanceRecordId: z.number().optional(),
          scheduleId: z.number().optional(),
          correctionId: z.number().optional(),
          manualCheckinRequestId: z.number().optional(),
          action: z.enum(["acknowledge", "resolve", "assign"]),
          note: z.string().max(2000).optional(),
          assignedToUserId: z.number().optional(),
        })
        .superRefine((d, ctx) => {
          try {
            operationalIssueKey({
              kind: d.kind,
              attendanceRecordId: d.attendanceRecordId,
              scheduleId: d.scheduleId,
              businessDateYmd: d.kind === "missed_shift" ? d.businessDateYmd : undefined,
              correctionId: d.correctionId,
              manualCheckinRequestId: d.manualCheckinRequestId,
            });
          } catch {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Missing target id(s) for this issue kind",
            });
          }
          if (d.action === "assign" && (d.assignedToUserId == null || d.assignedToUserId <= 0)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "assignedToUserId is required for assign",
            });
          }
          if (d.action === "resolve" && (!d.note || d.note.trim().length < 3)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Resolution note is required (min 3 characters)",
            });
          }
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await requireAttendanceAdmin(ctx.user as User, input.companyId);
      const db = await requireDb();
      const issueKey = operationalIssueKey({
        kind: input.kind,
        attendanceRecordId: input.attendanceRecordId,
        scheduleId: input.scheduleId,
        businessDateYmd: input.kind === "missed_shift" ? input.businessDateYmd : undefined,
        correctionId: input.correctionId,
        manualCheckinRequestId: input.manualCheckinRequestId,
      });

      let employeeId: number | null = null;
      if (input.kind === "overdue_checkout" && input.attendanceRecordId != null) {
        const [r] = await db
          .select({ employeeId: attendanceRecords.employeeId })
          .from(attendanceRecords)
          .where(
            and(
              eq(attendanceRecords.id, input.attendanceRecordId),
              eq(attendanceRecords.companyId, membership.companyId),
            ),
          )
          .limit(1);
        if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Attendance record not found" });
        employeeId = r.employeeId;
      } else if (input.kind === "missed_shift" && input.scheduleId != null) {
        const [sch] = await db
          .select({ employeeUserId: employeeSchedules.employeeUserId })
          .from(employeeSchedules)
          .where(
            and(
              eq(employeeSchedules.id, input.scheduleId),
              eq(employeeSchedules.companyId, membership.companyId),
            ),
          )
          .limit(1);
        if (!sch) throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found" });
        const [emp] = await db
          .select({ id: employees.id })
          .from(employees)
          .where(
            and(
              eq(employees.companyId, membership.companyId),
              or(eq(employees.id, sch.employeeUserId), eq(employees.userId, sch.employeeUserId)),
            ),
          )
          .limit(1);
        employeeId = emp?.id ?? null;
      } else if (input.kind === "correction_pending" && input.correctionId != null) {
        const [c] = await db
          .select({ employeeId: attendanceCorrections.employeeId })
          .from(attendanceCorrections)
          .where(
            and(
              eq(attendanceCorrections.id, input.correctionId),
              eq(attendanceCorrections.companyId, membership.companyId),
            ),
          )
          .limit(1);
        if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Correction not found" });
        employeeId = c.employeeId;
      } else if (input.kind === "manual_pending" && input.manualCheckinRequestId != null) {
        const [m] = await db
          .select({ employeeUserId: manualCheckinRequests.employeeUserId })
          .from(manualCheckinRequests)
          .where(
            and(
              eq(manualCheckinRequests.id, input.manualCheckinRequestId),
              eq(manualCheckinRequests.companyId, membership.companyId),
            ),
          )
          .limit(1);
        if (!m) throw new TRPCError({ code: "NOT_FOUND", message: "Manual check-in request not found" });
        const [emp] = await db
          .select({ id: employees.id })
          .from(employees)
          .where(
            and(eq(employees.companyId, membership.companyId), eq(employees.userId, m.employeeUserId)),
          )
          .limit(1);
        employeeId = emp?.id ?? null;
      }

      const now = new Date();
      const basePayload = {
        companyId: membership.companyId,
        businessDateYmd: input.businessDateYmd,
        issueKind: input.kind,
        issueKey,
        attendanceRecordId: input.attendanceRecordId ?? null,
        scheduleId: input.scheduleId ?? null,
        correctionId: input.correctionId ?? null,
        manualCheckinRequestId: input.manualCheckinRequestId ?? null,
        employeeId,
      };

      await db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(attendanceOperationalIssues)
          .where(
            and(
              eq(attendanceOperationalIssues.companyId, membership.companyId),
              eq(attendanceOperationalIssues.issueKey, issueKey),
            ),
          )
          .limit(1);

        if (existing?.status === "resolved" && input.action !== "assign") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Issue already resolved" });
        }

        if (input.action === "assign") {
          if (existing) {
            await tx
              .update(attendanceOperationalIssues)
              .set({
                assignedToUserId: input.assignedToUserId ?? null,
                updatedAt: now,
              })
              .where(eq(attendanceOperationalIssues.id, existing.id));
          } else {
            await tx.insert(attendanceOperationalIssues).values({
              ...basePayload,
              status: "open",
              assignedToUserId: input.assignedToUserId ?? null,
            });
          }
          await insertAttendanceAuditRow(tx, {
            companyId: membership.companyId,
            employeeId,
            actorUserId: ctx.user.id,
            actorRole: membership.member.role,
            actionType: ATTENDANCE_AUDIT_ACTION.OPERATIONAL_ISSUE_ASSIGN,
            entityType: "attendance_operational_issue",
            entityId: existing?.id ?? null,
            afterPayload: attendancePayloadJson({
              issueKey,
              assignedToUserId: input.assignedToUserId,
            }) ?? undefined,
            reason: input.note ?? null,
            source: ATTENDANCE_AUDIT_SOURCE.ADMIN_PANEL,
          });
          return;
        }

        if (input.action === "acknowledge") {
          if (!existing) {
            await tx.insert(attendanceOperationalIssues).values({
              ...basePayload,
              status: "acknowledged",
              acknowledgedByUserId: ctx.user.id,
              acknowledgedAt: now,
              resolutionNote: input.note?.trim() ?? null,
            });
          } else {
            await tx
              .update(attendanceOperationalIssues)
              .set({
                status: "acknowledged",
                acknowledgedByUserId: ctx.user.id,
                acknowledgedAt: now,
                resolutionNote: input.note?.trim() ?? existing.resolutionNote,
                updatedAt: now,
              })
              .where(eq(attendanceOperationalIssues.id, existing.id));
          }
          await insertAttendanceAuditRow(tx, {
            companyId: membership.companyId,
            employeeId,
            actorUserId: ctx.user.id,
            actorRole: membership.member.role,
            actionType: ATTENDANCE_AUDIT_ACTION.OPERATIONAL_ISSUE_ACKNOWLEDGE,
            entityType: "attendance_operational_issue",
            entityId: existing?.id ?? null,
            afterPayload: attendancePayloadJson({ issueKey, note: input.note ?? null }) ?? undefined,
            reason: input.note ?? null,
            source: ATTENDANCE_AUDIT_SOURCE.ADMIN_PANEL,
          });
          return;
        }

        if (input.action === "resolve") {
          if (!existing) {
            await tx.insert(attendanceOperationalIssues).values({
              ...basePayload,
              status: "resolved",
              reviewedByUserId: ctx.user.id,
              reviewedAt: now,
              resolutionNote: input.note!.trim(),
            });
          } else {
            await tx
              .update(attendanceOperationalIssues)
              .set({
                status: "resolved",
                reviewedByUserId: ctx.user.id,
                reviewedAt: now,
                resolutionNote: input.note!.trim(),
                updatedAt: now,
              })
              .where(eq(attendanceOperationalIssues.id, existing.id));
          }
          await insertAttendanceAuditRow(tx, {
            companyId: membership.companyId,
            employeeId,
            actorUserId: ctx.user.id,
            actorRole: membership.member.role,
            actionType: ATTENDANCE_AUDIT_ACTION.OPERATIONAL_ISSUE_RESOLVE,
            entityType: "attendance_operational_issue",
            entityId: existing?.id ?? null,
            afterPayload: attendancePayloadJson({ issueKey, note: input.note }) ?? undefined,
            reason: input.note ?? null,
            source: ATTENDANCE_AUDIT_SOURCE.ADMIN_PANEL,
          });
        }
      });

      return { success: true, issueKey };
    }),

  forceCheckout: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        attendanceRecordId: z.number(),
        reason: z.string().min(10).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await requireAttendanceAdmin(ctx.user as User, input.companyId);
      const db = await requireDb();
      const [rec] = await db
        .select()
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.id, input.attendanceRecordId),
            eq(attendanceRecords.companyId, membership.companyId),
          ),
        )
        .limit(1);
      if (!rec) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Attendance record not found" });
      }
      if (rec.checkOut != null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Session already closed" });
      }

      const checkOutTime = new Date();
      const businessDate = muscatCalendarYmdNow();
      const issueKey = operationalIssueKey({
        kind: "overdue_checkout",
        attendanceRecordId: rec.id,
      });

      await db.transaction(async (tx) => {
        await tx
          .update(attendanceRecords)
          .set({
            checkOut: checkOutTime,
            method: "admin",
          })
          .where(eq(attendanceRecords.id, rec.id));

        const [after] = await tx
          .select()
          .from(attendanceRecords)
          .where(eq(attendanceRecords.id, rec.id))
          .limit(1);

        await closeAttendanceSessionSafe(tx, {
          sourceRecordId: rec.id,
          checkOutAt: checkOutTime,
          checkOutLat: null,
          checkOutLng: null,
        });

        const forceCheckoutBusinessDate = muscatCalendarYmdFromUtcInstant(checkOutTime);
        await syncCheckoutToLegacyAttendanceTx(tx, {
          companyId: membership.companyId,
          employeeId: rec.employeeId,
          clockRecordId: rec.id,
          checkIn: rec.checkIn,
          checkOut: checkOutTime,
          businessDateYmd: forceCheckoutBusinessDate,
        });

        await insertAttendanceAuditRow(tx, {
          companyId: membership.companyId,
          employeeId: rec.employeeId,
          attendanceRecordId: rec.id,
          actorUserId: ctx.user.id,
          actorRole: membership.member.role,
          actionType: ATTENDANCE_AUDIT_ACTION.FORCE_CHECKOUT,
          entityType: ATTENDANCE_AUDIT_ENTITY.ATTENDANCE_RECORD,
          entityId: rec.id,
          beforePayload: attendancePayloadJson(rec) ?? undefined,
          afterPayload:
            attendancePayloadJson({
              record: after,
              forcedCheckoutAt: checkOutTime.toISOString(),
              businessDate,
            }) ?? undefined,
          reason: input.reason,
          source: ATTENDANCE_AUDIT_SOURCE.ADMIN_PANEL,
        });

        const [existingIssue] = await tx
          .select()
          .from(attendanceOperationalIssues)
          .where(
            and(
              eq(attendanceOperationalIssues.companyId, membership.companyId),
              eq(attendanceOperationalIssues.issueKey, issueKey),
            ),
          )
          .limit(1);

        if (existingIssue) {
          await tx
            .update(attendanceOperationalIssues)
            .set({
              status: "resolved",
              reviewedByUserId: ctx.user.id,
              reviewedAt: checkOutTime,
              resolutionNote: `Force checkout: ${input.reason}`,
              updatedAt: checkOutTime,
            })
            .where(eq(attendanceOperationalIssues.id, existingIssue.id));
        } else {
          await tx.insert(attendanceOperationalIssues).values({
            companyId: membership.companyId,
            businessDateYmd: businessDate,
            issueKind: "overdue_checkout",
            issueKey,
            attendanceRecordId: rec.id,
            employeeId: rec.employeeId,
            status: "resolved",
            reviewedByUserId: ctx.user.id,
            reviewedAt: checkOutTime,
            resolutionNote: `Force checkout: ${input.reason}`,
          });
        }
      });

      return {
        success: true,
        attendanceRecordId: rec.id,
        checkOutAt: checkOutTime.toISOString(),
      };
    }),

  // ─── P2: Session anomaly detection (admin-only) ────────────────────────────
  /**
   * Scans `attendance_records` for patterns that indicate data integrity issues:
   *
   * - MULTIPLE_OPEN_SESSIONS   — employee has 2+ open rows (no check_out) for the same shift
   * - MULTIPLE_SESSIONS        — employee has 2+ rows (any status) for the same shift on one day
   * - ORPHAN_CHECKOUT          — check_out exists but check_in is NULL (data corruption)
   * - RUNAWAY_SESSION          — open session whose check_in is > 16 hours ago
   * - EARLY_CHECKIN_RECHECKIN  — closed session followed by another open session for same shift
   *
   * Returns at most `limit` anomalies ordered by severity (most critical first).
   */
  getSessionAnomalies: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      dateFrom: z.string().optional(), // YYYY-MM-DD
      dateTo: z.string().optional(),
      limit: z.number().min(1).max(500).default(100),
    }))
    .query(async ({ ctx, input }) => {
      const membership = await requireAttendanceAdmin(ctx.user as User, input.companyId);
      const db = await requireDb();

      const now = new Date();
      const windowStart = input.dateFrom
        ? new Date(input.dateFrom + "T00:00:00.000Z")
        : new Date(now.getTime() - 30 * 24 * 3600 * 1000);
      const windowEnd = input.dateTo
        ? new Date(input.dateTo + "T23:59:59.999Z")
        : now;

      const records = await db
        .select({
          id: attendanceRecords.id,
          employeeId: attendanceRecords.employeeId,
          scheduleId: attendanceRecords.scheduleId,
          checkIn: attendanceRecords.checkIn,
          checkOut: attendanceRecords.checkOut,
        })
        .from(attendanceRecords)
        .where(and(
          eq(attendanceRecords.companyId, membership.company.id),
          gte(attendanceRecords.checkIn, windowStart),
          lte(attendanceRecords.checkIn, windowEnd),
        ))
        .orderBy(attendanceRecords.employeeId, attendanceRecords.scheduleId, attendanceRecords.checkIn);

      type AnomalyType =
        | "MULTIPLE_OPEN_SESSIONS"
        | "MULTIPLE_SESSIONS"
        | "RUNAWAY_SESSION"
        | "EARLY_CHECKIN_RECHECKIN";

      const anomalies: Array<{
        type: AnomalyType;
        severity: "critical" | "warning";
        employeeId: number;
        scheduleId: number | null;
        recordIds: number[];
        detail: string;
      }> = [];

      type RecordRow = (typeof records)[number];

      // Group by (employee, schedule, calendar day)
      const groupsMap: Record<string, RecordRow[]> = {};
      records.forEach((r) => {
        const day = muscatCalendarYmdFromUtcInstant(r.checkIn);
        const key = `${r.employeeId}:${r.scheduleId ?? "null"}:${day}`;
        if (!groupsMap[key]) groupsMap[key] = [];
        groupsMap[key]!.push(r);
      });

      Object.values(groupsMap).forEach((grp) => {
        if (grp.length === 0) return;
        const first = grp[0]!;
        const { employeeId, scheduleId } = first;
        const ids = grp.map((r: RecordRow) => r.id);

        const openRows = grp.filter((r: RecordRow) => r.checkOut == null);
        const closedRows = grp.filter((r: RecordRow) => r.checkOut != null);

        // Multiple open sessions for same shift — critical
        if (openRows.length > 1) {
          anomalies.push({
            type: "MULTIPLE_OPEN_SESSIONS",
            severity: "critical",
            employeeId,
            scheduleId: scheduleId ?? null,
            recordIds: openRows.map((r: RecordRow) => r.id),
            detail: `${openRows.length} open sessions for employee ${employeeId} on the same shift.`,
          });
        }

        // Multiple sessions (any state) for same shift — warning
        if (grp.length > 1 && openRows.length <= 1) {
          anomalies.push({
            type: "MULTIPLE_SESSIONS",
            severity: "warning",
            employeeId,
            scheduleId: scheduleId ?? null,
            recordIds: ids,
            detail: `${grp.length} attendance rows for employee ${employeeId} on the same shift.`,
          });
        }

        // Closed session followed by another open session for same shift
        if (closedRows.length > 0 && openRows.length > 0) {
          const lastClosed = closedRows.reduce((a: RecordRow, b: RecordRow) =>
            new Date(a.checkIn) > new Date(b.checkIn) ? a : b
          );
          const firstOpen = openRows.reduce((a: RecordRow, b: RecordRow) =>
            new Date(a.checkIn) < new Date(b.checkIn) ? a : b
          );
          if (new Date(firstOpen.checkIn) > new Date(lastClosed.checkIn)) {
            anomalies.push({
              type: "EARLY_CHECKIN_RECHECKIN",
              severity: "warning",
              employeeId,
              scheduleId: scheduleId ?? null,
              recordIds: [lastClosed.id, firstOpen.id],
              detail: `Employee ${employeeId} checked out early (record ${lastClosed.id}) then re-checked in (record ${firstOpen.id}) for the same shift.`,
            });
          }
        }
      });

      // Runaway open sessions (> 16 hours old, regardless of shift)
      const cutoff = new Date(now.getTime() - 16 * 3600 * 1000);
      for (const r of records) {
        if (r.checkOut == null && new Date(r.checkIn) < cutoff) {
          anomalies.push({
            type: "RUNAWAY_SESSION",
            severity: "critical",
            employeeId: r.employeeId,
            scheduleId: r.scheduleId ?? null,
            recordIds: [r.id],
            detail: `Record ${r.id} has been open for over 16 hours (checked in at ${r.checkIn.toISOString()}).`,
          });
        }
      }

      // Sort: critical first, then by employeeId
      anomalies.sort((a, b) => {
        if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
        return a.employeeId - b.employeeId;
      });

      return {
        total: anomalies.length,
        anomalies: anomalies.slice(0, input.limit),
        windowFrom: windowStart.toISOString(),
        windowTo: windowEnd.toISOString(),
      };
    }),

  /**
   * Admin/HR preflight: compares `attendance_records`, `attendance_sessions`, and legacy `attendance`
   * for a Muscat-inclusive YYYY-MM-DD range. Includes payroll-style `preflight` (safe / warnings / block).
   */
  reconciliationPreflight: protectedProcedure
    .input(
      z
        .object({
          companyId: z.number().optional(),
          fromYmd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          toYmd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })
        .refine((x) => x.fromYmd <= x.toYmd, { message: "fromYmd must be <= toYmd" }),
    )
    .query(async ({ ctx, input }) => {
      const membership = await requireAttendanceAdmin(ctx.user as User, input.companyId);
      const db = await requireDb();
      const report = await runAttendanceReconciliation(db, {
        companyId: membership.company.id,
        fromYmd: input.fromYmd,
        toYmd: input.toYmd,
      });
      const preflight = evaluatePayrollPreflight(report.mismatches);
      const payrollBlockedByIncompleteScan = report.recordsScanMayBeIncomplete === true;
      return { ...report, preflight, payrollBlockedByIncompleteScan };
    }),

  /**
   * Narrow repair: re-sync session row(s) from a single clock row (HR/admin).
   * Does not fix arbitrary drift; use after correcting `attendance_records` or when session dual-write missed.
   */
  repairSessionFromAttendanceRecord: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        attendanceRecordId: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await requireAttendanceAdmin(ctx.user as User, input.companyId);
      const db = await requireDb();
      const [rec] = await db
        .select()
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.id, input.attendanceRecordId),
            eq(attendanceRecords.companyId, membership.company.id),
          ),
        )
        .limit(1);
      if (!rec) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Attendance record not found" });
      }
      await db.transaction(async (tx) => {
        await syncAttendanceSessionsFromAttendanceRecordTx(tx as any, rec);
      });
      return { success: true as const, attendanceRecordId: rec.id };
    }),
});

export { syncCheckoutToLegacyAttendanceTx };
