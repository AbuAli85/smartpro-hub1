import { describe, expect, it } from "vitest";
import {
  canAccessGlobalAdminFromIdentity,
  canAccessSurveyAdminFromIdentity,
  getEffectiveGlobalPlatformRoles,
  isCompanyProvisioningAdminFromIdentity,
  seesPlatformOperatorNavFromIdentity,
} from "./identityAuthority";

describe("identityAuthority", () => {
  it("uses platformRoles from table over legacy columns", () => {
    const roles = getEffectiveGlobalPlatformRoles({
      role: "user",
      platformRole: "client",
      platformRoles: ["super_admin"],
    });
    expect(roles).toContain("super_admin");
    expect(canAccessGlobalAdminFromIdentity({ role: "user", platformRole: "client", platformRoles: ["super_admin"] })).toBe(
      true,
    );
  });

  it("falls back to legacy super_admin when platformRoles empty", () => {
    expect(
      canAccessGlobalAdminFromIdentity({ role: "user", platformRole: "super_admin", platformRoles: [] }),
    ).toBe(true);
  });

  it("does not treat company_admin as global admin without table grant", () => {
    expect(canAccessGlobalAdminFromIdentity({ role: "user", platformRole: "company_admin", platformRoles: [] })).toBe(
      false,
    );
  });

  it("sees regional_manager via platformRoles for operator nav", () => {
    expect(seesPlatformOperatorNavFromIdentity({ role: "user", platformRole: "client", platformRoles: ["regional_manager"] })).toBe(
      true,
    );
  });

  it("does not grant global admin from legacy users.role alone (use platformRoles / platformRole slugs)", () => {
    expect(canAccessGlobalAdminFromIdentity({ role: "admin", platformRole: "client", platformRoles: [] })).toBe(false);
    expect(
      canAccessGlobalAdminFromIdentity({ role: "admin", platformRole: "client", platformRoles: ["platform_admin"] }),
    ).toBe(true);
  });
});

describe("isCompanyProvisioningAdminFromIdentity", () => {
  it("global admin always gets provisioning (platform_user_roles grant)", () => {
    expect(
      isCompanyProvisioningAdminFromIdentity({ platformRole: "client", platformRoles: ["super_admin"] }),
    ).toBe(true);
  });

  it("migrated user with non-admin table slugs is denied — legacy column ignored", () => {
    expect(
      isCompanyProvisioningAdminFromIdentity({ platformRole: "company_admin", platformRoles: ["regional_manager"] }),
    ).toBe(false);
  });

  it("legacy path: user not yet migrated (empty platformRoles) with platformRole=company_admin is allowed", () => {
    expect(
      isCompanyProvisioningAdminFromIdentity({ platformRole: "company_admin", platformRoles: [] }),
    ).toBe(true);
  });

  it("legacy path: user not yet migrated with platformRole=client is denied", () => {
    expect(
      isCompanyProvisioningAdminFromIdentity({ platformRole: "client", platformRoles: [] }),
    ).toBe(false);
  });
});

describe("canAccessSurveyAdminFromIdentity", () => {
  it("global admin has survey access", () => {
    expect(
      canAccessSurveyAdminFromIdentity({ platformRole: "client", platformRoles: ["super_admin"] }),
    ).toBe(true);
  });

  it("regional_manager has survey access via platformRoles", () => {
    expect(
      canAccessSurveyAdminFromIdentity({ platformRole: "client", platformRoles: ["regional_manager"] }),
    ).toBe(true);
  });

  it("migrated user with no operator slug is denied — legacy company_admin column ignored", () => {
    expect(
      canAccessSurveyAdminFromIdentity({ platformRole: "company_admin", platformRoles: ["company_member"] }),
    ).toBe(false);
  });

  it("legacy path: unmigrated company_admin still gets survey access (transitional)", () => {
    expect(
      canAccessSurveyAdminFromIdentity({ platformRole: "company_admin", platformRoles: [] }),
    ).toBe(true);
  });

  it("legacy path: unmigrated non-admin is denied", () => {
    expect(
      canAccessSurveyAdminFromIdentity({ platformRole: "client", platformRoles: [] }),
    ).toBe(false);
  });
});
