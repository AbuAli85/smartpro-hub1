import { canAccessGlobalAdminProcedures } from "./rbac";

/** SmartPRO operator / provider tools — not shown to typical business tenants */
export const PLATFORM_ONLY_HREFS = new Set<string>([
  "/sanad/office-dashboard",
  "/sanad/catalogue-admin",
  "/sanad/ratings-moderation",
  "/omani-officers",
  "/officer-assignments",
  "/billing",
  "/sla-management",
  "/platform-ops",
  "/audit-log",
  "/admin",
]);

/** Owner-style configuration */
export const COMPANY_OWNER_HREFS = new Set<string>(["/company-admin", "/renewal-workflows"]);

/** Payroll & executive reports */
export const COMPANY_LEADERSHIP_HREFS = new Set<string>(["/payroll", "/reports"]);

/** End-customer portal — minimal shell */
export const PORTAL_CLIENT_HREFS = new Set<string>([
  "/dashboard",
  "/client-portal",
  "/subscriptions",
  "/alerts",
  "/contracts",
  "/onboarding",
  "/company/hub",
  "/preferences",
  "/",
]);

/** User can hide these from the sidebar (preferences) */
export const OPTIONAL_NAV_HREFS = new Set<string>([
  "/analytics",
  "/compliance",
  "/marketplace",
  "/hr/recruitment",
  "/quotations",
]);

export function seesPlatformOperatorNav(user: {
  role?: string | null;
  platformRole?: string | null;
} | null): boolean {
  if (!user) return false;
  if (canAccessGlobalAdminProcedures(user)) return true;
  const pr = user.platformRole;
  return pr === "regional_manager" || pr === "client_services";
}

export function isCompanyOwnerNav(user: { platformRole?: string | null } | null): boolean {
  return user?.platformRole === "company_admin";
}

export function seesLeadershipCompanyNav(user: { platformRole?: string | null } | null): boolean {
  const pr = user?.platformRole;
  return pr === "company_admin" || pr === "finance_admin" || pr === "hr_admin";
}

export function isPortalClientNav(user: { platformRole?: string | null } | null): boolean {
  return user?.platformRole === "client";
}

export type ClientNavOptions = {
  /** When true, `platformRole: client` still gets full company nav (not the minimal portal shell). */
  hasCompanyWorkspace?: boolean;
};

/**
 * Whether a sidebar item should render for this user.
 * `hiddenOptional` = hrefs the user turned off in preferences (optional items only).
 */
export function clientNavItemVisible(
  href: string,
  user: { role?: string | null; platformRole?: string | null } | null,
  hiddenOptional: Set<string>,
  options?: ClientNavOptions,
): boolean {
  if (OPTIONAL_NAV_HREFS.has(href) && hiddenOptional.has(href)) {
    return false;
  }

  const portalShell = isPortalClientNav(user) && options?.hasCompanyWorkspace !== true;
  if (portalShell) {
    return PORTAL_CLIENT_HREFS.has(href);
  }

  if (PLATFORM_ONLY_HREFS.has(href)) {
    return seesPlatformOperatorNav(user);
  }

  if (COMPANY_OWNER_HREFS.has(href)) {
    return seesPlatformOperatorNav(user) || isCompanyOwnerNav(user);
  }

  if (COMPANY_LEADERSHIP_HREFS.has(href)) {
    return seesPlatformOperatorNav(user) || seesLeadershipCompanyNav(user);
  }

  return true;
}
