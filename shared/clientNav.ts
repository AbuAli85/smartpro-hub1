import { canAccessGlobalAdminProcedures } from "./rbac";
import { seesPlatformOperatorNavFromIdentity } from "./identityAuthority";
import {
  GLOBAL_ADMIN_ONLY_PATH_PREFIXES,
  PLATFORM_OPERATOR_ONLY_PATH_PREFIXES,
} from "./navPlatformRestrictedPrefixes";
import { isTenantUnsafeNavExtensionPath, pathMatchesNavExtensionHref } from "./roleNavConfig";
import { normalizeAppPath } from "./normalizeAppPath";

/** SmartPRO operator / provider tools — not shown to typical business tenants */
/** Platform sidebar links restricted to global admins (not regional_manager / client_services). */
export const GLOBAL_ADMIN_PLATFORM_HREFS = new Set<string>([...GLOBAL_ADMIN_ONLY_PATH_PREFIXES]);

export const PLATFORM_ONLY_HREFS = new Set<string>([...PLATFORM_OPERATOR_ONLY_PATH_PREFIXES]);

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
 * hr_admin and finance_admin see Dashboard only, not Operations overview.
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
  "/hr/attendance-anomalies",
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

/**
 * End-customer portal — strict Client Workspace shell only (`/client/*`),
 * plus session preferences and contract signing deep links.
 */
