import { describe, it, expect } from "vitest";
import {
  deriveAccountType,
  deriveEffectiveAccess,
  deriveScope,
  deriveEdgeCaseWarning,
  deriveBestMemberRole,
} from "../shared/roleHelpers";

// ─── deriveAccountType ────────────────────────────────────────────────────────
describe("deriveAccountType", () => {
  it("returns platform_staff for super_admin", () => {
    expect(deriveAccountType("super_admin")).toBe("platform_staff");
  });
  it("returns platform_staff for platform_admin", () => {
    expect(deriveAccountType("platform_admin")).toBe("platform_staff");
  });
  it("returns platform_staff for regional_manager", () => {
    expect(deriveAccountType("regional_manager")).toBe("platform_staff");
  });
  it("returns business_user for company_admin", () => {
    expect(deriveAccountType("company_admin")).toBe("business_user");
  });
  it("returns business_user for hr_admin", () => {
    expect(deriveAccountType("hr_admin")).toBe("business_user");
  });
  it("returns business_user for finance_admin", () => {
    expect(deriveAccountType("finance_admin")).toBe("business_user");
  });
  it("returns customer for client", () => {
    expect(deriveAccountType("client")).toBe("customer");
  });
  it("returns auditor for external_auditor", () => {
    expect(deriveAccountType("external_auditor")).toBe("auditor");
  });
  it("returns needs_review for null", () => {
    expect(deriveAccountType(null)).toBe("needs_review");
  });
  it("returns needs_review for unknown role", () => {
    expect(deriveAccountType("totally_unknown_role")).toBe("needs_review");
  });
});

// ─── deriveEffectiveAccess ────────────────────────────────────────────────────
describe("deriveEffectiveAccess", () => {
  it("returns Super Administrator for super_admin", () => {
    expect(deriveEffectiveAccess("super_admin", null, [])).toBe("Super Admin");
  });
  it("returns Company Administrator for company_admin", () => {
    expect(deriveEffectiveAccess("company_admin", "company_admin", ["company_admin"])).toBe("Company Admin");
  });
  it("returns HR Manager for hr_admin", () => {
    expect(deriveEffectiveAccess("hr_admin", "hr_admin", ["hr_admin"])).toBe("HR Manager");
  });
  it("returns Portal User for client with no memberships", () => {
    expect(deriveEffectiveAccess("client", null, [])).toBe("Customer Portal");
  });
  it("returns External Auditor for external_auditor", () => {
    expect(deriveEffectiveAccess("external_auditor", "external_auditor", ["external_auditor"])).toBe("External Auditor");
  });
  it("returns Unknown Role for null platformRole", () => {
    expect(deriveEffectiveAccess(null, null, [])).toBe("No Assigned Access");
  });
});

// ─── deriveScope ─────────────────────────────────────────────────────────────
describe("deriveScope", () => {
  it("returns All companies for platform_staff", () => {
    expect(deriveScope("platform_staff", [], "super_admin")).toBe("All companies");
  });
  it("returns No company for business_user with no memberships", () => {
    expect(deriveScope("business_user", [], "hr_admin")).toBe("No company");
  });
  it("returns company name for single membership", () => {
    const memberships = [{ companyId: 1, companyName: "Acme Corp" }];
    expect(deriveScope("business_user", memberships, "hr_admin")).toBe("Acme Corp");
  });
  it("returns N companies for multiple memberships", () => {
    const memberships = [
      { companyId: 1, companyName: "Acme Corp" },
      { companyId: 2, companyName: "Beta Ltd" },
    ];
    expect(deriveScope("business_user", memberships, "hr_admin")).toBe("2 companies");
  });
  it("returns No company for customer with no memberships", () => {
    expect(deriveScope("customer", [], "client")).toBe("No company");
  });
  it("returns Read-only scope for auditor with no memberships", () => {
    expect(deriveScope("auditor", [], "external_auditor")).toBe("Read-only scope");
  });
});

// ─── deriveEdgeCaseWarning ────────────────────────────────────────────────────
describe("deriveEdgeCaseWarning", () => {
  it("returns null for valid platform_staff with no memberships", () => {
    expect(deriveEdgeCaseWarning("super_admin", [])).toBeNull();
  });
  it("returns null for valid business_user with memberships", () => {
    expect(deriveEdgeCaseWarning("company_admin", ["company_admin"])).toBeNull();
  });
  it("returns business_role_no_membership for hr_admin with no memberships", () => {
    expect(deriveEdgeCaseWarning("hr_admin", [])).toBe("business_role_no_membership");
  });
  it("returns client_has_membership for client with active memberships", () => {
    expect(deriveEdgeCaseWarning("client", ["company_member"])).toBe("client_has_membership");
  });
  it("returns unknown_role for null platformRole", () => {
    expect(deriveEdgeCaseWarning(null, [])).toBe("unknown_role");
  });
  it("returns unknown_role for empty string platformRole", () => {
    expect(deriveEdgeCaseWarning("", [])).toBe("unknown_role");
  });
  it("returns null for external_auditor with no memberships", () => {
    expect(deriveEdgeCaseWarning("external_auditor", [])).toBeNull();
  });
});

// ─── deriveBestMemberRole ─────────────────────────────────────────────────────
describe("deriveBestMemberRole", () => {
  it("returns null for empty roles", () => {
    expect(deriveBestMemberRole([])).toBeNull();
  });
  it("returns company_admin as highest role", () => {
    expect(deriveBestMemberRole(["company_member", "company_admin", "reviewer"])).toBe("company_admin");
  });
  it("returns hr_admin over company_member", () => {
    expect(deriveBestMemberRole(["company_member", "hr_admin"])).toBe("hr_admin");
  });
  it("returns finance_admin over reviewer", () => {
    expect(deriveBestMemberRole(["reviewer", "finance_admin"])).toBe("finance_admin");
  });
  it("returns single role when only one provided", () => {
    expect(deriveBestMemberRole(["reviewer"])).toBe("reviewer");
  });
});
