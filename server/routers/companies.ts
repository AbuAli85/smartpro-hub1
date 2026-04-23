import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { randomBytes } from "crypto";
import { z } from "zod";
import { canAccessGlobalAdminProcedures, mapMemberRoleToPlatformRole } from "@shared/rbac";
import { sanitizeRoleNavExtensions } from "@shared/roleNavConfig";
import {
  createCompany,
  getCompanies,
  getCompanyById,
  getCompanyStats,
  getCompanySubscription,
  getSubscriptionPlans,
  getUserCompanyById,
  getUserCompanies,
  updateCompany,
  getDb,
} from "../db";
import { companyInvites, companyMembers, users, employees, companies, companyOmanizationSnapshots } from "../../drizzle/schema";
import { computeOmanizationRate, isOmaniNationality } from "../../shared/omanization";
import { requireWorkspaceMembership } from "../_core/membership";
import { requireActiveCompanyId } from "../_core/tenant";
import type { User } from "../../drizzle/schema";
import { resolvePublicAppBaseUrl } from "../_core/publicAppUrl";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { notifyOwner } from "../_core/notification";
import { sendInviteEmail, sendHRLetterEmail, sendContractSigningEmail } from "../email";
import { buildInviteEmailHtml, buildHRLetterEmailHtml, buildContractSigningEmailHtml } from "../emailPreview";
import { buildAccessAnalyticsOverview } from "../accessAnalytics";
import { fetchEmployeesWithAccessData } from "../employeesWithAccessData";
import {
  recordInviteAcceptedAudit,
  recordInviteCreatedAudit,
  recordInviteRevokedAudit,
  recordMemberRemovedAudit,
  recordMemberRoleChangedAudit,
} from "../tenantGovernanceAudit";

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

function inviteIdFromInsertResult(row: unknown): number | null {
  if (row && typeof row === "object") {
    const r = row as { insertId?: unknown };
    if (r.insertId != null) {
      const n = Number(r.insertId);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

/** Resolves `{ company, member }` for the active or explicit workspace — not arbitrary first membership. */
async function membershipForActiveWorkspace(
  user: User,
  companyId?: number | null,
): Promise<NonNullable<Awaited<ReturnType<typeof getUserCompanyById>>>> {
  const { companyId: cid } = await requireWorkspaceMembership(user, companyId);
  const row = await getUserCompanyById(user.id, cid);
  if (!row?.company?.id || !row.member) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No active company membership." });
  }
  return row;
}

/** Tenant workspace or explicit company id for platform operators (no implicit first membership). */
async function resolveCompanyWorkspaceOrPlatformTarget(
  user: User,
  companyId: number | null | undefined,
): Promise<{ companyId: number; companyName: string }> {
  if (canAccessGlobalAdminProcedures(user)) {
    if (companyId == null) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Select a company workspace — pass companyId for this operation.",
      });
    }
    const c = await getCompanyById(companyId);
    if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found." });
    return { companyId: c.id, companyName: c.name ?? "SmartPRO" };
  }
  const membership = await membershipForActiveWorkspace(user, companyId);
  return { companyId: membership.company.id, companyName: membership.company.name ?? "SmartPRO" };
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

async function captureOmanizationSnapshotForCompany(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  companyId: number,
  targetPercent?: number,
) {
  const allEmps = await db
    .select({ nationality: employees.nationality })
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.status, "active")));

  const totalActive = allEmps.length;
  const omaniCount = allEmps.filter((e) => isOmaniNationality(e.nationality)).length;
  const result = computeOmanizationRate({ totalActive, omaniCount }, targetPercent);
  const now = new Date();
  const snapshotMonth = now.getMonth() + 1;
  const snapshotYear = now.getFullYear();
  const complianceStatus: "compliant" | "warning" | "non_compliant" = result.meetsTarget
    ? "compliant"
    : result.ratePercent >= (result.targetPercent ?? 0) * 0.9
      ? "warning"
      : "non_compliant";

  await db.insert(companyOmanizationSnapshots).values({
    companyId,
    snapshotMonth,
    snapshotYear,
    totalEmployees: totalActive,
    omaniEmployees: omaniCount,
    omaniRatio: String(result.ratePercent),
    requiredRatio: result.targetPercent != null ? String(result.targetPercent) : null,
    complianceStatus,
    notes: result.shortfallHeadcount > 0 ? `Shortfall: ${result.shortfallHeadcount} headcount` : null,
  });

  return result;
}

type CompaniesDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/**
 * PR2 — After `company_members.role` changes, align `users.platformRole` with that membership row
 * for this (companyId, userId) pair only. Local to this router until a global sync phase.
 * Exported for unit tests.
 */
export async function syncPlatformRoleForCompanyMembership(
  db: CompaniesDb,
  userId: number,
  companyId: number,
): Promise<void> {
  const rows = await db
    .select({ id: companyMembers.id, role: companyMembers.role })
    .from(companyMembers)
    .where(and(eq(companyMembers.companyId, companyId), eq(companyMembers.userId, userId)))
    .orderBy(asc(companyMembers.id));

  if (rows.length === 0) return;

  const chosenMemberId = rows[0]!.id;
  if (rows.length > 1) {
    console.warn("[companies] duplicate company_members rows for (companyId, userId); using first row by id asc", {
      companyId,
      userId,
      memberIds: rows.map((r) => r.id),
      chosenMemberId,
    });
  }

  const membership = rows[0]!;
  const nextPlatformRole = mapMemberRoleToPlatformRole(membership.role);

  const [u] = await db.select({ platformRole: users.platformRole }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u) {
    console.warn("[companies] syncPlatformRoleForCompanyMembership: users row missing for userId", {
      companyId,
      userId,
    });
    return;
  }

  if (u.platformRole === nextPlatformRole) return;

  await db.update(users).set({ platformRole: nextPlatformRole }).where(eq(users.id, userId));
}

