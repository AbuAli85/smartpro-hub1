import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { isPortalClientNav, seesPlatformOperatorNav } from "@shared/clientNav";

export type PreCompanyWorkspaceContext = {
  /**
   * Must be `ActiveCompanyContext.loading` — i.e. `trpc.companies.myCompanies` initial fetch
   * not finished. Do not substitute other queries (e.g. `myCompany`).
   */
  companyLoading: boolean;
  /** Resolved length of the membership list after `companyLoading` is false. */
  companiesCount: number;
};

/**
 * True when the membership list has **finished loading**, the user has **zero** companies,
 * and they should see the pre-company onboarding workspace (not the tenant business OS).
 *
 * Until `companyLoading` is false, callers should show a loading shell — not this state —
 * so we do not flash pre-company UI while memberships are still resolving.
 *
 * Excludes platform operators, global admins, and portal-only clients (separate shell).
 */
export function isPreCompanyWorkspaceUser(
  user: { role?: string | null; platformRole?: string | null } | null,
  ctx: PreCompanyWorkspaceContext,
): boolean {
  if (!user) return false;
  if (ctx.companyLoading) return false;
  if (ctx.companiesCount > 0) return false;
  if (seesPlatformOperatorNav(user)) return false;
  if (canAccessGlobalAdminProcedures(user)) return false;
  if (isPortalClientNav(user)) return false;
  return true;
}
