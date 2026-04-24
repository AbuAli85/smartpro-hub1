import { describe, expect, it } from "vitest";
import {
  canAccessGlobalAdminProcedures,
  hasTenantOperatorMembership,
  isCompanyProvisioningAdmin,
  mapMemberRoleToPlatformRole,
} from "@shared/rbac";

describe("canAccessGlobalAdminProcedures", () => {
  it("does not grant global admin from users.role alone (requires platformRoles or global platformRole slug)", () => {
    expect(canAccessGlobalAdminProcedures({ role: "admin", platformRole: "client", platformRoles: [] })).toBe(false);
  });

  it("allows super_admin and platform_admin via platformRole", () => {
    expect(canAccessGlobalAdminProcedures({ role: "user", platformRole: "super_admin" })).toBe(true);
    expect(canAccessGlobalAdminProcedures({ role: "user", platformRole: "platform_admin" })).toBe(true);
  });

  it("allows super_admin via platform_user_roles (session.platformRoles)", () => {
    expect(
      canAccessGlobalAdminProcedures({ role: "user", platformRole: "client", platformRoles: ["super_admin"] }),
    ).toBe(true);
  });

  it("denies normal company users", () => {
    expect(canAccessGlobalAdminProcedures({ role: "user", platformRole: "company_admin" })).toBe(false);
    expect(canAccessGlobalAdminProcedures({ role: "user", platformRole: "company_member" })).toBe(false);
  });

  it("platform_user_roles table overrides stale users.platformRole: non-admin table entry blocks access even when platformRole='super_admin'", () => {
    // Once platform_user_roles is populated for a user, platformRole column is no longer authoritative.
    // A stale platformRole:'super_admin' must NOT grant access if the live table says something else.
    expect(
      canAccessGlobalAdminProcedures({
        role: "user",
        platformRole: "super_admin",   // stale DB column
        platformRoles: ["company_member"], // live platform_user_roles entries
      }),
    ).toBe(false);
  });

  it("triggerAbsentMarkJob gate: grants access via platform_user_roles when platformRole is non-admin", () => {
    // Mirrors the canAccessGlobalAdminProcedures check introduced in attendance.ts
    expect(
      canAccessGlobalAdminProcedures({
        role: "user",
        platformRole: "client",            // stale/default column
        platformRoles: ["platform_admin"], // granted via platform_user_roles table
      }),
    ).toBe(true);
  });
});

describe("isCompanyProvisioningAdmin", () => {
  it("includes company_admin", () => {
    expect(isCompanyProvisioningAdmin({ role: "user", platformRole: "company_admin" })).toBe(true);
  });
});

describe("hasTenantOperatorMembership", () => {
  it("is true only for tenant operator membership roles", () => {
    expect(hasTenantOperatorMembership("company_admin")).toBe(true);
    expect(hasTenantOperatorMembership("hr_admin")).toBe(true);
    expect(hasTenantOperatorMembership("finance_admin")).toBe(true);
    expect(hasTenantOperatorMembership("company_member")).toBe(false);
    expect(hasTenantOperatorMembership("client")).toBe(false);
    expect(hasTenantOperatorMembership(null)).toBe(false);
  });
});

describe("mapMemberRoleToPlatformRole", () => {
  it("maps company_member after trim so it does not fall through to client", () => {
    expect(mapMemberRoleToPlatformRole(" company_member ")).toBe("company_member");
  });

  it("maps hr_admin to company_admin platform shell", () => {
    expect(mapMemberRoleToPlatformRole("hr_admin")).toBe("company_admin");
  });

  it("maps client membership to client", () => {
    expect(mapMemberRoleToPlatformRole("client")).toBe("client");
  });
});
