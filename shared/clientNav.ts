import { canAccessGlobalAdminProcedures } from "./rbac";
import { seesPlatformOperatorNavFromIdentity } from "./identityAuthority";
import {
  GLOBAL_ADMIN_ONLY_PATH_PREFIXES,
  PLATFORM_OPERATOR_ONLY_PATH_PREFIXES,
} from "./navPlatformRestrictedPrefixes";
import { isTenantUnsafeNavExtensionPath, pathMatchesNavExtensionHref } from "./roleNavConfig";
import { normalizeAppPath } from "./normalizeAppPath";
import { resolveEffectiveCapabilities, type Capability } from "./capabilities";

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

/**
 * Control Tower nav — visible only to users with canViewCompanyControlTower or
 * canViewPlatformControlTower.  Self-scope employees (company_member, isManager=false)
 * are excluded; dept/team managers gain it via MANAGER_SURFACE_HREFS.
 *
 * Role map (enforced server-side; nav hides it for unauthorized roles):
 *   company_admin, hr_admin, finance_admin, reviewer, external_auditor → always visible
 *   company_member (isManager=true)                                     → visible (scoped)
 *   company_member (isManager=false), client                             → hidden
 */
export const CONTROL_TOWER_HREFS = new Set<string>(["/control-tower"]);

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
  "/hr/attendance-reconciliation",
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
 * `/control-tower` is intentionally excluded: self-scope employees have no Control Tower access.
 * Dept/team managers (isManager=true) gain it via MANAGER_SURFACE_HREFS instead.
 */
export const FIELD_EMPLOYEE_HREFS = new Set<string>([
  "/workspace",
  "/my-portal",
  "/preferences",
  "/dashboard",
  "/",
]);

/**
 * End-customer portal — strict Client Workspace shell only (`/client/*`),
 * plus session preferences and contract signing deep links.
 */
