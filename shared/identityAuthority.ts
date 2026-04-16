/**
 * Centralized global platform authority (cross-tenant operators).
 * Source of truth order:
 *   1) `platform_user_roles` rows surfaced on the user as `platformRoles: string[]`
 *   2) Transition fallbacks: legacy `users.platformRole` + `users.role` (during migration only)
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
  if (user.role === "admin") return ["platform_admin"];
  return [];
}

export function getEffectiveGlobalPlatformRoles(user: IdentityAugmentedUser): string[] {
  return effectiveGlobalPlatformSlugs(user);
}

export function canAccessGlobalAdminFromIdentity(user: IdentityAugmentedUser): boolean {
  if (user.role === "admin") return true;
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
 * Company provisioning flag — still uses legacy `users.platformRole === "company_admin"`
 * until explicitly modeled elsewhere (keeps workforce onboarding behaviour).
 */
export function isCompanyProvisioningAdminFromIdentity(user: IdentityAugmentedUser): boolean {
  if (canAccessGlobalAdminFromIdentity(user)) return true;
  if (user.platformRole === "company_admin") return true;
  const pr = (user.platformRole ?? "").trim();
  /** Transition: mapped membership sometimes surfaces only via legacy column. */
  return pr === "company_admin";
}

export function canAccessSurveyAdminFromIdentity(user: IdentityAugmentedUser): boolean {
  if (canAccessGlobalAdminFromIdentity(user)) return true;
  if (isPlatformSurveyOperatorFromIdentity(user)) return true;
  const pr = (user.platformRole ?? "").trim();
  return pr === "company_admin";
}
