import { normalizeAppPath } from "@shared/normalizeAppPath";

/** Persistent bottom tabs (portal mobile only). Order: Home, Services, Messages, More (More is UI-only). */
export const CLIENT_PORTAL_MOBILE_PRIMARY_HREFS = ["/client", "/client/engagements", "/client/messages"] as const;

/**
 * Routes surfaced under the More bottom sheet — must stay within client-safe allowlist
 * (parity with `CLIENT_PORTAL_SHELL_GROUP_DEFS` overflow items, excluding primaries).
 */
export const CLIENT_PORTAL_MOBILE_OVERFLOW_ITEMS = [
  { href: "/client/documents", labelKey: "clientPortalMoreDocuments", defaultLabel: "Documents" },
  { href: "/client/invoices", labelKey: "clientPortalMoreInvoices", defaultLabel: "Invoices & payments" },
  { href: "/client/team", labelKey: "clientPortalMoreTeam", defaultLabel: "Team" },
  { href: "/preferences", labelKey: "clientPortalMoreSettings", defaultLabel: "Settings" },
] as const;

const OVERFLOW_HREFS = CLIENT_PORTAL_MOBILE_OVERFLOW_ITEMS.map((i) => i.href);

export function normalizeClientPortalMobilePath(pathname: string): string {
  return normalizeAppPath(pathname) || "/";
}

/** True when the More tab should show active styling (current route is in overflow inventory). */
export function isClientPortalMobileMoreTabActive(pathname: string): boolean {
  const p = normalizeClientPortalMobilePath(pathname);
  for (const href of OVERFLOW_HREFS) {
    if (p === href || p.startsWith(`${href}/`)) return true;
  }
  return false;
}

/** Active state for the three primary route tabs (not More). Home is exact on `/client` only. */
export function isClientPortalMobilePrimaryTabActive(href: string, pathname: string): boolean {
  const p = normalizeClientPortalMobilePath(pathname);
  if (href === "/client") return p === "/client";
  return p === href || p.startsWith(`${href}/`);
}
