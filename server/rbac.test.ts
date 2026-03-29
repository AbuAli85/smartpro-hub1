import { describe, expect, it } from "vitest";
import {
  canAccessGlobalAdminProcedures,
  isCompanyProvisioningAdmin,
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
