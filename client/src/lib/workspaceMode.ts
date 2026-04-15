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
 * **Core invariant — pre-company UI**
 *
 * Pre-company mode only applies **after company membership resolution is settled**
 * (`companies.myCompanies` has finished its initial load). **Loading** and
 * **platform / operator / portal-only-client** contexts are **explicitly excluded**
 * (they use a shell, skeleton, or different product surface — not the pre-company dashboard).
 *
 * When the above holds, returns true if the settled membership list is **empty** and the
 * user should see the pre-company onboarding workspace (not the tenant “business OS”).
 *
 * Until `companyLoading` is false, callers must show a **loading shell** — not this state —
 * so we never infer “no company” from a transient empty list.
 *
 * @see `docs/architecture/workspace-mode.md`
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
