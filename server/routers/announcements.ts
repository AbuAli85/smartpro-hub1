import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and, desc, or, isNull } from "drizzle-orm";
import { announcements, announcementReads, employees } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { requireWorkspaceMembership } from "../_core/membership";
import { requireHrOrAdmin } from "../_core/policy";
import type { User } from "../../drizzle/schema";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

/** Read-only workspace resolver — queries accessible to all company members. */
async function getMembership(user: User, companyId?: number | null) {
  const m = await requireWorkspaceMembership(user, companyId);
  return { company: { id: m.companyId }, member: { role: m.role } };
}

const announcementTypeEnum = z.enum(["announcement", "request", "alert", "reminder"]);

export const announcementsRouter = router({
  // List announcements — admin sees all, employee sees their own + company-wide
  listAnnouncements: protectedProcedure
    .input(z.object({
      type: announcementTypeEnum.optional(),
      targetEmployeeId: z.number().optional(),
      companyId: z.number().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const membership = await getMembership(ctx.user, input.companyId);
      const db = await requireDb();

      const rows = await db
        .select({
          ann: announcements,
          targetFirstName: employees.firstName,
          targetLastName: employees.lastName,
        })
        .from(announcements)
        .leftJoin(employees, eq(announcements.targetEmployeeId, employees.id))
        .where(and(
          eq(announcements.companyId, membership.company.id),
          eq(announcements.isDeleted, false),
        ))
        .orderBy(desc(announcements.createdAt));

      let results = rows.map((r) => ({
        ...r.ann,
        targetEmployeeName: r.targetFirstName
          ? `${r.targetFirstName} ${r.targetLastName ?? ""}`.trim()
          : null,
      }));

      if (input.type) results = results.filter((a) => a.type === input.type);
      if (input.targetEmployeeId !== undefined) {
        results = results.filter(
          (a) => a.targetEmployeeId === input.targetEmployeeId || a.targetEmployeeId === null
        );
      }

      return results;
    }),

  createAnnouncement: protectedProcedure
    .input(z.object({
      title: z.string().min(1).max(255),
      body: z.string().min(1),
      type: announcementTypeEnum.default("announcement"),
      targetEmployeeId: z.number().optional(), // null = all employees
      companyId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const membership = await requireHrOrAdmin(ctx.user as User, input.companyId);
      const db = await requireDb();
      const [result] = await db.insert(announcements).values({
        companyId: membership.companyId,
        createdByUserId: ctx.user.id,
        title: input.title,
        body: input.body,
        type: input.type,
        targetEmployeeId: input.targetEmployeeId,
      });
      return { id: (result as any).insertId };
    }),

  markRead: protectedProcedure
    .input(z.object({
      announcementId: z.number(),
      employeeId: z.number(),
      companyId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const membership = await getMembership(ctx.user, input.companyId);
      const db = await requireDb();
      // Check if already read
      const [existing] = await db
        .select()
        .from(announcementReads)
        .where(and(
          eq(announcementReads.announcementId, input.announcementId),
          eq(announcementReads.employeeId, input.employeeId),
        ));
      if (!existing) {
        await db.insert(announcementReads).values({
          announcementId: input.announcementId,
          employeeId: input.employeeId,
        });
      }
      return { success: true };
    }),

  getReadReceipts: protectedProcedure
    .input(z.object({ announcementId: z.number(), companyId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const membership = await getMembership(ctx.user, input.companyId);
      const db = await requireDb();
      return db
        .select({
          read: announcementReads,
          firstName: employees.firstName,
          lastName: employees.lastName,
        })
        .from(announcementReads)
        .leftJoin(employees, eq(announcementReads.employeeId, employees.id))
        .where(eq(announcementReads.announcementId, input.announcementId));
    }),

  deleteAnnouncement: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      const membership = await requireHrOrAdmin(ctx.user as User, input.companyId);
      const db = await requireDb();
      const [existing] = await db.select().from(announcements).where(eq(announcements.id, input.id));
      if (!existing || existing.companyId !== membership.companyId)
        throw new TRPCError({ code: "NOT_FOUND", message: "Announcement not found" });
      await db.update(announcements).set({ isDeleted: true }).where(eq(announcements.id, input.id));
      return { success: true };
    }),

  getUnreadCount: protectedProcedure
    .input(z.object({ employeeId: z.number(), companyId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const membership = await getMembership(ctx.user, input.companyId);
      const db = await requireDb();
      // Get all announcements for this employee (targeted + company-wide)
      const allAnns = await db
        .select({ id: announcements.id })
        .from(announcements)
        .where(and(
          eq(announcements.companyId, membership.company.id),
          eq(announcements.isDeleted, false),
          or(
            eq(announcements.targetEmployeeId, input.employeeId),
            isNull(announcements.targetEmployeeId),
          ),
        ));
      const reads = await db
        .select({ announcementId: announcementReads.announcementId })
        .from(announcementReads)
        .where(eq(announcementReads.employeeId, input.employeeId));
      const readIds = new Set(reads.map((r) => r.announcementId));
      const unread = allAnns.filter((a) => !readIds.has(a.id)).length;
      return { count: unread };
    }),
});
