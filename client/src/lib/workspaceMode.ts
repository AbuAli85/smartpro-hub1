import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { isPortalClientNav, seesPlatformOperatorNav } from "@shared/clientNav";

export type PreCompanyWorkspaceContext = {
  companyLoading: boolean;
  companiesCount: number;
};

/**
 * True when the user has finished loading memberships and belongs to no company,
 * and should see the pre-company onboarding workspace (not the tenant business OS).
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
