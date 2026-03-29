import { describe, it, expect } from "vitest";
import {
  clientNavItemVisible,
  OPTIONAL_NAV_HREFS,
  PLATFORM_ONLY_HREFS,
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
});
