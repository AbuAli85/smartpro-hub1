/**
 * Canonical post-authentication landing decisions (marketing `/`, OAuth default, etc.).
 * Uses membership-first rules — never legacy `users.role`.
 */

import type { IdentityAugmentedUser } from "./identityAuthority";
import { canAccessGlobalAdminFromIdentity, seesPlatformOperatorNavFromIdentity } from "./identityAuthority";
import { getRoleDefaultRoute, isCustomerPortalMemberRole, normalizeClientPath } from "./clientNav";

/** Default shell for platform operators and global admins after sign-in from `/`. */
export const OPERATOR_DEFAULT_HOME = "/control-tower";

export type ResolvePostAuthHomeInput = {
  isAuthenticated: boolean;
  /** True while auth.me (or equivalent) is still loading */
  authLoading: boolean;
  /** True while company membership list is unresolved */
  companiesLoading: boolean;
  /** Session user (includes `platformRoles` when loaded from API) */
  user: IdentityAugmentedUser | null;
  /** `companies.myCompanies` has finished (may be empty) */
  companiesSettled: boolean;
  /** At least one row in `company_members` for this user */
  hasCompanyMembership: boolean;
  /** Active workspace `company_members.role`; null if no active company yet */
  activeMemberRole: string | null;
};

export type ResolvePostAuthHomeResult = {
  /** `null` = remain on current route (e.g. stay on marketing `/`) */
  redirectTo: string | null;
};

function isGlobalOrOperator(user: IdentityAugmentedUser | null): boolean {
  if (!user) return false;
  return seesPlatformOperatorNavFromIdentity(user) || canAccessGlobalAdminFromIdentity(user);
}

/**
 * Where an authenticated tenant user should land inside the app shell
 * (not marketing `/`). Used by route gates and CTAs.
 */
export function tenantWorkspaceLandingPath(activeMemberRole: string | null | undefined): string {
  const mr = activeMemberRole ?? null;
  if (mr == null || mr === "") return "/dashboard";
  if (isCustomerPortalMemberRole(mr)) return "/client";
  return getRoleDefaultRoute(mr);
}

/**
 * Decide whether to auto-redirect away from the public marketing home (`/`).
 * Returns `null` while inputs are still loading or unauthenticated.
 */
export function resolvePostAuthHome(input: ResolvePostAuthHomeInput): ResolvePostAuthHomeResult {
  const {
    isAuthenticated,
    authLoading,
    companiesLoading,
    user,
    companiesSettled,
    hasCompanyMembership,
    activeMemberRole,
  } = input;

  if (!isAuthenticated || authLoading) return { redirectTo: null };
  if (companiesLoading || !companiesSettled) return { redirectTo: null };
  if (!user) return { redirectTo: null };

  if (isGlobalOrOperator(user)) {
    return { redirectTo: OPERATOR_DEFAULT_HOME };
  }

  if (!hasCompanyMembership) {
    return { redirectTo: "/dashboard" };
  }

  if (isCustomerPortalMemberRole(activeMemberRole)) {
    return { redirectTo: "/client" };
  }

  const path = getRoleDefaultRoute(activeMemberRole);
  return { redirectTo: path };
}

/** True when `currentPath` already matches the resolved home (avoid redirect loops). */
export function isAlreadyAtPostAuthDestination(currentPath: string, target: string | null): boolean {
  if (!target) return false;
  return normalizeClientPath(currentPath) === normalizeClientPath(target);
}
