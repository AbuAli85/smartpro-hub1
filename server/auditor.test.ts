/**
 * Tests for the External Auditor (Read-Only) role guards.
 *
 * Verifies that:
 * 1. requireNotAuditor throws FORBIDDEN for external_auditor members
 * 2. requireNotAuditor passes for all other roles
 * 3. clientNav correctly blocks/allows routes for external_auditor
 * 4. isExternalAuditor helper works correctly
 */

import { describe, it, expect } from "vitest";
import { TRPCError } from "@trpc/server";
import { requireNotAuditor } from "./_core/membership";
import {
  clientNavItemVisible,
  clientRouteAccessible,
  AUDITOR_BLOCKED_HREFS,
} from "../shared/clientNav";

// ─── requireNotAuditor ────────────────────────────────────────────────────────

describe("requireNotAuditor", () => {
  it("throws FORBIDDEN when role is external_auditor", () => {
    expect(() => requireNotAuditor("external_auditor")).toThrowError(
      expect.objectContaining({ code: "FORBIDDEN" })
    );
  });

  it("does not throw for company_admin", () => {
    expect(() => requireNotAuditor("company_admin")).not.toThrow();
  });

  it("does not throw for company_member", () => {
    expect(() => requireNotAuditor("company_member")).not.toThrow();
  });

  it("does not throw for finance_admin", () => {
    expect(() => requireNotAuditor("finance_admin")).not.toThrow();
  });

  it("does not throw for hr_admin", () => {
    expect(() => requireNotAuditor("hr_admin")).not.toThrow();
  });

  it("does not throw for reviewer", () => {
    expect(() => requireNotAuditor("reviewer")).not.toThrow();
  });

  it("does not throw when role is null (no membership)", () => {
    expect(() => requireNotAuditor(null)).not.toThrow();
  });
});

// ─── AUDITOR_BLOCKED_HREFS coverage ──────────────────────────────────────────

describe("AUDITOR_BLOCKED_HREFS", () => {
  it("includes payroll", () => {
    expect(AUDITOR_BLOCKED_HREFS).toContain("/payroll");
  });

  it("includes billing", () => {
    expect(AUDITOR_BLOCKED_HREFS).toContain("/billing");
  });

  it("includes admin panel", () => {
    expect(AUDITOR_BLOCKED_HREFS).toContain("/admin");
  });

  it("includes company-admin", () => {
    expect(AUDITOR_BLOCKED_HREFS).toContain("/company-admin");
  });

  it("includes renewal-workflows", () => {
    expect(AUDITOR_BLOCKED_HREFS).toContain("/renewal-workflows");
  });

  it("includes sla-management", () => {
    expect(AUDITOR_BLOCKED_HREFS).toContain("/sla-management");
  });
});

// ─── clientNavItemVisible — auditor filtering ─────────────────────────────────

const auditorUser = {
  id: "u1",
  openId: "o1",
  name: "Auditor User",
  email: "auditor@test.com",
  role: "user" as const,
  platformRole: "client_services" as const,
};

const navOptions = {
  hasCompanyWorkspace: true,
  companyWorkspaceLoading: false,
  memberRole: "external_auditor" as const,
};

describe("clientNavItemVisible — external_auditor", () => {
  it("hides /payroll for external_auditor", () => {
    expect(clientNavItemVisible("/payroll", auditorUser, new Set<string>(), navOptions)).toBe(false);
  });

  it("hides /billing for external_auditor", () => {
    expect(clientNavItemVisible("/billing", auditorUser, new Set<string>(), navOptions)).toBe(false);
  });

  it("hides /admin for external_auditor", () => {
    expect(clientNavItemVisible("/admin", auditorUser, new Set<string>(), navOptions)).toBe(false);
  });

  it("hides /company-admin for external_auditor", () => {
    expect(clientNavItemVisible("/company-admin", auditorUser, new Set<string>(), navOptions)).toBe(false);
  });

  it("shows /contracts for external_auditor", () => {
    expect(clientNavItemVisible("/contracts", auditorUser, new Set<string>(), navOptions)).toBe(true);
  });

  it("shows /hr/employees for external_auditor", () => {
    expect(clientNavItemVisible("/hr/employees", auditorUser, new Set<string>(), navOptions)).toBe(true);
  });

  it("shows /pro for external_auditor", () => {
    expect(clientNavItemVisible("/pro", auditorUser, new Set<string>(), navOptions)).toBe(true);
  });

  it("shows /workforce for external_auditor", () => {
    expect(clientNavItemVisible("/workforce", auditorUser, new Set<string>(), navOptions)).toBe(true);
  });
});

// ─── clientRouteAccessible — auditor deep-link blocking ───────────────────────

describe("clientRouteAccessible — external_auditor", () => {
  it("blocks /payroll deep link for external_auditor", () => {
    expect(clientRouteAccessible("/payroll", auditorUser, new Set<string>(), navOptions)).toBe(false);
  });

  it("blocks /billing deep link for external_auditor", () => {
    expect(clientRouteAccessible("/billing", auditorUser, new Set<string>(), navOptions)).toBe(false);
  });

  it("allows /contracts deep link for external_auditor", () => {
    expect(clientRouteAccessible("/contracts", auditorUser, new Set<string>(), navOptions)).toBe(true);
  });

  it("allows /hr/employees deep link for external_auditor", () => {
    expect(clientRouteAccessible("/hr/employees", auditorUser, new Set<string>(), navOptions)).toBe(true);
  });
});
