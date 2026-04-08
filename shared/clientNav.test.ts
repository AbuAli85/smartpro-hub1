import { describe, it, expect } from "vitest";
import {
  clientNavItemVisible,
  clientRouteAccessible,
  OPTIONAL_NAV_HREFS,
  PLATFORM_ONLY_HREFS,
  shouldUsePortalOnlyShell,
  shouldUsePreRegistrationShell,
} from "./clientNav";

const member = { role: "user" as const, platformRole: "company_member" as const };
const owner = { role: "user" as const, platformRole: "company_admin" as const };
const finance = { role: "user" as const, platformRole: "finance_admin" as const };
const platform = { role: "user" as const, platformRole: "platform_admin" as const };
const portalClient = { role: "user" as const, platformRole: "client" as const };

describe("clientNavItemVisible", () => {
  it("hides platform-only paths from company members", () => {
    expect(clientNavItemVisible("/platform-ops", member, new Set())).toBe(false);
    expect(clientNavItemVisible("/billing", member, new Set())).toBe(false);
    expect(PLATFORM_ONLY_HREFS.has("/admin")).toBe(true);
  });

  it("shows platform paths to platform_admin", () => {
    expect(clientNavItemVisible("/platform-ops", platform, new Set())).toBe(true);
    expect(clientNavItemVisible("/billing", platform, new Set())).toBe(true);
  });

  it("hides owner paths from company_member", () => {
    expect(clientNavItemVisible("/company-admin", member, new Set())).toBe(false);
    expect(clientNavItemVisible("/renewal-workflows", member, new Set())).toBe(false);
  });

  it("shows owner paths to company_admin", () => {
    expect(clientNavItemVisible("/company-admin", owner, new Set())).toBe(true);
  });

  it("hides payroll and reports from company_member", () => {
    expect(clientNavItemVisible("/payroll", member, new Set())).toBe(false);
    expect(clientNavItemVisible("/reports", member, new Set())).toBe(false);
  });

  it("shows payroll and reports to finance_admin", () => {
    expect(clientNavItemVisible("/payroll", finance, new Set())).toBe(true);
    expect(clientNavItemVisible("/reports", finance, new Set())).toBe(true);
  });

  it("respects optional hidden preferences", () => {
    const hidden = new Set(["/analytics"]);
    expect(OPTIONAL_NAV_HREFS.has("/analytics")).toBe(true);
    expect(clientNavItemVisible("/analytics", owner, hidden)).toBe(false);
    expect(clientNavItemVisible("/dashboard", owner, hidden)).toBe(true);
  });

  it("restricts portal client to allow-list when no company workspace", () => {
    expect(clientNavItemVisible("/dashboard", portalClient, new Set(), { hasCompanyWorkspace: false })).toBe(true);
    expect(clientNavItemVisible("/client-portal", portalClient, new Set(), { hasCompanyWorkspace: false })).toBe(true);
    expect(clientNavItemVisible("/payroll", portalClient, new Set(), { hasCompanyWorkspace: false })).toBe(false);
    expect(clientNavItemVisible("/hr/employees", portalClient, new Set(), { hasCompanyWorkspace: false })).toBe(false);
  });

  it("lets platformRole client use company nav when they have a company workspace", () => {
    expect(clientNavItemVisible("/hr/employees", portalClient, new Set(), { hasCompanyWorkspace: true })).toBe(true);
    expect(clientNavItemVisible("/payroll", portalClient, new Set(), { hasCompanyWorkspace: true })).toBe(false);
  });

  it("does not apply portal-only shell while company workspace is loading", () => {
    expect(
      clientNavItemVisible("/hr/employees", portalClient, new Set(), {
        hasCompanyWorkspace: false,
        companyWorkspaceLoading: true,
      }),
    ).toBe(true);
    expect(shouldUsePortalOnlyShell(portalClient, { companyWorkspaceLoading: true })).toBe(false);
  });

  it("restricts pre-registration users to onboarding essentials only", () => {
    expect(clientNavItemVisible("/analytics", owner, new Set(), { hasCompanyMembership: false })).toBe(false);
    expect(clientNavItemVisible("/operations", owner, new Set(), { hasCompanyMembership: false })).toBe(false);
    expect(clientNavItemVisible("/dashboard", owner, new Set(), { hasCompanyMembership: false })).toBe(true);
    expect(clientNavItemVisible("/onboarding", owner, new Set(), { hasCompanyMembership: false })).toBe(true);
  });
});

describe("shouldUsePreRegistrationShell", () => {
  it("is false when hasCompanyMembership is omitted (legacy)", () => {
    expect(shouldUsePreRegistrationShell(member, {})).toBe(false);
  });

  it("is true for a company_member with no companies", () => {
    expect(shouldUsePreRegistrationShell(member, { hasCompanyMembership: false })).toBe(true);
  });

  it("is false once the user has at least one company", () => {
    expect(shouldUsePreRegistrationShell(member, { hasCompanyMembership: true })).toBe(false);
  });

  it("is false for platform operators", () => {
    expect(shouldUsePreRegistrationShell(platform, { hasCompanyMembership: false })).toBe(false);
  });

  it("is false for portal clients (they use portal-only shell)", () => {
    expect(shouldUsePreRegistrationShell(portalClient, { hasCompanyMembership: false })).toBe(false);
  });
});

describe("shouldUsePortalOnlyShell", () => {
  it("is false for non-portal users", () => {
    expect(shouldUsePortalOnlyShell(member, { hasCompanyWorkspace: false })).toBe(false);
  });

  it("is true for portal client without company when not loading", () => {
    expect(shouldUsePortalOnlyShell(portalClient, { hasCompanyWorkspace: false })).toBe(true);
  });

  it("is false when client has company workspace", () => {
    expect(shouldUsePortalOnlyShell(portalClient, { hasCompanyWorkspace: true })).toBe(false);
  });
});

describe("clientRouteAccessible", () => {
  it("matches sidebar rules for platform-only prefixes", () => {
    expect(clientRouteAccessible("/billing/invoices", member, new Set())).toBe(false);
    expect(clientRouteAccessible("/billing/invoices", platform, new Set())).toBe(true);
  });

  it("blocks disallowed paths under portal shell", () => {
    expect(clientRouteAccessible("/hr/employees", portalClient, new Set(), { hasCompanyWorkspace: false })).toBe(false);
    expect(clientRouteAccessible("/contracts/123", portalClient, new Set(), { hasCompanyWorkspace: false })).toBe(true);
  });

  it("respects hidden optional nav subtrees", () => {
    const hidden = new Set(["/analytics"]);
    expect(clientRouteAccessible("/analytics/overview", owner, hidden)).toBe(false);
    expect(clientRouteAccessible("/dashboard", owner, hidden)).toBe(true);
  });

  it("blocks analytics for pre-registration users with no company", () => {
    expect(
      clientRouteAccessible("/analytics", member, new Set(), { hasCompanyMembership: false }),
    ).toBe(false);
    expect(
      clientRouteAccessible("/onboarding", member, new Set(), { hasCompanyMembership: false }),
    ).toBe(true);
    expect(
      clientRouteAccessible("/dashboard", member, new Set(), { hasCompanyMembership: false }),
    ).toBe(true);
  });
});
