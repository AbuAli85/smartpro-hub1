import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
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
  getUserCompanyById,
  getUserCompanies,
  updateCompany,
  getDb,
} from "../db";
import { companyInvites, companyMembers, users, employees, companies } from "../../drizzle/schema";
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

  myCompany: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
      if (input?.companyId) return getUserCompanyById(ctx.user.id, input.companyId);
      return getUserCompany(ctx.user.id);
    }),
  myStats: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const membership = input?.companyId
        ? await getUserCompanyById(ctx.user.id, input.companyId)
        : await getUserCompany(ctx.user.id);
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
      // Users can create multiple companies — no restriction
      const existingMembership = await getUserCompany(ctx.user.id);

      const { inviteEmails = [], ownerEmail, ...companyFields } = input;
      const slug = companyFields.name.toLowerCase().replace(/\s+/g, "-") + "-" + nanoid(6);
      const insertResult = await createCompany({ ...companyFields, slug, subscriptionPlanId: 1 });
      const companyId = companyIdFromCreateResult(insertResult);

      let teammatesAdded = 0;
      const db = await getDb();
      if (db) {
        // Creator always becomes company admin of the new company
        const [alreadyMember] = await db
          .select({ id: companyMembers.id })
          .from(companyMembers)
          .where(and(eq(companyMembers.userId, ctx.user.id), eq(companyMembers.companyId, companyId)))
          .limit(1);
        if (!alreadyMember) {
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
        email: z.string().optional(),
        website: z.string().optional(),
        registrationNumber: z.string().optional(),
        taxNumber: z.string().optional(),
        status: z.enum(["active", "suspended", "pending", "cancelled"]).optional(),
        // Extended Oman business profile
        crNumber: z.string().optional(),
        occiNumber: z.string().optional(),
        municipalityLicenceNumber: z.string().optional(),
        laborCardNumber: z.string().optional(),
        pasiNumber: z.string().optional(),
        bankName: z.string().optional(),
        bankAccountNumber: z.string().optional(),
        bankIban: z.string().optional(),
        omanisationTarget: z.number().min(0).max(100).optional(),
        foundedYear: z.number().min(1900).max(2100).optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      // Must be company_admin or platform admin
      if (!canAccessGlobalAdminProcedures(ctx.user)) await assertCompanyAdmin(ctx.user.id, id);
      await updateCompany(id, data as any);
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
  members: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
    const membership = input?.companyId
      ? await getUserCompanyById(ctx.user.id, input.companyId)
      : await getUserCompany(ctx.user.id);
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
      role: z.enum(["company_admin", "company_member", "finance_admin", "hr_admin", "reviewer", "client", "external_auditor"]),
      companyId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const membership = input.companyId ? await getUserCompanyById(ctx.user.id, input.companyId) : await getUserCompany(ctx.user.id);
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
    .input(z.object({ memberId: z.number(), companyId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const membership = input.companyId ? await getUserCompanyById(ctx.user.id, input.companyId) : await getUserCompany(ctx.user.id);
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
    .input(z.object({ memberId: z.number(), companyId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const membership = input.companyId ? await getUserCompanyById(ctx.user.id, input.companyId) : await getUserCompany(ctx.user.id);
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
      role: z.enum(["company_admin", "company_member", "finance_admin", "hr_admin", "reviewer", "client", "external_auditor"]).default("company_member"),
      companyId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const membership = input.companyId ? await getUserCompanyById(ctx.user.id, input.companyId) : await getUserCompany(ctx.user.id);
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
      role: z.enum(["company_admin", "company_member", "finance_admin", "hr_admin", "reviewer", "external_auditor"]).default("company_member"),
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
  listInvites: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return [];
    const membership = input?.companyId ? await getUserCompanyById(ctx.user.id, input.companyId) : await getUserCompany(ctx.user.id);
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
      const memberRole = invite.role as "company_admin" | "company_member" | "reviewer" | "client" | "external_auditor";
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

  /**
   * Returns all employees for the company with their system access status.
   * Each employee row includes:
   *  - HR profile data (name, department, position, email, status)
   *  - accessStatus: 'active' | 'inactive' | 'no_access'
   *  - memberRole: the role they have in company_members (if any)
   *  - memberId: the company_members.id (if any)
   *  - hasLogin: whether they have a users record linked
   */
  employeesWithAccess: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const membership = input?.companyId
      ? await getUserCompanyById(ctx.user.id, input.companyId)
      : await getUserCompany(ctx.user.id);
    if (!membership) return [];
    const companyId = membership.company.id;

    // Get only active/on_leave employees — terminated/resigned staff no longer need system access
    const allEmployees = await db
      .select({
        id: employees.id,
        firstName: employees.firstName,
        lastName: employees.lastName,
        firstNameAr: employees.firstNameAr,
        lastNameAr: employees.lastNameAr,
        email: employees.email,
        department: employees.department,
        position: employees.position,
        status: employees.status,
        userId: employees.userId,
        employeeNumber: employees.employeeNumber,
        nationality: employees.nationality,
        hireDate: employees.hireDate,
      })
      .from(employees)
      .where(and(
        eq(employees.companyId, companyId),
        or(eq(employees.status, 'active'), eq(employees.status, 'on_leave'))
      ))
      .orderBy(asc(employees.firstName));

    // Get all company members
    const allMembers = await db
      .select({
        id: companyMembers.id,
        userId: companyMembers.userId,
        role: companyMembers.role,
        isActive: companyMembers.isActive,
        joinedAt: companyMembers.joinedAt,
      })
      .from(companyMembers)
      .where(eq(companyMembers.companyId, companyId));

    // Get user details for members
    const memberUserIds = allMembers.map((m) => m.userId);
    const userDetails = memberUserIds.length > 0
      ? await db
          .select({ id: users.id, name: users.name, email: users.email, lastSignedIn: users.lastSignedIn })
          .from(users)
          .where(or(...memberUserIds.map((uid) => eq(users.id, uid))))
      : [];

    const userMap = new Map(userDetails.map((u) => [u.id, u]));
    const memberByUserId = new Map(allMembers.map((m) => [m.userId, m]));

    return allEmployees.map((emp) => {
      const member = emp.userId ? memberByUserId.get(emp.userId) : null;
      const userInfo = emp.userId ? userMap.get(emp.userId) : null;

      // Also try to match by email if userId not set
      let emailMatchedMember: typeof member = null;
      if (!member && emp.email) {
        const emailUser = userDetails.find((u) => u.email?.toLowerCase() === emp.email?.toLowerCase());
        if (emailUser) {
          emailMatchedMember = memberByUserId.get(emailUser.id) ?? null;
        }
      }

      const activeMember = member ?? emailMatchedMember;
      const accessStatus = activeMember
        ? activeMember.isActive ? 'active' : 'inactive'
        : 'no_access';

      return {
        employeeId: emp.id,
        firstName: emp.firstName,
        lastName: emp.lastName,
        firstNameAr: emp.firstNameAr,
        lastNameAr: emp.lastNameAr,
        email: emp.email,
        department: emp.department,
        position: emp.position,
        employeeStatus: emp.status,
        employeeNumber: emp.employeeNumber,
        nationality: emp.nationality,
        hireDate: emp.hireDate,
        // Access info
        accessStatus,
        memberRole: activeMember?.role ?? null,
        memberId: activeMember?.id ?? null,
        hasLogin: !!(emp.userId || emailMatchedMember),
        lastSignedIn: userInfo?.lastSignedIn ?? null,
        loginEmail: userInfo?.email ?? null,
      };
    });
  }),

  /**
   * Grant system access to an existing employee by their employee ID.
   * Looks up the employee's email, finds or creates a company_member record.
   * If the employee has a SmartPRO account (matched by email), links them directly.
   * Otherwise creates a pending invite.
   */
  grantEmployeeAccess: protectedProcedure
    .input(z.object({
      employeeId: z.number(),
      role: z.enum(["company_admin", "company_member", "finance_admin", "hr_admin", "reviewer", "external_auditor"]).default("company_member"),
      origin: z.string().url().optional(),
      companyId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const membership = input.companyId
        ? await getUserCompanyById(ctx.user.id, input.companyId)
        : await getUserCompany(ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      if (!canAccessGlobalAdminProcedures(ctx.user)) await assertCompanyAdmin(ctx.user.id, membership.company.id);

      const [emp] = await db
        .select({ id: employees.id, email: employees.email, userId: employees.userId, firstName: employees.firstName, lastName: employees.lastName })
        .from(employees)
        .where(and(eq(employees.id, input.employeeId), eq(employees.companyId, membership.company.id)))
        .limit(1);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found." });

      // If employee has a userId already, just update/create their member record
      if (emp.userId) {
        const [existing] = await db
          .select({ id: companyMembers.id, isActive: companyMembers.isActive })
          .from(companyMembers)
          .where(and(eq(companyMembers.userId, emp.userId), eq(companyMembers.companyId, membership.company.id)))
          .limit(1);
        if (existing) {
          await db.update(companyMembers).set({ isActive: true, role: input.role }).where(eq(companyMembers.id, existing.id));
        } else {
          await db.insert(companyMembers).values({ companyId: membership.company.id, userId: emp.userId, role: input.role, isActive: true, invitedBy: ctx.user.id });
        }
        return { success: true, action: 'linked' as const, message: `Access granted to ${emp.firstName} ${emp.lastName}` };
      }

      // Try to find user by email
      if (emp.email) {
        const [targetUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, emp.email.toLowerCase())).limit(1);
        if (targetUser) {
          // Link employee userId
          await db.update(employees).set({ userId: targetUser.id }).where(eq(employees.id, emp.id));
          const [existing] = await db
            .select({ id: companyMembers.id, isActive: companyMembers.isActive })
            .from(companyMembers)
            .where(and(eq(companyMembers.userId, targetUser.id), eq(companyMembers.companyId, membership.company.id)))
            .limit(1);
          if (existing) {
            await db.update(companyMembers).set({ isActive: true, role: input.role }).where(eq(companyMembers.id, existing.id));
          } else {
            await db.insert(companyMembers).values({ companyId: membership.company.id, userId: targetUser.id, role: input.role, isActive: true, invitedBy: ctx.user.id });
          }
          return { success: true, action: 'linked' as const, message: `Access granted to ${emp.firstName} ${emp.lastName}` };
        }

        // No SmartPRO account — create invite
        if (input.origin) {
          const token = randomBytes(32).toString('hex');
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          await db
            .update(companyInvites)
            .set({ revokedAt: new Date() })
            .where(and(eq(companyInvites.email, emp.email.toLowerCase()), eq(companyInvites.companyId, membership.company.id)));
          await db.insert(companyInvites).values({
            companyId: membership.company.id,
            email: emp.email.toLowerCase(),
            role: input.role,
            token,
            invitedBy: ctx.user.id,
            expiresAt,
          });
          const inviteUrl = `${input.origin}/invite/${token}`;
          await notifyOwner({
            title: `Invite sent to employee ${emp.firstName} ${emp.lastName}`,
            content: `Invite link for ${emp.email}: ${inviteUrl} (expires in 7 days)`,
          });
          return { success: true, action: 'invited' as const, message: `Invite sent to ${emp.email}`, inviteUrl };
        }
        return { success: true, action: 'no_account' as const, message: `Employee ${emp.firstName} ${emp.lastName} does not have a SmartPRO account yet. Add their email to send an invite.` };
      }

      throw new TRPCError({ code: "BAD_REQUEST", message: "Employee has no email address. Please update their profile first." });
    }),

  /**
   * Revoke system access from an employee (deactivates their company_member record).
   */
  revokeEmployeeAccess: protectedProcedure
    .input(z.object({ employeeId: z.number(), companyId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const membership = input.companyId
        ? await getUserCompanyById(ctx.user.id, input.companyId)
        : await getUserCompany(ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      if (!canAccessGlobalAdminProcedures(ctx.user)) await assertCompanyAdmin(ctx.user.id, membership.company.id);

      const [emp] = await db
        .select({ id: employees.id, email: employees.email, userId: employees.userId })
        .from(employees)
        .where(and(eq(employees.id, input.employeeId), eq(employees.companyId, membership.company.id)))
        .limit(1);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND" });

      if (emp.userId) {
        await db.update(companyMembers).set({ isActive: false }).where(and(eq(companyMembers.userId, emp.userId), eq(companyMembers.companyId, membership.company.id)));
        return { success: true };
      }
      if (emp.email) {
        const [targetUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, emp.email.toLowerCase())).limit(1);
        if (targetUser) {
          await db.update(companyMembers).set({ isActive: false }).where(and(eq(companyMembers.userId, targetUser.id), eq(companyMembers.companyId, membership.company.id)));
          return { success: true };
        }
      }
      return { success: true };
    }),

  /**
   * Update the role of an employee's system access.
   */
  updateEmployeeAccessRole: protectedProcedure
    .input(z.object({
      employeeId: z.number(),
      role: z.enum(["company_admin", "company_member", "finance_admin", "hr_admin", "reviewer", "external_auditor"]),
      companyId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const membership = input.companyId
        ? await getUserCompanyById(ctx.user.id, input.companyId)
        : await getUserCompany(ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      if (!canAccessGlobalAdminProcedures(ctx.user)) await assertCompanyAdmin(ctx.user.id, membership.company.id);

      const [emp] = await db
        .select({ id: employees.id, email: employees.email, userId: employees.userId })
        .from(employees)
        .where(and(eq(employees.id, input.employeeId), eq(employees.companyId, membership.company.id)))
        .limit(1);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND" });

      const resolveUserId = async (): Promise<number | null> => {
        if (emp.userId) return emp.userId;
        if (emp.email) {
          const [u] = await db!.select({ id: users.id }).from(users).where(eq(users.email, emp.email.toLowerCase())).limit(1);
          return u?.id ?? null;
        }
        return null;
      };

      const userId = await resolveUserId();
      if (!userId) throw new TRPCError({ code: "BAD_REQUEST", message: "Employee has no linked SmartPRO account." });

      const [member] = await db
        .select({ id: companyMembers.id })
        .from(companyMembers)
        .where(and(eq(companyMembers.userId, userId), eq(companyMembers.companyId, membership.company.id)))
        .limit(1);
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "No active access record found for this employee." });

      await db.update(companyMembers).set({ role: input.role }).where(eq(companyMembers.id, member.id));
      return { success: true };
    }),

  // ─── LIST ALL COMPANIES FOR USER ─────────────────────────────────────────────
  myCompanies: protectedProcedure.query(async ({ ctx }) => {
    return getUserCompanies(ctx.user.id);
  }),

  // ─── GET EXPIRY SETTINGS ────────────────────────────────────────────────────
  getExpirySettings: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [member] = await db
        .select({ role: companyMembers.role })
        .from(companyMembers)
        .where(and(eq(companyMembers.userId, ctx.user.id), eq(companyMembers.companyId, input.companyId), eq(companyMembers.isActive, true)))
        .limit(1);
      if (!member) throw new TRPCError({ code: "FORBIDDEN" });
      const [company] = await db
        .select({ expiryWarningDays: companies.expiryWarningDays })
        .from(companies)
        .where(eq(companies.id, input.companyId))
        .limit(1);
      return { expiryWarningDays: company?.expiryWarningDays ?? 30 };
    }),

  // ─── UPDATE COMPANY PROFILE ──────────────────────────────────────────────────
  updateMyCompany: protectedProcedure
    .input(
      z.object({
        companyId: z.number(),
        name: z.string().min(2).optional(),
        nameAr: z.string().optional(),
        industry: z.string().optional(),
        country: z.string().optional(),
        city: z.string().optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        website: z.string().optional(),
        registrationNumber: z.string().optional(),
        taxNumber: z.string().optional(),
        description: z.string().optional(),
        expiryWarningDays: z.number().int().min(1).max(365).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [member] = await db
        .select({ role: companyMembers.role })
        .from(companyMembers)
        .where(and(eq(companyMembers.userId, ctx.user.id), eq(companyMembers.companyId, input.companyId), eq(companyMembers.isActive, true)))
        .limit(1);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this company." });
      const adminRoles = ["owner", "company_admin", "hr_admin"];
      if (!adminRoles.includes(member.role ?? "")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can update company settings." });
      }
      const { companyId, ...updateData } = input;
      const cleanData = Object.fromEntries(Object.entries(updateData).filter(([, v]) => v !== undefined));
      await updateCompany(companyId, cleanData as any);
      return { success: true };
    }),

  /**
   * Grant one employee access to multiple companies at once.
   * The caller must be company_admin in each target company.
   * Each entry in `grants` specifies a companyId and the role to assign.
   */
  grantMultiCompanyAccess: protectedProcedure
    .input(z.object({
      employeeId: z.number(),
      sourceCompanyId: z.number(), // the company the employee belongs to
      grants: z.array(z.object({
        companyId: z.number(),
        role: z.enum(["company_admin", "company_member", "finance_admin", "hr_admin", "reviewer", "external_auditor"]),
      })).min(1),
      origin: z.string().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Verify caller is admin in the source company (where the employee lives)
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        await assertCompanyAdmin(ctx.user.id, input.sourceCompanyId);
      }

      // Fetch the employee from the source company
      const [emp] = await db
        .select({ id: employees.id, email: employees.email, userId: employees.userId, firstName: employees.firstName, lastName: employees.lastName })
        .from(employees)
        .where(and(eq(employees.id, input.employeeId), eq(employees.companyId, input.sourceCompanyId)))
        .limit(1);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found in source company." });
      if (!emp.email) throw new TRPCError({ code: "BAD_REQUEST", message: "Employee has no email address. Please update their profile first." });

      const results: Array<{ companyId: number; companyName: string; action: string; message: string }> = [];

      for (const grant of input.grants) {
        // Verify caller is admin in each target company too
        const targetMembership = await getUserCompanyById(ctx.user.id, grant.companyId);
        if (!targetMembership) {
          results.push({ companyId: grant.companyId, companyName: "Unknown", action: "skipped", message: "You are not a member of this company." });
          continue;
        }
        if (!canAccessGlobalAdminProcedures(ctx.user)) {
          const [adminCheck] = await db
            .select({ role: companyMembers.role })
            .from(companyMembers)
            .where(and(eq(companyMembers.userId, ctx.user.id), eq(companyMembers.companyId, grant.companyId), eq(companyMembers.isActive, true)))
            .limit(1);
          if (!adminCheck || adminCheck.role !== "company_admin") {
            results.push({ companyId: grant.companyId, companyName: targetMembership.company.name, action: "skipped", message: "You are not an admin of this company." });
            continue;
          }
        }

        // Resolve or create the user account
        let targetUserId: number | null = emp.userId ?? null;
        if (!targetUserId && emp.email) {
          const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, emp.email.toLowerCase())).limit(1);
          if (existingUser) {
            targetUserId = existingUser.id;
            // Link employee to user in source company
            await db.update(employees).set({ userId: targetUserId }).where(eq(employees.id, emp.id));
          }
        }

        if (targetUserId) {
          // Grant / update membership in target company
          const [existing] = await db
            .select({ id: companyMembers.id })
            .from(companyMembers)
            .where(and(eq(companyMembers.userId, targetUserId), eq(companyMembers.companyId, grant.companyId)))
            .limit(1);
          if (existing) {
            await db.update(companyMembers).set({ isActive: true, role: grant.role }).where(eq(companyMembers.id, existing.id));
          } else {
            await db.insert(companyMembers).values({ companyId: grant.companyId, userId: targetUserId, role: grant.role, isActive: true, invitedBy: ctx.user.id });
          }
          results.push({ companyId: grant.companyId, companyName: targetMembership.company.name, action: "granted", message: `Access granted as ${grant.role}` });
        } else if (emp.email && input.origin) {
          // No account yet — send invite for this company
          const token = randomBytes(32).toString('hex');
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          await db.update(companyInvites).set({ revokedAt: new Date() }).where(and(eq(companyInvites.email, emp.email.toLowerCase()), eq(companyInvites.companyId, grant.companyId)));
          await db.insert(companyInvites).values({ companyId: grant.companyId, email: emp.email.toLowerCase(), role: grant.role, token, invitedBy: ctx.user.id, expiresAt });
          results.push({ companyId: grant.companyId, companyName: targetMembership.company.name, action: "invited", message: `Invite sent to ${emp.email}` });
        } else {
          results.push({ companyId: grant.companyId, companyName: targetMembership.company.name, action: "no_account", message: "Employee has no SmartPRO account yet. Add an origin URL to send an invite." });
        }
      }

      return { success: true, results };
    }),

  /**
   * Get all users and their roles across all companies the caller manages.
   * Returns a user-centric view: each user with their memberships per company.
   */
  getAllUsersAcrossCompanies: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    // Get all companies the caller has admin access to
    const callerCompanies = await getUserCompanies(ctx.user.id);
    const adminCompanyIds = callerCompanies
      .filter(c => c.member.role === "company_admin" || canAccessGlobalAdminProcedures(ctx.user))
      .map(c => c.company.id);
    if (adminCompanyIds.length === 0) return [];
    // Get all members across these companies
    const rows = await db
      .select({
        memberId: companyMembers.id,
        userId: companyMembers.userId,
        companyId: companyMembers.companyId,
        role: companyMembers.role,
        isActive: companyMembers.isActive,
        joinedAt: companyMembers.joinedAt,
        userName: users.name,
        userEmail: users.email,
        userAvatarUrl: users.avatarUrl,
        companyName: companies.name,
      })
      .from(companyMembers)
      .innerJoin(users, eq(users.id, companyMembers.userId))
      .innerJoin(companies, eq(companies.id, companyMembers.companyId))
      .where(
        adminCompanyIds.length === 1
          ? eq(companyMembers.companyId, adminCompanyIds[0])
          : or(...adminCompanyIds.map(id => eq(companyMembers.companyId, id)))
      )
      .orderBy(asc(users.name), asc(companies.name));
    // Group by userId
    const userMap = new Map<number, {
      userId: number;
      name: string | null;
      email: string | null;
      avatarUrl: string | null;
      memberships: Array<{ memberId: number; companyId: number; companyName: string; role: string; isActive: boolean; joinedAt: Date }>;
    }>();
    for (const row of rows) {
      if (!userMap.has(row.userId)) {
        userMap.set(row.userId, {
          userId: row.userId,
          name: row.userName,
          email: row.userEmail,
          avatarUrl: row.userAvatarUrl,
          memberships: [],
        });
      }
      userMap.get(row.userId)!.memberships.push({
        memberId: row.memberId,
        companyId: row.companyId,
        companyName: row.companyName,
        role: row.role,
        isActive: row.isActive,
        joinedAt: row.joinedAt,
      });
    }
    return Array.from(userMap.values());
  }),

  /**
   * Revoke a user's access to a specific company (admin only) — used by Multi-Company Roles page.
   */
  revokeMemberAccess: protectedProcedure
    .input(z.object({
      memberId: z.number(),
      companyId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const callerMembership = await getUserCompanyById(ctx.user.id, input.companyId);
      if (!callerMembership?.member || callerMembership.member.role !== "company_admin") {
        if (!canAccessGlobalAdminProcedures(ctx.user)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only company admins can revoke access" });
        }
      }
      await db.update(companyMembers)
        .set({ isActive: false })
        .where(and(eq(companyMembers.id, input.memberId), eq(companyMembers.companyId, input.companyId)));
      return { success: true };
    }),
});
