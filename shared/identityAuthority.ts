/**
 * Centralized global platform authority (cross-tenant operators).
 * Source of truth order:
 *   1) `platform_user_roles` rows surfaced on the user as `platformRoles: string[]`
 *   2) Transition fallback: legacy `users.platformRole` when it matches a known global slug
 *
 * Tenant / company access comes from `company_members` — never infer tenant admin from legacy
 * `users.platformRole` alone.
 */

/** Roles stored only in `platform_user_roles` (global platform staff). */
export const GLOBAL_PLATFORM_ROLE_SLUGS = new Set([
  "super_admin",
  "platform_admin",
  "regional_manager",
  "client_services",
  "sanad_network_admin",
  "sanad_compliance_reviewer",
]);

export type IdentityAugmentedUser = {
  role?: string | null;
  platformRole?: string | null;
  /** Active grants from `platform_user_roles` (revoked rows excluded by loader). */
  platformRoles?: string[] | null;
};

function effectiveGlobalPlatformSlugs(user: IdentityAugmentedUser): string[] {
  const fromTable = (user.platformRoles ?? []).filter(Boolean);
  if (fromTable.length > 0) return Array.from(new Set(fromTable));

  const pr = (user.platformRole ?? "").trim();
  if (pr && GLOBAL_PLATFORM_ROLE_SLUGS.has(pr)) return [pr];
  return [];
}

export function getEffectiveGlobalPlatformRoles(user: IdentityAugmentedUser): string[] {
  return effectiveGlobalPlatformSlugs(user);
}

export function canAccessGlobalAdminFromIdentity(user: IdentityAugmentedUser): boolean {
  const slugs = effectiveGlobalPlatformSlugs(user);
  return slugs.includes("super_admin") || slugs.includes("platform_admin");
}

export function isPlatformSurveyOperatorFromIdentity(user: IdentityAugmentedUser): boolean {
  if (canAccessGlobalAdminFromIdentity(user)) return true;
  const slugs = effectiveGlobalPlatformSlugs(user);
  const pr = (user.platformRole ?? "").trim();
  return (
    slugs.includes("regional_manager") ||
    slugs.includes("client_services") ||
    pr === "regional_manager" ||
    pr === "client_services"
  );
}

export function seesPlatformOperatorNavFromIdentity(user: IdentityAugmentedUser | null): boolean {
  if (!user) return false;
  if (canAccessGlobalAdminFromIdentity(user)) return true;
  return isPlatformSurveyOperatorFromIdentity(user);
}

/**
 * Company provisioning flag — grants auto-provisioning on first login.
 *
 * Priority:
 *   1. Global admin via platform_user_roles → always allowed.
 *   2. User has been migrated to platform_user_roles (array is non-empty) but is NOT a global
 *      admin → refuse; provisioning is global-admin-only for migrated users.
 *   3. Legacy fallback: user has no platform_user_roles rows yet — allow provisioning when
 *      users.platformRole === "company_admin" (onboarding path, transitional only).
 */
export function isCompanyProvisioningAdminFromIdentity(user: IdentityAugmentedUser): boolean {
  if (canAccessGlobalAdminFromIdentity(user)) return true;
  const fromTable = (user.platformRoles ?? []).filter(Boolean);
  if (fromTable.length > 0) return false;
  const pr = (user.platformRole ?? "").trim();
  return pr === "company_admin";
}

/**
 * Survey admin access.
 *
 * Priority:
 *   1. Global admin → always allowed.
 *   2. Platform survey operator (regional_manager, client_services) → allowed.
 *   3. User has been migrated to platform_user_roles (array is non-empty) → no further fallback;
 *      survey admin for tenant users must be granted via a platform_user_roles row.
 *   4. Legacy: users not yet migrated may still have platformRole === "company_admin" and
 *      previously managed their own surveys. Transitional only — remove after migration.
 */
export function canAccessSurveyAdminFromIdentity(user: IdentityAugmentedUser): boolean {
  if (canAccessGlobalAdminFromIdentity(user)) return true;
  if (isPlatformSurveyOperatorFromIdentity(user)) return true;
  const fromTable = (user.platformRoles ?? []).filter(Boolean);
  if (fromTable.length > 0) return false;
  const pr = (user.platformRole ?? "").trim();
  return pr === "company_admin";
}
