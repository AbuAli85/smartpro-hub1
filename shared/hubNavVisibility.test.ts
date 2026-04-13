import { describe, it, expect } from "vitest";
import { clientNavItemVisible, clientRouteAccessible } from "./clientNav";

/**
 * Integration-style checks for hub routes + representative child links.
 * Complements structural tests in `platformNavIntegrity` (metadata) without duplicating full RBAC matrices.
 */

const emptyHidden = new Set<string>();

const ownerUser = { role: "user" as const, platformRole: "company_admin" as const };
const hrUser = { role: "user" as const, platformRole: "hr_admin" as const };
const financeUser = { role: "user" as const, platformRole: "finance_admin" as const };
const staffUser = { role: "user" as const, platformRole: "company_member" as const };
const portalUser = { role: "user" as const, platformRole: "client" as const };

const withCompany = { hasCompanyWorkspace: true, hasCompanyMembership: true };

describe("hub route visibility (sidebar)", () => {
  it("company_admin sees all three hubs and representative deep links", () => {
    const opts = { ...withCompany, memberRole: "company_admin" as const };
    expect(clientNavItemVisible("/hr/insights", ownerUser, emptyHidden, opts)).toBe(true);
    expect(clientNavItemVisible("/organization", ownerUser, emptyHidden, opts)).toBe(true);
    expect(clientNavItemVisible("/compliance/renewals", ownerUser, emptyHidden, opts)).toBe(true);
    expect(clientNavItemVisible("/hr/workforce-intelligence", ownerUser, emptyHidden, opts)).toBe(true);
    expect(clientNavItemVisible("/hr/org-chart", ownerUser, emptyHidden, opts)).toBe(true);
    expect(clientNavItemVisible("/alerts", ownerUser, emptyHidden, opts)).toBe(true);
  });

  it("hr_admin sees HR insights + organization + renewals hub; not finance-only locked-out HR", () => {
    const opts = { ...withCompany, memberRole: "hr_admin" as const };
    expect(clientNavItemVisible("/hr/insights", hrUser, emptyHidden, opts)).toBe(true);
    expect(clientNavItemVisible("/organization", hrUser, emptyHidden, opts)).toBe(true);
    expect(clientNavItemVisible("/compliance/renewals", hrUser, emptyHidden, opts)).toBe(true);
  });

  it("finance_admin sees renewals hub and compliance surfaces but not HR-only module nav items", () => {
    const opts = { ...withCompany, memberRole: "finance_admin" as const };
    expect(clientNavItemVisible("/compliance/renewals", financeUser, emptyHidden, opts)).toBe(true);
    expect(clientNavItemVisible("/hr/insights", financeUser, emptyHidden, opts)).toBe(false);
    expect(clientNavItemVisible("/organization", financeUser, emptyHidden, opts)).toBe(true);
  });

  it("field employee does not see hub or HR analytics surfaces", () => {
    const opts = { ...withCompany, memberRole: "company_member" as const };
    expect(clientNavItemVisible("/hr/insights", staffUser, emptyHidden, opts)).toBe(false);
    expect(clientNavItemVisible("/organization", staffUser, emptyHidden, opts)).toBe(false);
    expect(clientNavItemVisible("/compliance/renewals", staffUser, emptyHidden, opts)).toBe(false);
  });

  it("portal client never sees hubs or HR operator surfaces", () => {
    expect(
      clientNavItemVisible("/hr/insights", portalUser, emptyHidden, {
        hasCompanyWorkspace: true,
        hasCompanyMembership: true,
        memberRole: "client",
      }),
    ).toBe(false);
    expect(
      clientNavItemVisible("/compliance/renewals", portalUser, emptyHidden, {
        hasCompanyWorkspace: true,
        hasCompanyMembership: true,
        memberRole: "client",
      }),
    ).toBe(false);
  });
});

describe("hub route access (route guard / deep link)", () => {
  it("company_admin can access hub URLs; field employee cannot access HR insights", () => {
    expect(clientRouteAccessible("/hr/insights", ownerUser, emptyHidden, { memberRole: "company_admin" })).toBe(
      true,
    );
    expect(clientRouteAccessible("/organization", ownerUser, emptyHidden, { memberRole: "company_admin" })).toBe(
      true,
    );
    expect(
      clientRouteAccessible("/compliance/renewals", ownerUser, emptyHidden, { memberRole: "company_admin" }),
    ).toBe(true);
    expect(clientRouteAccessible("/hr/insights", staffUser, emptyHidden, { memberRole: "company_member" })).toBe(
      false,
    );
  });

  it("finance_admin can open renewals hub path; HR insights path remains blocked", () => {
    expect(
      clientRouteAccessible("/compliance/renewals", financeUser, emptyHidden, { memberRole: "finance_admin" }),
    ).toBe(true);
    expect(clientRouteAccessible("/hr/insights", financeUser, emptyHidden, { memberRole: "finance_admin" })).toBe(
      false,
    );
  });
});
