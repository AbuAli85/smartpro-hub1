/**
 * RBAC Unit Tests — Core Policy Layer (server/_core/policy.ts)
 *
 * Tests the four centralised policy gates:
 *   requireCompanyAdmin    → company_admin only
 *   requireHrOrAdmin       → company_admin | hr_admin
 *   requireFinanceOrAdmin  → company_admin | finance_admin
 *   requireAnyOperatorRole → company_admin | hr_admin | finance_admin
 *
 * Each gate is tested for:
 *  1. Allowed roles succeed
 *  2. Disallowed roles get FORBIDDEN
 *  3. Cross-tenant access fails (getUserCompanyById returns null)
 *  4. Platform-admin bypass works (platformRoles contains platform_admin/super_admin)
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  requireCompanyAdmin,
  requireHrOrAdmin,
  requireFinanceOrAdmin,
  requireAnyOperatorRole,
} from "../_core/policy";
import * as db from "../db";

vi.mock("../db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db")>();
  return {
    ...actual,
    getUserCompanies: vi.fn(),
    getUserCompanyById: vi.fn(),
  };
});

/** Build a minimal SessionUser-like object for tests. */
function makeUser(overrides: Record<string, unknown> = {}): any {
  return {
    id: 1,
    openId: "u1",
    email: "u@test.om",
    name: "Test User",
    displayName: "Test User",
    loginMethod: "manus",
    role: "user",
    platformRole: "company_member",
    isActive: true,
    twoFactorEnabled: false,
    platformRoles: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    accountStatus: "active",
    ...overrides,
  };
}

/** Mock a single-company membership for the given role. */
function mockMembership(companyId: number, role: string) {
  vi.mocked(db.getUserCompanyById).mockResolvedValue({
    company: { id: companyId },
    member: { role },
  } as any);
  vi.mocked(db.getUserCompanies).mockResolvedValue([
    { company: { id: companyId }, member: { role } },
  ] as any);
}

/** Mock cross-tenant: getUserCompanyById returns null for the requested company. */
function mockCrossTenantMembership(userCompanyId: number, requestedCompanyId: number, role: string) {
  vi.mocked(db.getUserCompanyById).mockImplementation(async (_userId: number, cid: number) => {
    if (cid === requestedCompanyId) return null as any;
    return { company: { id: userCompanyId }, member: { role } } as any;
  });
  vi.mocked(db.getUserCompanies).mockResolvedValue([
    { company: { id: userCompanyId }, member: { role } },
  ] as any);
}

beforeEach(() => {
  vi.mocked(db.getUserCompanyById).mockReset();
  vi.mocked(db.getUserCompanies).mockReset();
});

// ─── requireCompanyAdmin ──────────────────────────────────────────────────────

