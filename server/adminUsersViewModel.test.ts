import { describe, expect, it } from "vitest";
import {
  buildIdentityHealthSignals,
  buildSecurityHealthSignals,
} from "./adminUsersViewModel";

describe("buildIdentityHealthSignals", () => {
  it("flags duplicate email as critical", () => {
    const r = buildIdentityHealthSignals({
      accountStatus: "active",
      emailNormalized: "a@x.com",
      primaryEmail: "a@x.com",
      duplicateEmail: true,
      activeMembershipCount: 1,
      globalPlatformRoles: [],
      authIdentityCount: 1,
      legacyUsersPlatformRole: "company_member",
      mappedMembershipToPlatform: "company_member",
    });
    expect(r.signals.some((s) => s.code === "duplicate_email")).toBe(true);
    expect(r.overallLevel).toBe("critical");
  });

  it("flags legacy global cache when no platform table grant", () => {
    const r = buildIdentityHealthSignals({
      accountStatus: "active",
      emailNormalized: "a@x.com",
      primaryEmail: "a@x.com",
      duplicateEmail: false,
      activeMembershipCount: 0,
      globalPlatformRoles: [],
      authIdentityCount: 1,
      legacyUsersPlatformRole: "super_admin",
      mappedMembershipToPlatform: null,
    });
    expect(r.signals.some((s) => s.code === "legacy_global_not_in_platform_table")).toBe(true);
  });

  it("does not use legacy platformRole as healthy when mismatched with membership mapping", () => {
    const r = buildIdentityHealthSignals({
      accountStatus: "active",
      emailNormalized: "b@x.com",
      primaryEmail: "b@x.com",
      duplicateEmail: false,
      activeMembershipCount: 1,
      globalPlatformRoles: [],
      authIdentityCount: 1,
      legacyUsersPlatformRole: "client",
      mappedMembershipToPlatform: "company_admin",
    });
    expect(r.signals.some((s) => s.code === "legacy_platform_cache_mismatch")).toBe(true);
  });
});

describe("buildSecurityHealthSignals", () => {
  it("flags privileged global roles without 2FA as critical", () => {
    const r = buildSecurityHealthSignals({
      twoFactorEnabled: false,
      twoFactorVerifiedAt: null,
      requiresStepUp: false,
      globalPlatformRoles: ["super_admin"],
      recoveryCodesPresent: false,
    });
    expect(r.signals.some((s) => s.code === "privileged_no_2fa")).toBe(true);
    expect(r.overallLevel).toBe("critical");
  });

  it("flags step-up required with 2FA off", () => {
    const r = buildSecurityHealthSignals({
      twoFactorEnabled: false,
      twoFactorVerifiedAt: null,
      requiresStepUp: true,
      globalPlatformRoles: [],
      recoveryCodesPresent: false,
    });
    expect(r.signals.some((s) => s.code === "step_up_without_2fa")).toBe(true);
  });
});
