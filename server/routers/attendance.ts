import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and, desc, gte, lte, isNull } from "drizzle-orm";
import { randomBytes } from "crypto";
import {
  attendanceSites,
  attendanceRecords,
  employees,
} from "../../drizzle/schema";
import { getDb, getUserCompany } from "../db";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

async function requireAdminOrHR(userId: number) {
  const membership = await getUserCompany(userId);
  if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "No company membership" });
  const role = membership.member.role;
  if (role !== "company_admin" && role !== "hr_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "HR Admin or Company Admin required" });
  }
  return membership;
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
      const membership = await requireAdminOrHR(ctx.user.id);
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
      const membership = await requireAdminOrHR(ctx.user.id);
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
      const membership = await requireAdminOrHR(ctx.user.id);
      const db = await requireDb();
      const [site] = await db.select().from(attendanceSites).where(eq(attendanceSites.id, input.siteId)).limit(1);
      if (!site || site.companyId !== membership.company.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await db.update(attendanceSites).set({ isActive: input.isActive }).where(eq(attendanceSites.id, input.siteId));
      return { success: true };
    }),

  // ─── Admin: Update site ───────────────────────────────────────────────────
  updateSite: protectedProcedure
    .input(z.object({ siteId: z.number() }).merge(siteInputSchema))
    .mutation(async ({ ctx, input }) => {
      const membership = await requireAdminOrHR(ctx.user.id);
      const db = await requireDb();
      const [existing] = await db.select().from(attendanceSites).where(eq(attendanceSites.id, input.siteId)).limit(1);
      if (!existing || existing.companyId !== membership.company.id) {
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
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Location access is required to check in at this site. Please allow location access in your browser.",
          });
        }
        const distance = haversineMetres(
          parseFloat(site.lat),
          parseFloat(site.lng),
          input.lat,
          input.lng
        );
        if (distance > site.radiusMeters) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You are ${Math.round(distance)}m away from ${site.name}. You must be within ${site.radiusMeters}m to check in.`,
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
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Check-in is only allowed between ${site.operatingHoursStart} and ${site.operatingHoursEnd} (${site.timezone}).`,
          });
        }
      }

      // Resolve employee
      const membership = await getUserCompany(ctx.user.id);
      if (!membership || membership.company.id !== site.companyId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this company" });
      }
      const emp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", site.companyId);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee record not found. Please contact HR." });

      // Check if already checked in today (no checkout)
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const [existing] = await db
        .select()
        .from(attendanceRecords)
        .where(and(
          eq(attendanceRecords.employeeId, emp.id),
          eq(attendanceRecords.companyId, site.companyId),
          gte(attendanceRecords.checkIn, todayStart),
          isNull(attendanceRecords.checkOut),
        ))
        .limit(1);
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Already checked in. Please check out first." });
      }

      const [result] = await db.insert(attendanceRecords).values({
        companyId: site.companyId,
        employeeId: emp.id,
        siteId: site.id,
        siteName: site.name,
        checkIn: new Date(),
        checkInLat: input.lat ? String(input.lat) : null,
        checkInLng: input.lng ? String(input.lng) : null,
        method: "qr_scan",
      });
      const recordId = (result as any).insertId;
      const [record] = await db.select().from(attendanceRecords).where(eq(attendanceRecords.id, recordId)).limit(1);
      return record;
    }),

  // ─── Employee: Check out ──────────────────────────────────────────────────
  checkOut: protectedProcedure
    .input(z.object({
      siteToken: z.string().optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      const emp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", membership.company.id);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee record not found" });

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const [existing] = await db
        .select()
        .from(attendanceRecords)
        .where(and(
          eq(attendanceRecords.employeeId, emp.id),
          eq(attendanceRecords.companyId, membership.company.id),
          gte(attendanceRecords.checkIn, todayStart),
          isNull(attendanceRecords.checkOut),
        ))
        .limit(1);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No active check-in found for today" });
      }

      await db.update(attendanceRecords).set({
        checkOut: new Date(),
        checkOutLat: input.lat ? String(input.lat) : null,
        checkOutLng: input.lng ? String(input.lng) : null,
      }).where(eq(attendanceRecords.id, existing.id));

      const [updated] = await db.select().from(attendanceRecords).where(eq(attendanceRecords.id, existing.id)).limit(1);
      return updated;
    }),

  // ─── Employee: Get today's attendance record ──────────────────────────────
  myToday: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return null;
    const emp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", membership.company.id);
    if (!emp) return null;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [record] = await db
      .select()
      .from(attendanceRecords)
      .where(and(
        eq(attendanceRecords.employeeId, emp.id),
        gte(attendanceRecords.checkIn, todayStart),
      ))
      .orderBy(desc(attendanceRecords.checkIn))
      .limit(1);
    return record ?? null;
  }),

  // ─── Employee: Get attendance history ────────────────────────────────────
  myHistory: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(30) }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) return [];
      const emp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", membership.company.id);
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
      const membership = await requireAdminOrHR(ctx.user.id);
      const companyId = input.companyId ?? membership.company.id;
      const db = await requireDb();

      const targetDate = input.date ? new Date(input.date) : new Date();
      const dayStart = new Date(targetDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(targetDate);
      dayEnd.setHours(23, 59, 59, 999);

      const records = await db
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

      return records;
    }),

  // ─── Admin: Get attendance history for a specific employee ────────────────
  employeeHistory: protectedProcedure
    .input(z.object({
      employeeId: z.number(),
      limit: z.number().min(1).max(100).default(30),
    }))
    .query(async ({ ctx, input }) => {
      const membership = await requireAdminOrHR(ctx.user.id);
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

  // ─── Utility: List available site types ───────────────────────────────────
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