describe("requireCompanyAdmin", () => {
  it("allows company_admin", async () => {
    mockMembership(1, "company_admin");
    const result = await requireCompanyAdmin(makeUser(), 1);
    expect(result.companyId).toBe(1);
    expect(result.role).toBe("company_admin");
  });

  it("blocks hr_admin with FORBIDDEN", async () => {
    mockMembership(1, "hr_admin");
    await expect(requireCompanyAdmin(makeUser(), 1)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks finance_admin with FORBIDDEN", async () => {
    mockMembership(1, "finance_admin");
    await expect(requireCompanyAdmin(makeUser(), 1)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks company_member with FORBIDDEN", async () => {
    mockMembership(1, "company_member");
    await expect(requireCompanyAdmin(makeUser(), 1)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks reviewer with FORBIDDEN", async () => {
    mockMembership(1, "reviewer");
    await expect(requireCompanyAdmin(makeUser(), 1)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks external_auditor with FORBIDDEN", async () => {
    mockMembership(1, "external_auditor");
    await expect(requireCompanyAdmin(makeUser(), 1)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks client role with FORBIDDEN", async () => {
    mockMembership(1, "client");
    await expect(requireCompanyAdmin(makeUser(), 1)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks cross-tenant access with FORBIDDEN", async () => {
    mockCrossTenantMembership(1, 99, "company_admin");
    await expect(requireCompanyAdmin(makeUser(), 99)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("platform_admin bypasses tenant role check", async () => {
    // Even though the DB membership shows company_member, platform_admin bypasses
    mockMembership(1, "company_member");
    const platformAdmin = makeUser({ platformRoles: ["platform_admin"] });
    const result = await requireCompanyAdmin(platformAdmin, 1);
    expect(result.companyId).toBe(1);
    // Platform admin always gets company_admin role back from requireTenantRole
    expect(result.role).toBe("company_admin");
  });

  it("super_admin bypasses tenant role check", async () => {
    mockMembership(2, "reviewer");
    const superAdmin = makeUser({ platformRoles: ["super_admin"] });
    const result = await requireCompanyAdmin(superAdmin, 2);
    expect(result.companyId).toBe(2);
    expect(result.role).toBe("company_admin");
  });
});

// ─── requireHrOrAdmin ─────────────────────────────────────────────────────────

describe("requireHrOrAdmin", () => {
  it("allows company_admin", async () => {
    mockMembership(1, "company_admin");
    const result = await requireHrOrAdmin(makeUser(), 1);
    expect(result.companyId).toBe(1);
    expect(result.role).toBe("company_admin");
  });

  it("allows hr_admin", async () => {
    mockMembership(1, "hr_admin");
    const result = await requireHrOrAdmin(makeUser(), 1);
    expect(result.companyId).toBe(1);
    expect(result.role).toBe("hr_admin");
  });

  it("blocks finance_admin with FORBIDDEN", async () => {
    mockMembership(1, "finance_admin");
    await expect(requireHrOrAdmin(makeUser(), 1)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks company_member with FORBIDDEN", async () => {
    mockMembership(1, "company_member");
    await expect(requireHrOrAdmin(makeUser(), 1)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks reviewer with FORBIDDEN", async () => {
    mockMembership(1, "reviewer");
    await expect(requireHrOrAdmin(makeUser(), 1)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks external_auditor with FORBIDDEN", async () => {
    mockMembership(1, "external_auditor");
    await expect(requireHrOrAdmin(makeUser(), 1)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks client role with FORBIDDEN", async () => {
    mockMembership(1, "client");
    await expect(requireHrOrAdmin(makeUser(), 1)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks cross-tenant access with FORBIDDEN", async () => {
    mockCrossTenantMembership(1, 99, "hr_admin");
    await expect(requireHrOrAdmin(makeUser(), 99)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("platform_admin bypasses tenant role check", async () => {
    mockMembership(1, "company_member");
    const platformAdmin = makeUser({ platformRoles: ["platform_admin"] });
    const result = await requireHrOrAdmin(platformAdmin, 1);
    expect(result.companyId).toBe(1);
    expect(result.role).toBe("company_admin");
  });

  it("super_admin bypasses tenant role check", async () => {
    mockMembership(3, "reviewer");
    const superAdmin = makeUser({ platformRoles: ["super_admin"] });
    const result = await requireHrOrAdmin(superAdmin, 3);
    expect(result.companyId).toBe(3);
  });
});

// ─── requireFinanceOrAdmin ────────────────────────────────────────────────────

describe("requireFinanceOrAdmin", () => {
  it("allows company_admin", async () => {
    mockMembership(1, "company_admin");
    const result = await requireFinanceOrAdmin(makeUser(), 1);
    expect(result.companyId).toBe(1);
    expect(result.role).toBe("company_admin");
  });

  it("allows finance_admin", async () => {
    mockMembership(1, "finance_admin");
    const result = await requireFinanceOrAdmin(makeUser(), 1);
    expect(result.companyId).toBe(1);
    expect(result.role).toBe("finance_admin");
  });

  it("blocks hr_admin with FORBIDDEN", async () => {
    mockMembership(1, "hr_admin");
    await expect(requireFinanceOrAdmin(makeUser(), 1)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks company_member with FORBIDDEN", async () => {
    mockMembership(1, "company_member");
    await expect(requireFinanceOrAdmin(makeUser(), 1)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks reviewer with FORBIDDEN", async () => {
    mockMembership(1, "reviewer");
    await expect(requireFinanceOrAdmin(makeUser(), 1)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks external_auditor with FORBIDDEN", async () => {
    mockMembership(1, "external_auditor");
    await expect(requireFinanceOrAdmin(makeUser(), 1)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks client role with FORBIDDEN", async () => {
    mockMembership(1, "client");
    await expect(requireFinanceOrAdmin(makeUser(), 1)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks cross-tenant access with FORBIDDEN", async () => {
    mockCrossTenantMembership(1, 99, "finance_admin");
    await expect(requireFinanceOrAdmin(makeUser(), 99)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("platform_admin bypasses tenant role check", async () => {
    mockMembership(5, "company_member");
    const platformAdmin = makeUser({ platformRoles: ["platform_admin"] });
    const result = await requireFinanceOrAdmin(platformAdmin, 5);
    expect(result.companyId).toBe(5);
    expect(result.role).toBe("company_admin");
  });

  it("super_admin bypasses tenant role check", async () => {
    mockMembership(6, "reviewer");
    const superAdmin = makeUser({ platformRoles: ["super_admin"] });
    const result = await requireFinanceOrAdmin(superAdmin, 6);
    expect(result.companyId).toBe(6);
  });
});

// ─── requireAnyOperatorRole ───────────────────────────────────────────────────

describe("requireAnyOperatorRole", () => {
  it("allows company_admin", async () => {
    mockMembership(1, "company_admin");
    const result = await requireAnyOperatorRole(makeUser(), 1);
    expect(result.companyId).toBe(1);
    expect(result.role).toBe("company_admin");
  });

  it("allows hr_admin", async () => {
    mockMembership(1, "hr_admin");
    const result = await requireAnyOperatorRole(makeUser(), 1);
    expect(result.companyId).toBe(1);
    expect(result.role).toBe("hr_admin");
  });

  it("allows finance_admin", async () => {
    mockMembership(1, "finance_admin");
    const result = await requireAnyOperatorRole(makeUser(), 1);
    expect(result.companyId).toBe(1);
    expect(result.role).toBe("finance_admin");
  });

  it("blocks company_member with FORBIDDEN", async () => {
    mockMembership(1, "company_member");
    await expect(requireAnyOperatorRole(makeUser(), 1)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks reviewer with FORBIDDEN", async () => {
    mockMembership(1, "reviewer");
    await expect(requireAnyOperatorRole(makeUser(), 1)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks external_auditor with FORBIDDEN", async () => {
    mockMembership(1, "external_auditor");
    await expect(requireAnyOperatorRole(makeUser(), 1)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks client role with FORBIDDEN", async () => {
    mockMembership(1, "client");
    await expect(requireAnyOperatorRole(makeUser(), 1)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks cross-tenant access with FORBIDDEN", async () => {
    mockCrossTenantMembership(1, 99, "company_admin");
    await expect(requireAnyOperatorRole(makeUser(), 99)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("platform_admin bypasses tenant role check", async () => {
    mockMembership(3, "company_member");
    const platformAdmin = makeUser({ platformRoles: ["platform_admin"] });
    const result = await requireAnyOperatorRole(platformAdmin, 3);
    expect(result.companyId).toBe(3);
    expect(result.role).toBe("company_admin");
  });

  it("super_admin bypasses tenant role check", async () => {
    mockMembership(4, "reviewer");
    const superAdmin = makeUser({ platformRoles: ["super_admin"] });
    const result = await requireAnyOperatorRole(superAdmin, 4);
    expect(result.companyId).toBe(4);
  });
});
