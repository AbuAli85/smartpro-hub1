/**
 * Company role navigation extensions (`companies.roleNavExtensions` JSON).
 *
 * **Security contract (read carefully):**
 * - This module controls **navigation exposure only** (which extra sidebar paths a company may widen
 *   per membership role). It is **not** an authorization boundary.
 * - **Never** rely on these rules alone to protect data or actions: every page load and API must
 *   still enforce server-side / route-level permission checks and tenant isolation.
 * - Policy here is **deny-by-default** for extensions: normalized path → not suspicious → allowed
 *   roots for that role → not platform-restricted (secondary safety net).
 */

import { normalizeAppPath } from "./normalizeAppPath";
import { isPlatformRestrictedTenantNavPath } from "./navPlatformRestrictedPrefixes";

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

/** Public alias for app path normalization (policy + href matching). */
export const normalizePath = normalizeAppPath;

/**
 * Explicit roots under which a role may register **prefix** extensions (subtree grants).
 * Prevents broad stored paths like `/dashboard` or `/contracts` from implicitly covering future
 * unrelated routes; only listed roots (and their descendants) are eligible.
 */
export const ROLE_ALLOWED_EXTENSION_ROOTS: Record<NavExtensionRoleKey, readonly string[]> = {
  company_admin: [
    "/alerts",
    "/analytics",
    "/business",
    "/company",
    "/company-admin",
    "/compliance",
    "/contracts",
    "/control-tower",
    "/crm",
    "/dashboard",
    "/finance",
    "/hr",
    "/marketplace",
    "/my-portal",
    "/my-team",
    "/onboarding",
    "/operations",
    "/payroll",
    "/preferences",
    "/pro",
    "/quotations",
    "/renewal-workflows",
    "/reports",
    "/sanad",
    "/subscriptions",
    "/workforce",
    "/workspace",
  ],
  hr_admin: [
    "/analytics",
    "/business",
    "/compliance",
    "/company/documents",
    "/company/profile",
    "/control-tower",
    "/dashboard",
    "/hr",
    "/my-portal",
    "/my-team",
    "/preferences",
    "/workspace",
  ],
  finance_admin: [
    "/alerts",
    "/analytics",
    "/compliance",
    "/company/documents",
    "/company/profile",
    "/control-tower",
    "/dashboard",
    "/finance",
    "/my-portal",
    "/payroll",
    "/preferences",
    "/reports",
    "/subscriptions",
  ],
  company_member: ["/control-tower", "/dashboard", "/my-portal", "/onboarding", "/preferences", "/workspace"],
  reviewer: [
    "/analytics",
    "/compliance",
    "/company/documents",
    "/company/hub",
    "/company/profile",
    "/contracts",
    "/control-tower",
    "/crm",
    "/dashboard",
    "/marketplace",
    "/my-portal",
    "/preferences",
    "/quotations",
  ],
  external_auditor: [
    "/analytics",
    "/compliance",
    "/company/profile",
    "/contracts",
    "/control-tower",
    "/dashboard",
    "/hr",
    "/my-portal",
    "/preferences",
    "/pro",
    "/workforce",
  ],
};

function pathUnderRoot(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

/**
 * True when `normalizedPath` is allowed as an extension prefix for `role`
 * (exact root or strict subtree of an approved root).
 */
export function isAllowedNavExtensionForRole(role: NavExtensionRoleKey, normalizedPath: string): boolean {
  return ROLE_ALLOWED_EXTENSION_ROOTS[role].some((root) => pathUnderRoot(normalizedPath, root));
}

/** Values that must never be stored as extension prefixes (normalization + traversal + root). */
function isSuspiciousNavExtensionPath(normalizedPath: string): boolean {
  if (!normalizedPath) return true;
  if (normalizedPath === "/") return true;
  if (normalizedPath.includes("..")) return true;
  if (normalizedPath.includes("\\")) return true;
  if (normalizedPath.includes("://")) return true;
  for (const seg of normalizedPath.split("/")) {
    if (seg === "." || seg === "..") return true;
  }
  return false;
}

/**
 * Defense-in-depth: platform / global-admin-only surfaces must not be grantable via tenant JSON.
 * Prefer `navPlatformRestrictedPrefixes` as the single source of truth; see `clientNav` Sets.
 */
export function isTenantUnsafeNavExtensionPath(path: string): boolean {
  const p = normalizeAppPath(path);
  if (!p) return true;
  return isPlatformRestrictedTenantNavPath(p);
}

/**
 * Sanitize company-saved nav extensions: unknown role keys ignored; only `NAV_EXTENSION_ROLE_KEYS`
 * are read from persisted JSON (no iteration over arbitrary keys).
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
      const p = normalizeAppPath(item);
      if (isSuspiciousNavExtensionPath(p)) continue;
      if (!isAllowedNavExtensionForRole(key, p)) continue;
      if (isPlatformRestrictedTenantNavPath(p)) continue;
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
  const path = normalizeAppPath(href);
  if (!path) return false;
  for (const e of extras) {
    const base = normalizeAppPath(e);
    if (!base) continue;
    if (path === base || path.startsWith(`${base}/`)) return true;
  }
  return false;
}

/**
 * Human-readable summary for admin UI. Full nav rules live in `shared/clientNav.ts`; extension
 * eligibility is further constrained by `ROLE_ALLOWED_EXTENSION_ROOTS` above.
 */
export const ROLE_NAV_SUMMARY: Record<NavExtensionRoleKey, string> = {
  company_admin:
    "Company workspace modules only (operations, HR, finance, government, CRM, etc.) — see allowlisted roots in code; server APIs still enforce access.",
  hr_admin: "HR and people surfaces (`/hr`, workspace, team, shared employee dashboards) — not payroll-only finance roots unless also finance.",
  finance_admin: "Payroll, finance overview, subscriptions/alerts, reporting roots — not arbitrary `/hr` management paths.",
  company_member: "Staff shell: workspace, Employee home, dashboards, preferences — not HR/finance admin trees.",
  reviewer: "Commercial / CRM / contracts / hub — not platform or payroll admin surfaces.",
  external_auditor: "Read-oriented compliance paths (`/hr`, workforce, contracts, analytics) — management routes stay blocked elsewhere.",
};
