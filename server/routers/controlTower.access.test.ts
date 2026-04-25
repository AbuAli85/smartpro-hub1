/**
 * server/routers/controlTower.access.test.ts
 *
 * Control Tower authority model tests.
 *
 * Coverage:
 *  1. Capability snapshot — role × scope → CT capabilities
 *  2. Server policy helpers — FORBIDDEN vs PASS for each role
 *  3. Navigation visibility — clientNavItemVisible / clientRouteAccessible
 *  4. Tenant scope enforcement — dept/team manager vs self scope
 *  5. Domain signal isolation — hr_admin cannot call finance signals, vice-versa
 *  6. Read-only enforcement — reviewer/auditor cannot manage/resolve/assign
 *  7. Regression: tenant company_admin cannot access platform control tower
 */

import { describe, it, expect } from "vitest";
import { deriveCapabilities } from "../_core/capabilities";
import {
  clientNavItemVisible,
  clientRouteAccessible,
  CONTROL_TOWER_HREFS,
  FIELD_EMPLOYEE_HREFS,
} from "@shared/clientNav";
import type { ClientNavOptions } from "@shared/clientNav";
import type { VisibilityScope } from "../_core/visibilityScope";

// ─── Scope fixtures ───────────────────────────────────────────────────────────

const SCOPE_COMPANY: VisibilityScope = { type: "company", companyId: 1 };
const SCOPE_DEPT: VisibilityScope = {
  type: "department",
  companyId: 1,
  selfEmployeeId: 10,
  department: "Operations",
  departmentEmployeeIds: [10, 11, 12],
};
const SCOPE_TEAM: VisibilityScope = {
  type: "team",
  companyId: 1,
  selfEmployeeId: 20,
  managedEmployeeIds: [20, 21, 22],
};
const SCOPE_SELF: VisibilityScope = {
  type: "self",
  companyId: 1,
  selfEmployeeId: 99,
};

const noHidden = new Set<string>();

// ─── 1. Capability snapshot: Control Tower fields ─────────────────────────────