export const PORTAL_CLIENT_HREFS = new Set<string>([
  "/",
  "/client",
  "/client/company/create",
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

/**
 * Extra surfaces a company_member gains when they are a team manager or department head.
 * These are additive on top of FIELD_EMPLOYEE_HREFS.
 */
const MANAGER_SURFACE_HREFS = new Set<string>([
  "/workspace",
  "/my-portal",
  "/my-team",
  "/my-team/import",
  "/preferences",
  "/dashboard",
  "/control-tower",
  "/hr/tasks",
  "/compliance",
  "/analytics",
  "/organization",
  "/",
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

function managerSurfaceAllowed(href: string): boolean {
  if (MANAGER_SURFACE_HREFS.has(href)) return true;
  if (href.startsWith("/my-portal")) return true;
  if (href.startsWith("/my-team")) return true;
  if (href.startsWith("/preferences")) return true;
  if (href.startsWith("/workspace")) return true;
  if (href.startsWith("/compliance")) return true;
  if (href.startsWith("/analytics")) return true;
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
  if (isCompanyAdminMember(mr) || isCustomerPortalMemberRole(mr)) return false;

  // company_member who is a team manager or department head gets an expanded surface
  if (isFieldEmployee(mr) && options?.isManager) {
    return !managerSurfaceAllowed(href);
  }
  if (isFieldEmployee(mr)) return false;

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
 * Pass `isManager: true` when the company_member has active direct reports or heads a department.
 */
export function getRoleDefaultRoute(memberRole?: string | null, isManager?: boolean): string {
  switch (memberRole) {
    case "company_admin": return "/control-tower";
    case "hr_admin": return "/hr/employees";
    case "finance_admin": return "/payroll";
    case "company_member": return isManager ? "/my-team" : "/my-portal";
    case "reviewer": return "/control-tower";
    case "external_auditor": return "/control-tower";
    case "client": return "/client";
    default: return "/control-tower";
  }
}

/**
 * Explicit persona mode for sidebar navigation.
 *
 * - `"platform"` — user is operating as a platform/global operator; uses platformRoles.
 * - `"company"` — user is inside a company workspace; uses activeCompany.role only, platformRoles ignored.
 * - `"client"` — user is an end-customer; uses portal shell only.
 *
 * Modes must never mix. Derive via {@link resolveNavMode}.
 */
export type NavMode = "platform" | "company" | "client";

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
  /**
   * True when a company_member has active direct reports or is a department head
   * (team or department scope). Unlocks /my-team and scoped compliance views.
   * Populated from the myScopeInfo tRPC query.
   */
  isManager?: boolean;
  /**
   * Explicit persona mode. When set, enforces strict persona separation so platform
   * roles never bleed into company-mode nav, and vice versa.
   * Derive with {@link resolveNavMode}; set in PlatformLayout before passing to filterVisibleNavGroups.
   */
  navMode?: NavMode;
  /**
   * Active product modules for this company (`companies.enabledModules`).
   * null / undefined = all modules active (legacy / unlimited plan).
   * When set, nav items gated on a disabled module are hidden.
   */
  enabledModules?: string[] | null;
};

/**
 * Derive the explicit navigation persona mode from the active workspace state.
 *
 * Rules (in priority order):
 * 1. `"client"` — active membership role is "client", or account channel is portal-only.
 * 2. `"company"` — user has a resolved (non-client) company membership role.
 * 3. `"platform"` — everything else (global operators, pre-company users).
 */
export function resolveNavMode(
  user: { platformRole?: string | null } | null,
  options?: Pick<ClientNavOptions, "memberRole">,
): NavMode {
  const mr = options?.memberRole;
  if (isCustomerPortalMemberRole(mr)) return "client";
  if (!mr && isPortalClientNav(user)) return "client";
  if (hasResolvedMemberRole(mr)) return "company";
  return "platform";
}

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
 * Returns true if the given path belongs to a company module that is explicitly disabled.
 * Only called when `enabledModules` is non-null (null = all enabled).
 */
function navModuleDisabledForPath(path: string, enabledModules: string[]): boolean {
  const has = (mod: string) => enabledModules.includes(mod);
  if (path === "/payroll" || path.startsWith("/payroll/")) return !has("payroll");
  if (path === "/finance" || path.startsWith("/finance/")) return !has("finance");
  if (path === "/hr" || path.startsWith("/hr/")) return !has("hr");
  if (path === "/crm" || path.startsWith("/crm/")) return !has("crm");
  if (path === "/sanad" || path.startsWith("/sanad/")) return !has("compliance");
  if (path === "/workforce" || path.startsWith("/workforce/")) return !has("compliance");
  if (path === "/pro" || path.startsWith("/pro/")) return !has("compliance");
  if (path === "/marketplace" || path.startsWith("/marketplace/")) return !has("marketplace");
  if (path === "/contracts" || path.startsWith("/contracts/")) return !has("contracts");
  if (path === "/quotations" || path.startsWith("/quotations/")) return !has("contracts");
  if (path.startsWith("/company/documents") || path === "/documents" || path.startsWith("/documents/")) return !has("documents");
  return false;
}

/**
 * Whether a sidebar item should render for this user.
 * `hiddenOptional` = hrefs the user turned off in preferences (optional items only).
 *
 * When `options.navMode === "company"`, platform roles are stripped from nav checks so that
 * company-mode navigation is driven exclusively by `memberRole`. This prevents persona mixing.
 */
export function clientNavItemVisible(
  href: string,
  user: { role?: string | null; platformRole?: string | null } | null,
  hiddenOptional: Set<string>,
  options?: ClientNavOptions,
): boolean {
  // In company mode, platform identity is invisible to nav decisions.
  // A null-role sentinel ensures seesPlatformOperatorNav / canAccessGlobalAdminProcedures return false
  // while still being a non-null object so membershipScopedNavDenies can proceed with memberRole.
  const navUser: { role?: string | null; platformRole?: string | null } | null =
    options?.navMode === "company"
      ? { role: null, platformRole: null }
      : user;

  // Effective capability set — role defaults ∪ explicit grants ∖ explicit denials, module-gated.
  // Computed once per call and reused for all per-capability checks below.
  const effectiveCaps: Set<Capability> | null = options?.memberRole
    ? resolveEffectiveCapabilities(
        options.memberRole,
        options.memberPermissions,
        options.enabledModules,
      )
    : null;

  if (OPTIONAL_NAV_HREFS.has(href) && hiddenOptional.has(href)) {
    return false;
  }

  /** Internal engagements ops queue — not for end-customer portal roles. */
  if (normalizeClientPath(href) === "/engagements/ops") {
    if (shouldUsePortalOnlyShell(navUser, options)) return false;
    const mr = options?.memberRole;
    if (isCustomerPortalMemberRole(mr)) return false;
    if (seesPlatformOperatorNav(navUser) || canAccessGlobalAdminProcedures(navUser ?? {})) return true;
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
    return canAccessGlobalAdminProcedures(navUser ?? { role: null, platformRole: null });
  }

  if (shouldUsePortalOnlyShell(navUser, options)) {
    return PORTAL_CLIENT_HREFS.has(href);
  }

  if (shouldUsePreRegistrationShell(navUser, options)) {
    return PRE_COMPANY_NAV_HREFS.has(href);
  }

  /**
   * Create company — pre-company users, or `company_admin` adding another workspace (product:
   * confirm multi-company creation is intended for tenant admins). Not shown to basic staff.
   */
  if (normalizeClientPath(href) === "/company/create") {
    if (seesPlatformOperatorNav(navUser) || canAccessGlobalAdminProcedures(navUser ?? {})) return true;
    if (isCompanyAdminMember(options?.memberRole)) return true;
    return false;
  }

  // Company admin — optional extra routes for this role (before role shells below)
  if (companyNavExtensionAllows(href, navUser, options)) return true;

  const path = normalizeClientPath(href);
  // Client workspace: customer (`client`) members with a company; portal-only users may see `/client` before join.
  if (path.startsWith("/client")) {
    if (seesPlatformOperatorNav(navUser) || canAccessGlobalAdminProcedures(navUser ?? {})) return false;
    if (shouldUsePreRegistrationShell(navUser, options)) return false;
    if (shouldUsePortalOnlyShell(navUser, options)) {
      return isCustomerPortalMemberRole(options?.memberRole) || isPortalClientNav(navUser);
    }
    return Boolean(options?.hasCompanyMembership && isCustomerPortalMemberRole(options?.memberRole));
  }
  // ── Capability-based supplemental grants ──────────────────────────────────
  // Uses resolved effective set (role defaults + overrides + module gating) so that:
  //   • Role defaults are automatically honoured (e.g. hr_admin gets view_reports without explicit grant)
  //   • Per-user overrides (+cap / -cap in memberPermissions) are applied
  //   • Disabled company modules suppress access even for privileged roles
  if (
    path === "/reports" ||
    path.startsWith("/reports/") ||
    path === "/hr/attendance" ||
    path.startsWith("/hr/attendance/")
  ) {
    if (effectiveCaps?.has("view_reports")) return true;
  }
  if (path === "/payroll" || path.startsWith("/payroll/")) {
    if (effectiveCaps?.has("view_payroll")) return true;
  }
  if (path === "/finance/overview" || path.startsWith("/finance/overview/")) {
    if (effectiveCaps?.has("view_executive_summary")) return true;
  }

  // ── Module gating (company context only) ─────────────────────────────────
  // When a company has an explicit enabledModules list, hide module-specific nav
  // even for roles that would normally see them. Platform operators bypass this.
  if (
    options?.navMode === "company" &&
    options.enabledModules != null &&
    !seesPlatformOperatorNav(navUser)
  ) {
    if (navModuleDisabledForPath(path, options.enabledModules)) return false;
  }

  // Control Tower: gated by role — self-scope employees are excluded.
  // Platform operators, operators (company_admin/hr_admin/finance_admin), reviewer,
  // external_auditor, and company_member with isManager=true are all permitted.
  if (CONTROL_TOWER_HREFS.has(normalizeClientPath(href))) {
    if (shouldUsePortalOnlyShell(navUser, options)) return false;
    if (shouldUsePreRegistrationShell(navUser, options)) return false;
    if (seesPlatformOperatorNav(navUser) || canAccessGlobalAdminProcedures(navUser ?? {})) return true;
    const mr = options?.memberRole;
    if (!hasResolvedMemberRole(mr)) return false;
    if (isCustomerPortalMemberRole(mr)) return false;
    if (isFieldEmployee(mr)) return options?.isManager === true;
    // operator roles + reviewer + external_auditor
    return (
      isCompanyAdminMember(mr) ||
      readsAsHrManager(mr) ||
      readsAsFinanceManager(mr) ||
      isExternalAuditorNav(mr) ||
      isReviewer(mr)
    );
  }

  // Staff / "Member" company role — employee shell only, even for Super Admin or other platform jobs
  // while this membership is the active workspace role (see PlatformLayout memberRole from myCompany).
  if (isFieldEmployee(options?.memberRole)) {
    return FIELD_EMPLOYEE_HREFS.has(href);
  }

  if (PLATFORM_ONLY_HREFS.has(href)) {
    return seesPlatformOperatorNav(navUser);
  }

  if (COMPANY_OWNER_HREFS.has(href)) {
    return seesPlatformOperatorNav(navUser) || isCompanyAdminMember(options?.memberRole);
  }

  if (COMPANY_LEADERSHIP_HREFS.has(href)) {
    return (
      seesPlatformOperatorNav(navUser) ||
      isCompanyAdminMember(options?.memberRole) ||
      isFinanceAdminMember(options?.memberRole)
    );
  }

  // HR module — company_admin, hr_admin, external auditors (read); never finance-only managers
  if (isHrModuleHref(href)) {
    if (seesPlatformOperatorNav(navUser)) return true;
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
      seesPlatformOperatorNav(navUser) ||
      isCompanyAdminMember(options?.memberRole) ||
      isExternalAuditorNav(options?.memberRole)
    );
  }

  // Business management pages — not for HR-only, Finance-only, or basic staff
  if (BUSINESS_MGMT_HREFS.has(href)) {
    if (seesPlatformOperatorNav(navUser)) return true;
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
    return seesPlatformOperatorNav(navUser) || isCompanyAdminMember(options?.memberRole);
  }

  if (membershipScopedNavDenies(href, navUser, options)) {
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
  /** Client-journey company creation (minimal `/client` chrome). */
  if (path === "/client/company/create" || path.startsWith("/client/company/create/")) return true;
  /** Legacy portal deep link while still routed under PlatformLayout — prefer `/client/company/create`. */
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
    /** Platform staff never use the end-customer `/client` shell (no preview bypass). */
    if (seesPlatformOperatorNav(user) || canAccessGlobalAdminProcedures(user ?? {})) return false;
    /**
     * Strict client workspace routes: only `company_members.role === "client"` once a workspace exists.
     * Pre-workspace users stay on `/client` + `/client/company/create` for onboarding (no membership yet).
     */
    if (!options?.hasCompanyMembership) {
      return path === "/client" || path === "/client/company/create" || path.startsWith("/client/company/create/");
    }
    return isCustomerPortalMemberRole(options?.memberRole);
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

  // Control Tower route guard — mirrors clientNavItemVisible gating
  if (path === "/control-tower" || path.startsWith("/control-tower/")) {
    if (shouldUsePortalOnlyShell(user, options)) return false;
    if (shouldUsePreRegistrationShell(user, options)) return false;
    if (seesPlatformOperatorNav(user) || canAccessGlobalAdminProcedures(user ?? {})) return true;
    const mr = options?.memberRole;
    if (!hasResolvedMemberRole(mr)) return false;
    if (isCustomerPortalMemberRole(mr)) return false;
    if (isFieldEmployee(mr)) return options?.isManager === true;
    return (
      isCompanyAdminMember(mr) ||
      readsAsHrManager(mr) ||
      readsAsFinanceManager(mr) ||
      isExternalAuditorNav(mr) ||
      isReviewer(mr)
    );
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
