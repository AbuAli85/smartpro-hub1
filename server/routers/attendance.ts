import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and, desc, gte, like, lt, lte, isNull, ne } from "drizzle-orm";
import { randomBytes } from "crypto";
import {
  attendance,
  attendanceSites,
  attendanceRecords,
  attendanceCorrections,
  employees,
  manualCheckinRequests,
  attendanceAudit,
} from "../../drizzle/schema";
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
  muscatDayUtcRangeExclusiveEnd,
  muscatWallDateTimeToUtc,
} from "@shared/attendanceMuscatTime";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
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

      const [openSession] = await db
        .select()
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

      let record: (typeof attendanceRecords.$inferSelect) | undefined;
      await db.transaction(async (tx) => {
        const [result] = await tx.insert(attendanceRecords).values({
          companyId: site.companyId,
          employeeId: emp.id,
          siteId: site.id,
          siteName: site.name,
          checkIn: new Date(),
          checkInLat: input.lat ? String(input.lat) : null,
          checkInLng: input.lng ? String(input.lng) : null,
          method: "qr_scan",
        });
        const recordId = (result as { insertId?: number }).insertId;
        if (!recordId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Check-in insert failed" });
        const [r] = await tx.select().from(attendanceRecords).where(eq(attendanceRecords.id, recordId)).limit(1);
        record = r;
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
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const membership = await getActiveCompanyMembership(ctx.user.id, input.companyId ?? undefined);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      const emp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", membership.companyId);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee record not found" });

      const [existing] = await db
        .select()
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

      let updated: (typeof attendanceRecords.$inferSelect) | undefined;
      await db.transaction(async (tx) => {
        await tx
          .update(attendanceRecords)
          .set({
            checkOut: new Date(),
            checkOutLat: input.lat ? String(input.lat) : null,
            checkOutLng: input.lng ? String(input.lng) : null,
          })
          .where(eq(attendanceRecords.id, existing.id));
        const [u] = await tx.select().from(attendanceRecords).where(eq(attendanceRecords.id, existing.id)).limit(1);
        updated = u;
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
   * Employee submits a manual check-in request when outside the geo-fence.
   * Requires a justification note. HR admin must approve for attendance to be recorded.
   */
  submitManualCheckIn: protectedProcedure
    .input(z.object({
      siteToken: z.string(),
      justification: z.string().min(10, "Please provide at least 10 characters of justification"),
      lat: z.number().optional(),
      lng: z.number().optional(),
      distanceMeters: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      // Resolve site first — company scope follows the site
      const [site] = await db
        .select()
        .from(attendanceSites)
        .where(and(
          eq(attendanceSites.qrToken, input.siteToken),
          eq(attendanceSites.isActive, true),
        ))
        .limit(1);
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "Invalid or inactive site" });

      const membership = await getActiveCompanyMembership(ctx.user.id, site.companyId);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "No company membership" });

      // Check for duplicate pending request today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const [existing] = await db
        .select()
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
        const [req] = await tx
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
          req: manualCheckinRequests,
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
      if (!empRow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No employee row linked to this user — cannot create attendance record",
        });
      }

      let recordIdOut = 0;
      await db.transaction(async (tx) => {
        const [record] = await tx
          .insert(attendanceRecords)
          .values({
            companyId: membership.company.id,
            employeeId: empRow.id,
            siteId: req.siteId,
            checkIn: req.requestedAt,
            checkInLat: req.lat ?? undefined,
            checkInLng: req.lng ?? undefined,
            method: "manual" as const,
            notes: `Manual check-in approved. Justification: ${req.justification}`,
          })
          .$returningId();
        recordIdOut = record.id;
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
   */
  myManualCheckIns: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(10) }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      return db
        .select({
          req: manualCheckinRequests,
          site: { id: attendanceSites.id, name: attendanceSites.name, siteType: attendanceSites.siteType },
        })
        .from(manualCheckinRequests)
        .leftJoin(attendanceSites, eq(manualCheckinRequests.siteId, attendanceSites.id))
        .where(eq(manualCheckinRequests.employeeUserId, ctx.user.id))
        .orderBy(desc(manualCheckinRequests.requestedAt))
        .limit(input.limit);
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
});