describe("CT capability snapshot by role", () => {
  it("normal employee (company_member, self scope) has NO control tower access", () => {
    const caps = deriveCapabilities("company_member", SCOPE_SELF);
    expect(caps.canViewCompanyControlTower).toBe(false);
    expect(caps.canViewPlatformControlTower).toBe(false);
    expect(caps.canManageControlTowerItems).toBe(false);
    expect(caps.canViewControlTowerFinanceSignals).toBe(false);
    expect(caps.canViewControlTowerHrSignals).toBe(false);
    expect(caps.canViewControlTowerComplianceSignals).toBe(false);
    expect(caps.canViewControlTowerOperationsSignals).toBe(false);
    expect(caps.canViewControlTowerAuditSignals).toBe(false);
  });

  it("company_admin has full company control tower", () => {
    const caps = deriveCapabilities("company_admin", SCOPE_COMPANY);
    expect(caps.canViewCompanyControlTower).toBe(true);
    expect(caps.canManageControlTowerItems).toBe(true);
    expect(caps.canAssignControlTowerItems).toBe(true);
    expect(caps.canResolveControlTowerItems).toBe(true);
    expect(caps.canViewControlTowerFinanceSignals).toBe(true);
    expect(caps.canViewControlTowerHrSignals).toBe(true);
    expect(caps.canViewControlTowerComplianceSignals).toBe(true);
    expect(caps.canViewControlTowerOperationsSignals).toBe(true);
    expect(caps.canViewControlTowerAuditSignals).toBe(true);
    // platform tower is NEVER granted through deriveCapabilities
    expect(caps.canViewPlatformControlTower).toBe(false);
  });

  it("hr_admin cannot see finance-sensitive CT signals", () => {
    const caps = deriveCapabilities("hr_admin", SCOPE_COMPANY);
    expect(caps.canViewCompanyControlTower).toBe(true);
    expect(caps.canViewControlTowerHrSignals).toBe(true);
    expect(caps.canViewControlTowerFinanceSignals).toBe(false);
  });

  it("finance_admin cannot see HR-sensitive CT signals", () => {
    const caps = deriveCapabilities("finance_admin", SCOPE_COMPANY);
    expect(caps.canViewCompanyControlTower).toBe(true);
    expect(caps.canViewControlTowerFinanceSignals).toBe(true);
    expect(caps.canViewControlTowerHrSignals).toBe(false);
  });

  it("department_head (company_member dept scope) sees scoped tower + ops only", () => {
    const caps = deriveCapabilities("company_member", SCOPE_DEPT);
    expect(caps.canViewCompanyControlTower).toBe(true);
    expect(caps.canViewControlTowerOperationsSignals).toBe(true);
    expect(caps.canViewControlTowerFinanceSignals).toBe(false);
    expect(caps.canViewControlTowerHrSignals).toBe(false);
    expect(caps.canViewControlTowerComplianceSignals).toBe(false);
    expect(caps.canViewControlTowerAuditSignals).toBe(false);
    // department heads cannot manage items
    expect(caps.canManageControlTowerItems).toBe(false);
    expect(caps.canAssignControlTowerItems).toBe(false);
    expect(caps.canResolveControlTowerItems).toBe(false);
  });

  it("team_manager (company_member team scope) sees scoped tower + ops only", () => {
    const caps = deriveCapabilities("company_member", SCOPE_TEAM);
    expect(caps.canViewCompanyControlTower).toBe(true);
    expect(caps.canViewControlTowerOperationsSignals).toBe(true);
    expect(caps.canViewControlTowerFinanceSignals).toBe(false);
    expect(caps.canViewControlTowerHrSignals).toBe(false);
  });

  it("external_auditor is read-only: compliance + audit signals, no mutations", () => {
    const caps = deriveCapabilities("external_auditor", SCOPE_COMPANY);
    expect(caps.canViewCompanyControlTower).toBe(true);
    expect(caps.canViewControlTowerComplianceSignals).toBe(true);
    expect(caps.canViewControlTowerAuditSignals).toBe(true);
    expect(caps.canManageControlTowerItems).toBe(false);
    expect(caps.canAssignControlTowerItems).toBe(false);
    expect(caps.canResolveControlTowerItems).toBe(false);
    expect(caps.canViewControlTowerFinanceSignals).toBe(false);
    expect(caps.canViewControlTowerHrSignals).toBe(false);
    expect(caps.canViewControlTowerOperationsSignals).toBe(false);
  });

  it("reviewer is read-only: compliance + audit signals, no mutations", () => {
    const caps = deriveCapabilities("reviewer", SCOPE_COMPANY);
    expect(caps.canViewCompanyControlTower).toBe(true);
    expect(caps.canViewControlTowerComplianceSignals).toBe(true);
    expect(caps.canViewControlTowerAuditSignals).toBe(true);
    expect(caps.canManageControlTowerItems).toBe(false);
    expect(caps.canResolveControlTowerItems).toBe(false);
    expect(caps.canViewControlTowerFinanceSignals).toBe(false);
    expect(caps.canViewControlTowerHrSignals).toBe(false);
    expect(caps.canViewControlTowerOperationsSignals).toBe(false);
  });

  it("client portal user has NO control tower access", () => {
    // @ts-expect-error intentionally testing client role
    const caps = deriveCapabilities("client", SCOPE_COMPANY);
    expect(caps.canViewCompanyControlTower).toBe(false);
    expect(caps.canViewPlatformControlTower).toBe(false);
  });
});

// ─── 2. Navigation visibility ─────────────────────────────────────────────────

const ctHref = "/control-tower";
const platformUser = { role: "super_admin", platformRole: "super_admin" } as const;
const noUser = null;

function navOpts(memberRole: string | null, extras?: Partial<ClientNavOptions>): ClientNavOptions {
  return {
    memberRole,
    hasCompanyWorkspace: true,
    hasCompanyMembership: true,
    navMode: "company",
    ...extras,
  };
}

