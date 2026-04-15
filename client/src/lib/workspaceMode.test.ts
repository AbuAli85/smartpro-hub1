import { describe, it, expect } from "vitest";
import { isPreCompanyWorkspaceUser } from "./workspaceMode";

const regularUser = { role: "user" as const, platformRole: "company_admin" as const };
const platform = { role: "user" as const, platformRole: "platform_admin" as const };
const superAdmin = { role: "user" as const, platformRole: "super_admin" as const };
const portalClient = { role: "user" as const, platformRole: "client" as const };

describe("isPreCompanyWorkspaceUser", () => {
  it("is false while membership list is loading (avoid pre-company flash)", () => {
    expect(
      isPreCompanyWorkspaceUser(regularUser, { companyLoading: true, companiesCount: 0 }),
    ).toBe(false);
  });

  it("is false once the user has at least one company", () => {
    expect(
      isPreCompanyWorkspaceUser(regularUser, { companyLoading: false, companiesCount: 1 }),
    ).toBe(false);
  });

  it("is true for a settled empty membership list for a standard business user", () => {
    expect(
      isPreCompanyWorkspaceUser(regularUser, { companyLoading: false, companiesCount: 0 }),
    ).toBe(true);
  });

  it("is false for platform operators and global admins", () => {
    expect(isPreCompanyWorkspaceUser(platform, { companyLoading: false, companiesCount: 0 })).toBe(
      false,
    );
    expect(isPreCompanyWorkspaceUser(superAdmin, { companyLoading: false, companiesCount: 0 })).toBe(
      false,
    );
  });

  it("is false for portal-only clients", () => {
    expect(
      isPreCompanyWorkspaceUser(portalClient, { companyLoading: false, companiesCount: 0 }),
    ).toBe(false);
  });
});
