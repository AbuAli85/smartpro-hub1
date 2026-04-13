import { canAccessGlobalAdminProcedures } from "./rbac";

/** SmartPRO operator / provider tools — not shown to typical business tenants */
/** Platform sidebar links restricted to global admins (not regional_manager / client_services). */
export const GLOBAL_ADMIN_PLATFORM_HREFS = new Set<string>(["/admin/sanad"]);

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
  "/user-roles",
  "/survey/admin/responses",
  "/survey/admin/analytics",
]);

/** Owner-style configuration — company_admin only */
export const COMPANY_OWNER_HREFS = new Set<string>([
  "/company-admin",
  "/renewal-workflows",
  "/company/team-access",
  "/company/multi-company-roles",
  "/company/settings",
  "/company/email-preview",
]);

/**
 * Government services & Sanad — platform operators + company_admin only.
 * HR/Finance managers and field employees should not see these.
 */
export const GOVERNMENT_SERVICES_HREFS = new Set<string>([
  "/sanad",
  "/sanad/marketplace",
  "/pro",
  "/workforce",
  "/workforce/employees",
  "/workforce/permits",
  "/workforce/cases",
  "/workforce/documents",
  "/workforce/sync",
  "/workforce/profile-change-requests",
]);

/**
 * Business / commercial pages — company_admin + finance_admin + reviewer.
 * HR-only managers should not see CRM, quotations, marketplace.
 */
export const BUSINESS_MGMT_HREFS = new Set<string>([
  "/company/hub",
  "/quotations",
  "/marketplace",
  "/crm",
]);

/**
 * Overview items restricted to company_admin and above.
 * hr_admin and finance_admin see Dashboard only, not Operations Centre.
 */
export const COMPANY_ADMIN_OVERVIEW_HREFS = new Set<string>([
  "/operations",
]);

/** Payroll & executive reports — company owner/admin + finance manager (not HR-only). */
export const COMPANY_LEADERSHIP_HREFS = new Set<string>([
  "/payroll",
  "/payroll/process",
  "/reports",
  "/finance/overview",
]);

/** HR-specific pages — company_admin + hr_admin only */
export const HR_ADMIN_HREFS = new Set<string>([
  "/hr/employees",
  "/hr/departments",
  "/hr/recruitment",
  "/hr/leave",
  "/hr/attendance",
  "/hr/attendance-sites",
  "/hr/employee-requests",
  "/hr/letters",
  "/hr/leave-balance",
  "/hr/completeness",
  "/hr/org-structure",
  "/workspace",
  "/hr/tasks",
  "/hr/announcements",
  "/hr/documents-dashboard",
  "/hr/expiry-dashboard",
  "/my-team",
  "/my-team/import",
  "/business/employee",
]);

/** Finance-specific pages — company_admin + finance_admin only */
export const FINANCE_ADMIN_HREFS = new Set<string>([
  "/payroll",
  "/payroll/process",
  "/reports",
  "/billing",
  "/finance/overview",
]);

/**
 * Company membership role `company_member` ("Member") — staff shell in the sidebar and route guard.
 * Shown regardless of platform job (e.g. Super Admin) while that membership is the active workspace role.
 */
export const FIELD_EMPLOYEE_HREFS = new Set<string>([
  "/workspace",
  "/my-portal",
  "/preferences",
  "/dashboard",
  "/control-tower",
  "/",
]);

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
  "/company/operations",
  "/company/documents",
  "/company/profile",
  "/company/team-access",
  "/hr/documents-dashboard",
  "/hr/letters",
  "/hr/leave-balance",
  "/hr/completeness",
  "/hr/departments",
  "/hr/org-structure",
  "/hr/tasks",
  "/hr/announcements",
  "/my-portal",
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
  "/company/team-access",
  "/renewal-workflows",
  "/payroll",
  "/reports",
  "/hr/recruitment",
  "/quotations",
  "/marketplace",
  "/sanad/catalogue-admin",
  "/sanad/ratings-moderation",
  "/admin",
  "/admin/sanad",
  "/user-roles",
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

