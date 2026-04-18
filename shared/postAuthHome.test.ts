import { describe, expect, it } from "vitest";
import {
  resolvePostAuthHome,
  tenantWorkspaceLandingPath,
  OPERATOR_DEFAULT_HOME,
  isAlreadyAtPostAuthDestination,
  pickSafeAuthenticatedReturnPath,
  computePostAuthNavigationRedirect,
  isPostAuthNavigationSweepSkippedPath,
} from "./postAuthHome";

const baseInput = {
  isAuthenticated: true,
  authLoading: false,
  companiesLoading: false,
  companiesSettled: true,
  hasCompanyMembership: true,
  user: { role: "user" as const, platformRole: "company_member" as const, platformRoles: [] as string[] },
};

const portalClientUser = { role: "user" as const, platformRole: "client" as const, platformRoles: [] as string[] };
const ownerUser = { role: "user" as const, platformRole: "company_admin" as const, platformRoles: [] as string[] };

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

  it("prefers operator shell over active client membership when user has super_admin grant", () => {
    expect(
      resolvePostAuthHome({
        ...baseInput,
        user: { role: "user", platformRole: "client", platformRoles: ["super_admin"] },
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

describe("isPostAuthNavigationSweepSkippedPath", () => {
  it("skips MFA challenge routes", () => {
    expect(isPostAuthNavigationSweepSkippedPath("/auth/mfa")).toBe(true);
    expect(isPostAuthNavigationSweepSkippedPath("/auth/mfa?challenge=1")).toBe(true);
    expect(isPostAuthNavigationSweepSkippedPath("/dashboard")).toBe(false);
  });
});

function pickSafeRouteCheck(memberRole: "company_admin" | "hr_admin" | "finance_admin") {
  return {
    user: ownerUser,
    hiddenOptional: new Set<string>(),
    navOptions: { hasCompanyMembership: true, memberRole },
  };
}

describe("computePostAuthNavigationRedirect", () => {
  it("returns null while auth is still loading", () => {
    expect(
      computePostAuthNavigationRedirect({
        isAuthenticated: true,
        authLoading: true,
        companiesLoading: false,
        pathname: "/client",
        search: "",
        pickSafeInput: {
          resolveInput: { ...baseInput, activeMemberRole: "company_admin" },
          routeCheck: pickSafeRouteCheck("company_admin"),
        },
      }),
    ).toBeNull();
  });

  it("returns null while workspace policy context is still loading", () => {
    expect(
      computePostAuthNavigationRedirect({
        isAuthenticated: true,
        authLoading: false,
        companiesLoading: true,
        pathname: "/client",
        search: "",
        pickSafeInput: {
          resolveInput: { ...baseInput, activeMemberRole: "company_admin" },
          routeCheck: pickSafeRouteCheck("company_admin"),
        },
      }),
    ).toBeNull();
  });

  it("redirects company_admin from / to control tower", () => {
    expect(
      computePostAuthNavigationRedirect({
        isAuthenticated: true,
        authLoading: false,
        companiesLoading: false,
        pathname: "/",
        search: "",
        pickSafeInput: {
          resolveInput: { ...baseInput, activeMemberRole: "company_admin" },
          routeCheck: pickSafeRouteCheck("company_admin"),
        },
      }),
    ).toBe("/control-tower");
  });

  it("redirects company_admin from disallowed /client to tenant landing", () => {
    expect(
      computePostAuthNavigationRedirect({
        isAuthenticated: true,
        authLoading: false,
        companiesLoading: false,
        pathname: "/client",
        search: "",
        pickSafeInput: {
          resolveInput: { ...baseInput, activeMemberRole: "company_admin" },
          routeCheck: pickSafeRouteCheck("company_admin"),
        },
      }),
    ).toBe("/control-tower");
  });

  it("honours allowed /preferences for client member", () => {
    const clientUser = { role: "user" as const, platformRole: "client" as const, platformRoles: [] as string[] };
    expect(
      computePostAuthNavigationRedirect({
        isAuthenticated: true,
        authLoading: false,
        companiesLoading: false,
        pathname: "/preferences",
        search: "",
        pickSafeInput: {
          resolveInput: { ...baseInput, user: clientUser, activeMemberRole: "client" },
          routeCheck: {
            user: clientUser,
            hiddenOptional: new Set(),
            navOptions: {
              hasCompanyMembership: true,
              hasCompanyWorkspace: true,
              memberRole: "client" as const,
            },
          },
        },
      }),
    ).toBeNull();
  });

  it("redirects super_admin from stale /client return to operator home", () => {
    const su = { role: "user" as const, platformRole: "client" as const, platformRoles: ["super_admin"] as string[] };
    expect(
      computePostAuthNavigationRedirect({
        isAuthenticated: true,
        authLoading: false,
        companiesLoading: false,
        pathname: "/client",
        search: "",
        pickSafeInput: {
          resolveInput: { ...baseInput, user: su, activeMemberRole: "client" },
          routeCheck: {
            user: su,
            hiddenOptional: new Set(),
            navOptions: { hasCompanyMembership: true, memberRole: "client" as const },
          },
        },
      }),
    ).toBe(OPERATOR_DEFAULT_HOME);
  });

  it("returns null on MFA path (sweep skipped)", () => {
    expect(
      computePostAuthNavigationRedirect({
        isAuthenticated: true,
        authLoading: false,
        companiesLoading: false,
        pathname: "/auth/mfa",
        search: "?challenge=1",
        pickSafeInput: {
          resolveInput: { ...baseInput, activeMemberRole: "company_admin" },
          routeCheck: pickSafeRouteCheck("company_admin"),
        },
      }),
    ).toBeNull();
  });

  it("keeps an allowed internal deep link for hr_admin", () => {
    expect(
      computePostAuthNavigationRedirect({
        isAuthenticated: true,
        authLoading: false,
        companiesLoading: false,
        pathname: "/hr/employees",
        search: "",
        pickSafeInput: {
          resolveInput: { ...baseInput, activeMemberRole: "hr_admin" },
          routeCheck: {
            user: ownerUser,
            hiddenOptional: new Set(),
            navOptions: { hasCompanyMembership: true, memberRole: "hr_admin" as const },
          },
        },
      }),
    ).toBeNull();
  });

  it("is deterministic for active workspace role (multi-company simulation)", () => {
    const toHr = computePostAuthNavigationRedirect({
      isAuthenticated: true,
      authLoading: false,
      companiesLoading: false,
      pathname: "/client",
      search: "",
      pickSafeInput: {
        resolveInput: { ...baseInput, activeMemberRole: "hr_admin" },
        routeCheck: {
          user: baseInput.user,
          hiddenOptional: new Set(),
          navOptions: { hasCompanyMembership: true, memberRole: "hr_admin" as const },
        },
      },
    });
    const toFinance = computePostAuthNavigationRedirect({
      isAuthenticated: true,
      authLoading: false,
      companiesLoading: false,
      pathname: "/client",
      search: "",
      pickSafeInput: {
        resolveInput: { ...baseInput, activeMemberRole: "finance_admin" },
        routeCheck: {
          user: baseInput.user,
          hiddenOptional: new Set(),
          navOptions: { hasCompanyMembership: true, memberRole: "finance_admin" as const },
        },
      },
    });
    expect(toHr).toBe("/hr/employees");
    expect(toFinance).toBe("/payroll");
  });
});

describe("pickSafeAuthenticatedReturnPath", () => {
  it("uses canonical home for marketing root even when a return path asks for /", () => {
    const resolveInput = {
      ...baseInput,
      activeMemberRole: "company_admin",
    };
    expect(
      pickSafeAuthenticatedReturnPath({
        requestedPath: "/",
        resolveInput,
        routeCheck: { user: ownerUser, hiddenOptional: new Set(), navOptions: { memberRole: "company_admin", hasCompanyMembership: true } },
      }),
    ).toBe("/control-tower");
  });

  it("honours an allowed deep link (preferences) for a customer member", () => {
    const resolveInput = {
      ...baseInput,
      user: portalClientUser,
      activeMemberRole: "client",
    };
    expect(
      pickSafeAuthenticatedReturnPath({
        requestedPath: "/preferences",
        resolveInput,
        routeCheck: {
          user: portalClientUser,
          hiddenOptional: new Set(),
          navOptions: {
            hasCompanyMembership: true,
            hasCompanyWorkspace: true,
            memberRole: "client",
          },
        },
      }),
    ).toBe("/preferences");
  });

  it("rejects disallowed returnPath (/client) for internal tenant and falls back to canonical", () => {
    const resolveInput = {
      ...baseInput,
      activeMemberRole: "company_admin",
    };
    expect(
      pickSafeAuthenticatedReturnPath({
        requestedPath: "/client",
        resolveInput,
        routeCheck: {
          user: ownerUser,
          hiddenOptional: new Set(),
          navOptions: { memberRole: "company_admin", hasCompanyMembership: true },
        },
      }),
    ).toBe("/control-tower");
  });

  it("rejects /client/company/create for internal tenant who already has a company (not client journey)", () => {
    const resolveInput = {
      ...baseInput,
      activeMemberRole: "hr_admin",
    };
    expect(
      pickSafeAuthenticatedReturnPath({
        requestedPath: "/client/company/create",
        resolveInput,
        routeCheck: {
          user: { role: "user", platformRole: "company_admin", platformRoles: [] },
          hiddenOptional: new Set(),
          navOptions: { memberRole: "hr_admin", hasCompanyMembership: true },
        },
      }),
    ).toBe("/hr/employees");
  });

  it("normalizes open-redirect style paths to / then canonical", () => {
    const resolveInput = { ...baseInput, activeMemberRole: "company_member" };
    expect(
      pickSafeAuthenticatedReturnPath({
        requestedPath: "//evil.example/phish",
        resolveInput,
        routeCheck: {
          user: baseInput.user,
          hiddenOptional: new Set(),
          navOptions: { memberRole: "company_member", hasCompanyMembership: true },
        },
      }),
    ).toBe("/my-portal");
  });
});
