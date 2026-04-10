/**
 * Tests for role redirect settings feature.
 *
 * Covers:
 * 1. getRoleDefaultRoute — system defaults per role
 * 2. Custom redirect resolution logic (custom overrides system default)
 * 3. Fallback to system default when no custom redirect is set
 */
import { describe, expect, it } from "vitest";
import { getRoleDefaultRoute } from "@shared/clientNav";

// ── Helper: simulate the redirect resolution logic used in Dashboard.tsx ──────
function resolveRedirectTarget(
  memberRole: string,
  customSettings: Record<string, string> = {},
): string {
  const customRoute = customSettings[memberRole];
  return customRoute || getRoleDefaultRoute(memberRole);
}

describe("getRoleDefaultRoute — system defaults", () => {
  it("returns /control-tower for company_admin", () => {
    expect(getRoleDefaultRoute("company_admin")).toBe("/control-tower");
  });

  it("returns /hr/employees for hr_admin", () => {
    expect(getRoleDefaultRoute("hr_admin")).toBe("/hr/employees");
  });

  it("returns /payroll for finance_admin", () => {
    expect(getRoleDefaultRoute("finance_admin")).toBe("/payroll");
  });

  it("returns /my-portal for company_member", () => {
    expect(getRoleDefaultRoute("company_member")).toBe("/my-portal");
  });

  it("returns /control-tower for reviewer", () => {
    expect(getRoleDefaultRoute("reviewer")).toBe("/control-tower");
  });

  it("returns /control-tower for external_auditor", () => {
    expect(getRoleDefaultRoute("external_auditor")).toBe("/control-tower");
  });

  it("returns /control-tower for unknown roles", () => {
    expect(getRoleDefaultRoute("unknown_role")).toBe("/control-tower");
    expect(getRoleDefaultRoute(null)).toBe("/control-tower");
    expect(getRoleDefaultRoute(undefined)).toBe("/control-tower");
  });
});

describe("resolveRedirectTarget — custom overrides", () => {
  it("uses custom redirect when set for hr_admin", () => {
    const settings = { hr_admin: "/hr/attendance" };
    expect(resolveRedirectTarget("hr_admin", settings)).toBe("/hr/attendance");
  });

  it("uses custom redirect when set for finance_admin", () => {
    const settings = { finance_admin: "/reports" };
    expect(resolveRedirectTarget("finance_admin", settings)).toBe("/reports");
  });

  it("uses custom redirect when set for company_member", () => {
    const settings = { company_member: "/dashboard" };
    expect(resolveRedirectTarget("company_member", settings)).toBe("/dashboard");
  });

  it("falls back to system default when no custom redirect is set", () => {
    expect(resolveRedirectTarget("hr_admin", {})).toBe("/hr/employees");
    expect(resolveRedirectTarget("finance_admin", {})).toBe("/payroll");
    expect(resolveRedirectTarget("company_member", {})).toBe("/my-portal");
  });

  it("falls back to system default when custom settings is undefined", () => {
    expect(resolveRedirectTarget("hr_admin")).toBe("/hr/employees");
    expect(resolveRedirectTarget("finance_admin")).toBe("/payroll");
  });

  it("custom redirect for one role does not affect other roles", () => {
    const settings = { hr_admin: "/hr/tasks" };
    // finance_admin should still use system default
    expect(resolveRedirectTarget("finance_admin", settings)).toBe("/payroll");
    // company_member should still use system default
    expect(resolveRedirectTarget("company_member", settings)).toBe("/my-portal");
  });

  it("supports all 6 configurable roles", () => {
    const settings: Record<string, string> = {
      company_admin: "/operations",
      hr_admin: "/hr/announcements",
      finance_admin: "/payroll/process",
      company_member: "/dashboard",
      reviewer: "/company/hub",
      external_auditor: "/dashboard",
    };
    expect(resolveRedirectTarget("company_admin", settings)).toBe("/operations");
    expect(resolveRedirectTarget("hr_admin", settings)).toBe("/hr/announcements");
    expect(resolveRedirectTarget("finance_admin", settings)).toBe("/payroll/process");
    expect(resolveRedirectTarget("company_member", settings)).toBe("/dashboard");
    expect(resolveRedirectTarget("reviewer", settings)).toBe("/company/hub");
    expect(resolveRedirectTarget("external_auditor", settings)).toBe("/dashboard");
  });
});
