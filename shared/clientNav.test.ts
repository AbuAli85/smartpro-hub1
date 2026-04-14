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
const superAdmin = { role: "user" as const, platformRole: "super_admin" as const };
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

  it("shows owner paths to company_admin when active workspace membership is company_admin", () => {
    const ownerOpts = { hasCompanyWorkspace: true, hasCompanyMembership: true, memberRole: "company_admin" as const };
    expect(clientNavItemVisible("/company-admin", owner, new Set(), ownerOpts)).toBe(true);
  });

  it("does not show owner paths from stale platformRole when membership is company_member (multi-company)", () => {
    const syncedOwnerPlatform = { role: "user" as const, platformRole: "company_admin" as const };
    expect(
      clientNavItemVisible("/company-admin", syncedOwnerPlatform, new Set(), {
        hasCompanyWorkspace: true,
        hasCompanyMembership: true,
        memberRole: "company_member",
      }),
    ).toBe(false);
    expect(
      clientRouteAccessible("/company/settings", syncedOwnerPlatform, new Set(), {
        memberRole: "company_member",
      }),
    ).toBe(false);
  });

  it("hides payroll and reports from company_member", () => {
    expect(clientNavItemVisible("/payroll", member, new Set())).toBe(false);
    expect(clientNavItemVisible("/reports", member, new Set())).toBe(false);
  });

  it("shows payroll and reports to finance_admin membership", () => {
    const financeOpts = { hasCompanyWorkspace: true, hasCompanyMembership: true, memberRole: "finance_admin" as const };
    expect(clientNavItemVisible("/payroll", finance, new Set(), financeOpts)).toBe(true);
    expect(clientNavItemVisible("/reports", finance, new Set(), financeOpts)).toBe(true);
  });

  it("respects optional hidden preferences", () => {
    const hidden = new Set(["/analytics"]);
    const ownerOpts = { hasCompanyWorkspace: true, hasCompanyMembership: true, memberRole: "company_admin" as const };
    expect(OPTIONAL_NAV_HREFS.has("/analytics")).toBe(true);
    expect(clientNavItemVisible("/analytics", owner, hidden, ownerOpts)).toBe(false);
    expect(clientNavItemVisible("/dashboard", owner, hidden, ownerOpts)).toBe(true);
  });

  it("restricts portal client to allow-list when no company workspace", () => {
    expect(clientNavItemVisible("/dashboard", portalClient, new Set(), { hasCompanyWorkspace: false })).toBe(true);
    expect(clientNavItemVisible("/client-portal", portalClient, new Set(), { hasCompanyWorkspace: false })).toBe(true);
    expect(clientNavItemVisible("/payroll", portalClient, new Set(), { hasCompanyWorkspace: false })).toBe(false);
    expect(clientNavItemVisible("/hr/employees", portalClient, new Set(), { hasCompanyWorkspace: false })).toBe(false);
  });

  it("keeps portal customers on the allow-list after they join a company (no HR / admin nav)", () => {
    expect(clientNavItemVisible("/hr/employees", portalClient, new Set(), { hasCompanyWorkspace: true })).toBe(false);
    expect(clientNavItemVisible("/sanad", portalClient, new Set(), { hasCompanyWorkspace: true })).toBe(false);
    expect(clientNavItemVisible("/client-portal", portalClient, new Set(), { hasCompanyWorkspace: true })).toBe(true);
    expect(clientNavItemVisible("/payroll", portalClient, new Set(), { hasCompanyWorkspace: true })).toBe(false);
  });

  it("uses membership role client for portal shell even when platformRole is company_admin-shaped", () => {
    expect(
      clientNavItemVisible("/hr/employees", owner, new Set(), {
        hasCompanyWorkspace: true,
        hasCompanyMembership: true,
        memberRole: "client",
      }),
    ).toBe(false);
    expect(
      clientNavItemVisible("/contracts", owner, new Set(), {
        hasCompanyWorkspace: true,
        hasCompanyMembership: true,
        memberRole: "client",
      }),
    ).toBe(true);
  });

  it("keeps portal shell while loading for platformRole client", () => {
    expect(
      clientNavItemVisible("/hr/employees", portalClient, new Set(), {
        hasCompanyWorkspace: false,
        companyWorkspaceLoading: true,
      }),
    ).toBe(false);
    expect(shouldUsePortalOnlyShell(portalClient, { companyWorkspaceLoading: true })).toBe(true);
  });

  it("restricts pre-registration users to onboarding essentials only", () => {
    expect(clientNavItemVisible("/analytics", owner, new Set(), { hasCompanyMembership: false })).toBe(false);
    expect(clientNavItemVisible("/operations", owner, new Set(), { hasCompanyMembership: false })).toBe(false);
    expect(clientNavItemVisible("/dashboard", owner, new Set(), { hasCompanyMembership: false })).toBe(true);
    expect(clientNavItemVisible("/onboarding", owner, new Set(), { hasCompanyMembership: false })).toBe(true);
  });

  it("hides payroll from HR managers even when platformRole is company_admin (synced)", () => {
    const syncedHr = { role: "user" as const, platformRole: "company_admin" as const };
    const opts = { hasCompanyWorkspace: true, memberRole: "hr_admin" as const };
    expect(clientNavItemVisible("/payroll", syncedHr, new Set(), opts)).toBe(false);
    expect(clientNavItemVisible("/hr/performance", syncedHr, new Set(), opts)).toBe(true);
    expect(clientNavItemVisible("/crm", syncedHr, new Set(), opts)).toBe(false);
  });

  it("hides HR and CRM from finance managers (membership-scoped shell)", () => {
    const syncedFinance = { role: "user" as const, platformRole: "company_admin" as const };
    const opts = { hasCompanyWorkspace: true, memberRole: "finance_admin" as const };
    expect(clientNavItemVisible("/payroll", syncedFinance, new Set(), opts)).toBe(true);
    expect(clientNavItemVisible("/hr/employees", syncedFinance, new Set(), opts)).toBe(false);
    expect(clientNavItemVisible("/crm", syncedFinance, new Set(), opts)).toBe(false);
  });

  it("limits reviewers to commercial + overview surfaces", () => {
    const rev = { role: "user" as const, platformRole: "company_member" as const };
    const opts = { hasCompanyWorkspace: true, memberRole: "reviewer" as const };
    expect(clientNavItemVisible("/company/hub", rev, new Set(), opts)).toBe(true);
    expect(clientNavItemVisible("/hr/employees", rev, new Set(), opts)).toBe(false);
    expect(clientNavItemVisible("/payroll", rev, new Set(), opts)).toBe(false);
  });

  it("allows company-admin routes when platformRole is still client but membership is company_admin", () => {
    const staleClientPlatform = { role: "user" as const, platformRole: "client" as const };
    const opts = {
      hasCompanyWorkspace: true,
      hasCompanyMembership: true,
      memberRole: "company_admin" as const,
    };
    expect(clientNavItemVisible("/company/settings", staleClientPlatform, new Set(), opts)).toBe(true);
    expect(clientRouteAccessible("/company/settings", staleClientPlatform, new Set(), opts)).toBe(true);
    expect(clientNavItemVisible("/hr/employees", staleClientPlatform, new Set(), opts)).toBe(true);
  });

  it('uses the Member (company_member) shell even for Super Admin when that is the active membership role', () => {
    const opts = { hasCompanyWorkspace: true, memberRole: "company_member" as const };
    expect(clientNavItemVisible("/user-roles", superAdmin, new Set(), opts)).toBe(false);
    expect(clientNavItemVisible("/platform-ops", superAdmin, new Set(), opts)).toBe(false);
    expect(clientNavItemVisible("/admin", superAdmin, new Set(), opts)).toBe(false);
    expect(clientNavItemVisible("/my-portal", superAdmin, new Set(), opts)).toBe(true);
    expect(clientNavItemVisible("/dashboard", superAdmin, new Set(), opts)).toBe(true);
    expect(
      clientRouteAccessible("/user-roles", superAdmin, new Set(), opts),
    ).toBe(false);
    expect(
      clientRouteAccessible("/my-portal/tasks", superAdmin, new Set(), opts),
    ).toBe(true);
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

  it("is false for customer membership role with no company list", () => {
    expect(
      shouldUsePreRegistrationShell(member, { hasCompanyMembership: false, memberRole: "client" }),
    ).toBe(false);
  });
});