export const companiesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const companiesList = canAccessGlobalAdminProcedures(ctx.user)
      ? await getCompanies()
      : (await getUserCompanies(ctx.user.id)).map((r) => r.company);

    const db = await getDb();
    if (!db || companiesList.length === 0) {
      return companiesList.map((company) => ({ ...company, omanizationLatest: null }));
    }

    const companyIds = companiesList.map((c) => c.id);
    const idFilter =
      companyIds.length === 1
        ? eq(companyOmanizationSnapshots.companyId, companyIds[0]!)
        : or(...companyIds.map((id) => eq(companyOmanizationSnapshots.companyId, id)));

    const snapshots = await db
      .select()
      .from(companyOmanizationSnapshots)
      .where(idFilter!)
      .orderBy(
        desc(companyOmanizationSnapshots.snapshotYear),
        desc(companyOmanizationSnapshots.snapshotMonth),
        desc(companyOmanizationSnapshots.createdAt),
      );

    const latestByCompany = new Map<number, (typeof snapshots)[number]>();
    for (const row of snapshots) {
      if (!latestByCompany.has(row.companyId)) {
        latestByCompany.set(row.companyId, row);
      }
    }

    return companiesList.map((company) => ({
      ...company,
      omanizationLatest: latestByCompany.get(company.id) ?? null,
    }));
  }),

  getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const company = await getCompanyById(input.id);
    if (!company) throw new TRPCError({ code: "NOT_FOUND" });
    return company;
  }),

  myCompany: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user);
      return getUserCompanyById(ctx.user.id, cid);
    }),
  myStats: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user);
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        await assertCompanyAdmin(ctx.user.id, cid);
      }
      return getCompanyStats(cid);
    }),

  /** Read delegated report permissions for all members of the active company. */
  getReportDelegations: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      await assertCompanyAdmin(ctx.user.id, cid);
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select({
          memberId: companyMembers.id,
          userId: companyMembers.userId,
          role: companyMembers.role,
          permissions: companyMembers.permissions,
          name: users.name,
          email: users.email,
        })
        .from(companyMembers)
        .innerJoin(users, eq(users.id, companyMembers.userId))
        .where(and(eq(companyMembers.companyId, cid), eq(companyMembers.isActive, true)))
        .orderBy(asc(users.name));
      return rows;
    }),

  /** Set (replace) the permissions array for one member. Company admin only. */
  setReportDelegations: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        memberId: z.number(),
        permissions: z.array(z.enum(["view_reports", "view_payroll", "view_executive_summary"])),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      await assertCompanyAdmin(ctx.user.id, cid);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [member] = await db
        .select({ id: companyMembers.id, role: companyMembers.role })
        .from(companyMembers)
        .where(and(eq(companyMembers.id, input.memberId), eq(companyMembers.companyId, cid)))
        .limit(1);
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      if (member.role === "company_admin") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Admins already have full access" });
      }
      await db
        .update(companyMembers)
        .set({ permissions: input.permissions })
        .where(eq(companyMembers.id, input.memberId));
      return { success: true, memberId: input.memberId, permissions: input.permissions };
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

  mySubscription: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
    const cid = await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user);
    if (!canAccessGlobalAdminProcedures(ctx.user)) {
      await assertCompanyAdmin(ctx.user.id, cid);
    }
    return getCompanySubscription(cid);
  }),

  // ── Member Management ──────────────────────────────────────────────────────

  /** List all members of the caller's company with user details */
  members: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
    const cid = await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user);
    if (!canAccessGlobalAdminProcedures(ctx.user)) {
      await assertCompanyAdmin(ctx.user.id, cid);
    }
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
      .where(eq(companyMembers.companyId, cid))
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
      let companyId: number;
      if (canAccessGlobalAdminProcedures(ctx.user)) {
        if (input.companyId == null) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Select a company workspace — pass companyId for this operation.",
          });
        }
        const c = await getCompanyById(input.companyId);
        if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found." });
        companyId = c.id;
      } else {
        const membership = await membershipForActiveWorkspace(ctx.user, input.companyId);
        await assertCompanyAdmin(ctx.user.id, membership.company.id);
        companyId = membership.company.id;
      }
      const [target] = await db
        .select({ userId: companyMembers.userId, role: companyMembers.role })
        .from(companyMembers)
        .where(and(eq(companyMembers.id, input.memberId), eq(companyMembers.companyId, companyId)))
        .limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      if (target.userId === ctx.user.id && input.role !== "company_admin") {
        const admins = await db
          .select({ id: companyMembers.id })
          .from(companyMembers)
          .where(and(eq(companyMembers.companyId, companyId), eq(companyMembers.role, "company_admin"), eq(companyMembers.isActive, true)));
        if (admins.length <= 1) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot demote the last company admin." });
      }
      await db.update(companyMembers).set({ role: input.role }).where(eq(companyMembers.id, input.memberId));
      await syncPlatformRoleForCompanyMembership(db, target.userId, companyId);
      await recordMemberRoleChangedAudit(db as never, {
        companyId,
        actorUserId: ctx.user.id,
        memberRowId: input.memberId,
        targetUserId: target.userId,
        previousRole: target.role,
        nextRole: input.role,
        platformOperator: canAccessGlobalAdminProcedures(ctx.user),
      });
      return { success: true };
    }),

  /** Deactivate (soft-remove) a member from the caller's company */
  removeMember: protectedProcedure
    .input(z.object({ memberId: z.number(), companyId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      let companyId: number;
      if (canAccessGlobalAdminProcedures(ctx.user)) {
        if (input.companyId == null) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Select a company workspace — pass companyId for this operation.",
          });
        }
        const c = await getCompanyById(input.companyId);
        if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found." });
        companyId = c.id;
      } else {
        const membership = await membershipForActiveWorkspace(ctx.user, input.companyId);
        await assertCompanyAdmin(ctx.user.id, membership.company.id);
        companyId = membership.company.id;
      }
      const [target] = await db
        .select({ userId: companyMembers.userId })
        .from(companyMembers)
        .where(and(eq(companyMembers.id, input.memberId), eq(companyMembers.companyId, companyId)))
        .limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      if (target.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot remove yourself." });
      await db.update(companyMembers).set({ isActive: false }).where(eq(companyMembers.id, input.memberId));
      await recordMemberRemovedAudit(db as never, {
        companyId,
        actorUserId: ctx.user.id,
        memberRowId: input.memberId,
        targetUserId: target.userId,
        platformOperator: canAccessGlobalAdminProcedures(ctx.user),
      });
      return { success: true };
    }),

  /** Reactivate a previously removed member */
  reactivateMember: protectedProcedure
    .input(z.object({ memberId: z.number(), companyId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      let companyId: number;
      if (canAccessGlobalAdminProcedures(ctx.user)) {
        if (input.companyId == null) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Select a company workspace — pass companyId for this operation.",
          });
        }
        const c = await getCompanyById(input.companyId);
        if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found." });
        companyId = c.id;
      } else {
        const membership = await membershipForActiveWorkspace(ctx.user, input.companyId);
        await assertCompanyAdmin(ctx.user.id, membership.company.id);
        companyId = membership.company.id;
      }
      const [target] = await db
        .select({ id: companyMembers.id })
        .from(companyMembers)
        .where(and(eq(companyMembers.id, input.memberId), eq(companyMembers.companyId, companyId)))
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
      /** Frontend origin — used to build the invite link when the user has no SmartPRO account yet */
      origin: z.string().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      let companyId: number;
      let companyName: string;
      if (canAccessGlobalAdminProcedures(ctx.user)) {
        if (input.companyId == null) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Select a company workspace — pass companyId for this operation.",
          });
        }
        const c = await getCompanyById(input.companyId);
        if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found." });
        companyId = c.id;
        companyName = c.name ?? "SmartPRO";
      } else {
        const membership = await membershipForActiveWorkspace(ctx.user, input.companyId);
        await assertCompanyAdmin(ctx.user.id, membership.company.id);
        companyId = membership.company.id;
        companyName = membership.company.name ?? "SmartPRO";
      }
      const emailNorm = input.email.toLowerCase().trim();
      const [targetUser] = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.email, emailNorm))
        .limit(1);
      // ── User has a SmartPRO account — add directly ──────────────────────────
      if (targetUser) {
        const [existing] = await db
          .select({ id: companyMembers.id, isActive: companyMembers.isActive })
          .from(companyMembers)
          .where(and(eq(companyMembers.userId, targetUser.id), eq(companyMembers.companyId, companyId)))
          .limit(1);
        if (existing) {
          if (existing.isActive) throw new TRPCError({ code: "CONFLICT", message: "This user is already a member." });
          await db.update(companyMembers).set({ isActive: true, role: input.role }).where(eq(companyMembers.id, existing.id));
          // Auto-promote platformRole on reactivation
          const reactivatedPlatformRole = mapMemberRoleToPlatformRole(input.role);
          await db.update(users).set({ platformRole: reactivatedPlatformRole }).where(eq(users.id, targetUser.id));
          return { success: true, action: 'reactivated' as const, message: `${targetUser.name ?? emailNorm} has been re-activated.` };
        }
        await db.insert(companyMembers).values({
          companyId,
          userId: targetUser.id,
          role: input.role,
          isActive: true,
          invitedBy: ctx.user.id,
        });
        // Auto-promote platformRole so the added member sees the correct sidebar immediately
        const addedPlatformRole = mapMemberRoleToPlatformRole(input.role);
        await db.update(users).set({ platformRole: addedPlatformRole }).where(eq(users.id, targetUser.id));
        return { success: true, action: "added" as const, message: `${targetUser.name ?? emailNorm} has been added to the team.` };
      }
      // ── No SmartPRO account yet — create an invite automatically ────────────
      // Revoke any existing pending invite for same email+company
      await db
        .update(companyInvites)
        .set({ revokedAt: new Date() })
        .where(and(
          eq(companyInvites.email, emailNorm),
          eq(companyInvites.companyId, companyId),
          isNull(companyInvites.acceptedAt),
          isNull(companyInvites.revokedAt),
        ));
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      await db.insert(companyInvites).values({
        companyId,
        email: emailNorm,
        role: input.role,
        token,
        invitedBy: ctx.user.id,
        expiresAt,
      });
      const origin = input.origin ?? "https://smartprohub-q4qjnxjv.manus.space";
      const inviteUrl = `${origin}/invite/${token}`;
      await notifyOwner({
        title: `Team invite sent to ${emailNorm}`,
        content: `${ctx.user.name ?? ctx.user.email} invited ${emailNorm} to join ${companyName} as ${input.role.replace(/_/g, " ")}. Invite link: ${inviteUrl} (expires in 7 days)`,
      });
      await sendInviteEmail({
        to: emailNorm,
        inviterName: ctx.user.name ?? ctx.user.email ?? "A team member",
        companyName,
        role: input.role,
        inviteUrl,
        expiresAt,
      }).catch((e) => console.error("[Email] addMemberByEmail invite email failed (non-fatal):", e));
      return { success: true, action: "invited" as const, message: `Invite sent to ${emailNorm}. They will receive a link to join the team.`, inviteUrl };
    }),

  // ── Invite Pipeline (for users without SmartPRO accounts) ─────────────────

  /**
   * Creates a time-limited invite token for a user who doesn't yet have a SmartPRO account.
   * Sends a notification to the owner with the invite URL.
   * The invitee follows the link, signs up / signs in, and calls acceptInvite.
   */
  createInvite: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      email: z.string().email(),
      role: z.enum(["company_admin", "company_member", "finance_admin", "hr_admin", "reviewer", "external_auditor"]).default("company_member"),
      origin: z.string().url(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      let companyId: number;
      let companyName: string;
      if (canAccessGlobalAdminProcedures(ctx.user)) {
        if (input.companyId == null) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Select a company workspace — pass companyId for this operation.",
          });
        }
        const c = await getCompanyById(input.companyId);
        if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found." });
        companyId = c.id;
        companyName = c.name ?? "SmartPRO";
      } else {
        const membership = await membershipForActiveWorkspace(ctx.user, input.companyId);
        companyId = membership.company.id;
        companyName = membership.company.name ?? "SmartPRO";
        await assertCompanyAdmin(ctx.user.id, companyId);
      }
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
      const [insertInviteResult] = await db.insert(companyInvites).values({
        companyId,
        email: input.email.toLowerCase(),
        role: input.role,
        token,
        invitedBy: ctx.user.id,
        expiresAt,
      });
      const newInviteId = inviteIdFromInsertResult(insertInviteResult);
      if (newInviteId != null) {
        await recordInviteCreatedAudit(db as never, {
          companyId,
          actorUserId: ctx.user.id,
          inviteId: newInviteId,
          email: input.email.toLowerCase(),
          role: input.role,
          platformOperator: canAccessGlobalAdminProcedures(ctx.user),
        });
      }
      const inviteUrl = `${input.origin}/invite/${token}`;
      await notifyOwner({
        title: `Team invite sent to ${input.email}`,
        content: `${ctx.user.name ?? ctx.user.email} invited ${input.email} to join ${companyName} as ${input.role.replace(/_/g, " ")}. Invite link: ${inviteUrl} (expires in 7 days)`,
      });
      // Send invite email to the invitee
      await sendInviteEmail({
        to: input.email,
        inviterName: ctx.user.name ?? ctx.user.email ?? "A team member",
        companyName,
        role: input.role,
        inviteUrl,
        expiresAt,
      }).catch((e) => console.error("[Email] createInvite email failed (non-fatal):", e));
      return { success: true, token, inviteUrl, expiresAt };
    }),

  /** List all invites for the caller's company (pending, accepted, revoked). */
  listInvites: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return [];
    let targetCompanyId: number;
    if (canAccessGlobalAdminProcedures(ctx.user)) {
      if (input?.companyId == null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Select a company workspace — pass companyId for this operation.",
        });
      }
      const c = await getCompanyById(input.companyId);
      if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found." });
      targetCompanyId = c.id;
    } else {
      const membership = await membershipForActiveWorkspace(ctx.user, input?.companyId);
      await assertCompanyAdmin(ctx.user.id, membership.company.id);
      targetCompanyId = membership.company.id;
    }
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
      .where(eq(companyInvites.companyId, targetCompanyId))
      .orderBy(desc(companyInvites.createdAt));
  }),

  /** Revoke a pending invite — scoped to the invite's company (not arbitrary first membership). */
  revokeInvite: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [invite] = await db
        .select({ id: companyInvites.id, companyId: companyInvites.companyId, revokedAt: companyInvites.revokedAt })
        .from(companyInvites)
        .where(eq(companyInvites.id, input.id))
        .limit(1);
      if (!invite) throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found." });
      if (invite.revokedAt) return { success: true };
      const global = canAccessGlobalAdminProcedures(ctx.user);
      if (!global) {
        if (input.companyId != null && input.companyId !== invite.companyId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Invite does not belong to the selected workspace." });
        }
        const m = await getUserCompanyById(ctx.user.id, invite.companyId);
        if (!m?.member) throw new TRPCError({ code: "FORBIDDEN" });
        await assertCompanyAdmin(ctx.user.id, invite.companyId);
      }
      await db.update(companyInvites).set({ revokedAt: new Date() }).where(eq(companyInvites.id, input.id));
      await recordInviteRevokedAudit(db as never, {
        companyId: invite.companyId,
        actorUserId: ctx.user.id,
        inviteId: invite.id,
        platformOperator: global,
      });
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
      const inviteEmailNorm = invite.email.trim().toLowerCase();
      const userEmailNorm = ctx.user.email?.trim().toLowerCase() ?? "";
      if (!userEmailNorm || userEmailNorm !== inviteEmailNorm) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Sign in with the same email address this invitation was sent to. If you use Google or Microsoft, pick the account that matches the invite email.",
        });
      }
      const [existing] = await db
        .select({ id: companyMembers.id, isActive: companyMembers.isActive })
        .from(companyMembers)
        .where(and(eq(companyMembers.userId, ctx.user.id), eq(companyMembers.companyId, invite.companyId)))
        .limit(1);
      if (existing?.isActive) throw new TRPCError({ code: "CONFLICT", message: "You are already a member of this company." });
      const validMemberRoles = [
        "company_admin",
        "company_member",
        "finance_admin",
        "hr_admin",
        "reviewer",
        "client",
        "external_auditor",
      ] as const;
      const normalizedRole = (invite.role ?? "").trim().toLowerCase();
      const memberRole = (validMemberRoles as readonly string[]).includes(normalizedRole)
        ? (normalizedRole as (typeof validMemberRoles)[number])
        : null;
      if (!memberRole) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This invitation has invalid role data. Ask your admin to revoke it and send a new invite.",
        });
      }
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
      // Auto-promote platformRole so the new member sees the correct sidebar immediately
      const newPlatformRole = mapMemberRoleToPlatformRole(memberRole);
      await db.update(users).set({ platformRole: newPlatformRole }).where(eq(users.id, ctx.user.id));
      // Auto-link: if an employees row with the invited email exists in this company,
      // set its userId so the Employee Portal works immediately without HR needing to "Grant Access"
      try {
        const [empRow] = await db
          .select({ id: employees.id, userId: employees.userId })
          .from(employees)
          .where(and(
            eq(employees.companyId, invite.companyId),
            eq(employees.email, invite.email.toLowerCase()),
          ))
          .limit(1);
        if (empRow && !empRow.userId) {
          await db.update(employees).set({ userId: ctx.user.id }).where(eq(employees.id, empRow.id));
        }
      } catch {
        // Non-critical — don't fail the accept if auto-link fails
      }
      await recordInviteAcceptedAudit(db as never, {
        companyId: invite.companyId,
        actorUserId: ctx.user.id,
        inviteId: invite.id,
        assignedRole: memberRole,
      });
      return { success: true, companyId: invite.companyId, role: invite.role };
    }),

  /** Fetch invite metadata for the accept-invite page (no auth required for preview). */
  getInviteInfo: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [row] = await db
        .select({
          id: companyInvites.id,
          email: companyInvites.email,
          role: companyInvites.role,
          expiresAt: companyInvites.expiresAt,
          acceptedAt: companyInvites.acceptedAt,
          revokedAt: companyInvites.revokedAt,
          companyId: companyInvites.companyId,
          companyName: companies.name,
        })
        .from(companyInvites)
        .leftJoin(companies, eq(companies.id, companyInvites.companyId))
        .where(eq(companyInvites.token, input.token))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found." });
      return { ...row, companyName: row.companyName ?? "Your Company" };
    }),

  /**
   * Returns all employees for the company with their system access status.
   * Each employee row includes HR profile fields plus:
   *  - accessState / flags / primaryAction / stateReason — canonical access model (from resolveEmployeeAccess)
   *  - accessStatus — legacy mirror of accessState for older clients ('active' | 'inactive' | 'no_access')
   *  - memberRole, memberId — company_members link when resolved
   *  - hasLogin, lastSignedIn, loginEmail — identity / session hints
   */
  employeesWithAccess: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) return [];
    let companyId: number;
    if (canAccessGlobalAdminProcedures(ctx.user)) {
      if (input?.companyId == null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Select a company workspace — pass companyId for this operation.",
        });
      }
      const c = await getCompanyById(input.companyId);
      if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found." });
      companyId = c.id;
    } else {
      const membership = await membershipForActiveWorkspace(ctx.user, input?.companyId);
      await assertCompanyAdmin(ctx.user.id, membership.company.id);
      companyId = membership.company.id;
    }
    return fetchEmployeesWithAccessData(db, companyId);
  }),

  /**
   * Live Access Intelligence snapshot — same canonical rows as Team Access + members + pending invites.
   * Future: time-bounded snapshots can reuse `buildAccessAnalyticsOverview` with stored inputs.
   */
  accessAnalyticsOverview: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) return null;
    let companyId: number;
    if (canAccessGlobalAdminProcedures(ctx.user)) {
      if (input?.companyId == null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Select a company workspace — pass companyId for this operation.",
        });
      }
      const c = await getCompanyById(input.companyId);
      if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found." });
      companyId = c.id;
    } else {
      const membership = await membershipForActiveWorkspace(ctx.user, input?.companyId);
      await assertCompanyAdmin(ctx.user.id, membership.company.id);
      companyId = membership.company.id;
    }

    const employeeRows = await fetchEmployeesWithAccessData(db, companyId);
    const memberRows = await db
      .select({ memberId: companyMembers.id, isActive: companyMembers.isActive })
      .from(companyMembers)
      .where(eq(companyMembers.companyId, companyId));

    const rawInvites = await db
      .select({
        expiresAt: companyInvites.expiresAt,
        acceptedAt: companyInvites.acceptedAt,
        revokedAt: companyInvites.revokedAt,
      })
      .from(companyInvites)
      .where(eq(companyInvites.companyId, companyId));

    const nowMs = Date.now();
    const pendingInviteExpiresAt = rawInvites
      .filter((i) => !i.acceptedAt && !i.revokedAt && new Date(i.expiresAt).getTime() > nowMs)
      .map((i) => i.expiresAt);

    return buildAccessAnalyticsOverview({ employeeRows, memberRows, pendingInviteExpiresAt });
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
      const { companyId, companyName } = await resolveCompanyWorkspaceOrPlatformTarget(ctx.user, input.companyId);
      if (!canAccessGlobalAdminProcedures(ctx.user)) await assertCompanyAdmin(ctx.user.id, companyId);

      const [emp] = await db
        .select({ id: employees.id, email: employees.email, userId: employees.userId, firstName: employees.firstName, lastName: employees.lastName })
        .from(employees)
        .where(and(eq(employees.id, input.employeeId), eq(employees.companyId, companyId)))
        .limit(1);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found." });

      // If employee has a userId already, just update/create their member record
      if (emp.userId) {
        const [existing] = await db
          .select({ id: companyMembers.id, isActive: companyMembers.isActive })
          .from(companyMembers)
          .where(and(eq(companyMembers.userId, emp.userId), eq(companyMembers.companyId, companyId)))
          .limit(1);
         if (existing) {
          await db.update(companyMembers).set({ isActive: true, role: input.role }).where(eq(companyMembers.id, existing.id));
        } else {
          await db.insert(companyMembers).values({ companyId, userId: emp.userId, role: input.role, isActive: true, invitedBy: ctx.user.id });
        }
        // Auto-promote platformRole so the member sees the correct sidebar
        const grantedPlatformRole1 = mapMemberRoleToPlatformRole(input.role);
        await db.update(users).set({ platformRole: grantedPlatformRole1 }).where(eq(users.id, emp.userId));
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
            .where(and(eq(companyMembers.userId, targetUser.id), eq(companyMembers.companyId, companyId)))
            .limit(1);
          if (existing) {
            await db.update(companyMembers).set({ isActive: true, role: input.role }).where(eq(companyMembers.id, existing.id));
          } else {
            await db.insert(companyMembers).values({ companyId, userId: targetUser.id, role: input.role, isActive: true, invitedBy: ctx.user.id });
          }
          // Auto-promote platformRole so the member sees the correct sidebar
          const grantedPlatformRole2 = mapMemberRoleToPlatformRole(input.role);
          await db.update(users).set({ platformRole: grantedPlatformRole2 }).where(eq(users.id, targetUser.id));
          return { success: true, action: 'linked' as const, message: `Access granted to ${emp.firstName} ${emp.lastName}` };
        }

        // No SmartPRO account — create invite
        if (input.origin) {
          const token = randomBytes(32).toString('hex');
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          await db
            .update(companyInvites)
            .set({ revokedAt: new Date() })
            .where(and(eq(companyInvites.email, emp.email.toLowerCase()), eq(companyInvites.companyId, companyId)));
          await db.insert(companyInvites).values({
            companyId,
            email: emp.email.toLowerCase(),
            role: input.role,
            token,
            invitedBy: ctx.user.id,
            expiresAt,
          });
          const inviteUrl = `${input.origin}/invite/${token}`;
          const bulkCompanyName = companyName;
          await notifyOwner({
            title: `Invite sent to employee ${emp.firstName} ${emp.lastName}`,
            content: `Invite link for ${emp.email}: ${inviteUrl} (expires in 7 days)`,
          });
          // Send invite email to the employee
          await sendInviteEmail({
            to: emp.email.toLowerCase(),
            inviteeName: `${emp.firstName} ${emp.lastName}`.trim(),
            inviterName: ctx.user.name ?? ctx.user.email ?? "HR Team",
            companyName: bulkCompanyName,
            role: input.role,
            inviteUrl,
            expiresAt,
          }).catch((e) => console.error("[Email] bulkInvite email failed (non-fatal):", e));
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
      const { companyId } = await resolveCompanyWorkspaceOrPlatformTarget(ctx.user, input.companyId);
      if (!canAccessGlobalAdminProcedures(ctx.user)) await assertCompanyAdmin(ctx.user.id, companyId);

      const [emp] = await db
        .select({ id: employees.id, email: employees.email, userId: employees.userId })
        .from(employees)
        .where(and(eq(employees.id, input.employeeId), eq(employees.companyId, companyId)))
        .limit(1);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND" });

      if (emp.userId) {
        await db.update(companyMembers).set({ isActive: false }).where(and(eq(companyMembers.userId, emp.userId), eq(companyMembers.companyId, companyId)));
        return { success: true };
      }
      if (emp.email) {
        const [targetUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, emp.email.toLowerCase())).limit(1);
        if (targetUser) {
          await db.update(companyMembers).set({ isActive: false }).where(and(eq(companyMembers.userId, targetUser.id), eq(companyMembers.companyId, companyId)));
          return { success: true };
        }
      }
      return { success: true };
    }),

  /**
   * Manually link an existing company member (by their login email) to an employee record.
   * Use this when a user has already accepted an invite but their employee record was not auto-linked.
   */
  linkMemberToEmployee: protectedProcedure
    .input(z.object({
      employeeId: z.number(),
      memberEmail: z.string().email(),
      companyId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { companyId } = await resolveCompanyWorkspaceOrPlatformTarget(ctx.user, input.companyId);
      if (!canAccessGlobalAdminProcedures(ctx.user)) await assertCompanyAdmin(ctx.user.id, companyId);
      // Verify employee belongs to this company
      const [emp] = await db
        .select({ id: employees.id, userId: employees.userId, firstName: employees.firstName, lastName: employees.lastName })
        .from(employees)
        .where(and(eq(employees.id, input.employeeId), eq(employees.companyId, companyId)))
        .limit(1);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found." });
      // Find user by email
      const [targetUser] = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.email, input.memberEmail.toLowerCase()))
        .limit(1);
      if (!targetUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "No SmartPRO account exists for that email yet. Ask them to sign in once (same email), then try linking again.",
        });
      }
      // Check they are a member of this company
      const [member] = await db
        .select({ id: companyMembers.id, isActive: companyMembers.isActive })
        .from(companyMembers)
        .where(and(eq(companyMembers.userId, targetUser.id), eq(companyMembers.companyId, companyId)))
        .limit(1);
      if (!member) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "That user has signed in to SmartPRO but is not in this company workspace yet. Use Grant Access or send a company invite and wait until they accept, then link again.",
        });
      }
      // Link the employee record to this user
      await db.update(employees).set({ userId: targetUser.id }).where(eq(employees.id, emp.id));
      return { success: true, message: `${emp.firstName} ${emp.lastName} is now linked to ${targetUser.email}` };
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
      const { companyId } = await resolveCompanyWorkspaceOrPlatformTarget(ctx.user, input.companyId);
      if (!canAccessGlobalAdminProcedures(ctx.user)) await assertCompanyAdmin(ctx.user.id, companyId);

      const [emp] = await db
        .select({ id: employees.id, email: employees.email, userId: employees.userId })
        .from(employees)
        .where(and(eq(employees.id, input.employeeId), eq(employees.companyId, companyId)))
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
        .where(and(eq(companyMembers.userId, userId), eq(companyMembers.companyId, companyId)))
        .limit(1);
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "No active access record found for this employee." });

      await db.update(companyMembers).set({ role: input.role }).where(eq(companyMembers.id, member.id));
      await syncPlatformRoleForCompanyMembership(db, userId, companyId);
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
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        await assertCompanyAdmin(ctx.user.id, input.companyId);
      }
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
        /** Set explicit caps, or `null` to clear and use Oman portal defaults from shared code. */
        leavePolicyCaps: z
          .union([
            z.object({
              annual: z.number().int().min(0).max(366),
              sick: z.number().int().min(0).max(366),
              emergency: z.number().int().min(0).max(366),
            }),
            z.null(),
          ])
          .optional(),
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

  // ─── ROLE REDIRECT SETTINGS ──────────────────────────────────────────────────
  /**
   * Get the per-role login redirect configuration for the active company.
   * Returns a map of memberRole → route (e.g. { hr_admin: "/hr/employees" }).
   * Falls back to empty object (system defaults apply) if not configured.
   */
  getRoleRedirectSettings: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        await assertCompanyAdmin(ctx.user.id, input.companyId);
      }
      const [member] = await db
        .select({ role: companyMembers.role })
        .from(companyMembers)
        .where(and(
          eq(companyMembers.userId, ctx.user.id),
          eq(companyMembers.companyId, input.companyId),
          eq(companyMembers.isActive, true),
        ))
        .limit(1);
      if (!member) throw new TRPCError({ code: "FORBIDDEN" });
      const [company] = await db
        .select({ roleRedirectSettings: companies.roleRedirectSettings })
        .from(companies)
        .where(eq(companies.id, input.companyId))
        .limit(1);
      return { settings: (company?.roleRedirectSettings as Record<string, string> | null) ?? {} };
    }),

  /**
   * Update the per-role login redirect configuration for the active company.
   * Only company_admin (or platform admin) can call this.
   * Pass an empty object to reset all roles to system defaults.
   */
  updateRoleRedirectSettings: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      settings: z.record(
        z.enum(["company_admin", "hr_admin", "finance_admin", "company_member", "reviewer", "external_auditor"]),
        z.string().min(1).max(200),
      ),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [member] = await db
        .select({ role: companyMembers.role })
        .from(companyMembers)
        .where(and(
          eq(companyMembers.userId, ctx.user.id),
          eq(companyMembers.companyId, input.companyId),
          eq(companyMembers.isActive, true),
        ))
        .limit(1);
      const isAdmin = member?.role === "company_admin" || (member?.role as string) === "owner";
      if (!isAdmin && !canAccessGlobalAdminProcedures(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only company admins can update role redirect settings." });
      }
      await db.update(companies)
        .set({ roleRedirectSettings: input.settings })
        .where(eq(companies.id, input.companyId));
      return { success: true };
    }),

  /**
   * Extra navigation path prefixes per membership role (sidebar + route guard).
   * Company admins may grant additional routes beyond system defaults; platform URLs are stripped server-side.
   */
  getRoleNavExtensions: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        await assertCompanyAdmin(ctx.user.id, input.companyId);
      }
      const [member] = await db
        .select({ role: companyMembers.role })
        .from(companyMembers)
        .where(
          and(
            eq(companyMembers.userId, ctx.user.id),
            eq(companyMembers.companyId, input.companyId),
            eq(companyMembers.isActive, true),
          ),
        )
        .limit(1);
      if (!member) throw new TRPCError({ code: "FORBIDDEN" });
      const [row] = await db
        .select({ roleNavExtensions: companies.roleNavExtensions })
        .from(companies)
        .where(eq(companies.id, input.companyId))
        .limit(1);
      return { extensions: (row?.roleNavExtensions as Record<string, string[]> | null) ?? {} };
    }),

  updateRoleNavExtensions: protectedProcedure
    .input(
      z.object({
        companyId: z.number(),
        /** Raw map from role key → path prefixes; sanitized before persist. */
        extensions: z.record(z.string(), z.array(z.string())),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [member] = await db
        .select({ role: companyMembers.role })
        .from(companyMembers)
        .where(
          and(
            eq(companyMembers.userId, ctx.user.id),
            eq(companyMembers.companyId, input.companyId),
            eq(companyMembers.isActive, true),
          ),
        )
        .limit(1);
      const isAdmin = member?.role === "company_admin" || (member?.role as string) === "owner";
      if (!isAdmin && !canAccessGlobalAdminProcedures(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only company admins can update navigation extensions." });
      }
      const cleaned = sanitizeRoleNavExtensions(input.extensions);
      await db.update(companies).set({ roleNavExtensions: cleaned }).where(eq(companies.id, input.companyId));
      return { success: true, extensions: cleaned };
    }),

  // ── Email Template Preview ─────────────────────────────────────────────────
  previewEmailTemplate: protectedProcedure
    .input(z.object({
      template: z.enum(["invite", "hr_letter", "contract_signing"]),
      // invite fields
      inviteeName: z.string().optional(),
      inviterName: z.string().optional(),
      companyName: z.string().optional(),
      roleLabel: z.string().optional(),
      expiryStr: z.string().optional(),
      inviteUrl: z.string().optional(),
      // hr_letter fields
      employeeName: z.string().optional(),
      letterLabel: z.string().optional(),
      issuedBy: z.string().optional(),
      dateStr: z.string().optional(),
      pdfUrl: z.string().optional(),
      // contract fields
      signerName: z.string().optional(),
      contractTitle: z.string().optional(),
      signingUrl: z.string().optional(),
    }))
    .query(({ ctx, input }) => {
      // Only company admins and platform admins can preview email templates
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        // allow all authenticated users to preview (it's read-only)
      }
      const { template } = input;
      let html = "";
      if (template === "invite") {
        html = buildInviteEmailHtml({
          inviteeName: input.inviteeName ?? "John Smith",
          inviterName: input.inviterName ?? "Abu Ali",
          companyName: input.companyName ?? "Falcon Eye Business and Promotion",
          roleLabel: input.roleLabel ?? "Company Admin",
          expiryStr: input.expiryStr ?? "10 April 2026",
          inviteUrl: input.inviteUrl ?? "https://smartprohub-q4qjnxjv.manus.space/invite/sample-token",
        });
      } else if (template === "hr_letter") {
        html = buildHRLetterEmailHtml({
          employeeName: input.employeeName ?? "John Smith",
          letterLabel: input.letterLabel ?? "Employment Confirmation Letter",
          companyName: input.companyName ?? "Falcon Eye Business and Promotion",
          issuedBy: input.issuedBy ?? "HR Manager",
          dateStr: input.dateStr ?? new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
          pdfUrl: input.pdfUrl,
        });
      } else if (template === "contract_signing") {
        html = buildContractSigningEmailHtml({
          signerName: input.signerName ?? "John Smith",
          contractTitle: input.contractTitle ?? "Service Agreement 2026",
          companyName: input.companyName ?? "Falcon Eye Business and Promotion",
          signingUrl: input.signingUrl ?? "https://smartprohub-q4qjnxjv.manus.space/contracts/sample",
          expiryStr: input.expiryStr,
        });
      }
      return { html };
    }),

  sendTestEmail: protectedProcedure
    .input(z.object({
      to: z.string().email(),
      template: z.enum(["invite", "hr_letter", "contract_signing"]),
      companyName: z.string().default("Sample Company"),
      roleLabel: z.string().default("Company Admin"),
    }))
    .mutation(async ({ ctx, input }) => {
      const appUrl = resolvePublicAppBaseUrl(ctx.req) || "https://smartprohub-q4qjnxjv.manus.space";
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      if (input.template === "invite") {
        return sendInviteEmail({
          to: input.to,
          inviteeName: ctx.user.name ?? "Test User",
          inviterName: ctx.user.name ?? "Admin",
          companyName: input.companyName,
          role: input.roleLabel.toLowerCase().replace(/ /g, "_"),
          inviteUrl: `${appUrl}/invite/test-preview-token`,
          expiresAt,
        });
      } else if (input.template === "hr_letter") {
        return sendHRLetterEmail({
          to: input.to,
          employeeName: ctx.user.name ?? "Test Employee",
          letterType: "employment_confirmation",
          companyName: input.companyName,
          issuedBy: ctx.user.name ?? "HR Manager",
          appBaseUrl: appUrl,
        });
      } else {
        return sendContractSigningEmail({
          to: input.to,
          signerName: ctx.user.name ?? "Test Signer",
          contractTitle: "Service Agreement 2026 (Test)",
          companyName: input.companyName,
          signingUrl: `${appUrl}/contracts/test-preview`,
          expiresAt,
        });
      }
    }),

  // ── Omanization Snapshots ─────────────────────────────────────────────────────────

  /**
   * Get live Omanization compliance status for the company (no DB write).
   */
  getOmanizationStatus: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await getDb();
      if (!db) return null;
      const allEmps = await db
        .select({ nationality: employees.nationality })
        .from(employees)
        .where(and(eq(employees.companyId, cid), eq(employees.status, "active")));
      const totalActive = allEmps.length;
      const omaniCount = allEmps.filter((e) => isOmaniNationality(e.nationality)).length;
      return computeOmanizationRate({ totalActive, omaniCount });
    }),

  /**
   * Take a live Omanization snapshot and persist it to company_omanization_snapshots.
   */
  takeOmanizationSnapshot: protectedProcedure
    .input(z.object({ companyId: z.number().optional(), targetPercent: z.number().min(0).max(100).optional() }))
    .mutation(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      return captureOmanizationSnapshotForCompany(db, cid, input.targetPercent);
    }),

  /**
   * Alias kept for clearer procedure naming on UI integrations.
   */
  captureOmanizationSnapshot: protectedProcedure
    .input(z.object({ companyId: z.number().optional(), targetPercent: z.number().min(0).max(100).optional() }))
    .mutation(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      return captureOmanizationSnapshotForCompany(db, cid, input.targetPercent);
    }),

  /**
   * Get Omanization snapshot history for the company (latest 12 months).
   */
  omanizationHistory: protectedProcedure
    .input(z.object({ companyId: z.number().optional(), limit: z.number().min(1).max(36).default(12) }))
    .query(async ({ input, ctx }) => {
      const cid = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(companyOmanizationSnapshots)
        .where(eq(companyOmanizationSnapshots.companyId, cid))
        .orderBy(desc(companyOmanizationSnapshots.snapshotYear), desc(companyOmanizationSnapshots.snapshotMonth))
        .limit(input.limit);
    }),
});
