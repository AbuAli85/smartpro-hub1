import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { randomBytes } from "crypto";
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
import { companyInvites, companyMembers, users } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { notifyOwner } from "../_core/notification";

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
        /**
         * Optional: email of an existing user who should be assigned as company_admin.
         * Only honoured when the caller is a platform operator (canAccessGlobalAdminProcedures).
         * Useful for Admin "New Company" form where the operator creates a workspace on behalf of a client.
         */
        ownerEmail: z.string().email().optional(),
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

      const { inviteEmails = [], ownerEmail, ...companyFields } = input;
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

        // Platform admin "New Company" with ownerEmail: assign the specified user as company_admin
        if (ownerEmail && canAccessGlobalAdminProcedures(ctx.user)) {
          const [ownerUser] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.email, ownerEmail.toLowerCase()))
            .limit(1);
          if (ownerUser && ownerUser.id !== ctx.user.id) {
            // Check not already a member
            const [ownerMember] = await db
              .select({ id: companyMembers.id })
              .from(companyMembers)
              .where(and(eq(companyMembers.userId, ownerUser.id), eq(companyMembers.companyId, companyId)))
              .limit(1);
            if (!ownerMember) {
              await db.insert(companyMembers).values({
                companyId,
                userId: ownerUser.id,
                role: "company_admin",
                isActive: true,
                invitedBy: ctx.user.id,
              });
              teammatesAdded++;
            }
          }
        }

        if (inviteEmails.length > 0) {
          teammatesAdded += await addExistingUsersAsMembers(
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
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      if (!canAccessGlobalAdminProcedures(ctx.user)) await assertCompanyAdmin(ctx.user.id, membership.company.id);
      const [target] = await db
        .select({ userId: companyMembers.userId, role: companyMembers.role })
        .from(companyMembers)
        .where(and(eq(companyMembers.id, input.memberId), eq(companyMembers.companyId, membership.company.id)))
        .limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      if (target.userId === ctx.user.id && input.role !== "company_admin") {
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
      const [targetUser] = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);
      if (!targetUser) throw new TRPCError({ code: "NOT_FOUND", message: "No user found with that email address." });
      const [existing] = await db
        .select({ id: companyMembers.id, isActive: companyMembers.isActive })
        .from(companyMembers)
        .where(and(eq(companyMembers.userId, targetUser.id), eq(companyMembers.companyId, membership.company.id)))
        .limit(1);
      if (existing) {
        if (existing.isActive) throw new TRPCError({ code: "CONFLICT", message: "This user is already a member." });
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

  // ── Invite Pipeline (for users without SmartPRO accounts) ─────────────────

  /**
   * Creates a time-limited invite token for a user who doesn't yet have a SmartPRO account.
   * Sends a notification to the owner with the invite URL.
   * The invitee follows the link, signs up / signs in, and calls acceptInvite.
   */
  createInvite: protectedProcedure
    .input(z.object({
      email: z.string().email(),
      role: z.enum(["company_admin", "company_member", "finance_admin", "hr_admin", "reviewer"]).default("company_member"),
      origin: z.string().url(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const membership = await getUserCompany(ctx.user.id);
      if (!membership && !canAccessGlobalAdminProcedures(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You must belong to a company to invite members." });
      }
      const companyId = membership?.company.id;
      if (!companyId) throw new TRPCError({ code: "BAD_REQUEST", message: "No active company found." });
      if (!canAccessGlobalAdminProcedures(ctx.user)) await assertCompanyAdmin(ctx.user.id, companyId);
      // If user already has an account, suggest addMemberByEmail instead
      const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email.toLowerCase())).limit(1);
      if (existingUser) {
        const [existingMember] = await db
          .select({ id: companyMembers.id, isActive: companyMembers.isActive })
          .from(companyMembers)
          .where(and(eq(companyMembers.userId, existingUser.id), eq(companyMembers.companyId, companyId)))
          .limit(1);
        if (existingMember?.isActive) throw new TRPCError({ code: "CONFLICT", message: "This user is already a member." });
      }
      // Revoke any existing pending invite for same email+company
      await db
        .update(companyInvites)
        .set({ revokedAt: new Date() })
        .where(and(eq(companyInvites.email, input.email.toLowerCase()), eq(companyInvites.companyId, companyId)));
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      await db.insert(companyInvites).values({
        companyId,
        email: input.email.toLowerCase(),
        role: input.role,
        token,
        invitedBy: ctx.user.id,
        expiresAt,
      });
      const inviteUrl = `${input.origin}/invite/${token}`;
      const companyName = membership?.company.name ?? "SmartPRO";
      await notifyOwner({
        title: `Team invite sent to ${input.email}`,
        content: `${ctx.user.name ?? ctx.user.email} invited ${input.email} to join ${companyName} as ${input.role.replace(/_/g, " ")}. Invite link: ${inviteUrl} (expires in 7 days)`,
      });
      return { success: true, token, inviteUrl, expiresAt };
    }),

  /** List all invites for the caller's company (pending, accepted, revoked). */
  listInvites: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return [];
    if (!canAccessGlobalAdminProcedures(ctx.user)) await assertCompanyAdmin(ctx.user.id, membership.company.id);
    return db
      .select({
        id: companyInvites.id,
        email: companyInvites.email,
        role: companyInvites.role,
        token: companyInvites.token,
        expiresAt: companyInvites.expiresAt,
        acceptedAt: companyInvites.acceptedAt,
        revokedAt: companyInvites.revokedAt,
        createdAt: companyInvites.createdAt,
        inviterName: users.name,
      })
      .from(companyInvites)
      .leftJoin(users, eq(users.id, companyInvites.invitedBy))
      .where(eq(companyInvites.companyId, membership.company.id))
      .orderBy(desc(companyInvites.createdAt));
  }),

  /** Revoke a pending invite. */
  revokeInvite: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const membership = await getUserCompany(ctx.user.id);
      if (!membership && !canAccessGlobalAdminProcedures(ctx.user)) throw new TRPCError({ code: "FORBIDDEN" });
      if (membership && !canAccessGlobalAdminProcedures(ctx.user)) await assertCompanyAdmin(ctx.user.id, membership.company.id);
      await db.update(companyInvites).set({ revokedAt: new Date() }).where(eq(companyInvites.id, input.id));
      return { success: true };
    }),

  /** Accept an invite token — adds the signed-in user to the company. */
  acceptInvite: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [invite] = await db
        .select()
        .from(companyInvites)
        .where(eq(companyInvites.token, input.token))
        .limit(1);
      if (!invite) throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found or already used." });
      if (invite.revokedAt) throw new TRPCError({ code: "FORBIDDEN", message: "This invite has been revoked." });
      if (invite.acceptedAt) throw new TRPCError({ code: "CONFLICT", message: "This invite has already been accepted." });
      if (new Date() > invite.expiresAt) throw new TRPCError({ code: "FORBIDDEN", message: "This invite has expired. Please ask your admin to resend it." });
      const [existing] = await db
        .select({ id: companyMembers.id, isActive: companyMembers.isActive })
        .from(companyMembers)
        .where(and(eq(companyMembers.userId, ctx.user.id), eq(companyMembers.companyId, invite.companyId)))
        .limit(1);
      if (existing?.isActive) throw new TRPCError({ code: "CONFLICT", message: "You are already a member of this company." });
      // invite.role is varchar in schema; cast to the companyMembers enum type
      const memberRole = invite.role as "company_admin" | "company_member" | "reviewer" | "client";
      if (existing && !existing.isActive) {
        await db.update(companyMembers).set({ isActive: true, role: memberRole }).where(eq(companyMembers.id, existing.id));
      } else {
        await db.insert(companyMembers).values({
          companyId: invite.companyId,
          userId: ctx.user.id,
          role: memberRole,
          isActive: true,
          invitedBy: invite.invitedBy,
        });
      }
      await db.update(companyInvites).set({ acceptedAt: new Date() }).where(eq(companyInvites.id, invite.id));
      return { success: true, companyId: invite.companyId, role: invite.role };
    }),

  /** Fetch invite metadata for the accept-invite page (no auth required for preview). */
  getInviteInfo: protectedProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [invite] = await db
        .select({
          id: companyInvites.id,
          email: companyInvites.email,
          role: companyInvites.role,
          expiresAt: companyInvites.expiresAt,
          acceptedAt: companyInvites.acceptedAt,
          revokedAt: companyInvites.revokedAt,
          companyId: companyInvites.companyId,
        })
        .from(companyInvites)
        .where(eq(companyInvites.token, input.token))
        .limit(1);
      if (!invite) throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found." });
      return invite;
    }),
});
