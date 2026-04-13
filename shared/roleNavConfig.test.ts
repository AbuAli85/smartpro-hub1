import { describe, it, expect } from "vitest";
import {
  normalizePath,
  sanitizeRoleNavExtensions,
  pathMatchesNavExtensionHref,
  isTenantUnsafeNavExtensionPath,
  isAllowedNavExtensionForRole,
} from "./roleNavConfig";
import { isPlatformRestrictedTenantNavPath } from "./navPlatformRestrictedPrefixes";

describe("normalizePath", () => {
  it("trims whitespace", () => {
    expect(normalizePath("  /hr/foo  ")).toBe("/hr/foo");
  });

  it("strips query strings and hash fragments", () => {
    expect(normalizePath("/hr?tab=a")).toBe("/hr");
    expect(normalizePath("/hr#section")).toBe("/hr");
    expect(normalizePath("/path?x=1#y")).toBe("/path");
  });

  it("ensures a single leading slash", () => {
    expect(normalizePath("hr/tasks")).toBe("/hr/tasks");
  });

  it("collapses repeated slashes", () => {
    expect(normalizePath("//hr///tasks//")).toBe("/hr/tasks");
  });

  it("removes trailing slash except for root", () => {
    expect(normalizePath("/hr/")).toBe("/hr");
    expect(normalizePath("/")).toBe("/");
  });

  it("returns empty string for empty or whitespace-only input", () => {
    expect(normalizePath("")).toBe("");
    expect(normalizePath("   ")).toBe("");
  });
});

describe("isTenantUnsafeNavExtensionPath (platform blocklist)", () => {
  it("blocks exact restricted prefixes", () => {
    expect(isTenantUnsafeNavExtensionPath("/admin")).toBe(true);
    expect(isTenantUnsafeNavExtensionPath("/user-roles")).toBe(true);
    expect(isTenantUnsafeNavExtensionPath("/platform-ops")).toBe(true);
  });

  it("blocks child routes under restricted prefixes", () => {
    expect(isTenantUnsafeNavExtensionPath("/admin/users")).toBe(true);
    expect(isTenantUnsafeNavExtensionPath("/survey/admin/responses/123")).toBe(true);
  });

  it("does not treat sibling paths as restricted prefixes", () => {
    expect(isTenantUnsafeNavExtensionPath("/adminish")).toBe(false);
    expect(isPlatformRestrictedTenantNavPath("/adminish")).toBe(false);
  });
});

describe("sanitizeRoleNavExtensions", () => {
  it("strips platform-only paths", () => {
    const out = sanitizeRoleNavExtensions({
      company_admin: ["/my-portal", "/user-roles", "/platform-ops"],
      hr_admin: ["/hr/employees"],
    });
    expect(out.company_admin).toEqual(["/my-portal"]);
    expect(out.hr_admin).toEqual(["/hr/employees"]);
  });

  it("normalizes leading slashes for allowed paths", () => {
    const out = sanitizeRoleNavExtensions({ hr_admin: ["hr/tasks"] });
    expect(out.hr_admin).toEqual(["/hr/tasks"]);
  });

  it("rejects root path", () => {
    const out = sanitizeRoleNavExtensions({ company_admin: ["/", "/dashboard"] });
    expect(out.company_admin).toEqual(["/dashboard"]);
  });

  it("rejects paths containing parent traversal", () => {
    const out = sanitizeRoleNavExtensions({
      company_admin: ["/dashboard", "/company/../admin", "/contracts"],
    });
    expect(out.company_admin).toEqual(["/dashboard", "/contracts"]);
  });

  it("rejects backslashes and protocol-like garbage", () => {
    expect(
      sanitizeRoleNavExtensions({ company_admin: ["/dashboard", "\\\\evil", "https://x/y"] }).company_admin,
    ).toEqual(["/dashboard"]);
  });

  it("deduplicates paths", () => {
    const out = sanitizeRoleNavExtensions({
      hr_admin: ["/hr/tasks", "/hr/tasks", "/workspace"],
    });
    expect(out.hr_admin).toEqual(["/hr/tasks", "/workspace"]);
  });

  it("ignores unknown role keys in raw JSON", () => {
    const out = sanitizeRoleNavExtensions({
      company_admin: ["/dashboard"],
      evil_role: ["/dashboard"],
      extra: ["/contracts"],
    } as Record<string, unknown>);
    expect(out.company_admin).toEqual(["/dashboard"]);
    expect((out as Record<string, unknown>).evil_role).toBeUndefined();
    expect((out as Record<string, unknown>).extra).toBeUndefined();
  });

  it("enforces per-role allowlists (company_member cannot get HR subtree)", () => {
    const out = sanitizeRoleNavExtensions({
      company_member: ["/hr/employees"],
      hr_admin: ["/hr/employees"],
    });
    expect(out.company_member).toBeUndefined();
    expect(out.hr_admin).toEqual(["/hr/employees"]);
  });

  it("allows finance roots for finance_admin only", () => {
    expect(
      sanitizeRoleNavExtensions({ finance_admin: ["/payroll/process"] }).finance_admin,
    ).toEqual(["/payroll/process"]);
    expect(sanitizeRoleNavExtensions({ hr_admin: ["/payroll"] }).hr_admin).toBeUndefined();
  });
});

describe("isAllowedNavExtensionForRole", () => {
  it("allows subtree under an approved root", () => {
    expect(isAllowedNavExtensionForRole("hr_admin", "/hr/team")).toBe(true);
  });

  it("does not allow paths that only share a prefix with a sibling route name", () => {
    expect(isAllowedNavExtensionForRole("hr_admin", "/hrish")).toBe(false);
  });
});

describe("pathMatchesNavExtensionHref", () => {
  it("matches exact and subtree prefixes", () => {
    expect(pathMatchesNavExtensionHref("/hr/employees/12", ["/hr/employees"])).toBe(true);
    expect(pathMatchesNavExtensionHref("/crm", ["/hr"])).toBe(false);
  });

  it("does not match sibling prefixes accidentally", () => {
    expect(pathMatchesNavExtensionHref("/hrish", ["/hr"])).toBe(false);
  });

  it("normalizes href with query to match stored prefix", () => {
    expect(pathMatchesNavExtensionHref("/hr?tab=a", ["/hr"])).toBe(true);
  });

  it("normalizes stored extras with trailing slash", () => {
    expect(pathMatchesNavExtensionHref("/hr/sub", ["/hr/"])).toBe(true);
  });
});
