import { normalizeAppPath } from "./normalizeAppPath";

/**
 * Routes that use minimal chrome (no main sidebar) while a portal-only user has no company yet.
 * Keep in sync with {@link PlatformLayout} pre-company client journey detection.
 */
export function isPortalPreCompanyMinimalPath(location: string): boolean {
  const path = normalizeAppPath(location.split("?")[0] ?? "") || "/";
  if (path === "/client" || path.startsWith("/client/")) return true;
  if (path === "/company/create" || path.startsWith("/company/create/")) return true;
  return false;
}
