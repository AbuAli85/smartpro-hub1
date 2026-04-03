import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and, desc, gte, lte, isNull, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import {
  attendanceSites,
  attendanceRecords,
  employees,
  companyMembers,
  users,
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

export const attendanceRouter = router({
  // ─── Admin: Create attendance site with QR token ──────────────────────────
  createSite: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      name: z.string().min(1).max(128),
      location: z.string().max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await requireAdminOrHR(ctx.user.id);
      const companyId = input.companyId ?? membership.company.id;
      const db = await requireDb();
      const qrToken = randomBytes(24).toString("hex");
      const [result] = await db.insert(attendanceSites).values({
        companyId,
        name: input.name,
        location: input.location ?? null,
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
      return { id: site.id, name: site.name, location: site.location, companyId: site.companyId };
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

      // Resolve employee
      const membership = await getUserCompany(ctx.user.id);
      if (!membership || membership.company.id !== site.companyId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this company" });
      }
      const emp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", site.companyId);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee record not found" });

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

  // ─── Admin: Update a site name/location/notes ────────────────────────────────
  updateSite: protectedProcedure
    .input(z.object({
      siteId: z.number(),
      name: z.string().min(1).max(128),
      location: z.string().max(255).optional(),
      notes: z.string().optional(),
    }))
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
      }).where(eq(attendanceSites.id, input.siteId));
      const [updated] = await db.select().from(attendanceSites).where(eq(attendanceSites.id, input.siteId)).limit(1);
      return updated;
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
});
