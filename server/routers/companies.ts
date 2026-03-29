import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import {
  createCompany,
  getCompanies,
  getCompanyById,
  getCompanyStats,
  getCompanySubscription,
  getSubscriptionPlans,
  getUserCompany,
  updateCompany,
  getDb,
} from "../db";
import { companyMembers, users } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";

function companyIdFromCreateResult(row: unknown): number {
  if (row && typeof row === "object") {
    const r = row as { insertId?: unknown; id?: unknown };
    if (r.insertId != null) {
      const n = Number(r.insertId);
      if (Number.isFinite(n) && n > 0) return n;
    }
    if (r.id != null) {
      const n = Number(r.id);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to resolve new company id" });
}

/** Adds existing platform users as company_member (no email invites for users not yet registered). */
async function addExistingUsersAsMembers(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  companyId: number,
  inviterUserId: number,
  inviteEmails: string[],
  inviterEmail: string | null | undefined,
): Promise<number> {
  let count = 0;
  const seen = new Set<string>();
  const inviterNorm = inviterEmail?.trim().toLowerCase() ?? "";
  for (const raw of inviteEmails) {
    const email = raw.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    if (email === inviterNorm) continue;

    const [targetUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (!targetUser) continue;

    const [existing] = await db
      .select({ id: companyMembers.id, isActive: companyMembers.isActive })
      .from(companyMembers)
      .where(and(eq(companyMembers.userId, targetUser.id), eq(companyMembers.companyId, companyId)))
      .limit(1);

    if (existing?.isActive) continue;

    if (existing && !existing.isActive) {
      await db
        .update(companyMembers)
        .set({ isActive: true, role: "company_member", invitedBy: inviterUserId })
        .where(eq(companyMembers.id, existing.id));
      count++;
      continue;
    }

    await db.insert(companyMembers).values({
      companyId,
      userId: targetUser.id,
      role: "company_member",
      isActive: true,
      invitedBy: inviterUserId,
    });
    count++;
  }
  return count;
}

// ─── Guard: caller must be company_admin or platform admin ───────────────────
async function assertCompanyAdmin(userId: number, companyId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const [row] = await db
    .select({ role: companyMembers.role })
    .from(companyMembers)
    .where(and(eq(companyMembers.userId, userId), eq(companyMembers.companyId, companyId), eq(companyMembers.isActive, true)))
    .limit(1);
  if (!row || row.role !== "company_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only company admins can perform this action." });
  }
}

export const companiesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    if (!canAccessGlobalAdminProcedures(ctx.user)) {
      const membership = await getUserCompany(ctx.user.id);
      return membership ? [membership.company] : [];
    }
    return getCompanies();
  }),

  getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const company = await getCompanyById(input.id);
    if (!company) throw new TRPCError({ code: "NOT_FOUND" });
    return company;
  }),

  myCompany: protectedProcedure.query(async ({ ctx }) => {
    return getUserCompany(ctx.user.id);
  }),

  myStats: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return null;
    return getCompanyStats(membership.company.id);
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2),
        nameAr: z.string().optional(),
        industry: z.string().optional(),
        country: z.string().default("OM"),
        city: z.string().optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        website: z.string().optional(),
        registrationNumber: z.string().optional(),
        /** Emails of users who already have SmartPRO accounts — they are added as company members. */
        inviteEmails: z.array(z.string().email()).max(50).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const existingMembership = await getUserCompany(ctx.user.id);
      if (existingMembership && !canAccessGlobalAdminProcedures(ctx.user)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You already belong to a company. Use Company Admin to invite teammates.",
        });
      }

      const { inviteEmails = [], ...companyFields } = input;
      const slug = companyFields.name.toLowerCase().replace(/\s+/g, "-") + "-" + nanoid(6);
      const insertResult = await createCompany({ ...companyFields, slug, subscriptionPlanId: 1 });
      const companyId = companyIdFromCreateResult(insertResult);

      let teammatesAdded = 0;
      const db = await getDb();
      if (db) {
        // Tenant onboarding: creator becomes company admin. Platform users who already have a
        // workspace can still provision another company (e.g. Admin UI) without a second self-membership.
        if (!existingMembership) {
          await db.insert(companyMembers).values({
            companyId,
            userId: ctx.user.id,
            role: "company_admin",
            isActive: true,
          });
        }
        if (inviteEmails.length > 0) {
          teammatesAdded = await addExistingUsersAsMembers(
            db,
            companyId,
            ctx.user.id,
            inviteEmails,
            ctx.user.email,
          );
        }
      }

      return { success: true, id: companyId, teammatesAdded };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(2).optional(),
        nameAr: z.string().optional(),
        industry: z.string().optional(),
        city: z.string().optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        website: z.string().optional(),
        registrationNumber: z.string().optional(),
        taxNumber: z.string().optional(),
        status: z.enum(["active", "suspended", "pending", "cancelled"]).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      // Must be company_admin or platform admin
      if (!canAccessGlobalAdminProcedures(ctx.user)) await assertCompanyAdmin(ctx.user.id, id);
      await updateCompany(id, data);
      return { success: true };
    }),

  subscriptionPlans: protectedProcedure.query(() => getSubscriptionPlans()),

  mySubscription: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return null;
    return getCompanySubscription(membership.company.id);
  }),

  // ── Member Management ──────────────────────────────────────────────────────

  /** List all members of the caller's company with user details */
  members: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return [];
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select({
        memberId: companyMembers.id,
        role: companyMembers.role,
        permissions: companyMembers.permissions,
        isActive: companyMembers.isActive,
        joinedAt: companyMembers.joinedAt,
        userId: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        loginMethod: users.loginMethod,
        userRole: users.role,
        platformRole: users.platformRole,
        lastSignedIn: users.lastSignedIn,
      })
      .from(companyMembers)
      .innerJoin(users, eq(users.id, companyMembers.userId))
      .where(eq(companyMembers.companyId, membership.company.id))
      .orderBy(desc(companyMembers.joinedAt));
    return rows;
  }),

  /** Update a member's role within the caller's company */
  updateMemberRole: protectedProcedure
    .input(z.object({
      memberId: z.number(),
      role: z.enum(["company_admin", "company_member", "reviewer", "client"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Verify the member belongs to the caller's company
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      if (!canAccessGlobalAdminProcedures(ctx.user)) await assertCompanyAdmin(ctx.user.id, membership.company.id);
      // Prevent self-demotion if last admin
      const [target] = await db
        .select({ userId: companyMembers.userId, role: companyMembers.role })
        .from(companyMembers)
        .where(and(eq(companyMembers.id, input.memberId), eq(companyMembers.companyId, membership.company.id)))
        .limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      if (target.userId === ctx.user.id && input.role !== "company_admin") {
        // Check if there's another admin
        const admins = await db
          .select({ id: companyMembers.id })
          .from(companyMembers)
          .where(and(eq(companyMembers.companyId, membership.company.id), eq(companyMembers.role, "company_admin"), eq(companyMembers.isActive, true)));
        if (admins.length <= 1) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot demote the last company admin." });
      }
      await db.update(companyMembers).set({ role: input.role }).where(eq(companyMembers.id, input.memberId));
      return { success: true };
    }),

  /** Deactivate (soft-remove) a member from the caller's company */
  removeMember: protectedProcedure
    .input(z.object({ memberId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      if (!canAccessGlobalAdminProcedures(ctx.user)) await assertCompanyAdmin(ctx.user.id, membership.company.id);
      const [target] = await db
        .select({ userId: companyMembers.userId })
        .from(companyMembers)
        .where(and(eq(companyMembers.id, input.memberId), eq(companyMembers.companyId, membership.company.id)))
        .limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      if (target.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot remove yourself." });
      await db.update(companyMembers).set({ isActive: false }).where(eq(companyMembers.id, input.memberId));
      return { success: true };
    }),

  /** Reactivate a previously removed member */
  reactivateMember: protectedProcedure
    .input(z.object({ memberId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      if (!canAccessGlobalAdminProcedures(ctx.user)) await assertCompanyAdmin(ctx.user.id, membership.company.id);
      const [target] = await db
        .select({ id: companyMembers.id })
        .from(companyMembers)
        .where(and(eq(companyMembers.id, input.memberId), eq(companyMembers.companyId, membership.company.id)))
        .limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(companyMembers).set({ isActive: true }).where(eq(companyMembers.id, input.memberId));
      return { success: true };
    }),

  /** Add an existing platform user to the company by email */
  addMemberByEmail: protectedProcedure
    .input(z.object({
      email: z.string().email(),
      role: z.enum(["company_admin", "company_member", "reviewer", "client"]).default("company_member"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      if (!canAccessGlobalAdminProcedures(ctx.user)) await assertCompanyAdmin(ctx.user.id, membership.company.id);
      // Find user by email
      const [targetUser] = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);
      if (!targetUser) throw new TRPCError({ code: "NOT_FOUND", message: "No user found with that email address." });
      // Check if already a member
      const [existing] = await db
        .select({ id: companyMembers.id, isActive: companyMembers.isActive })
        .from(companyMembers)
        .where(and(eq(companyMembers.userId, targetUser.id), eq(companyMembers.companyId, membership.company.id)))
        .limit(1);
      if (existing) {
        if (existing.isActive) throw new TRPCError({ code: "CONFLICT", message: "This user is already a member." });
        // Re-activate
        await db.update(companyMembers).set({ isActive: true, role: input.role }).where(eq(companyMembers.id, existing.id));
        return { success: true, action: "reactivated" as const };
      }
      await db.insert(companyMembers).values({
        companyId: membership.company.id,
        userId: targetUser.id,
        role: input.role,
        isActive: true,
        invitedBy: ctx.user.id,
      });
      return { success: true, action: "added" as const };
    }),
});