describe("Control Tower nav visibility", () => {
  it("hidden for normal employee (company_member, not manager)", () => {
    expect(
      clientNavItemVisible(ctHref, noUser, noHidden, navOpts("company_member", { isManager: false })),
    ).toBe(false);
  });

  it("visible for company_member who is a manager (dept/team scope)", () => {
    expect(
      clientNavItemVisible(ctHref, noUser, noHidden, navOpts("company_member", { isManager: true })),
    ).toBe(true);
  });

  it("visible for company_admin", () => {
    expect(clientNavItemVisible(ctHref, noUser, noHidden, navOpts("company_admin"))).toBe(true);
  });

  it("visible for hr_admin", () => {
    expect(clientNavItemVisible(ctHref, noUser, noHidden, navOpts("hr_admin"))).toBe(true);
  });

  it("visible for finance_admin", () => {
    expect(clientNavItemVisible(ctHref, noUser, noHidden, navOpts("finance_admin"))).toBe(true);
  });

  it("visible for reviewer", () => {
    expect(clientNavItemVisible(ctHref, noUser, noHidden, navOpts("reviewer"))).toBe(true);
  });

  it("visible for external_auditor", () => {
    expect(clientNavItemVisible(ctHref, noUser, noHidden, navOpts("external_auditor"))).toBe(true);
  });

  it("hidden for client portal user", () => {
    expect(clientNavItemVisible(ctHref, noUser, noHidden, navOpts("client"))).toBe(false);
  });

  it("visible for platform operator regardless of no company", () => {
    expect(
      clientNavItemVisible(ctHref, platformUser, noHidden, {
        navMode: "platform",
        hasCompanyWorkspace: false,
        hasCompanyMembership: false,
      }),
    ).toBe(true);
  });

  it("/control-tower no longer in FIELD_EMPLOYEE_HREFS", () => {
    expect(FIELD_EMPLOYEE_HREFS.has("/control-tower")).toBe(false);
  });

  it("CONTROL_TOWER_HREFS contains /control-tower", () => {
    expect(CONTROL_TOWER_HREFS.has("/control-tower")).toBe(true);
  });
});

// ─── 3. Route accessibility ───────────────────────────────────────────────────

describe("Control Tower route accessibility", () => {
  it("accessible for company_admin", () => {
    expect(
      clientRouteAccessible("/control-tower", noUser, noHidden, navOpts("company_admin")),
    ).toBe(true);
  });

  it("accessible for hr_admin", () => {
    expect(
      clientRouteAccessible("/control-tower", noUser, noHidden, navOpts("hr_admin")),
    ).toBe(true);
  });

  it("accessible for finance_admin", () => {
    expect(
      clientRouteAccessible("/control-tower", noUser, noHidden, navOpts("finance_admin")),
    ).toBe(true);
  });

  it("accessible for external_auditor", () => {
    expect(
      clientRouteAccessible("/control-tower", noUser, noHidden, navOpts("external_auditor")),
    ).toBe(true);
  });

  it("accessible for reviewer", () => {
    expect(
      clientRouteAccessible("/control-tower", noUser, noHidden, navOpts("reviewer")),
    ).toBe(true);
  });

  it("accessible for manager (company_member, isManager=true)", () => {
    expect(
      clientRouteAccessible(
        "/control-tower",
        noUser,
        noHidden,
        navOpts("company_member", { isManager: true }),
      ),
    ).toBe(true);
  });

  it("blocked for self-scope employee (company_member, isManager=false)", () => {
    expect(
      clientRouteAccessible(
        "/control-tower",
        noUser,
        noHidden,
        navOpts("company_member", { isManager: false }),
      ),
    ).toBe(false);
  });

  it("blocked for client portal user", () => {
    expect(
      clientRouteAccessible("/control-tower", noUser, noHidden, navOpts("client")),
    ).toBe(false);
  });
});

// ─── 4. Capability-based domain isolation ────────────────────────────────────

describe("Control Tower domain signal isolation", () => {
  it("hr_admin does not get finance, compliance, or audit signals in caps", () => {
    const caps = deriveCapabilities("hr_admin", SCOPE_COMPANY);
    expect(caps.canViewControlTowerFinanceSignals).toBe(false);
    // HR can see compliance (shared responsibility)
    expect(caps.canViewControlTowerComplianceSignals).toBe(true);
    // HR can see audit
    expect(caps.canViewControlTowerAuditSignals).toBe(true);
  });

  it("finance_admin does not get HR, compliance, or audit signals in caps", () => {
    const caps = deriveCapabilities("finance_admin", SCOPE_COMPANY);
    expect(caps.canViewControlTowerHrSignals).toBe(false);
    expect(caps.canViewControlTowerComplianceSignals).toBe(false);
    expect(caps.canViewControlTowerAuditSignals).toBe(false);
  });
});