describe("shouldUsePortalOnlyShell", () => {
  it("is false for non-portal users", () => {
    expect(shouldUsePortalOnlyShell(member, { hasCompanyWorkspace: false })).toBe(false);
  });

  it("is true for portal client without company when not loading", () => {
    expect(shouldUsePortalOnlyShell(portalClient, { hasCompanyWorkspace: false })).toBe(true);
  });

  it("stays true for portal clients after they join a company", () => {
    expect(shouldUsePortalOnlyShell(portalClient, { hasCompanyWorkspace: true })).toBe(true);
  });

  it("when membership is known, ignores platformRole for portal shell (non-client membership wins)", () => {
    const stalePortalPlatform = { role: "user" as const, platformRole: "client" as const };
    expect(
      shouldUsePortalOnlyShell(stalePortalPlatform, {
        hasCompanyWorkspace: true,
        memberRole: "company_admin",
      }),
    ).toBe(false);
  });

  it("is false for platform operators (SANAD / regional staff)", () => {
    const regional = { role: "user" as const, platformRole: "regional_manager" as const };
    expect(shouldUsePortalOnlyShell(regional, { hasCompanyWorkspace: false })).toBe(false);
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
    const ownerOpts = { memberRole: "company_admin" as const };
    expect(clientRouteAccessible("/analytics/overview", owner, hidden, ownerOpts)).toBe(false);
    expect(clientRouteAccessible("/dashboard", owner, hidden, ownerOpts)).toBe(true);
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
