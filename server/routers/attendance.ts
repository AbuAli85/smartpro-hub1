import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and, desc, gte, like, lt, lte, isNull, ne, inArray, or } from "drizzle-orm";
import { randomBytes } from "crypto";
import {
  attendance,
  attendanceSites,
  attendanceRecords,
  attendanceSessions,
  attendanceCorrections,
  employees,
  manualCheckinRequests,
  attendanceAudit,
  shiftTemplates,
  employeeSchedules,
} from "../../drizzle/schema";
import { buildEmployeeDayShiftStatuses } from "@shared/employeeDayShiftStatus";
import { pickScheduleRowForNow } from "@shared/pickScheduleForAttendanceNow";
import { evaluateCheckoutOutcomeByShiftTimes } from "@shared/attendanceCheckoutPolicy";
import { createAttendanceRecordTx, getDb } from "../db";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getActiveCompanyMembership } from "../_core/membership";
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
  muscatDayUtcRangeExclusiveEnd,
  muscatWallDateTimeToUtc,
} from "@shared/attendanceMuscatTime";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

// ── Dual-write helpers ────────────────────────────────────────────────────────
/**
 * Write a new open session row to `attendance_sessions` in parallel with the
 * existing `attendance_records` insert.  Non-fatal: if the table doesn't exist
 * yet (e.g. migration pending) we log and continue.
 */
async function insertAttendanceSessionSafe(
  tx: Parameters<Parameters<Awaited<ReturnType<typeof requireDb>>["transaction"]>[0]>[0],
  data: typeof attendanceSessions.$inferInsert,
): Promise<number | null> {
  try {
    const [result] = await tx.insert(attendanceSessions).values(data);
    return (result as { insertId?: number }).insertId ?? null;
  } catch (err: any) {
    // Tolerate missing table during migration window; surface other errors.
    if (/Table.*doesn't exist|Unknown table/i.test(String(err?.message ?? ""))) {
      console.warn("[attendance_sessions] Table not yet present — skipping session write.");
      return null;
    }
    // Re-throw duplicate-key errors so the uniqueness constraint is enforced.
    throw err;
  }
}

/**
 * Close the session row linked to `sourceRecordId` (set status='closed',
 * check_out_at, geo).  Non-fatal if the table is absent.
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
  } catch (err: any) {
    if (/Table.*doesn't exist|Unknown table/i.test(String(err?.message ?? ""))) {
      console.warn("[attendance_sessions] Table not yet present — skipping session close.");
      return;
    }
    throw err;
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
  const dow = new Date(businessDate + "T12:00:00").getDay();

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

/** HR/company admin for the active or explicitly selected company (never arbitrary first membership). */
async function requireAdminOrHR(userId: number, companyId?: number | null) {
  const m = await getActiveCompanyMembership(userId, companyId ?? undefined);
  if (!m) throw new TRPCError({ code: "FORBIDDEN", message: "No company membership" });
  if (m.role !== "company_admin" && m.role !== "hr_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "HR Admin or Company Admin required" });
  }
  return { company: { id: m.companyId }, member: { role: m.role } };
}

/** DB stores `HH:MM:SS`; API may send `HH:MM` — normalize for {@link muscatWallDateTimeToUtc}. */
function normalizeCorrectionHms(s: string | null | undefined): string {
  if (!s) return "00:00:00";
  const t = s.trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t;
  if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
  return t;
}

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

/**
 * Haversine distance in metres between two GPS coordinates.
 */
function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in metres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Check if current time (UTC) is within the site's operating hours.
 * operatingHoursStart / End are "HH:MM" strings in the site's timezone.
 */
function isWithinOperatingHours(
  start: string | null | undefined,
  end: string | null | undefined,
  tz: string
): boolean {
  if (!start || !end) return true; // no restriction
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const h = parts.find((p) => p.type === "hour")?.value ?? "00";
    const m = parts.find((p) => p.type === "minute")?.value ?? "00";
    const current = `${h}:${m}`;
    // Simple string comparison works for HH:MM if start < end (same day)
    if (start <= end) return current >= start && current <= end;
    // Overnight shift (e.g. 22:00 – 06:00)
    return current >= start || current <= end;
  } catch {
    return true;
  }
}

// Site type options
const SITE_TYPES = [
  "mall",
  "brand_store",
  "office",
  "warehouse",
  "client_site",
  "showroom",
  "factory",
  "other",
] as const;

