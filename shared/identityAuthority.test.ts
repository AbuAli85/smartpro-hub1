import { describe, expect, it } from "vitest";
import {
  canAccessGlobalAdminFromIdentity,
  getEffectiveGlobalPlatformRoles,
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
