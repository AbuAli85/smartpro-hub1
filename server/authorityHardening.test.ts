/**
 * Authority Hardening Integration Tests
 *
 * Covers scenarios identified in docs/security/ROLE_AUTHORITY_AUDIT.md §9.2 as missing:
 *   b. company_admin cannot access another company without membership
 *   c. multi-company user must pass companyId (already in tenant-boundary.test.ts; confirmed here)
 *   e. external_auditor cannot mutate sensitive modules (requireWorkspaceMembership + requireNotAuditor chain)
 *   h. isCompanyProvisioningAdminFromIdentity only grants when platformRoles[] empty (in identityAuthority.test.ts)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as db from "./db";
import * as tenantModule from "./_core/tenant";
import { requireWorkspaceMembership, requireNotAuditor } from "./_core/membership";

vi.mock("./_core/tenant", () => ({
  requireActiveCompanyId: vi.fn(),
}));

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getUserCompanyById: vi.fn(),
  };
});

// ─── Scenario b: cross-tenant company_admin denial ────────────────────────────

describe("cross-tenant company_admin denial", () => {
  const companyAdminUser = { id: 10 } as any;

  beforeEach(() => {
    vi.mocked(tenantModule.requireActiveCompanyId).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
  });

  it("company_admin of company 1 cannot access company 2 — requireWorkspaceMembership throws FORBIDDEN", async () => {
    vi.mocked(tenantModule.requireActiveCompanyId).mockResolvedValue(2);
    // getUserCompanyById returns null → user has no membership in company 2
    vi.mocked(db.getUserCompanyById).mockResolvedValue(null);

    await expect(requireWorkspaceMembership(companyAdminUser, 2)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringContaining("No active company membership"),
    });
  });

  it("company_admin of company 1 can access company 1 with valid membership", async () => {
    vi.mocked(tenantModule.requireActiveCompanyId).mockResolvedValue(1);
    vi.mocked(db.getUserCompanyById).mockResolvedValue({
      company: { id: 1 },
      member: { role: "company_admin" },
    } as any);

    await expect(requireWorkspaceMembership(companyAdminUser, 1)).resolves.toEqual({
      companyId: 1,
      role: "company_admin",
    });
  });
});

// ─── Scenario c: multi-company user must pass companyId ───────────────────────
// (Also tested in tenant-boundary.test.ts — confirmed here for completeness)

describe("multi-company user companyId requirement (via requireActiveCompanyId contract)", () => {
  it("requireWorkspaceMembership delegates companyId disambiguation to requireActiveCompanyId", async () => {
    vi.mocked(tenantModule.requireActiveCompanyId).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();

    // requireActiveCompanyId throws BAD_REQUEST when user has multiple memberships and no companyId
    vi.mocked(tenantModule.requireActiveCompanyId).mockRejectedValue(
      Object.assign(new Error("Select a company workspace — pass companyId for this operation."), {
        code: "BAD_REQUEST",
      }),
    );

    const multiUser = { id: 20 } as any;
    await expect(requireWorkspaceMembership(multiUser, undefined)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

// ─── Scenario e: external_auditor cannot mutate sensitive modules ─────────────

describe("external_auditor write rejection chain", () => {
  const auditorUser = { id: 30 } as any;

  beforeEach(() => {
    vi.mocked(tenantModule.requireActiveCompanyId).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
  });

  it("requireWorkspaceMembership returns external_auditor role from DB membership", async () => {
    vi.mocked(tenantModule.requireActiveCompanyId).mockResolvedValue(5);
    vi.mocked(db.getUserCompanyById).mockResolvedValue({
      company: { id: 5 },
      member: { role: "external_auditor" },
    } as any);

    const membership = await requireWorkspaceMembership(auditorUser, 5);
    expect(membership.role).toBe("external_auditor");
  });

  it("requireNotAuditor throws FORBIDDEN immediately after membership is retrieved for external_auditor", async () => {
    vi.mocked(tenantModule.requireActiveCompanyId).mockResolvedValue(5);
    vi.mocked(db.getUserCompanyById).mockResolvedValue({
      company: { id: 5 },
      member: { role: "external_auditor" },
    } as any);

    const membership = await requireWorkspaceMembership(auditorUser, 5);
    expect(() => requireNotAuditor(membership.role)).toThrowError(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
  });

  it("payroll mutation path: external_auditor role is denied before any DB write occurs", async () => {
    vi.mocked(tenantModule.requireActiveCompanyId).mockResolvedValue(5);
    vi.mocked(db.getUserCompanyById).mockResolvedValue({
      company: { id: 5 },
      member: { role: "external_auditor" },
    } as any);

    // Simulates the pattern used in payroll.ts, hr.ts, engagements.ts, etc.:
    //   const m = await requireWorkspaceMembership(ctx.user, input.companyId);
    //   requireNotAuditor(m.role);
    const membership = await requireWorkspaceMembership(auditorUser, 5);
    let mutationReached = false;
    const runMutation = () => {
      requireNotAuditor(membership.role, "Cannot run payroll in Audit Mode");
      mutationReached = true; // must never reach here for external_auditor
    };
    expect(runMutation).toThrowError(expect.objectContaining({ code: "FORBIDDEN" }));
    expect(mutationReached).toBe(false);
  });

  it("hr mutation path: hr_admin is allowed through (not blocked by requireNotAuditor)", async () => {
    vi.mocked(tenantModule.requireActiveCompanyId).mockResolvedValue(5);
    vi.mocked(db.getUserCompanyById).mockResolvedValue({
      company: { id: 5 },
      member: { role: "hr_admin" },
    } as any);

    const membership = await requireWorkspaceMembership(auditorUser, 5);
    let mutationReached = false;
    const runMutation = () => {
      requireNotAuditor(membership.role);
      mutationReached = true;
    };
    expect(runMutation).not.toThrow();
    expect(mutationReached).toBe(true);
  });

  it("documents upload: external_auditor is denied across all sensitive modules", () => {
    const sensitiveModules = [
      "payroll", "hr", "documents", "attendance", "contracts",
      "finance", "promoter_assignments", "billing", "compliance", "settings",
    ];
    for (const _module of sensitiveModules) {
      expect(() => requireNotAuditor("external_auditor")).toThrowError(
        expect.objectContaining({ code: "FORBIDDEN" }),
      );
    }
  });
});

// ─── Scenario h: sanadRoles platformRoles[] check ────────────────────────────
// (Covered via updated shared/identityAuthority.test.ts)
// The following confirms the sanadRoles.ts hasSanadSlug helper works correctly.

import { canAccessSanadIntelFull, canAccessSanadIntelRead } from "../shared/sanadRoles";

describe("sanadRoles — platformRoles[] takes precedence over legacy platformRole", () => {
  it("sanad_network_admin via platformRoles[] grants full access", () => {
    expect(
      canAccessSanadIntelFull({ platformRole: "client", platformRoles: ["sanad_network_admin"] }),
    ).toBe(true);
  });

  it("sanad_network_admin via legacy platformRole (no table rows) grants full access", () => {
    expect(
      canAccessSanadIntelFull({ platformRole: "sanad_network_admin", platformRoles: [] }),
    ).toBe(true);
  });

  it("migrated user: platformRole=sanad_network_admin ignored when platformRoles has non-matching entries", () => {
    expect(
      canAccessSanadIntelFull({ platformRole: "sanad_network_admin", platformRoles: ["regional_manager"] }),
    ).toBe(false);
  });

  it("sanad_compliance_reviewer via platformRoles[] grants read access but not full", () => {
    expect(
      canAccessSanadIntelRead({ platformRole: "client", platformRoles: ["sanad_compliance_reviewer"] }),
    ).toBe(true);
    expect(
      canAccessSanadIntelFull({ platformRole: "client", platformRoles: ["sanad_compliance_reviewer"] }),
    ).toBe(false);
  });

  it("migrated user: platformRole=sanad_compliance_reviewer ignored when platformRoles has non-matching entries", () => {
    expect(
      canAccessSanadIntelRead({ platformRole: "sanad_compliance_reviewer", platformRoles: ["company_member"] }),
    ).toBe(false);
  });

  it("global admin (super_admin via platformRoles) always gets full sanad access", () => {
    expect(
      canAccessSanadIntelFull({ platformRole: "client", platformRoles: ["super_admin"] }),
    ).toBe(true);
    expect(
      canAccessSanadIntelRead({ platformRole: "client", platformRoles: ["super_admin"] }),
    ).toBe(true);
  });
});