export function isExternalAuditorNav(memberRole?: string | null): boolean {
  return memberRole === "external_auditor";
}

export function isCompanyAdminMember(memberRole?: string | null): boolean {
  return memberRole === "company_admin";
}

export function isHrAdminMember(memberRole?: string | null): boolean {
  return memberRole === "hr_admin";
}

export function isFinanceAdminMember(memberRole?: string | null): boolean {
  return memberRole === "finance_admin";
}

export function isFieldEmployee(memberRole?: string | null): boolean {
  // company_member with no special role = field employee / basic staff
  return memberRole === "company_member";
}

export function isReviewer(memberRole?: string | null): boolean {
  return memberRole === "reviewer";
}

/** Active company membership role OR legacy platform-only role (before membership loads). */
function readsAsHrManager(
  user: { platformRole?: string | null } | null,
  memberRole?: string | null,
): boolean {
  return isHrAdminMember(memberRole) || user?.platformRole === "hr_admin";
}

function readsAsFinanceManager(
  user: { platformRole?: string | null } | null,
  memberRole?: string | null,
): boolean {
  return isFinanceAdminMember(memberRole) || user?.platformRole === "finance_admin";
}

function readsAsReviewerRole(
  user: { platformRole?: string | null } | null,
  memberRole?: string | null,
): boolean {
  return isReviewer(memberRole) || user?.platformRole === "reviewer";
}

function isHrModuleHref(href: string): boolean {
  return href === "/hr" || href.startsWith("/hr/");
}

/** Non-HR surfaces shown to HR managers (sidebar uses exact hrefs; route guard uses prefixes). */
const HR_MANAGER_SURFACE_HREFS = new Set<string>([
  "/dashboard",
  "/control-tower",
  "/my-portal",
  "/preferences",
  "/",
  "/workspace",
  "/my-team",
  "/my-team/import",
  "/business/employee",
  "/company/profile",
  "/company/documents",
  "/analytics",
  "/compliance",
]);

const FINANCE_MANAGER_SURFACE_HREFS = new Set<string>([
  "/payroll",
  "/payroll/process",
  "/reports",
  "/finance/overview",
  "/dashboard",
  "/control-tower",
  "/my-portal",
  "/preferences",
  "/",
  "/company/profile",
  "/company/documents",
  "/subscriptions",
  "/alerts",
  "/analytics",
  "/compliance",
]);

const REVIEWER_SURFACE_HREFS = new Set<string>([
  "/dashboard",
  "/control-tower",
  "/my-portal",
  "/preferences",
  "/",
  "/company/profile",
  "/company/documents",
  "/analytics",
  "/compliance",
  "/contracts",
  "/company/hub",
  "/crm",
  "/quotations",
  "/marketplace",
]);

const EXTERNAL_AUDITOR_SURFACE_HREFS = new Set<string>([
  "/dashboard",
  "/control-tower",
  "/my-portal",
  "/preferences",
  "/",
  "/company/profile",
  "/analytics",
  "/compliance",
  "/contracts",
]);

function hrManagerSurfaceAllowed(href: string): boolean {
  if (isHrModuleHref(href)) return true;
  if (HR_MANAGER_SURFACE_HREFS.has(href)) return true;
  if (href.startsWith("/my-portal")) return true;
  if (href.startsWith("/preferences")) return true;
  if (href.startsWith("/workspace")) return true;
  if (href.startsWith("/company/profile")) return true;
  if (href.startsWith("/company/documents")) return true;
  if (href.startsWith("/my-team")) return true;
  if (href.startsWith("/business/employee")) return true;
  if (href.startsWith("/analytics")) return true;
  if (href.startsWith("/compliance")) return true;
  return false;
}