export const PORTAL_CLIENT_HREFS = new Set<string>([
  "/",
  "/client",
  "/client/engagements",
  "/client/documents",
  "/client/invoices",
  "/client/messages",
  "/client/team",
  "/preferences",
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

/** Tenant HR/Finance/Reviewer nav — active membership only (never platformRole; avoids multi-company stale UI). */
function readsAsHrManager(memberRole?: string | null): boolean {
  return isHrAdminMember(memberRole);
}

function readsAsFinanceManager(memberRole?: string | null): boolean {
  return isFinanceAdminMember(memberRole);
}

function readsAsReviewerRole(memberRole?: string | null): boolean {
  return isReviewer(memberRole);
}

function hasResolvedMemberRole(memberRole?: string | null): boolean {
  return memberRole != null && memberRole !== "";
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
  if (href.startsWith("/engagements")) return true;
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
  if (href === "/organization" || href.startsWith("/organization/")) return true;
  return false;
}

function financeManagerSurfaceAllowed(href: string): boolean {
  if (FINANCE_MANAGER_SURFACE_HREFS.has(href)) return true;
  if (href.startsWith("/engagements")) return true;
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
  if (href === "/organization" || href.startsWith("/organization/")) return true;
  return false;
}

function reviewerSurfaceAllowed(href: string): boolean {
  if (REVIEWER_SURFACE_HREFS.has(href)) return true;
  if (href.startsWith("/engagements")) return true;
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
  if (href === "/organization" || href.startsWith("/organization/")) return true;
  return false;
}

function externalAuditorSurfaceAllowed(href: string): boolean {
  if (isHrModuleHref(href)) return true;
  if (href.startsWith("/engagements")) return true;
  if (href === "/workforce" || href.startsWith("/workforce/")) return true;
  if (EXTERNAL_AUDITOR_SURFACE_HREFS.has(href)) return true;
  if (href.startsWith("/my-portal")) return true;
  if (href.startsWith("/preferences")) return true;
  if (href.startsWith("/company/profile")) return true;
  if (href.startsWith("/analytics")) return true;
  if (href.startsWith("/compliance")) return true;
  if (href.startsWith("/contracts")) return true;
  if (href === "/organization" || href.startsWith("/organization/")) return true;
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

  if (readsAsHrManager(mr)) {
    return !hrManagerSurfaceAllowed(href);
  }
  if (readsAsFinanceManager(mr)) {
    return !financeManagerSurfaceAllowed(href);
  }
  if (readsAsReviewerRole(mr)) {
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
  platformRoles?: string[] | null;
} | null): boolean {
  return seesPlatformOperatorNavFromIdentity(user);
}

/**
 * @deprecated Legacy helper: `platformRole === "company_admin"`. Do not use for tenant nav;
 * use {@link isCompanyAdminMember} with active workspace `memberRole`.
 */
export function isCompanyOwnerNav(user: { platformRole?: string | null } | null): boolean {
  return user?.platformRole === "company_admin";
}

/** Finance/leadership surfaces: company owner or finance manager in the active workspace. */
export function seesLeadershipCompanyNav(memberRole?: string | null): boolean {
  return isCompanyAdminMember(memberRole) || isFinanceAdminMember(memberRole);
}

/** True when the auth profile is the end-customer channel (`users.platformRole`). Not a company_members check. */
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
    case "client": return "/client";
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
  /** `company_members.permissions` — granular read access for reports, payroll, executive KPIs. */
  memberPermissions?: string[] | null;
  /**
   * When set, reflects whether `trpc.companies.myCompanies` returned at least one company.
   * If `false`, non-platform users without a portal-only profile see a minimal shell until they join or create a company.
   */
  hasCompanyMembership?: boolean;
  /**
   * Optional extra routes (path prefixes) for this membership role, set by company admins
   * in Company Settings → Role navigation extensions (`companies.roleNavExtensions`).
   */
  navExtraAllowedHrefs?: string[] | null;
};

/**
 * Routes + sidebar entries for logged-in users who are not yet in any company
 * (non-platform, non-portal-client). Intentionally excludes `/control-tower` and other
 * tenant “operating system” surfaces until a workspace exists.
 */
export const PRE_COMPANY_NAV_HREFS = new Set<string>([
  "/",
  "/dashboard",
  "/onboarding",
  "/onboarding-guide",
  "/preferences",
  "/company/create",
  "/marketplace",
]);

/** @deprecated Use {@link PRE_COMPANY_NAV_HREFS} */
export const NO_COMPANY_SHELL_HREFS = PRE_COMPANY_NAV_HREFS;

/**
 * Company-configured extra nav paths for the active role. Still respects portal/prereg shells,
 * auditor blocks, and never grants platform-only URLs to tenant users.
 */
function pathMatchesAuditorBlock(path: string): boolean {
  for (const blocked of Array.from(AUDITOR_BLOCKED_HREFS)) {
    if (path === blocked || path.startsWith(`${blocked}/`)) return true;
  }
  return false;
}

export function companyNavExtensionAllows(
  hrefOrPath: string,
  user: { role?: string | null; platformRole?: string | null } | null,
  options?: ClientNavOptions,
): boolean {
  const extras = options?.navExtraAllowedHrefs;
  if (!extras?.length || !pathMatchesNavExtensionHref(hrefOrPath, extras)) return false;
  const path = normalizeClientPath(hrefOrPath);
  if (isTenantUnsafeNavExtensionPath(path)) {
    if (!seesPlatformOperatorNav(user) && !canAccessGlobalAdminProcedures(user ?? {})) return false;
  }
  if (isExternalAuditorNav(options?.memberRole) && pathMatchesAuditorBlock(path)) return false;
  if (shouldUsePortalOnlyShell(user, options)) {
    const portalOk =
      PORTAL_CLIENT_HREFS.has(path) ||
      path.startsWith("/client/") ||
      (path.startsWith("/contracts/") && path.includes("/sign"));
    if (!portalOk) return false;
  }
  if (shouldUsePreRegistrationShell(user, options)) {
    const preOk =
      PRE_COMPANY_NAV_HREFS.has(path) || path.startsWith("/onboarding") || path.startsWith("/invite/");
    if (!preOk) return false;
  }
  return true;
}

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
 * **Primary rule:** active workspace `company_members.role === "client"`.
 * Until that role is known, fall back to `users.platformRole === "client"` (account channel only).
 * Platform operators and global admins never use this shell.
 */
export function shouldUsePortalOnlyShell(
  user: { platformRole?: string | null } | null,
  options?: ClientNavOptions,
): boolean {
  if (canAccessGlobalAdminProcedures(user ?? {})) return false;
  if (seesPlatformOperatorNav(user)) return false;
  const mr = options?.memberRole;
  if (hasResolvedMemberRole(mr)) {
    return isCustomerPortalMemberRole(mr);
  }
  return isPortalClientNav(user);
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

  /** Internal engagements ops queue — not for end-customer portal roles. */
  if (normalizeClientPath(href) === "/engagements/ops") {
    if (shouldUsePortalOnlyShell(user, options)) return false;
    const mr = options?.memberRole;
    if (isCustomerPortalMemberRole(mr)) return false;
    if (seesPlatformOperatorNav(user) || canAccessGlobalAdminProcedures(user ?? {})) return true;
    return (
      isCompanyAdminMember(mr) ||
      readsAsHrManager(mr) ||
      readsAsFinanceManager(mr) ||
      mr === "reviewer"
    );
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
    return PRE_COMPANY_NAV_HREFS.has(href);
  }

  /**
   * Create company — pre-company users, or `company_admin` adding another workspace (product:
   * confirm multi-company creation is intended for tenant admins). Not shown to basic staff.
   */
  if (normalizeClientPath(href) === "/company/create") {
    if (seesPlatformOperatorNav(user) || canAccessGlobalAdminProcedures(user ?? {})) return true;
    if (isCompanyAdminMember(options?.memberRole)) return true;
    return false;
  }

  // Company admin — optional extra routes for this role (before role shells below)
  if (companyNavExtensionAllows(href, user, options)) return true;

  const path = normalizeClientPath(href);
  // Client workspace: any member with a company may open it; hide from platform/global operators in the main shell.
  if (path.startsWith("/client")) {
    if (seesPlatformOperatorNav(user) || canAccessGlobalAdminProcedures(user ?? {})) return false;
    if (shouldUsePreRegistrationShell(user, options)) return false;
    return Boolean(options?.hasCompanyMembership);
  }
  if (
    path === "/reports" ||
    path.startsWith("/reports/") ||
    path === "/hr/attendance" ||
    path.startsWith("/hr/attendance/")
  ) {
    const perms: string[] = options?.memberPermissions ?? [];
    if (perms.includes("view_reports")) return true;
  }
  if (path === "/payroll" || path.startsWith("/payroll/")) {
    const perms: string[] = options?.memberPermissions ?? [];
    if (perms.includes("view_payroll")) return true;
  }
  if (path === "/finance/overview" || path.startsWith("/finance/overview/")) {
    const perms: string[] = options?.memberPermissions ?? [];
    if (perms.includes("view_executive_summary")) return true;
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
    return seesPlatformOperatorNav(user) || isCompanyAdminMember(options?.memberRole);
  }

  if (COMPANY_LEADERSHIP_HREFS.has(href)) {
    return (
      seesPlatformOperatorNav(user) ||
      isCompanyAdminMember(options?.memberRole) ||
      isFinanceAdminMember(options?.memberRole)
    );
  }

  // HR module — company_admin, hr_admin, external auditors (read); never finance-only managers
  if (isHrModuleHref(href)) {
    if (seesPlatformOperatorNav(user)) return true;
    const mr = options?.memberRole;
    if (!hasResolvedMemberRole(mr)) return false;
    if (readsAsFinanceManager(mr) && !readsAsHrManager(mr) && !isCompanyAdminMember(mr)) {
      return false;
    }
    return (
      isCompanyAdminMember(mr) ||
      readsAsHrManager(mr) ||
      isExternalAuditorNav(mr)
    );
  }

  // Government services — platform operators, company_admin, external auditors (compliance read)
  if (GOVERNMENT_SERVICES_HREFS.has(href)) {
    return (
      seesPlatformOperatorNav(user) ||
      isCompanyAdminMember(options?.memberRole) ||
      isExternalAuditorNav(options?.memberRole)
    );
  }

  // Business management pages — not for HR-only, Finance-only, or basic staff
  if (BUSINESS_MGMT_HREFS.has(href)) {
    if (seesPlatformOperatorNav(user)) return true;
    const mr = options?.memberRole;
    if (!hasResolvedMemberRole(mr)) return false;
    if (isCustomerPortalMemberRole(mr)) return false;
    if (readsAsHrManager(mr) && !isCompanyAdminMember(mr)) return false;
    if (readsAsFinanceManager(mr) && !isCompanyAdminMember(mr)) return false;
    if (isFieldEmployee(mr)) return false;
    return true;
  }

  // Operations overview — company_admin and platform operators only
  if (COMPANY_ADMIN_OVERVIEW_HREFS.has(href)) {
    return seesPlatformOperatorNav(user) || isCompanyAdminMember(options?.memberRole);
  }

  if (membershipScopedNavDenies(href, user, options)) {
    return false;
  }

  return true;
}

/** Strip query/hash, collapse slashes, trim trailing slash (except `/`). */
export function normalizeClientPath(path: string): string {
  return normalizeAppPath(path) || "/";
}

function pathMatchesRestrictedPrefix(path: string, baseHref: string): boolean {
  return path === baseHref || path.startsWith(`${baseHref}/`);
}

/** Portal-only users: strict `/client` workspace + preferences + contract signing. */
function portalShellPathAllowed(path: string): boolean {
  if (path === "/client-portal") return true;
  if (PORTAL_CLIENT_HREFS.has(path)) return true;
  if (path.startsWith("/client/")) return true;
  /** Pre-workspace onboarding from client shell (create company / invite team). */
  if (path === "/company/create" || path.startsWith("/company/create/")) return true;
  if (path === "/company/team-access" || path.startsWith("/company/team-access")) return true;
  if (path.startsWith("/contracts/") && path.includes("/sign")) return true;
  return false;
}

/** Deep links allowed before the user has any company membership */
function preRegistrationPathAllowed(path: string): boolean {
  if (PRE_COMPANY_NAV_HREFS.has(path)) return true;
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

  // Buyer Portal routes — path allowed; API enforces customer_account membership
  if (path === "/buyer" || path.startsWith("/buyer/")) {
    return true;
  }

  if (path === "/client" || path.startsWith("/client/")) {
    if (!user) return false;
    if (seesPlatformOperatorNav(user) || canAccessGlobalAdminProcedures(user)) return true;
    if (shouldUsePortalOnlyShell(user, options)) return true;
    return Boolean(options?.hasCompanyMembership);
  }

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

  if (companyNavExtensionAllows(path, user, options)) return true;

  if (
    path === "/reports" ||
    path.startsWith("/reports/") ||
    path === "/hr/attendance" ||
    path.startsWith("/hr/attendance/")
  ) {
    const perms: string[] = options?.memberPermissions ?? [];
    if (perms.includes("view_reports")) return true;
  }
  if (path === "/payroll" || path.startsWith("/payroll/")) {
    const perms: string[] = options?.memberPermissions ?? [];
    if (perms.includes("view_payroll")) return true;
  }
  if (path === "/finance/overview" || path.startsWith("/finance/overview/")) {
    const perms: string[] = options?.memberPermissions ?? [];
    if (perms.includes("view_executive_summary")) return true;
  }

  if (isFieldEmployee(options?.memberRole)) {
    return (
      FIELD_EMPLOYEE_HREFS.has(path) || path.startsWith("/my-portal") || path.startsWith("/preferences")
    );
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
      !isFinanceAdminMember(options?.memberRole)
    ) {
      return false;
    }
  }

  // HR module routes
  if (path === "/hr" || path.startsWith("/hr/")) {
    if (seesPlatformOperatorNav(user)) return true;
    const mr = options?.memberRole;
    if (!hasResolvedMemberRole(mr)) return false;
    if (
      readsAsFinanceManager(mr) &&
      !readsAsHrManager(mr) &&
      !isCompanyAdminMember(mr)
    ) {
      return false;
    }
    if (isExternalAuditorNav(mr)) return true;
    if (!isCompanyAdminMember(mr) && !readsAsHrManager(mr)) return false;
    return true;
  }

  // Government services routes
  for (const href of Array.from(GOVERNMENT_SERVICES_HREFS)) {
    if (pathMatchesRestrictedPrefix(path, href)) {
      if (seesPlatformOperatorNav(user)) return true;
      if (
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
      if (!hasResolvedMemberRole(mr)) return false;
      if (isCustomerPortalMemberRole(mr)) return false;
      if (readsAsHrManager(mr) && !isCompanyAdminMember(mr)) return false;
      if (readsAsFinanceManager(mr) && !isCompanyAdminMember(mr)) return false;
      if (isFieldEmployee(mr)) return false;
      return true;
    }
  }

  // Operations overview: company_admin and platform operators only
  for (const href of Array.from(COMPANY_ADMIN_OVERVIEW_HREFS)) {
    if (pathMatchesRestrictedPrefix(path, href)) {
      return seesPlatformOperatorNav(user) || isCompanyAdminMember(options?.memberRole);
    }
  }

  if (membershipScopedNavDenies(path, user, options)) {
    if (companyNavExtensionAllows(path, user, options)) return true;
    return false;
  }

  if (path === "/company/create" || path.startsWith("/company/create/")) {
    if (seesPlatformOperatorNav(user) || canAccessGlobalAdminProcedures(user ?? {})) return true;
    if (isCompanyAdminMember(options?.memberRole)) return true;
    return false;
  }

  return true;
}
