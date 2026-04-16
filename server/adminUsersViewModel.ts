/**
 * Admin Users — centralized view models for identity & access operations UI.
 * Primary sources: users + platform_user_roles + company_members + user_auth_identities + user_security_settings.
 * Legacy users.role / users.platformRole appear only in diagnostics blocks, not as authority truth.
 */

import {
  and,
  count,
  desc,
  eq,
  exists,
  gt,
  inArray,
  isNotNull,
  isNull,
  like,
  lte,
  not,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { escapeLike } from "@shared/objectUtils";
import {
  auditLogs,
  companies,
  companyMembers,
  platformUserRoles,
  userAuthIdentities,
  userSecuritySettings,
  users,
} from "../drizzle/schema";
import { deriveBestMemberRole } from "../shared/roleHelpers";
import { mapMemberRoleToPlatformRole } from "../shared/rbac";
import { GLOBAL_PLATFORM_ROLE_SLUGS } from "../shared/identityAuthority";

export type IdentityHealthLevel = "healthy" | "info" | "warning" | "critical";

export type IdentityHealthSignal = {
  level: IdentityHealthLevel;
  code: string;
  label: string;
};

/** Security posture for admin ops (2FA, step-up, privileged gaps). */
export type SecurityHealthSignal = IdentityHealthSignal;

export type AdminUserListItem = {
  id: number;
  displayName: string | null;
  primaryEmail: string | null;
  emailNormalized: string | null;
  avatarUrl: string | null;
  accountStatus: string;
  isActiveLegacy: boolean;
  /** Active global platform grants — source of truth for operator authority. */
  platformRoles: string[];
  membershipSummary: { activeCount: number; topRolesLabel: string };
  authProviders: { provider: string; label: string }[];
  securityHealth: {
    overallLevel: IdentityHealthLevel;
    signals: SecurityHealthSignal[];
    twoFactorEnabled: boolean;
    twoFactorVerifiedAt: Date | null;
    requiresStepUp: boolean;
    /** super_admin / platform_admin with no 2FA */
    privilegedMissing2fa: boolean;
  };
  identityHealth: { overallLevel: IdentityHealthLevel; signals: IdentityHealthSignal[] };
  lastSignedInAt: Date | null;
  createdAt: Date;
  /** Legacy cache — do not display as primary authority in UI. */
  legacy: { usersRole: string; usersPlatformRole: string };
};

const PRIVILEGED_GLOBAL = new Set(["super_admin", "platform_admin"]);

const levelOrder: IdentityHealthLevel[] = ["healthy", "info", "warning", "critical"];

function maxLevel(a: IdentityHealthLevel, b: IdentityHealthLevel): IdentityHealthLevel {
  return levelOrder.indexOf(b) > levelOrder.indexOf(a) ? b : a;
}

function displayNameFromRow(r: {
  displayName: string | null;
  name: string | null;
}): string | null {
  return (r.displayName ?? r.name)?.trim() || null;
}

function primaryEmailFromRow(r: {
  primaryEmail: string | null;
  email: string | null;
}): string | null {
  return (r.primaryEmail ?? r.email)?.trim() || null;
}

export function buildIdentityHealthSignals(params: {
  accountStatus: string;
  emailNormalized: string | null;
  primaryEmail: string | null;
  duplicateEmail: boolean;
  activeMembershipCount: number;
  globalPlatformRoles: string[];
  authIdentityCount: number;
  legacyUsersPlatformRole: string;
  mappedMembershipToPlatform: string | null;
}): { overallLevel: IdentityHealthLevel; signals: IdentityHealthSignal[] } {
  const signals: IdentityHealthSignal[] = [];

  if (params.accountStatus === "merged") {
    signals.push({ level: "info", code: "merged", label: "Account merged into another user" });
  }
  if (params.accountStatus === "archived") {
    signals.push({ level: "warning", code: "archived", label: "Archived account" });
  }
  if (!params.primaryEmail) {
    signals.push({ level: "warning", code: "no_email", label: "No primary email on file" });
  }
  if (params.duplicateEmail && params.accountStatus !== "merged") {
    signals.push({ level: "critical", code: "duplicate_email", label: "Duplicate normalized email (another active row)" });
  }
  if (params.activeMembershipCount === 0 && params.globalPlatformRoles.length === 0) {
    signals.push({ level: "info", code: "no_memberships", label: "No active company memberships" });
  }
  if (params.authIdentityCount > 1) {
    signals.push({ level: "info", code: "multiple_identities", label: "Multiple auth providers linked" });
  }

  const legacyPr = (params.legacyUsersPlatformRole ?? "").trim();
  const mapped = params.mappedMembershipToPlatform;
  if (
    mapped &&
    legacyPr &&
    !GLOBAL_PLATFORM_ROLE_SLUGS.has(legacyPr) &&
    legacyPr !== mapped
  ) {
    signals.push({
      level: "warning",
      code: "legacy_platform_cache_mismatch",
      label: `Legacy users.platformRole (${legacyPr}) ≠ membership-derived shell (${mapped})`,
    });
  }

  if (GLOBAL_PLATFORM_ROLE_SLUGS.has(legacyPr) && legacyPr && !params.globalPlatformRoles.includes(legacyPr)) {
    signals.push({
      level: "warning",
      code: "legacy_global_not_in_platform_table",
      label: `Legacy cache lists global role "${legacyPr}" but platform_user_roles has no active grant`,
    });
  }

  const overallLevel =
    signals.length === 0
      ? "healthy"
      : signals.reduce((acc, s) => maxLevel(acc, s.level), "healthy" as IdentityHealthLevel);

  return { overallLevel, signals };
}

export function buildSecurityHealthSignals(params: {
  twoFactorEnabled: boolean;
  twoFactorVerifiedAt: Date | null;
  requiresStepUp: boolean;
  globalPlatformRoles: string[];
  recoveryCodesPresent: boolean;
}): { overallLevel: IdentityHealthLevel; signals: SecurityHealthSignal[] } {
  const signals: SecurityHealthSignal[] = [];
  const privMissing =
    params.globalPlatformRoles.some((r) => PRIVILEGED_GLOBAL.has(r)) && !params.twoFactorEnabled;

  if (privMissing) {
    signals.push({
      level: "critical",
      code: "privileged_no_2fa",
      label: "Privileged platform role (super_admin / platform_admin) without 2FA",
    });
  }
  if (params.requiresStepUp && !params.twoFactorEnabled) {
    signals.push({
      level: "warning",
      code: "step_up_without_2fa",
      label: "Step-up authentication flagged but 2FA is off",
    });
  }
  if (params.twoFactorEnabled && !params.twoFactorVerifiedAt) {
    signals.push({
      level: "warning",
      code: "two_factor_unverified",
      label: "2FA enabled but not verified",
    });
  }
  if (params.twoFactorEnabled && !params.recoveryCodesPresent) {
    signals.push({
      level: "info",
      code: "no_recovery_codes",
      label: "No backup / recovery codes on file",
    });
  }

  const overallLevel =
    signals.length === 0
      ? "healthy"
      : signals.reduce((acc, s) => maxLevel(acc, s.level), "healthy" as IdentityHealthLevel);

  return { overallLevel, signals };
}

export type AdminUsersListInput = {
  search?: string;
  accountStatuses?: string[];
  /** Filter: user has this active global platform role */
  globalPlatformRole?: string;
  /** Filter: user has at least one active company_members row with this role */
  membershipRole?: string;
  /** Substring match against user_auth_identities.provider */
  authProvider?: string;
  /** any | enabled | missing */
  twoFactor?: "any" | "enabled" | "missing";
  identityQuickFilter?:
    | "any"
    | "duplicate"
    | "no_memberships"
    | "merged_inactive"
    | "privileged_no_2fa";
  createdAfter?: Date;
  createdBefore?: Date;
  staleAfterDays?: number;
  /** Privileged missing 2FA or step-up without 2FA */
  securityQuickFilter?: "any" | "needs_attention";
  limit: number;
  offset: number;
};

function membershipSummaryLabel(roles: string[]): { activeCount: number; topRolesLabel: string } {
  const activeCount = roles.length;
  if (activeCount === 0) return { activeCount: 0, topRolesLabel: "—" };
  const uniq = Array.from(new Set(roles));
  const top = uniq.slice(0, 2).join(", ");
  return { activeCount, topRolesLabel: uniq.length > 2 ? `${top} +${uniq.length - 2}` : top };
}

function providerLabel(p: string): string {
  const s = (p || "").toLowerCase();
  if (s === "oauth" || s === "manus") return "OAuth";
  if (s === "registered_platform_google" || s === "google") return "Google";
  if (s.includes("microsoft") || s.includes("azure")) return "Microsoft";
  if (s === "apple") return "Apple";
  if (s === "email") return "Email";
  return p || "Unknown";
}

type Db = NonNullable<
  Awaited<ReturnType<typeof import("./db.client").getDb>>
>;

export async function fetchDuplicateEmailNormalizedSet(db: Db): Promise<Set<string>> {
  const dupRows = await db
    .select({ emailNormalized: users.emailNormalized })
    .from(users)
    .where(and(isNotNull(users.emailNormalized), notInArray(users.accountStatus, ["merged", "archived"])))
    .groupBy(users.emailNormalized)
    .having(gt(count(users.id), 1));
  return new Set(dupRows.map((r) => r.emailNormalized).filter((x): x is string => Boolean(x)));
}

export async function queryAdminUsersList(db: Db, input: AdminUsersListInput) {
  const dupEmails = await fetchDuplicateEmailNormalizedSet(db);

  const conditions: ReturnType<typeof and>[] = [];

  const searchTerm = input.search?.trim();
  if (searchTerm) {
    const pat = `%${escapeLike(searchTerm)}%`;
    conditions.push(
      or(
        like(users.name, pat),
        like(users.displayName, pat),
        like(users.email, pat),
        like(users.primaryEmail, pat),
        like(users.emailNormalized, pat),
      )!,
    );
  }

  if (input.accountStatuses?.length) {
    conditions.push(inArray(users.accountStatus, input.accountStatuses as ("active" | "invited" | "suspended" | "merged" | "archived")[]));
  }

  if (input.createdAfter) {
    conditions.push(sql`${users.createdAt} >= ${input.createdAfter}`);
  }
  if (input.createdBefore) {
    conditions.push(sql`${users.createdAt} <= ${input.createdBefore}`);
  }
  if (input.staleAfterDays !== undefined && input.staleAfterDays >= 0) {
    const cutoff = new Date(Date.now() - input.staleAfterDays * 86400000);
    conditions.push(or(isNull(users.lastSignedIn), lte(users.lastSignedIn, cutoff))!);
  }

  if (input.securityQuickFilter === "needs_attention") {
    conditions.push(
      or(
        and(
          exists(
            db
              .select({ x: sql`1` })
              .from(platformUserRoles)
              .where(
                and(
                  eq(platformUserRoles.userId, users.id),
                  isNull(platformUserRoles.revokedAt),
                  inArray(platformUserRoles.role, ["super_admin", "platform_admin"]),
                )!,
              ),
          ),
          eq(users.twoFactorEnabled, false),
        )!,
        exists(
          db
            .select({ x: sql`1` })
            .from(userSecuritySettings)
            .where(
              and(
                eq(userSecuritySettings.userId, users.id),
                eq(userSecuritySettings.requiresStepUpAuth, true),
                sql`coalesce(${userSecuritySettings.twoFactorEnabled}, ${users.twoFactorEnabled}) = false`,
              )!,
            ),
        ),
      )!,
    );
  }

  if (input.globalPlatformRole) {
    conditions.push(
      exists(
        db
          .select({ x: sql`1` })
          .from(platformUserRoles)
          .where(
            and(
              eq(platformUserRoles.userId, users.id),
              isNull(platformUserRoles.revokedAt),
              eq(platformUserRoles.role, input.globalPlatformRole as (typeof platformUserRoles.$inferSelect)["role"]),
            )!,
          ),
      ),
    );
  }

  if (input.membershipRole) {
    conditions.push(
      exists(
        db
          .select({ x: sql`1` })
          .from(companyMembers)
          .where(
            and(
              eq(companyMembers.userId, users.id),
              eq(companyMembers.isActive, true),
              eq(companyMembers.role, input.membershipRole as (typeof companyMembers.$inferSelect)["role"]),
            )!,
          ),
      ),
    );
  }

  if (input.authProvider?.trim()) {
    const ap = `%${escapeLike(input.authProvider.trim())}%`;
    conditions.push(
      exists(
        db
          .select({ x: sql`1` })
          .from(userAuthIdentities)
          .where(and(eq(userAuthIdentities.userId, users.id), like(userAuthIdentities.provider, ap))!),
      ),
    );
  }

  if (input.twoFactor === "enabled") {
    conditions.push(eq(users.twoFactorEnabled, true));
  } else if (input.twoFactor === "missing") {
    conditions.push(eq(users.twoFactorEnabled, false));
  }

  /** identity quick filters applied in SQL where possible */
  if (input.identityQuickFilter === "duplicate") {
    const dupList = [...dupEmails];
    if (dupList.length === 0) {
      return { items: [] as AdminUserListItem[], total: 0 };
    }
    conditions.push(and(inArray(users.emailNormalized, dupList), notInArray(users.accountStatus, ["merged", "archived"]))!);
  } else if (input.identityQuickFilter === "no_memberships") {
    conditions.push(
      not(
        exists(
          db
            .select({ x: sql`1` })
            .from(companyMembers)
            .where(and(eq(companyMembers.userId, users.id), eq(companyMembers.isActive, true))!),
        ),
      ),
    );
  } else if (input.identityQuickFilter === "merged_inactive") {
    conditions.push(or(eq(users.accountStatus, "merged"), eq(users.accountStatus, "archived"), eq(users.isActive, false))!);
  } else if (input.identityQuickFilter === "privileged_no_2fa") {
    conditions.push(
      and(
        exists(
          db
            .select({ x: sql`1` })
            .from(platformUserRoles)
            .where(
              and(
                eq(platformUserRoles.userId, users.id),
                isNull(platformUserRoles.revokedAt),
                inArray(platformUserRoles.role, ["super_admin", "platform_admin"]),
              )!,
            ),
        ),
        eq(users.twoFactorEnabled, false),
      )!,
    );
  }

  const finalWhere = conditions.length > 0 ? and(...conditions) : undefined;

  const [countRow] = await db.select({ c: count() }).from(users).where(finalWhere);
  const total = Number(countRow?.c ?? 0);

  const userRows = await db
    .select({
      id: users.id,
      name: users.name,
      displayName: users.displayName,
      email: users.email,
      primaryEmail: users.primaryEmail,
      emailNormalized: users.emailNormalized,
      avatarUrl: users.avatarUrl,
      accountStatus: users.accountStatus,
      isActive: users.isActive,
      role: users.role,
      platformRole: users.platformRole,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn,
      twoFactorEnabled: users.twoFactorEnabled,
      twoFactorVerifiedAt: users.twoFactorVerifiedAt,
      twoFactorBackupCodesJson: users.twoFactorBackupCodesJson,
    })
    .from(users)
    .where(finalWhere)
    .orderBy(desc(users.lastSignedIn))
    .limit(input.limit)
    .offset(input.offset);

  const userIds = userRows.map((r) => r.id);
  if (userIds.length === 0) return { items: [] as AdminUserListItem[], total };

  const pur = await db
    .select({
      userId: platformUserRoles.userId,
      role: platformUserRoles.role,
      grantedAt: platformUserRoles.grantedAt,
      grantedBy: platformUserRoles.grantedBy,
      revokedAt: platformUserRoles.revokedAt,
    })
    .from(platformUserRoles)
    .where(and(inArray(platformUserRoles.userId, userIds), isNull(platformUserRoles.revokedAt)));

  const purByUser = new Map<number, typeof pur>();
  for (const row of pur) {
    if (!purByUser.has(row.userId)) purByUser.set(row.userId, []);
    purByUser.get(row.userId)!.push(row);
  }

  const mem = await db
    .select({
      userId: companyMembers.userId,
      role: companyMembers.role,
      companyId: companyMembers.companyId,
      companyName: companies.name,
      isActive: companyMembers.isActive,
      invitedAt: companyMembers.invitedAt,
      acceptedAt: companyMembers.acceptedAt,
      removedAt: companyMembers.removedAt,
      joinedAt: companyMembers.joinedAt,
    })
    .from(companyMembers)
    .innerJoin(companies, eq(companies.id, companyMembers.companyId))
    .where(and(inArray(companyMembers.userId, userIds), eq(companyMembers.isActive, true)));

  const memByUser = new Map<number, typeof mem>();
  for (const row of mem) {
    if (!memByUser.has(row.userId)) memByUser.set(row.userId, []);
    memByUser.get(row.userId)!.push(row);
  }

  const idents = await db
    .select({
      userId: userAuthIdentities.userId,
      provider: userAuthIdentities.provider,
      providerEmail: userAuthIdentities.providerEmail,
      isPrimary: userAuthIdentities.isPrimary,
      linkedAt: userAuthIdentities.linkedAt,
      lastUsedAt: userAuthIdentities.lastUsedAt,
      providerSubjectId: userAuthIdentities.providerSubjectId,
    })
    .from(userAuthIdentities)
    .where(inArray(userAuthIdentities.userId, userIds));

  const identsByUser = new Map<number, typeof idents>();
  for (const row of idents) {
    if (!identsByUser.has(row.userId)) identsByUser.set(row.userId, []);
    identsByUser.get(row.userId)!.push(row);
  }

  const sec = await db.select().from(userSecuritySettings).where(inArray(userSecuritySettings.userId, userIds));
  const secByUser = new Map(sec.map((s) => [s.userId, s]));

  const items: AdminUserListItem[] = userRows.map((r) => {
    const prRows = purByUser.get(r.id) ?? [];
    const globalRoles = prRows.map((x) => x.role);
    const mrows = memByUser.get(r.id) ?? [];
    const activeRoles = mrows.map((m) => m.role ?? "company_member");
    const best = deriveBestMemberRole(activeRoles);
    const mapped = best ? mapMemberRoleToPlatformRole(best) : null;

    const display = displayNameFromRow(r);
    const email = primaryEmailFromRow(r);
    const en = r.emailNormalized ?? undefined;
    const duplicateEmail = Boolean(en && dupEmails.has(en) && (r.accountStatus ?? "active") !== "merged");

    const idrows = identsByUser.get(r.id) ?? [];
    const providers = Array.from(
      new Map(idrows.map((i) => [i.provider, { provider: i.provider, label: providerLabel(i.provider) }])).values(),
    );

    const secRow = secByUser.get(r.id);
    const twoFa = secRow?.twoFactorEnabled ?? r.twoFactorEnabled ?? false;
    const verifiedAt = secRow?.twoFactorVerifiedAt ?? r.twoFactorVerifiedAt ?? null;
    const stepUp = secRow?.requiresStepUpAuth ?? false;
    const privMissing = globalRoles.some((g) => PRIVILEGED_GLOBAL.has(g)) && !twoFa;

    const recoveryPresent = Boolean(r.twoFactorBackupCodesJson || secRow?.recoveryCodesHash);

    const { overallLevel, signals } = buildIdentityHealthSignals({
      accountStatus: r.accountStatus ?? "active",
      emailNormalized: r.emailNormalized,
      primaryEmail: email,
      duplicateEmail,
      activeMembershipCount: mrows.length,
      globalPlatformRoles: globalRoles,
      authIdentityCount: idrows.length,
      legacyUsersPlatformRole: r.platformRole ?? "client",
      mappedMembershipToPlatform: mapped,
    });

    const secHealth = buildSecurityHealthSignals({
      twoFactorEnabled: twoFa,
      twoFactorVerifiedAt: verifiedAt,
      requiresStepUp: stepUp,
      globalPlatformRoles: globalRoles,
      recoveryCodesPresent: recoveryPresent,
    });

    const sum = membershipSummaryLabel(activeRoles);

    return {
      id: r.id,
      displayName: display,
      primaryEmail: email,
      emailNormalized: r.emailNormalized,
      avatarUrl: r.avatarUrl,
      accountStatus: r.accountStatus ?? "active",
      isActiveLegacy: Boolean(r.isActive),
      platformRoles: globalRoles,
      membershipSummary: sum,
      authProviders: providers,
      securityHealth: {
        overallLevel: secHealth.overallLevel,
        signals: secHealth.signals,
        twoFactorEnabled: twoFa,
        twoFactorVerifiedAt: verifiedAt,
        requiresStepUp: stepUp,
        privilegedMissing2fa: privMissing,
      },
      identityHealth: { overallLevel, signals },
      lastSignedInAt: r.lastSignedIn,
      createdAt: r.createdAt,
      legacy: { usersRole: r.role, usersPlatformRole: r.platformRole },
    };
  });

  return { items, total };
}

export type AdminAnomalySignal = IdentityHealthSignal & {
  category: "identity" | "security";
};

export type AdminUserDetail = {
  listSlice: AdminUserListItem;
  /** Canonical account when this row was merged away. */
  mergedIntoUser: {
    userId: number;
    primaryEmail: string | null;
    displayLabel: string | null;
  } | null;
  /** Combined identity + security signals for the anomalies panel. */
  anomalies: AdminAnomalySignal[];
  identity: {
    userId: number;
    displayName: string | null;
    primaryEmail: string | null;
    emailNormalized: string | null;
    accountStatus: string;
    openId: string;
    createdAt: Date;
    updatedAt: Date;
    lastSignedIn: Date | null;
    mergedIntoUserId: number | null;
  };
  mergedFromUsers: { id: number; primaryEmail: string | null; displayLabel: string | null }[];
  platformRoles: Array<{
    role: string;
    grantedAt: Date | null;
    grantedByUserId: number | null;
    grantedByLabel: string | null;
    revokedAt: Date | null;
  }>;
  revokedPlatformRoles: Array<{
    role: string;
    grantedAt: Date | null;
    revokedAt: Date | null;
  }>;
  memberships: Array<{
    memberId: number;
    companyId: number;
    companyName: string;
    role: string;
    isActive: boolean;
    invitedAt: Date | null;
    acceptedAt: Date | null;
    removedAt: Date | null;
  }>;
  authIdentities: Array<{
    id: number;
    provider: string;
    providerLabel: string;
    providerEmail: string | null;
    providerSubjectId: string;
    isPrimary: boolean;
    linkedAt: Date | null;
    lastUsedAt: Date | null;
  }>;
  security: {
    twoFactorEnabled: boolean;
    twoFactorVerifiedAt: Date | null;
    requiresStepUpAuth: boolean;
    passwordLastChangedAt: Date | null;
    recoveryCodesPresent: boolean;
  };
  legacyDiagnostics: {
    usersRole: string;
    usersPlatformRole: string;
    notes: string;
  };
  recentAudit: Array<{
    id: number;
    action: string;
    entityType: string;
    entityId: number | null;
    companyId: number | null;
    createdAt: Date;
    actorUserId: number | null;
    snippet: string | null;
  }>;
};

export async function fetchAdminUserDetail(db: Db, userId: number): Promise<AdminUserDetail | null> {
  const dupEmails = await fetchDuplicateEmailNormalizedSet(db);

  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row) return null;

  const purAll = await db
    .select({
      id: platformUserRoles.id,
      role: platformUserRoles.role,
      grantedAt: platformUserRoles.grantedAt,
      grantedBy: platformUserRoles.grantedBy,
      revokedAt: platformUserRoles.revokedAt,
    })
    .from(platformUserRoles)
    .where(eq(platformUserRoles.userId, userId));
  const activePur = purAll.filter((r) => r.revokedAt == null);

  const mem = await db
    .select({
      memberId: companyMembers.id,
      companyId: companyMembers.companyId,
      companyName: companies.name,
      role: companyMembers.role,
      isActive: companyMembers.isActive,
      invitedAt: companyMembers.invitedAt,
      acceptedAt: companyMembers.acceptedAt,
      removedAt: companyMembers.removedAt,
    })
    .from(companyMembers)
    .innerJoin(companies, eq(companies.id, companyMembers.companyId))
    .where(eq(companyMembers.userId, userId));

  const idents = await db
    .select()
    .from(userAuthIdentities)
    .where(eq(userAuthIdentities.userId, userId));

  const [sec] = await db.select().from(userSecuritySettings).where(eq(userSecuritySettings.userId, userId));

  const granterIds = activePur.map((p) => p.grantedBy).filter((x): x is number => typeof x === "number");
  const granters =
    granterIds.length > 0
      ? await db
          .select({ id: users.id, name: users.name, email: users.email, primaryEmail: users.primaryEmail, displayName: users.displayName })
          .from(users)
          .where(inArray(users.id, Array.from(new Set(granterIds))))
      : [];
  const granterMap = new Map(granters.map((g) => [g.id, g]));

  const mergedFrom = await db
    .select({ id: users.id, email: users.email, primaryEmail: users.primaryEmail, displayName: users.displayName, name: users.name })
    .from(users)
    .where(eq(users.mergedIntoUserId, userId));

  const [mergedIntoTarget] =
    row.mergedIntoUserId != null
      ? await db
          .select({ id: users.id, email: users.email, primaryEmail: users.primaryEmail, displayName: users.displayName, name: users.name })
          .from(users)
          .where(eq(users.id, row.mergedIntoUserId))
          .limit(1)
      : [];

  const primaryEmail = primaryEmailFromRow(row);
  const display = displayNameFromRow(row);
  const activeRoles = mem.filter((m) => m.isActive).map((m) => m.role ?? "company_member");
  const best = deriveBestMemberRole(activeRoles);
  const mapped = best ? mapMemberRoleToPlatformRole(best) : null;

  const en = row.emailNormalized ?? undefined;
  const duplicateEmail = Boolean(en && dupEmails.has(en) && (row.accountStatus ?? "active") !== "merged");

  const twoFa = sec?.twoFactorEnabled ?? row.twoFactorEnabled ?? false;
  const verifiedAt = sec?.twoFactorVerifiedAt ?? row.twoFactorVerifiedAt ?? null;
  const recoveryPresent = Boolean(row.twoFactorBackupCodesJson || sec?.recoveryCodesHash);

  const { overallLevel, signals } = buildIdentityHealthSignals({
    accountStatus: row.accountStatus ?? "active",
    emailNormalized: row.emailNormalized,
    primaryEmail,
    duplicateEmail,
    activeMembershipCount: mem.filter((m) => m.isActive).length,
    globalPlatformRoles: activePur.map((p) => p.role),
    authIdentityCount: idents.length,
    legacyUsersPlatformRole: row.platformRole ?? "client",
    mappedMembershipToPlatform: mapped,
  });

  const activeGlobalRoles = activePur.map((p) => p.role);
  const secHealth = buildSecurityHealthSignals({
    twoFactorEnabled: twoFa,
    twoFactorVerifiedAt: verifiedAt,
    requiresStepUp: sec?.requiresStepUpAuth ?? false,
    globalPlatformRoles: activeGlobalRoles,
    recoveryCodesPresent: recoveryPresent,
  });

  const listSlice: AdminUserListItem = {
    id: row.id,
    displayName: display,
    primaryEmail,
    emailNormalized: row.emailNormalized,
    avatarUrl: row.avatarUrl,
    accountStatus: row.accountStatus ?? "active",
    isActiveLegacy: Boolean(row.isActive),
    platformRoles: activePur.map((p) => p.role),
    membershipSummary: membershipSummaryLabel(activeRoles),
    authProviders: Array.from(
      new Map(
        idents.map((i) => [i.provider, { provider: i.provider, label: providerLabel(i.provider) }]),
      ).values(),
    ),
    securityHealth: {
      overallLevel: secHealth.overallLevel,
      signals: secHealth.signals,
      twoFactorEnabled: twoFa,
      twoFactorVerifiedAt: verifiedAt,
      requiresStepUp: sec?.requiresStepUpAuth ?? false,
      privilegedMissing2fa: activePur.some((p) => PRIVILEGED_GLOBAL.has(p.role)) && !twoFa,
    },
    identityHealth: { overallLevel, signals },
    lastSignedInAt: row.lastSignedIn,
    createdAt: row.createdAt,
    legacy: { usersRole: row.role, usersPlatformRole: row.platformRole },
  };

  const platformRolesDetail = activePur.map((p) => {
    const g = p.grantedBy != null ? granterMap.get(p.grantedBy) : undefined;
    const gl = g ? displayNameFromRow(g) ?? primaryEmailFromRow(g) ?? `User #${g.id}` : null;
    return {
      role: p.role,
      grantedAt: p.grantedAt,
      grantedByUserId: p.grantedBy ?? null,
      grantedByLabel: gl,
      revokedAt: null as Date | null,
    };
  });

  const revokedPlatformRoles = purAll
    .filter((p) => p.revokedAt != null)
    .map((p) => ({ role: p.role, grantedAt: p.grantedAt, revokedAt: p.revokedAt }));

  const auditRows = await db
    .select({
      id: auditLogs.id,
      actorUserId: auditLogs.userId,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      companyId: auditLogs.companyId,
      createdAt: auditLogs.createdAt,
      oldValues: auditLogs.oldValues,
      newValues: auditLogs.newValues,
    })
    .from(auditLogs)
    .where(
      or(
        and(eq(auditLogs.entityType, "user"), eq(auditLogs.entityId, userId))!,
        eq(auditLogs.userId, userId)!,
      )!,
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(10);

  const anomalies: AdminAnomalySignal[] = [
    ...listSlice.identityHealth.signals.map((s) => ({ ...s, category: "identity" as const })),
    ...listSlice.securityHealth.signals.map((s) => ({ ...s, category: "security" as const })),
  ];

  return {
    listSlice,
    mergedIntoUser: mergedIntoTarget
      ? {
          userId: mergedIntoTarget.id,
          primaryEmail: primaryEmailFromRow(mergedIntoTarget),
          displayLabel: displayNameFromRow(mergedIntoTarget),
        }
      : null,
    anomalies,
    identity: {
      userId: row.id,
      displayName: display,
      primaryEmail,
      emailNormalized: row.emailNormalized,
      accountStatus: row.accountStatus ?? "active",
      openId: row.openId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastSignedIn: row.lastSignedIn,
      mergedIntoUserId: row.mergedIntoUserId,
    },
    mergedFromUsers: mergedFrom.map((m) => ({
      id: m.id,
      primaryEmail: primaryEmailFromRow(m),
      displayLabel: displayNameFromRow(m),
    })),
    platformRoles: platformRolesDetail,
    revokedPlatformRoles,
    memberships: mem.map((m) => ({
      memberId: m.memberId,
      companyId: m.companyId,
      companyName: m.companyName,
      role: m.role,
      isActive: Boolean(m.isActive),
      invitedAt: m.invitedAt,
      acceptedAt: m.acceptedAt,
      removedAt: m.removedAt,
    })),
    authIdentities: idents.map((i) => ({
      id: i.id,
      provider: i.provider,
      providerLabel: providerLabel(i.provider),
      providerEmail: i.providerEmail,
      providerSubjectId: i.providerSubjectId,
      isPrimary: Boolean(i.isPrimary),
      linkedAt: i.linkedAt,
      lastUsedAt: i.lastUsedAt,
    })),
    security: {
      twoFactorEnabled: twoFa,
      twoFactorVerifiedAt: sec?.twoFactorVerifiedAt ?? row.twoFactorVerifiedAt ?? null,
      requiresStepUpAuth: sec?.requiresStepUpAuth ?? false,
      passwordLastChangedAt: sec?.passwordLastChangedAt ?? null,
      recoveryCodesPresent: Boolean(row.twoFactorBackupCodesJson || sec?.recoveryCodesHash),
    },
    legacyDiagnostics: {
      usersRole: row.role,
      usersPlatformRole: row.platformRole,
      notes:
        "Legacy template (`users.role`) and UI cache (`users.platformRole`) — not authoritative. Compare to Platform roles and Company memberships above.",
    },
    recentAudit: auditRows.map((a) => ({
      id: a.id,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      companyId: a.companyId,
      createdAt: a.createdAt,
      actorUserId: a.actorUserId,
      snippet: summarizeAuditPayload(a.action, a.oldValues, a.newValues),
    })),
  };
}

function summarizeAuditPayload(
  action: string,
  oldValues: unknown,
  newValues: unknown,
): string | null {
  try {
    if (newValues && typeof newValues === "object") {
      return JSON.stringify(newValues).slice(0, 120);
    }
    if (oldValues && typeof oldValues === "object") {
      return JSON.stringify(oldValues).slice(0, 120);
    }
  } catch {
    return null;
  }
  return action;
}
