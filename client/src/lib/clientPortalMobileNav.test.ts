import { describe, it, expect } from "vitest";
import {
  CLIENT_PORTAL_MOBILE_OVERFLOW_ITEMS,
  CLIENT_PORTAL_MOBILE_PRIMARY_HREFS,
  isClientPortalMobileMoreTabActive,
  isClientPortalMobilePrimaryTabActive,
} from "./clientPortalMobileNav";

describe("clientPortalMobileNav", () => {
  it("primary bottom tabs are exactly Home, Services, Messages (href order)", () => {
    expect([...CLIENT_PORTAL_MOBILE_PRIMARY_HREFS]).toEqual(["/client", "/client/engagements", "/client/messages"]);
  });

  it("More menu contains only Documents, Invoices, Team, Settings hrefs", () => {
    expect(CLIENT_PORTAL_MOBILE_OVERFLOW_ITEMS.map((i) => i.href)).toEqual([
      "/client/documents",
      "/client/invoices",
      "/client/team",
      "/preferences",
    ]);
  });

  it("More tab is active for overflow routes and nested paths", () => {
    expect(isClientPortalMobileMoreTabActive("/client/documents")).toBe(true);
    expect(isClientPortalMobileMoreTabActive("/client/documents/foo")).toBe(true);
    expect(isClientPortalMobileMoreTabActive("/client/invoices")).toBe(true);
    expect(isClientPortalMobileMoreTabActive("/client/team")).toBe(true);
    expect(isClientPortalMobileMoreTabActive("/preferences")).toBe(true);
    expect(isClientPortalMobileMoreTabActive("/preferences?tab=nav")).toBe(true);
  });

  it("More tab is not active for primary tabs or unrelated routes", () => {
    expect(isClientPortalMobileMoreTabActive("/client")).toBe(false);
    expect(isClientPortalMobileMoreTabActive("/client/engagements")).toBe(false);
    expect(isClientPortalMobileMoreTabActive("/client/messages")).toBe(false);
    expect(isClientPortalMobileMoreTabActive("/dashboard")).toBe(false);
    expect(isClientPortalMobileMoreTabActive("/company/hub")).toBe(false);
  });

  it("Home tab active only on exact /client, not child workspace routes", () => {
    expect(isClientPortalMobilePrimaryTabActive("/client", "/client")).toBe(true);
    expect(isClientPortalMobilePrimaryTabActive("/client", "/client/engagements")).toBe(false);
  });

  it("Services and Messages tabs use prefix matching", () => {
    expect(isClientPortalMobilePrimaryTabActive("/client/engagements", "/client/engagements")).toBe(true);
    expect(isClientPortalMobilePrimaryTabActive("/client/engagements", "/client/engagements/abc")).toBe(true);
    expect(isClientPortalMobilePrimaryTabActive("/client/messages", "/client/messages")).toBe(true);
    expect(isClientPortalMobilePrimaryTabActive("/client/messages", "/client/messages/thread")).toBe(true);
  });

  it("overflow links stay client-safe (no tenant or operator destinations)", () => {
    for (const { href } of CLIENT_PORTAL_MOBILE_OVERFLOW_ITEMS) {
      expect(
        href.startsWith("/client/") || href === "/preferences",
        `${href} must be under /client/* or /preferences`,
      ).toBe(true);
      expect(href).not.toMatch(/^\/(dashboard|operations|company|hr\/|crm|alerts)/);
    }
  });
});
