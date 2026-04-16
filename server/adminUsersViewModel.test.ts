import { describe, expect, it } from "vitest";
import { buildIdentityHealthSignals } from "./adminUsersViewModel";

describe("buildIdentityHealthSignals", () => {
  it("flags duplicate email as critical", () => {
    const r = buildIdentityHealthSignals({
      accountStatus: "active",
      emailNormalized: "a@x.com",
      primaryEmail: "a@x.com",
      duplicateEmail: true,
      activeMembershipCount: 1,
      globalPlatformRoles: [],
      twoFactorEnabled: false,
      authIdentityCount: 1,
      legacyUsersPlatformRole: "company_member",
      mappedMembershipToPlatform: "company_member",
    });
    expect(r.signals.some((s) => s.code === "duplicate_email")).toBe(true);
    expect(r.overallLevel).toBe("critical");
  });

  it("flags privileged without 2FA", () => {
    const r = buildIdentityHealthSignals({
      accountStatus: "active",
      emailNormalized: "a@x.com",
      primaryEmail: "a@x.com",
      duplicateEmail: false,
      activeMembershipCount: 0,
      globalPlatformRoles: ["super_admin"],
      twoFactorEnabled: false,
      authIdentityCount: 1,
      legacyUsersPlatformRole: "super_admin",
      mappedMembershipToPlatform: null,
    });
    expect(r.signals.some((s) => s.code === "privileged_no_2fa")).toBe(true);
  });

  it("does not use legacy platformRole as healthy when mismatched with membership mapping", () => {
    const r = buildIdentityHealthSignals({
      accountStatus: "active",
      emailNormalized: "b@x.com",
      primaryEmail: "b@x.com",
      duplicateEmail: false,
      activeMembershipCount: 1,
      globalPlatformRoles: [],
      twoFactorEnabled: false,
      authIdentityCount: 1,
      legacyUsersPlatformRole: "client",
      mappedMembershipToPlatform: "company_admin",
    });
    expect(r.signals.some((s) => s.code === "legacy_platform_cache_mismatch")).toBe(true);
  });
});