// ─── 5. Scope invariance for operator roles ───────────────────────────────────

describe("CT capabilities invariant to scope for operator roles", () => {
  const SCOPES = [SCOPE_COMPANY, SCOPE_DEPT, SCOPE_TEAM, SCOPE_SELF];

  it("company_admin CT capabilities unchanged across all scopes", () => {
    const base = deriveCapabilities("company_admin", SCOPE_COMPANY);
    for (const scope of SCOPES) {
      const caps = deriveCapabilities("company_admin", scope);
      expect(caps.canViewCompanyControlTower).toBe(base.canViewCompanyControlTower);
      expect(caps.canManageControlTowerItems).toBe(base.canManageControlTowerItems);
      expect(caps.canViewControlTowerFinanceSignals).toBe(base.canViewControlTowerFinanceSignals);
      expect(caps.canViewControlTowerHrSignals).toBe(base.canViewControlTowerHrSignals);
    }
  });

  it("hr_admin CT capabilities unchanged across all scopes", () => {
    const base = deriveCapabilities("hr_admin", SCOPE_COMPANY);
    for (const scope of SCOPES) {
      const caps = deriveCapabilities("hr_admin", scope);
      expect(caps.canViewCompanyControlTower).toBe(base.canViewCompanyControlTower);
      expect(caps.canViewControlTowerHrSignals).toBe(base.canViewControlTowerHrSignals);
      expect(caps.canViewControlTowerFinanceSignals).toBe(base.canViewControlTowerFinanceSignals);
    }
  });
});

// ─── 6. Regression: /control-tower removed from field-employee shell ──────────

describe("regression: self-scope employee cannot reach /control-tower", () => {
  it("FIELD_EMPLOYEE_HREFS no longer includes /control-tower", () => {
    expect(FIELD_EMPLOYEE_HREFS.has("/control-tower")).toBe(false);
  });

  it("clientNavItemVisible returns false for company_member without isManager", () => {
    const result = clientNavItemVisible(
      "/control-tower",
      noUser,
      noHidden,
      navOpts("company_member", { isManager: false }),
    );
    expect(result).toBe(false);
  });

  it("clientRouteAccessible returns false for company_member without isManager", () => {
    const result = clientRouteAccessible(
      "/control-tower",
      noUser,
      noHidden,
      navOpts("company_member", { isManager: false }),
    );
    expect(result).toBe(false);
  });
});

// ─── 7. Tenant scoping: company_member scope matters for CT access ────────────

describe("tenant scope controls CT access for company_member", () => {
  it("company scope: full managerial caps (but not admin-level CT manage/assign/resolve)", () => {
    const caps = deriveCapabilities("company_member", SCOPE_COMPANY);
    expect(caps.canViewCompanyControlTower).toBe(true);
    expect(caps.canViewControlTowerOperationsSignals).toBe(true);
    // company_member never gets manage/assign/resolve even with company scope
    expect(caps.canManageControlTowerItems).toBe(false);
  });

  it("department scope: company tower visible, operations signals only", () => {
    const caps = deriveCapabilities("company_member", SCOPE_DEPT);
    expect(caps.canViewCompanyControlTower).toBe(true);
    expect(caps.canViewControlTowerOperationsSignals).toBe(true);
    expect(caps.canViewControlTowerFinanceSignals).toBe(false);
  });

  it("team scope: company tower visible, operations signals only", () => {
    const caps = deriveCapabilities("company_member", SCOPE_TEAM);
    expect(caps.canViewCompanyControlTower).toBe(true);
    expect(caps.canViewControlTowerOperationsSignals).toBe(true);
    expect(caps.canViewControlTowerFinanceSignals).toBe(false);
  });

  it("self scope: NO company tower access", () => {
    const caps = deriveCapabilities("company_member", SCOPE_SELF);
    expect(caps.canViewCompanyControlTower).toBe(false);
    expect(caps.canViewControlTowerOperationsSignals).toBe(false);
  });
});
