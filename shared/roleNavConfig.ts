/**
 * Canonical company membership roles (company_members.role) for navigation and admin UI.
 * Keep in sync with drizzle/schema companyMembers.role enum.
 */
export const COMPANY_MEMBER_ROLE_KEYS = [
  "company_admin",
  "hr_admin",
  "finance_admin",
  "company_member",
  "reviewer",
  "external_auditor",
  "client",
] as const;

export type CompanyMemberRoleKey = (typeof COMPANY_MEMBER_ROLE_KEYS)[number];

/** Roles that can receive optional extra sidebar paths (excludes end-customer portal role). */
export const NAV_EXTENSION_ROLE_KEYS = [
  "company_admin",
  "hr_admin",
  "finance_admin",
  "company_member",
  "reviewer",
  "external_auditor",
] as const satisfies readonly CompanyMemberRoleKey[];

export type NavExtensionRoleKey = (typeof NAV_EXTENSION_ROLE_KEYS)[number];

export type RoleNavExtensionsMap = Partial<Record<NavExtensionRoleKey, string[]>>;

function normalizePath(path: string): string {
  let p = path.split("?")[0] ?? "/";
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p || "/";
}

/** Must match PLATFORM_ONLY_HREFS + GLOBAL_ADMIN_PLATFORM_HREFS in clientNav.ts */
const EXTENSION_BLOCKED_PREFIXES = [
  "/admin/sanad",
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
] as const;

/**
 * Paths that must never be granted via company JSON alone (platform / global admin surfaces).
 */
export function isTenantUnsafeNavExtensionPath(path: string): boolean {
  const p = normalizePath(path);
  for (const x of EXTENSION_BLOCKED_PREFIXES) {
    if (p === x || p.startsWith(`${x}/`)) return true;
  }
  return false;
}

function isGloballyRestrictedExtensionPath(path: string): boolean {
  return isTenantUnsafeNavExtensionPath(path);
}

/**
 * Sanitize company-saved nav extensions: strip unsafe paths, trim, normalize leading slash.
 */
export function sanitizeRoleNavExtensions(raw: unknown): RoleNavExtensionsMap {
  if (raw == null || typeof raw !== "object") return {};
  const out: RoleNavExtensionsMap = {};
  for (const key of NAV_EXTENSION_ROLE_KEYS) {
    const arr = (raw as Record<string, unknown>)[key];
    if (!Array.isArray(arr)) continue;
    const paths: string[] = [];
    for (const item of arr) {
      if (typeof item !== "string") continue;
      let p = item.trim();
      if (!p.startsWith("/")) p = `/${p}`;
      p = normalizePath(p);
      if (p.length < 1) continue;
      if (isGloballyRestrictedExtensionPath(p)) continue;
      paths.push(p);
    }
    if (paths.length) out[key] = [...new Set(paths)];
  }
  return out;
}

/**
 * True if `href` (sidebar item) is allowed by an extra path prefix from company settings.
 */
export function pathMatchesNavExtensionHref(href: string, extras: string[] | null | undefined): boolean {
  if (!extras?.length) return false;
  const path = normalizePath(href);
  for (const e of extras) {
    const base = normalizePath(e);
    if (path === base || path.startsWith(`${base}/`)) return true;
  }
  return false;
}

/**
 * Human-readable summary for admin UI (not exhaustive; see shared/clientNav.ts for full rules).
 */
export const ROLE_NAV_SUMMARY: Record<NavExtensionRoleKey, string> = {
  company_admin: "Full company workspace: settings, HR, finance, operations, government modules (per product rules).",
  hr_admin: "HR modules under /hr, workspace, team, dashboards — not payroll-only finance surfaces.",
  finance_admin: "Payroll, reports, finance overview, subscriptions/alerts, shared dashboards.",
  company_member: "Workspace, Employee home, Business overview, Control Tower, preferences — staff shell.",
  reviewer: "Commercial (CRM, hub, quotations), contracts, compliance-style overview links.",
  external_auditor: "Read-oriented compliance paths; management routes stay blocked.",
};
