import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, like, or } from "drizzle-orm";
import { z } from "zod";
import { escapeLike } from "@shared/objectUtils";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { canAccessSanadIntelFull, canAccessSanadIntelRead } from "@shared/sanadRoles";
import { getDb } from "../../db";
import { sanadOfficeMembers, users } from "../../../drizzle/schema";
import { protectedProcedure } from "../../_core/trpc";
import {
  assertSanadOfficeAccess,
  assertSanadOfficeRosterAdmin,
  countSanadOfficeOwners,
} from "../../sanadAccess";

function assertCanAssignSanadOfficeOwner(user: { platformRole?: string | null; role?: string | null }): void {
  if (canAccessGlobalAdminProcedures(user)) return;
  if (canAccessSanadIntelFull(user)) return;
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Only platform or SANAD network administrators can assign the owner role.",
  });
}

/** SANAD office roster procedures (extracted from the main sanad router for maintainability). */
export const sanadRosterProcedures = {
  /** Search platform users by name/email for SANAD roster assignment (intel read+). */
  searchUsersForSanadRoster: protectedProcedure
    .input(z.object({ query: z.string().min(2).max(120), officeId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      if (input.officeId != null) {
        try {
          await assertSanadOfficeRosterAdmin(db as never, ctx.user, input.officeId);
        } catch {
          if (!canAccessSanadIntelRead(ctx.user)) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "SANAD network access or office owner/manager permission is required to search users for this roster.",
            });
          }
        }
      } else if (!canAccessSanadIntelRead(ctx.user)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "SANAD network or compliance access is required to search users for roster assignment.",
        });
      }
      const q = `%${escapeLike(input.query.trim())}%`;
      return db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          platformRole: users.platformRole,
        })
        .from(users)
        .where(or(like(users.email, q), like(users.name, q)))
        .orderBy(asc(users.id))
        .limit(20);
    }),

  /** Office roster — platform / SANAD intel read, or any office member. */
  listSanadOfficeMembers: protectedProcedure
    .input(z.object({ officeId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      if (!canAccessSanadIntelRead(ctx.user)) {
        await assertSanadOfficeAccess(db as never, ctx.user.id, input.officeId);
      }
      return db
        .select({
          membershipId: sanadOfficeMembers.id,
          userId: users.id,
          role: sanadOfficeMembers.role,
          name: users.name,
          email: users.email,
          platformRole: users.platformRole,
          createdAt: sanadOfficeMembers.createdAt,
        })
        .from(sanadOfficeMembers)
        .innerJoin(users, eq(users.id, sanadOfficeMembers.userId))
        .where(eq(sanadOfficeMembers.sanadOfficeId, input.officeId))
        .orderBy(desc(sanadOfficeMembers.createdAt));
    }),

  addSanadOfficeMember: protectedProcedure
    .input(
      z.object({
        officeId: z.number(),
        userId: z.number(),
        role: z.enum(["owner", "manager", "staff"]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await assertSanadOfficeRosterAdmin(db as never, ctx.user, input.officeId);
      if (input.role === "owner") {
        assertCanAssignSanadOfficeOwner(ctx.user);
      }
      const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).limit(1);
      if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      try {
        await db.insert(sanadOfficeMembers).values({
          sanadOfficeId: input.officeId,
          userId: input.userId,
          role: input.role,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("Duplicate") || msg.includes("duplicate")) {
          throw new TRPCError({ code: "CONFLICT", message: "This user is already a member of this office." });
        }
        throw e;
      }
      return { success: true };
    }),

  updateSanadOfficeMemberRole: protectedProcedure
    .input(
      z.object({
        officeId: z.number(),
        userId: z.number(),
        role: z.enum(["owner", "manager", "staff"]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await assertSanadOfficeRosterAdmin(db as never, ctx.user, input.officeId);
      const [row] = await db
        .select({ role: sanadOfficeMembers.role })
        .from(sanadOfficeMembers)
        .where(
          and(
            eq(sanadOfficeMembers.sanadOfficeId, input.officeId),
            eq(sanadOfficeMembers.userId, input.userId),
          ),
        )
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Office membership not found." });
      if (input.role === "owner") {
        assertCanAssignSanadOfficeOwner(ctx.user);
      }
      if (row.role === "owner" && input.role !== "owner") {
        const owners = await countSanadOfficeOwners(db as never, input.officeId);
        if (owners <= 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot change role: this is the only owner for the office. Add another owner first.",
          });
        }
      }
      await db
        .update(sanadOfficeMembers)
        .set({ role: input.role })
        .where(
          and(
            eq(sanadOfficeMembers.sanadOfficeId, input.officeId),
            eq(sanadOfficeMembers.userId, input.userId),
          ),
        );
      return { success: true };
    }),

  removeSanadOfficeMember: protectedProcedure
    .input(z.object({ officeId: z.number(), userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await assertSanadOfficeRosterAdmin(db as never, ctx.user, input.officeId);
      const [row] = await db
        .select({ role: sanadOfficeMembers.role })
        .from(sanadOfficeMembers)
        .where(
          and(
            eq(sanadOfficeMembers.sanadOfficeId, input.officeId),
            eq(sanadOfficeMembers.userId, input.userId),
          ),
        )
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Office membership not found." });
      if (row.role === "owner") {
        const owners = await countSanadOfficeOwners(db as never, input.officeId);
        if (owners <= 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot remove the only owner for this office.",
          });
        }
      }
      await db
        .delete(sanadOfficeMembers)
        .where(
          and(
            eq(sanadOfficeMembers.sanadOfficeId, input.officeId),
            eq(sanadOfficeMembers.userId, input.userId),
          ),
        );
      return { success: true };
    }),
};