function financeManagerSurfaceAllowed(href: string): boolean {
  if (FINANCE_MANAGER_SURFACE_HREFS.has(href)) return true;
  if (href.startsWith("/my-portal")) return true;
  if (href.startsWith("/preferences")) return true;
  if (href.startsWith("/payroll")) return true;
  if (href.startsWith("/finance")) return true;
  if (href.startsWith("/reports")) return true;
  if (href.startsWith("/subscriptions")) return true;
  if (href.startsWith("/alerts")) return true;
  if (href.startsWith("/company/profile")) return true;
  if (href.startsWith("/company/documents")) return true;
  if (href.startsWith("/analytics")) return true;
  if (href.startsWith("/compliance")) return true;
  return false;
}

function reviewerSurfaceAllowed(href: string): boolean {
  if (REVIEWER_SURFACE_HREFS.has(href)) return true;
  if (href.startsWith("/my-portal")) return true;
  if (href.startsWith("/preferences")) return true;
  if (href.startsWith("/company/profile")) return true;
  if (href.startsWith("/company/documents")) return true;
  if (href.startsWith("/contracts")) return true;
  if (href.startsWith("/company/hub")) return true;
  if (href.startsWith("/crm")) return true;
  if (href.startsWith("/quotations")) return true;
  if (href.startsWith("/marketplace")) return true;
  if (href.startsWith("/analytics")) return true;
  if (href.startsWith("/compliance")) return true;
  return false;
}

function externalAuditorSurfaceAllowed(href: string): boolean {
  if (isHrModuleHref(href)) return true;
  if (href === "/workforce" || href.startsWith("/workforce/")) return true;
  if (EXTERNAL_AUDITOR_SURFACE_HREFS.has(href)) return true;
  if (href.startsWith("/my-portal")) return true;
  if (href.startsWith("/preferences")) return true;
  if (href.startsWith("/company/profile")) return true;
  if (href.startsWith("/analytics")) return true;
  if (href.startsWith("/compliance")) return true;
  if (href.startsWith("/contracts")) return true;
  return false;
}

/**
 * When the user's job in the active company is HR / Finance / Reviewer / Auditor only,
 * hide any sidebar item not part of that surface (membership role wins over synced platformRole).
 */
