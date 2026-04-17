import { describe, expect, it } from "vitest";
import { canAccessGlobalAdminFromIdentity, seesPlatformOperatorNavFromIdentity } from "./identityAuthority";

/**
 * Documents UI policies that replaced legacy `users.role === "admin"` checks.
 * Page components use `canAccessGlobalAdminProcedures` / `seesPlatformOperatorNav` from rbac / clientNav.
 */
describe("platform UI access (replaces legacy users.role admin)", () => {
  it("billing / ratings moderation: global admins (platform_user_roles or super/platform slug)", () => {
    expect(canAccessGlobalAdminFromIdentity({ role: "user", platformRoles: ["platform_admin"] })).toBe(true);
    expect(canAccessGlobalAdminFromIdentity({ role: "user", platformRole: "super_admin", platformRoles: [] })).toBe(
      true,
    );
    expect(canAccessGlobalAdminFromIdentity({ role: "admin", platformRole: "client", platformRoles: [] })).toBe(false);
    expect(canAccessGlobalAdminFromIdentity({ role: "user", platformRole: "company_admin", platformRoles: [] })).toBe(
      false,
    );
  });

  it("officer registry write actions: platform operators (not tenant company_admin alone)", () => {
    expect(seesPlatformOperatorNavFromIdentity({ role: "user", platformRoles: ["regional_manager"] })).toBe(true);
    expect(seesPlatformOperatorNavFromIdentity({ role: "user", platformRole: "company_admin", platformRoles: [] })).toBe(
      false,
    );
  });
});
