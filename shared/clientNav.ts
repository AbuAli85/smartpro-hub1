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
export const COMPANY_LEADERSHIP_HREFS = new Set<string>(["/payroll", "/payroll/process", "/reports"]);

/** End-customer portal — minimal shell */
export const PORTAL_CLIENT_HREFS = new Set<string>([
  "/dashboard",
  "/client-portal",
  "/subscriptions",
  "/alerts",
  "/contracts",
  "/onboarding",
  "/company/hub",
  "/company/workspace",
  "/my-team",
  "/my-team/import",
  "/business/dashboard",
  "/company/operations",
  "/company/documents",
  "/hr/documents-dashboard",
  "/payroll/process",
  "/preferences",
  "/",
]);

/**
 * Routes blocked for external_auditor (read-only role).
 * Auditors can view data but cannot access management/write-heavy pages.
 */
export const AUDITOR_BLOCKED_HREFS = new Set<string>([
  "/company-admin",
  "/renewal-workflows",
  "/payroll",
  "/reports",
  "/hr/recruitment",
  "/quotations",
  "/marketplace",
  "/sanad/catalogue-admin",
  "/sanad/ratings-moderation",
  "/admin",
  "/omani-officers",
  "/officer-assignments",
  "/billing",
  "/sla-management",
  "/platform-ops",
]);

/** User can hide these from the sidebar (preferences) */
export const OPTIONAL_NAV_HREFS = new Set<string>([
  "/analytics",
  "/compliance",
  "/marketplace",
  "/hr/recruitment",
  "/quotations",
]);

export function isExternalAuditorNav(
  memberRole?: string | null,
): boolean {
  return memberRole === "external_auditor";
}

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
  /** While company membership is loading, do not treat portal users as "no company" (avoids nav flash). */
  companyWorkspaceLoading?: boolean;
  /** Company membership role (e.g. "external_auditor") — used for auditor nav filtering. */
  memberRole?: string | null;
};

/** Exported for mobile nav / layout parity with sidebar. */
export function shouldUsePortalOnlyShell(
  user: { platformRole?: string | null } | null,
  options?: ClientNavOptions,
): boolean {
  if (!isPortalClientNav(user)) return false;
  if (options?.companyWorkspaceLoading) return false;
  return options?.hasCompanyWorkspace !== true;
}

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

  // External auditors cannot see management/write-heavy pages
  if (AUDITOR_BLOCKED_HREFS.has(href) && isExternalAuditorNav(options?.memberRole)) {
    return false;
  }

  if (shouldUsePortalOnlyShell(user, options)) {
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

/** Strip query string and trailing slash (except `/`). */
export function normalizeClientPath(path: string): string {
  let p = path.split("?")[0] ?? "/";
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p || "/";
}

function pathMatchesRestrictedPrefix(path: string, baseHref: string): boolean {
  return path === baseHref || path.startsWith(`${baseHref}/`);
}

/** Portal-only users (no company): allowed path prefixes / exact entries. */
function portalShellPathAllowed(path: string): boolean {
  if (PORTAL_CLIENT_HREFS.has(path)) return true;
  if (path.startsWith("/contracts")) return true;
  if (path.startsWith("/company/documents")) return true;
  if (path.startsWith("/hr/documents-dashboard")) return true;
  if (path.startsWith("/employee")) return true;
  return false;
}

/**
 * Full URL path access (for route guard + deep links). Uses the same rules as the sidebar.
 */
export function clientRouteAccessible(
  pathname: string,
  user: { role?: string | null; platformRole?: string | null } | null,
  hiddenOptional: Set<string>,
  options?: ClientNavOptions,
): boolean {
  const path = normalizeClientPath(pathname);

  for (const opt of Array.from(OPTIONAL_NAV_HREFS)) {
    if (!hiddenOptional.has(opt)) continue;
    if (path === opt || path.startsWith(`${opt}/`)) {
      return false;
    }
  }

  // External auditors: block all management/write-heavy routes
  if (isExternalAuditorNav(options?.memberRole)) {
    for (const blocked of Array.from(AUDITOR_BLOCKED_HREFS)) {
      if (pathMatchesRestrictedPrefix(path, blocked)) return false;
    }
  }

  if (shouldUsePortalOnlyShell(user, options)) {
    return portalShellPathAllowed(path);
  }

  for (const href of Array.from(PLATFORM_ONLY_HREFS)) {
    if (pathMatchesRestrictedPrefix(path, href) && !seesPlatformOperatorNav(user)) {
      return false;
    }
  }

  for (const href of Array.from(COMPANY_OWNER_HREFS)) {
    if (pathMatchesRestrictedPrefix(path, href) && !seesPlatformOperatorNav(user) && !isCompanyOwnerNav(user)) {
      return false;
    }
  }

  for (const href of Array.from(COMPANY_LEADERSHIP_HREFS)) {
    if (pathMatchesRestrictedPrefix(path, href) && !seesPlatformOperatorNav(user) && !seesLeadershipCompanyNav(user)) {
      return false;
    }
  }

  return true;
}