function membershipScopedNavDenies(
  href: string,
  user: { role?: string | null; platformRole?: string | null } | null,
  options?: ClientNavOptions,
): boolean {
  if (!user) return false;
  if (seesPlatformOperatorNav(user) || canAccessGlobalAdminProcedures(user)) return false;
  const mr = options?.memberRole ?? null;
  if (isCompanyAdminMember(mr) || isFieldEmployee(mr) || isCustomerPortalMemberRole(mr)) return false;

  if (readsAsHrManager(user, mr)) {
    return !hrManagerSurfaceAllowed(href);
  }
  if (readsAsFinanceManager(user, mr)) {
    return !financeManagerSurfaceAllowed(href);
  }
  if (readsAsReviewerRole(user, mr)) {
    return !reviewerSurfaceAllowed(href);
  }
  if (isExternalAuditorNav(mr)) {
    return !externalAuditorSurfaceAllowed(href);
  }
  return false;
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

/** Company membership role `client` — end customer, not an internal operator (SANAD / platform staff). */
export function isCustomerPortalMemberRole(memberRole?: string | null): boolean {
  return memberRole === "client";
}

/**
 * Get the human-readable role label for a company member role.
 */
export function getMemberRoleLabel(memberRole?: string | null): string {
  switch (memberRole) {
    case "company_admin": return "Owner / Admin";
    case "hr_admin": return "HR Manager";
    case "finance_admin": return "Finance Manager";
    case "company_member": return "Staff / Employee";
    case "reviewer": return "Reviewer";
    case "external_auditor": return "External Auditor";
    case "client": return "Customer / Client";
    default: return "Team Member";
  }
}

/**
 * Get the role badge color class for a company member role.
 */
export function getMemberRoleColor(memberRole?: string | null): string {
  switch (memberRole) {
    case "company_admin": return "text-orange-400";
    case "hr_admin": return "text-blue-400";
    case "finance_admin": return "text-green-400";
    case "company_member": return "text-white/50";
    case "reviewer": return "text-purple-400";
    case "external_auditor": return "text-yellow-400";
    case "client": return "text-cyan-400";
    default: return "text-white/40";
  }
}

/**
 * Get the default landing page for a company member role.
 */
export function getRoleDefaultRoute(memberRole?: string | null): string {
  switch (memberRole) {
    case "company_admin": return "/control-tower";
    case "hr_admin": return "/hr/employees";
    case "finance_admin": return "/payroll";
    case "company_member": return "/my-portal";
    case "reviewer": return "/control-tower";
    case "external_auditor": return "/control-tower";
    case "client": return "/client-portal";
    default: return "/control-tower";
  }
}

export type ClientNavOptions = {
  /** When true, the active company workspace is resolved (myCompany). */
  hasCompanyWorkspace?: boolean;
  /** While company membership is loading, do not treat portal users as "no company" (avoids nav flash). */
  companyWorkspaceLoading?: boolean;
  /** Company membership role (e.g. "external_auditor") — used for role-based nav filtering. */
  memberRole?: string | null;
  /**
   * When set, reflects whether `trpc.companies.myCompanies` returned at least one company.
   * If `false`, non-platform users without a portal-only profile see a minimal shell until they join or create a company.
   */
  hasCompanyMembership?: boolean;
};

/**
 * Routes allowed for logged-in users who are not yet in any company (non-platform, non-portal-client).
 * Platform operators and global admins use the full app; portal clients use PORTAL_CLIENT_HREFS.
 */
export const NO_COMPANY_SHELL_HREFS = new Set<string>([
  "/",
  "/dashboard",
  "/control-tower",
  "/onboarding",
  "/onboarding-guide",
  "/preferences",
  "/company/create",
]);

/**
 * Minimal shell until the user belongs to at least one company.
 * Does not apply when `hasCompanyMembership` is omitted (legacy callers).
 */
export function shouldUsePreRegistrationShell(
  user: { role?: string | null; platformRole?: string | null } | null,
  options?: ClientNavOptions,
): boolean {
  if (!user) return false;
  if (canAccessGlobalAdminProcedures(user) || seesPlatformOperatorNav(user)) return false;
  if (isPortalClientNav(user)) return false;
  if (isCustomerPortalMemberRole(options?.memberRole)) return false;
  if (options?.hasCompanyMembership === undefined) return false;
  return options.hasCompanyMembership === false;
}

/**
 * Customer / end-user portal shell (PORTAL_CLIENT_HREFS).
 * Applies when the user is an end customer (`platformRole` or company membership role `client`),
 * even after they belong to a company — they must not see HR, Sanad ops, company admin, etc.
 * Platform operators (SANAD, regional_manager, client_services) and global admins keep the full app.
 */
export function shouldUsePortalOnlyShell(
  user: { platformRole?: string | null } | null,
  options?: ClientNavOptions,
): boolean {
  if (canAccessGlobalAdminProcedures(user ?? {})) return false;
  if (seesPlatformOperatorNav(user)) return false;
  if (options?.companyWorkspaceLoading) {
    if (isPortalClientNav(user)) return true;
    return false;
  }
  if (isPortalClientNav(user)) return true;
  if (isCustomerPortalMemberRole(options?.memberRole)) return true;
  return false;
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

  if (GLOBAL_ADMIN_PLATFORM_HREFS.has(href)) {
    return canAccessGlobalAdminProcedures(user ?? { role: null, platformRole: null });
  }

  if (shouldUsePortalOnlyShell(user, options)) {
    return PORTAL_CLIENT_HREFS.has(href);
  }

  if (shouldUsePreRegistrationShell(user, options)) {
    return NO_COMPANY_SHELL_HREFS.has(href);
  }

  // Staff / "Member" company role — employee shell only, even for Super Admin or other platform jobs
  // while this membership is the active workspace role (see PlatformLayout memberRole from myCompany).
  if (isFieldEmployee(options?.memberRole)) {
    return FIELD_EMPLOYEE_HREFS.has(href);
  }

  if (PLATFORM_ONLY_HREFS.has(href)) {
    return seesPlatformOperatorNav(user);
  }

  if (COMPANY_OWNER_HREFS.has(href)) {
    return seesPlatformOperatorNav(user) || isCompanyOwnerNav(user) || isCompanyAdminMember(options?.memberRole);
  }

  if (COMPANY_LEADERSHIP_HREFS.has(href)) {
    return (
      seesPlatformOperatorNav(user) ||
      isCompanyAdminMember(options?.memberRole) ||
      isFinanceAdminMember(options?.memberRole) ||
      user?.platformRole === "finance_admin"
    );
  }

  // HR module — company_admin, hr_admin, external auditors (read); never finance-only managers
  if (isHrModuleHref(href)) {
    if (seesPlatformOperatorNav(user)) return true;
    const mr = options?.memberRole;
    if (!mr && (isCompanyOwnerNav(user) || canAccessGlobalAdminProcedures(user ?? {}))) return true;
    if (
      !mr &&
      options?.companyWorkspaceLoading &&
      (isCompanyOwnerNav(user) || canAccessGlobalAdminProcedures(user ?? {}))
    ) {
      return true;
    }
    if (readsAsFinanceManager(user, mr) && !readsAsHrManager(user, mr) && !isCompanyAdminMember(mr)) {
      return false;
    }
    return (
      isCompanyAdminMember(mr) ||
      readsAsHrManager(user, mr) ||
      isExternalAuditorNav(mr)
    );
  }

  // Government services — platform operators, company_admin, external auditors (compliance read)
  if (GOVERNMENT_SERVICES_HREFS.has(href)) {
    return (
      seesPlatformOperatorNav(user) ||
      isCompanyOwnerNav(user) ||
      isCompanyAdminMember(options?.memberRole) ||
      isExternalAuditorNav(options?.memberRole)
    );
  }

  // Business management pages — not for HR-only, Finance-only, or basic staff
  if (BUSINESS_MGMT_HREFS.has(href)) {
    if (seesPlatformOperatorNav(user)) return true;
    const mr = options?.memberRole;
    if (isCustomerPortalMemberRole(mr)) return false;
    if (readsAsHrManager(user, mr) && !isCompanyAdminMember(mr)) return false;
    if (readsAsFinanceManager(user, mr) && !isCompanyAdminMember(mr)) return false;
    if (isFieldEmployee(mr)) return false;
    return true;
  }

  // Operations Centre — company_admin and platform operators only
  if (COMPANY_ADMIN_OVERVIEW_HREFS.has(href)) {
    return seesPlatformOperatorNav(user) || isCompanyOwnerNav(user) || isCompanyAdminMember(options?.memberRole);
  }

  if (membershipScopedNavDenies(href, user, options)) {
    return false;
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
  if (path.startsWith("/company/team-access")) return true;
  if (path.startsWith("/hr/documents-dashboard")) return true;
  if (path.startsWith("/hr/letters")) return true;
  if (path.startsWith("/hr/leave-balance")) return true;
  if (path.startsWith("/hr/completeness")) return true;
  if (path.startsWith("/hr/org-structure")) return true;
  if (path.startsWith("/workspace")) return true;
  if (path.startsWith("/hr/tasks")) return true;
  if (path.startsWith("/hr/announcements")) return true;
  if (path.startsWith("/my-portal")) return true;
  if (path.startsWith("/employee")) return true;
  return false;
}

/** Deep links allowed before the user has any company membership */
function preRegistrationPathAllowed(path: string): boolean {
  if (NO_COMPANY_SHELL_HREFS.has(path)) return true;
  if (path.startsWith("/onboarding")) return true;
  if (path.startsWith("/invite/")) return true;
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

  if (shouldUsePreRegistrationShell(user, options)) {
    return preRegistrationPathAllowed(path);
  }

  if (isFieldEmployee(options?.memberRole)) {
    return FIELD_EMPLOYEE_HREFS.has(path) || path.startsWith("/my-portal") || path.startsWith("/preferences");
  }

  for (const href of Array.from(GLOBAL_ADMIN_PLATFORM_HREFS)) {
    if (pathMatchesRestrictedPrefix(path, href)) {
      if (!user || !canAccessGlobalAdminProcedures(user)) return false;
    }
  }

  for (const href of Array.from(PLATFORM_ONLY_HREFS)) {
    if (pathMatchesRestrictedPrefix(path, href) && !seesPlatformOperatorNav(user)) {
      return false;
    }
  }

  for (const href of Array.from(COMPANY_OWNER_HREFS)) {
    if (
      pathMatchesRestrictedPrefix(path, href) &&
      !seesPlatformOperatorNav(user) &&
      !isCompanyOwnerNav(user) &&
      !isCompanyAdminMember(options?.memberRole)
    ) {
      return false;
    }
  }

  for (const href of Array.from(COMPANY_LEADERSHIP_HREFS)) {
    if (
      pathMatchesRestrictedPrefix(path, href) &&
      !seesPlatformOperatorNav(user) &&
      !isCompanyAdminMember(options?.memberRole) &&
      !isFinanceAdminMember(options?.memberRole) &&
      user?.platformRole !== "finance_admin"
    ) {
      return false;
    }
  }

  // HR module routes
  if (path === "/hr" || path.startsWith("/hr/")) {
    if (seesPlatformOperatorNav(user)) return true;
    const mr = options?.memberRole;
    if (
      readsAsFinanceManager(user, mr) &&
      !readsAsHrManager(user, mr) &&
      !isCompanyAdminMember(mr)
    ) {
      return false;
    }
    if (isExternalAuditorNav(mr)) return true;
    if (!isCompanyAdminMember(mr) && !readsAsHrManager(user, mr)) return false;
    return true;
  }

  // Government services routes
  for (const href of Array.from(GOVERNMENT_SERVICES_HREFS)) {
    if (pathMatchesRestrictedPrefix(path, href)) {
      if (seesPlatformOperatorNav(user)) return true;
      if (
        isCompanyOwnerNav(user) ||
        isCompanyAdminMember(options?.memberRole) ||
        isExternalAuditorNav(options?.memberRole)
      ) {
        return true;
      }
      return false;
    }
  }

  // Business management routes: not for HR-only / Finance-only / basic staff
  for (const href of Array.from(BUSINESS_MGMT_HREFS)) {
    if (pathMatchesRestrictedPrefix(path, href)) {
      if (seesPlatformOperatorNav(user)) return true;
      const mr = options?.memberRole;
      if (isCustomerPortalMemberRole(mr)) return false;
      if (readsAsHrManager(user, mr) && !isCompanyAdminMember(mr)) return false;
      if (readsAsFinanceManager(user, mr) && !isCompanyAdminMember(mr)) return false;
      if (isFieldEmployee(mr)) return false;
      return true;
    }
  }

  // Operations Centre: company_admin and platform operators only
  for (const href of Array.from(COMPANY_ADMIN_OVERVIEW_HREFS)) {
    if (pathMatchesRestrictedPrefix(path, href)) {
      return seesPlatformOperatorNav(user) || isCompanyOwnerNav(user) || isCompanyAdminMember(options?.memberRole);
    }
  }

  if (membershipScopedNavDenies(path, user, options)) {
    return false;
  }

  return true;
}
