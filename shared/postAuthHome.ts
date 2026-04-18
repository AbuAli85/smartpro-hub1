/**
 * Canonical post-authentication landing decisions (marketing `/`, OAuth default, etc.).
 * Uses membership-first rules — never legacy `users.role`.
 */

import type { IdentityAugmentedUser } from "./identityAuthority";
import { canAccessGlobalAdminFromIdentity, seesPlatformOperatorNavFromIdentity } from "./identityAuthority";
import {
  clientRouteAccessible,
  getRoleDefaultRoute,
  isCustomerPortalMemberRole,
  normalizeClientPath,
  type ClientNavOptions,
} from "./clientNav";
import { sanitizeRelativeAppPath } from "./sanitizeRelativeAppPath";

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

export type PickSafeReturnPathInput = {
  /** Raw return path from OAuth state / deep link (trimmed by caller). */
  requestedPath: string;
  resolveInput: ResolvePostAuthHomeInput;
  routeCheck: {
    user: IdentityAugmentedUser | null;
    hiddenOptional: Set<string>;
    navOptions?: ClientNavOptions;
  };
};

/**
 * After authentication, choose where to send the user:
 * - If `requestedPath` is `/` or empty → canonical home from {@link resolvePostAuthHome}.
 * - Else if the path is **allowed** for this user/session ({@link clientRouteAccessible}) → use it.
 * - Else → canonical home (prevents privilege / UX bugs from arbitrary `returnPath`).
 *
 * Call only when `resolvePostAuthHome` inputs are settled (same gates as marketing-home redirect).
 */
export function pickSafeAuthenticatedReturnPath(input: PickSafeReturnPathInput): string {
  const { requestedPath, resolveInput, routeCheck } = input;
  const { user, hiddenOptional, navOptions } = routeCheck;

  const canonicalResult = resolvePostAuthHome(resolveInput);
  const canonical =
    canonicalResult.redirectTo ??
    (resolveInput.isAuthenticated && resolveInput.user ? "/dashboard" : "/");

  const safe = sanitizeRelativeAppPath(requestedPath);
  const pathForPolicy = normalizeClientPath(safe);
  if (pathForPolicy === "/" || pathForPolicy === "") {
    return canonical;
  }
  if (!user) return canonical;

  if (clientRouteAccessible(pathForPolicy, user, hiddenOptional, navOptions)) {
    return safe;
  }
  return canonical;
}

/** Paths where we must not hijack navigation (e.g. MFA step-up). */
export function isPostAuthNavigationSweepSkippedPath(pathname: string): boolean {
  const p = normalizeClientPath(pathname.split("?")[0] ?? pathname);
  if (p === "/auth/mfa" || p.startsWith("/auth/mfa/")) return true;
  return false;
}

export type ComputePostAuthNavigationRedirectInput = {
  isAuthenticated: boolean;
  authLoading: boolean;
  companiesLoading: boolean;
  pathname: string;
  /** From wouter `useSearch()` (may be `""`, `?a=1`, or `a=1`). */
  search: string;
  /** `requestedPath` is derived from `pathname` + `search` inside {@link computePostAuthNavigationRedirect}. */
  pickSafeInput: Omit<PickSafeReturnPathInput, "requestedPath">;
};

/**
 * Production post-auth / deep-link redirect: settled auth + companies only.
 * Returns `null` when the current URL already matches policy or sweep must not run.
 */
export function computePostAuthNavigationRedirect(
  input: ComputePostAuthNavigationRedirectInput,
): string | null {
  const { isAuthenticated, authLoading, companiesLoading, pathname, search, pickSafeInput } = input;
  if (!isAuthenticated || authLoading || companiesLoading) return null;

  const pathOnly = normalizeClientPath(pathname.split("?")[0] ?? pathname);
  if (isPostAuthNavigationSweepSkippedPath(pathOnly)) return null;

  const sq = (search ?? "").trim();
  const fullPath = sq === "" ? pathname : `${pathname}${sq.startsWith("?") ? sq : `?${sq}`}`;

  const target = pickSafeAuthenticatedReturnPath({
    ...pickSafeInput,
    requestedPath: fullPath,
  });

  if (normalizeClientPath(target) === normalizeClientPath(fullPath)) {
    return null;
  }

  return target;
}
