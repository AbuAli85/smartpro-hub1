/**
 * Platform / global-admin-only route prefixes (defense-in-depth for tenant navigation).
 *
 * **Single source of truth** for:
 * - `GLOBAL_ADMIN_PLATFORM_HREFS` / `PLATFORM_ONLY_HREFS` in `clientNav.ts` (sidebar + route guard)
 * - `isTenantUnsafeNavExtensionPath` in `roleNavConfig.ts` (company JSON nav extensions)
 *
 * Keep lists alphabetically grouped where practical; add new platform-only surfaces here only.
 */
export const GLOBAL_ADMIN_ONLY_PATH_PREFIXES = ["/admin/sanad"] as const;

export const PLATFORM_OPERATOR_ONLY_PATH_PREFIXES = [
  "/admin",
  "/audit-log",
  "/billing",
  "/officer-assignments",
  "/omani-officers",
  "/platform-ops",
  "/sanad/catalogue-admin",
  "/sanad/office-dashboard",
  "/sanad/ratings-moderation",
  "/sla-management",
  "/survey/admin/analytics",
  "/survey/admin/responses",
  "/user-roles",
] as const;

/** Combined tenant-forbidden prefixes for JSON nav extensions and policy checks (exact + subtree). */
export const TENANT_FORBIDDEN_NAV_EXTENSION_PREFIXES = [
  ...GLOBAL_ADMIN_ONLY_PATH_PREFIXES,
  ...PLATFORM_OPERATOR_ONLY_PATH_PREFIXES,
] as const;

/**
 * True when `normalizedPath` is exactly a restricted prefix or a strict child (`prefix/`…).
 * Uses boundary-safe matching: `/admin` blocks `/admin/users` but not `/adminish`.
 */
export function isPlatformRestrictedTenantNavPath(normalizedPath: string): boolean {
  const p = normalizedPath;
  for (const prefix of TENANT_FORBIDDEN_NAV_EXTENSION_PREFIXES) {
    if (p === prefix || p.startsWith(`${prefix}/`)) return true;
  }
  return false;
}
