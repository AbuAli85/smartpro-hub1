import { describe, expect, it } from "vitest";
import {
  canAccessGlobalAdminProcedures,
  isCompanyProvisioningAdmin,
  mapMemberRoleToPlatformRole,
} from "@shared/rbac";

describe("canAccessGlobalAdminProcedures", () => {
  it("allows legacy users.role admin", () => {
    expect(canAccessGlobalAdminProcedures({ role: "admin", platformRole: "client" })).toBe(true);
  });

  it("allows super_admin and platform_admin via platformRole", () => {
    expect(canAccessGlobalAdminProcedures({ role: "user", platformRole: "super_admin" })).toBe(true);
    expect(canAccessGlobalAdminProcedures({ role: "user", platformRole: "platform_admin" })).toBe(true);
  });

  it("denies normal company users", () => {
    expect(canAccessGlobalAdminProcedures({ role: "user", platformRole: "company_admin" })).toBe(false);
    expect(canAccessGlobalAdminProcedures({ role: "user", platformRole: "company_member" })).toBe(false);
  });
});

describe("isCompanyProvisioningAdmin", () => {
  it("includes company_admin", () => {
    expect(isCompanyProvisioningAdmin({ role: "user", platformRole: "company_admin" })).toBe(true);
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
