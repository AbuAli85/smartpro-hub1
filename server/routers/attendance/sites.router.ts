/**
 * Attendance Sites sub-router.
 *
 * Procedures: createSite · listSites · toggleSite · updateSite · getSiteByToken · siteTypes
 *
 * Extracted from the monolithic attendance.ts to keep site management logic
 * together and independently testable.
 */
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { z } from "zod";
import { attendanceSites } from "../../../drizzle/schema";
import { protectedProcedure, publicProcedure, router } from "../../_core/trpc";
import { requireAdminOrHR, requireDb } from "./helpers";
import type { User } from "../../../drizzle/schema";

export const SITE_TYPES = [
  "mall",
  "brand_store",
  "office",
  "warehouse",
  "client_site",
  "showroom",
  "factory",
  "other",
] as const;

export const siteInputSchema = z.object({
  name: z.string().min(1).max(128),
  location: z.string().max(255).optional(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  radiusMeters: z.number().min(30).max(5000).default(200),
  enforceGeofence: z.boolean().default(false),
  siteType: z.enum(SITE_TYPES).default("office"),
  clientName: z.string().max(255).optional().nullable(),
  dailyRateOmr: z.number().min(0).max(9999.999).default(0),
  operatingHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  operatingHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  timezone: z.string().default("Asia/Muscat"),
  enforceHours: z.boolean().default(false),
});

export const sitesRouter = router({
  createSite: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).merge(siteInputSchema))
    .mutation(async ({ ctx, input }) => {
      const membership = await requireAdminOrHR(ctx.user as User, input.companyId);
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
        dailyRateOmr: String(Math.round(input.dailyRateOmr * 1000) / 1000),
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

  listSites: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const membership = await requireAdminOrHR(ctx.user as User, input.companyId);
      const companyId = input.companyId ?? membership.company.id;
      const db = await requireDb();
      return db
        .select()
        .from(attendanceSites)
        .where(eq(attendanceSites.companyId, companyId))
        .orderBy(desc(attendanceSites.createdAt));
    }),

  toggleSite: protectedProcedure
    .input(z.object({ siteId: z.number(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [site] = await db
        .select()
        .from(attendanceSites)
        .where(eq(attendanceSites.id, input.siteId))
        .limit(1);
      if (!site) throw new TRPCError({ code: "NOT_FOUND" });
      const membership = await requireAdminOrHR(ctx.user as User, site.companyId);
      if (site.companyId !== membership.company.id) throw new TRPCError({ code: "NOT_FOUND" });
      await db
        .update(attendanceSites)
        .set({ isActive: input.isActive })
        .where(eq(attendanceSites.id, input.siteId));
      return { success: true };
    }),

  updateSite: protectedProcedure
    .input(z.object({ siteId: z.number() }).merge(siteInputSchema))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [existing] = await db
        .select()
        .from(attendanceSites)
        .where(eq(attendanceSites.id, input.siteId))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      const membership = await requireAdminOrHR(ctx.user as User, existing.companyId);
      if (existing.companyId !== membership.company.id) throw new TRPCError({ code: "NOT_FOUND" });
      await db
        .update(attendanceSites)
        .set({
          name: input.name,
          location: input.location ?? null,
          lat: input.lat != null ? String(input.lat) : null,
          lng: input.lng != null ? String(input.lng) : null,
          radiusMeters: input.radiusMeters,
          enforceGeofence: input.enforceGeofence,
          siteType: input.siteType,
          clientName: input.clientName ?? null,
          dailyRateOmr: String(Math.round(input.dailyRateOmr * 1000) / 1000),
          operatingHoursStart: input.operatingHoursStart ?? null,
          operatingHoursEnd: input.operatingHoursEnd ?? null,
          timezone: input.timezone,
          enforceHours: input.enforceHours,
        })
        .where(eq(attendanceSites.id, input.siteId));
      const [updated] = await db
        .select()
        .from(attendanceSites)
        .where(eq(attendanceSites.id, input.siteId))
        .limit(1);
      return updated;
    }),

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