const siteInputSchema = z.object({
  name: z.string().min(1).max(128),
  location: z.string().max(255).optional(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  radiusMeters: z.number().min(30).max(5000).default(200),
  enforceGeofence: z.boolean().default(false),
  siteType: z.enum(SITE_TYPES).default("office"),
  clientName: z.string().max(255).optional().nullable(),
  operatingHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  operatingHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  timezone: z.string().default("Asia/Muscat"),
  enforceHours: z.boolean().default(false),
});

export const attendanceRouter = router({
  // ─── Admin: Create attendance site with QR token ──────────────────────────
  createSite: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).merge(siteInputSchema))
    .mutation(async ({ ctx, input }) => {
      const membership = await requireAdminOrHR(ctx.user.id, input.companyId);
      const companyId = input.companyId ?? membership.company.id;
      const db = await requireDb();
      const qrToken = randomBytes(24).toString("hex");
      const [result] = await db.insert(attendanceSites).values({
        companyId,
        name: input.name,
        location: input.location ?? null,
        lat: input.lat != null ? String(input.lat) : null,
        lng: input.lng != null ? String(input.lng) : null,
        radiusMeters: input.radiusMeters,
        enforceGeofence: input.enforceGeofence,
        siteType: input.siteType,
        clientName: input.clientName ?? null,
        operatingHoursStart: input.operatingHoursStart ?? null,
        operatingHoursEnd: input.operatingHoursEnd ?? null,
        timezone: input.timezone,
        enforceHours: input.enforceHours,
        qrToken,
        isActive: true,
        createdByUserId: ctx.user.id,
      });
      const siteId = (result as any).insertId;
      const [site] = await db.select().from(attendanceSites).where(eq(attendanceSites.id, siteId)).limit(1);
      return site;
    }),

  // ─── Admin: List all sites for a company ─────────────────────────────────
  listSites: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const membership = await requireAdminOrHR(ctx.user.id, input.companyId);
      const companyId = input.companyId ?? membership.company.id;
      const db = await requireDb();
      return db
        .select()
        .from(attendanceSites)
        .where(eq(attendanceSites.companyId, companyId))
        .orderBy(desc(attendanceSites.createdAt));
    }),

  // ─── Admin: Toggle site active status ────────────────────────────────────
  toggleSite: protectedProcedure
    .input(z.object({ siteId: z.number(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [site] = await db.select().from(attendanceSites).where(eq(attendanceSites.id, input.siteId)).limit(1);
      if (!site) throw new TRPCError({ code: "NOT_FOUND" });
      const membership = await requireAdminOrHR(ctx.user.id, site.companyId);
      if (site.companyId !== membership.company.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await db.update(attendanceSites).set({ isActive: input.isActive }).where(eq(attendanceSites.id, input.siteId));
      return { success: true };
    }),

  // ─── Admin: Update site ───────────────────────────────────────────────────
  updateSite: protectedProcedure
    .input(z.object({ siteId: z.number() }).merge(siteInputSchema))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [existing] = await db.select().from(attendanceSites).where(eq(attendanceSites.id, input.siteId)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      const membership = await requireAdminOrHR(ctx.user.id, existing.companyId);
      if (existing.companyId !== membership.company.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await db.update(attendanceSites).set({
        name: input.name,
        location: input.location ?? null,
        lat: input.lat != null ? String(input.lat) : null,
        lng: input.lng != null ? String(input.lng) : null,
        radiusMeters: input.radiusMeters,
        enforceGeofence: input.enforceGeofence,
        siteType: input.siteType,
        clientName: input.clientName ?? null,
        operatingHoursStart: input.operatingHoursStart ?? null,
        operatingHoursEnd: input.operatingHoursEnd ?? null,
        timezone: input.timezone,
        enforceHours: input.enforceHours,
      }).where(eq(attendanceSites.id, input.siteId));
      const [updated] = await db.select().from(attendanceSites).where(eq(attendanceSites.id, input.siteId)).limit(1);
      return updated;
    }),

  // ─── Public: Resolve QR token to site info (for scan page) ───────────────
  getSiteByToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [site] = await db
        .select()
        .from(attendanceSites)
        .where(and(eq(attendanceSites.qrToken, input.token), eq(attendanceSites.isActive, true)))
        .limit(1);
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "Invalid or inactive QR code" });
      return {
        id: site.id,
        name: site.name,
        location: site.location,
        companyId: site.companyId,
        siteType: site.siteType,
        clientName: site.clientName,
        lat: site.lat ? parseFloat(site.lat) : null,
        lng: site.lng ? parseFloat(site.lng) : null,
        radiusMeters: site.radiusMeters,
        enforceGeofence: site.enforceGeofence,
        operatingHoursStart: site.operatingHoursStart,
        operatingHoursEnd: site.operatingHoursEnd,
        timezone: site.timezone,
        enforceHours: site.enforceHours,
      };
    }),

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
      const membership = await getActiveCompanyMembership(ctx.user.id, site.companyId);
      if (!membership) {
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
        throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this company" });
      }
      const memberRole = membership.role;
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
      });
      return record!;
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
      const db = await requireDb();
      const membership = await getActiveCompanyMembership(ctx.user.id, input.companyId ?? undefined);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
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
    const db = await requireDb();
    const membership = await getActiveCompanyMembership(ctx.user.id, input.companyId ?? undefined);
    if (!membership) return null;
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
      const db = await requireDb();
      const membership = await getActiveCompanyMembership(ctx.user.id, input.companyId ?? undefined);
      if (!membership) return null;
      const emp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", membership.companyId);
      if (!emp) return null;

      const businessDate = muscatCalendarYmdNow();
      const now = new Date();
      const dow = new Date(businessDate + "T12:00:00").getDay();

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
      const db = await requireDb();
      const membership = await getActiveCompanyMembership(ctx.user.id, input.companyId ?? undefined);
      if (!membership) return [];
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
      const membership = await requireAdminOrHR(ctx.user.id, input.companyId);
      const companyId = membership.company.id;
      const db = await requireDb();

      const targetDate = input.date ? new Date(input.date) : new Date();
      const dayStart = new Date(targetDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(targetDate);
      dayEnd.setHours(23, 59, 59, 999);

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
          lte(attendanceRecords.checkIn, dayEnd),
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
      const membership = await requireAdminOrHR(ctx.user.id, input.companyId);
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

        const membership = await getActiveCompanyMembership(ctx.user.id, cid);
        if (!membership || membership.companyId !== s.companyId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No company membership" });
        }

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

      const membership = await getActiveCompanyMembership(ctx.user.id, site.companyId);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "No company membership" });

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
      const membership = await requireAdminOrHR(ctx.user.id, input.companyId);
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

      return rows;
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
      const membership = await requireAdminOrHR(ctx.user.id, input.companyId);
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
              requestedBusinessDate: null as null,
              requestedScheduleId: null as null,
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
      });

      return { success: true, attendanceRecordId: recordIdOut };
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
      const membership = await requireAdminOrHR(ctx.user.id, input.companyId);
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
      const db = await requireDb();
      const membership = await getActiveCompanyMembership(ctx.user.id, input.companyId ?? undefined);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "No company membership" });
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
      const membership = await requireAdminOrHR(ctx.user.id, input.companyId);
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
      return rows;
    }),

  // ─── Admin: Approve a correction request ───────────────────────────────────────────
  approveCorrection: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      correctionId: z.number(),
      adminNote: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await requireAdminOrHR(ctx.user.id, input.companyId);
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
      });

      return { success: true };
    }),

  // ─── Admin: Reject a correction request ────────────────────────────────────────────
  rejectCorrection: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      correctionId: z.number(),
      adminNote: z.string().min(5, "Please provide a reason"),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await requireAdminOrHR(ctx.user.id, input.companyId);
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
      }),
    )
    .query(async ({ ctx, input }) => {
      const membership = await requireAdminOrHR(ctx.user.id, input.companyId);
      const db = await requireDb();
      const conditions = [eq(attendanceAudit.companyId, membership.company.id)];
      if (input.employeeId != null) {
        conditions.push(eq(attendanceAudit.employeeId, input.employeeId));
      }
      if (input.actionType) {
        conditions.push(eq(attendanceAudit.actionType, input.actionType as AttendanceAuditActionType));
      }
      if (input.createdOnOrAfter) {
        conditions.push(gte(attendanceAudit.createdAt, new Date(input.createdOnOrAfter + "T00:00:00.000Z")));
      }
      if (input.createdOnOrBefore) {
        conditions.push(lte(attendanceAudit.createdAt, new Date(input.createdOnOrBefore + "T23:59:59.999Z")));
      }
      return db
        .select()
        .from(attendanceAudit)
        .where(and(...conditions))
        .orderBy(desc(attendanceAudit.createdAt))
        .limit(input.limit);
    }),

  // ─── Utility: List available site types ─────────────────────────────────────────
  siteTypes: publicProcedure.query(() => {
    return [
      { value: "mall", label: "Shopping Mall", icon: "🏬" },
      { value: "brand_store", label: "Brand / Retail Store", icon: "🛍️" },
      { value: "office", label: "Office", icon: "🏢" },
      { value: "warehouse", label: "Warehouse / Distribution", icon: "🏭" },
      { value: "client_site", label: "Client Site", icon: "📍" },
      { value: "showroom", label: "Showroom", icon: "✨" },
      { value: "factory", label: "Factory", icon: "⚙️" },
      { value: "other", label: "Other", icon: "📌" },
    ];
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
      const db = await requireDb();
      const membership = await getActiveCompanyMembership(ctx.user.id, input.companyId ?? undefined);
      if (!membership) return null;
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
      const db = await requireDb();
      const membership = await getActiveCompanyMembership(ctx.user.id, input.companyId ?? undefined);
      if (!membership) return { sessions: [], summary: { total: 0, hoursWorked: 0 } };
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
      const membership = await requireAdminOrHR(ctx.user.id, input.companyId);
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
      const membership = await requireAdminOrHR(ctx.user.id, input.companyId);
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
});
