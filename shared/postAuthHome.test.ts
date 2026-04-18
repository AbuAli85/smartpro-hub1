import { describe, expect, it } from "vitest";
import {
  resolvePostAuthHome,
  tenantWorkspaceLandingPath,
  OPERATOR_DEFAULT_HOME,
  isAlreadyAtPostAuthDestination,
} from "./postAuthHome";

const baseInput = {
  isAuthenticated: true,
  authLoading: false,
  companiesLoading: false,
  companiesSettled: true,
  hasCompanyMembership: true,
  user: { role: "user" as const, platformRole: "company_member" as const, platformRoles: [] as string[] },
};

describe("resolvePostAuthHome", () => {
  it("returns null while auth is loading", () => {
    expect(
      resolvePostAuthHome({
        ...baseInput,
        authLoading: true,
        companiesLoading: false,
        activeMemberRole: "client",
      }).redirectTo,
    ).toBeNull();
  });

  it("returns null while companies are loading", () => {
    expect(
      resolvePostAuthHome({
        ...baseInput,
        companiesLoading: true,
        companiesSettled: false,
        activeMemberRole: "client",
      }).redirectTo,
    ).toBeNull();
  });

  it("sends platform operator to operator home", () => {
    expect(
      resolvePostAuthHome({
        ...baseInput,
        user: { role: "user", platformRole: "regional_manager", platformRoles: [] },
        activeMemberRole: "company_admin",
      }).redirectTo,
    ).toBe(OPERATOR_DEFAULT_HOME);
  });

  it("sends global admin to operator home", () => {
    expect(
      resolvePostAuthHome({
        ...baseInput,
        user: { role: "user", platformRole: "client", platformRoles: ["platform_admin"] },
        activeMemberRole: "client",
      }).redirectTo,
    ).toBe(OPERATOR_DEFAULT_HOME);
  });

  it("sends customer member to /client", () => {
    expect(
      resolvePostAuthHome({
        ...baseInput,
        activeMemberRole: "client",
      }).redirectTo,
    ).toBe("/client");
  });

  it("sends company_admin to non-client tenant home", () => {
    expect(
      resolvePostAuthHome({
        ...baseInput,
        activeMemberRole: "company_admin",
      }).redirectTo,
    ).toBe("/control-tower");
  });

  it("sends hr_admin to HR default", () => {
    expect(
      resolvePostAuthHome({
        ...baseInput,
        activeMemberRole: "hr_admin",
      }).redirectTo,
    ).toBe("/hr/employees");
  });

  it("sends users with no company to /dashboard", () => {
    expect(
      resolvePostAuthHome({
        ...baseInput,
        hasCompanyMembership: false,
        activeMemberRole: null,
      }).redirectTo,
    ).toBe("/dashboard");
  });
});

describe("tenantWorkspaceLandingPath", () => {
  it("maps client to /client", () => {
    expect(tenantWorkspaceLandingPath("client")).toBe("/client");
  });

  it("maps unknown role to /dashboard", () => {
    expect(tenantWorkspaceLandingPath(null)).toBe("/dashboard");
    expect(tenantWorkspaceLandingPath("")).toBe("/dashboard");
  });
});

describe("isAlreadyAtPostAuthDestination", () => {
  it("detects same normalized path", () => {
    expect(isAlreadyAtPostAuthDestination("/control-tower", "/control-tower")).toBe(true);
    expect(isAlreadyAtPostAuthDestination("/client?x=1", "/client")).toBe(true);
  });
});
