import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  assertContractReadable,
  assertQuotationTenantAccess,
  assertRowBelongsToActiveCompany,
  normalizeEmail,
  requireActiveCompanyId,
  resolvePlatformOrCompanyScope,
  resolveStatsCompanyFilter,
} from "./_core/tenant";
import * as db from "./db";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getUserCompany: vi.fn(),
    getUserCompanies: vi.fn(),
    getUserCompanyById: vi.fn(),
    getDb: vi.fn(),
    getContractById: vi.fn(),
  };
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  User@Example.COM ")).toBe("user@example.com");
  });
});

describe("requireActiveCompanyId", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
  });

  it("throws FORBIDDEN when user has no company", async () => {
    vi.mocked(db.getUserCompanies).mockResolvedValue([]);
    await expect(requireActiveCompanyId(1)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns active company id when user has exactly one membership", async () => {
    vi.mocked(db.getUserCompanies).mockResolvedValue([{ company: { id: 7 }, member: {} }] as any);
    await expect(requireActiveCompanyId(2)).resolves.toBe(7);
  });

  it("throws BAD_REQUEST when user has multiple memberships and companyId is omitted", async () => {
    vi.mocked(db.getUserCompanies).mockResolvedValue([
      { company: { id: 1 }, member: {} },
      { company: { id: 2 }, member: {} },
    ] as any);
    await expect(requireActiveCompanyId(10)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("resolves to explicit companyId via membership lookup when user has multiple companies", async () => {
    vi.mocked(db.getUserCompanyById).mockResolvedValue({ company: { id: 2 }, member: {} } as any);
    await expect(requireActiveCompanyId(10, 2)).resolves.toBe(2);
    expect(db.getUserCompanyById).toHaveBeenCalledWith(10, 2);
    expect(db.getUserCompanies).not.toHaveBeenCalled();
  });

  it("does not let super_admin implicit workspace skip multi-membership disambiguation", async () => {
    vi.mocked(db.getUserCompanies).mockResolvedValue([
      { company: { id: 10 }, member: {} },
      { company: { id: 20 }, member: {} },
    ] as any);
    const superAdmin = { id: 1, role: "user" as const, platformRole: "super_admin" as const };
    await expect(requireActiveCompanyId(1, undefined, superAdmin as any)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("assertRowBelongsToActiveCompany", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompany).mockReset();
    vi.mocked(db.getUserCompanies).mockReset();
  });

  const memberUser = { id: 1, role: "user" as const, platformRole: "company_member" as const };

  it("throws NOT_FOUND when row company differs from membership", async () => {
    vi.mocked(db.getUserCompanies).mockResolvedValue([{ company: { id: 1 }, member: {} }] as any);
    await expect(assertRowBelongsToActiveCompany(memberUser as any, 2, "Row")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("allows when companies match", async () => {
    vi.mocked(db.getUserCompanies).mockResolvedValue([{ company: { id: 3 }, member: {} }] as any);
    await expect(assertRowBelongsToActiveCompany(memberUser as any, 3, "Row")).resolves.toBeUndefined();
  });

  it("platform super_admin bypasses tenant check", async () => {
    const admin = { id: 1, role: "user" as const, platformRole: "super_admin" as const };
    await expect(assertRowBelongsToActiveCompany(admin as any, 999, "Row")).resolves.toBeUndefined();
    expect(db.getUserCompanies).not.toHaveBeenCalled();
  });
});

describe("assertQuotationTenantAccess", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompany).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
  });

  const memberUser = { id: 10, role: "user" as const, platformRole: "company_member" as const };

  it("allows creator when companyId is null", async () => {
    await expect(
      assertQuotationTenantAccess(memberUser as any, { companyId: null, createdBy: 10 }),
    ).resolves.toBeUndefined();
  });

  it("rejects other users when companyId is null", async () => {
    await expect(
      assertQuotationTenantAccess(memberUser as any, { companyId: null, createdBy: 99 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("uses company membership when companyId is set", async () => {
    vi.mocked(db.getUserCompanyById).mockResolvedValue({ company: { id: 4 }, member: {} } as any);
    await expect(
      assertQuotationTenantAccess(memberUser as any, { companyId: 4, createdBy: 99 }),
    ).resolves.toBeUndefined();
  });
});

describe("resolveStatsCompanyFilter", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
  });

  const memberUser = { id: 10, role: "user" as const, platformRole: "company_member" as const };

  it("throws FORBIDDEN when non-platform user has no company", async () => {
    vi.mocked(db.getUserCompanies).mockResolvedValue([]);
    await expect(resolveStatsCompanyFilter(memberUser as any, undefined)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("returns scoped company for tenant user", async () => {
    vi.mocked(db.getUserCompanies).mockResolvedValue([{ company: { id: 5 }, member: {} }] as any);
    await expect(resolveStatsCompanyFilter(memberUser as any, undefined)).resolves.toEqual({
      aggregateAllTenants: false,
      companyId: 5,
    });
  });

  it("throws FORBIDDEN when tenant passes another company id", async () => {
    vi.mocked(db.getUserCompanyById).mockResolvedValue(null);
    await expect(resolveStatsCompanyFilter(memberUser as any, 99)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws BAD_REQUEST when tenant has multiple companies and companyId is omitted", async () => {
    vi.mocked(db.getUserCompanies).mockResolvedValue([
      { company: { id: 1 }, member: {} },
      { company: { id: 2 }, member: {} },
    ] as any);
    await expect(resolveStatsCompanyFilter(memberUser as any, undefined)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("assertContractReadable", () => {
  beforeEach(() => {
    vi.mocked(db.getContractById).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
    vi.mocked(db.getUserCompany).mockReset();
    vi.mocked(db.getDb).mockReset();
  });

  const tenantUser = {
    id: 7,
    role: "user" as const,
    platformRole: "company_member" as const,
    email: "signer@co.com",
  };

  it("allows member of the contract owning company via explicit company membership lookup", async () => {
    vi.mocked(db.getContractById).mockResolvedValue({ companyId: 42, id: 1 } as any);
    vi.mocked(db.getUserCompanyById).mockResolvedValue({
      company: { id: 42 },
      member: {},
    } as any);
    await expect(assertContractReadable(tenantUser as any, 1)).resolves.toBeUndefined();
    expect(db.getUserCompanyById).toHaveBeenCalledWith(7, 42);
    expect(db.getUserCompany).not.toHaveBeenCalled();
    expect(db.getDb).not.toHaveBeenCalled();
  });

  it("allows invited signer by email when not a company member", async () => {
    vi.mocked(db.getContractById).mockResolvedValue({ companyId: 42, id: 99 } as any);
    vi.mocked(db.getUserCompanyById).mockResolvedValue(null);
    vi.mocked(db.getDb).mockResolvedValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([{ signerEmail: "Signer@co.com" }])),
        })),
      })),
    } as any);
    await expect(assertContractReadable(tenantUser as any, 99)).resolves.toBeUndefined();
  });

  it("denies when not a member and signer email does not match", async () => {
    vi.mocked(db.getContractById).mockResolvedValue({ companyId: 42, id: 3 } as any);
    vi.mocked(db.getUserCompanyById).mockResolvedValue(null);
    vi.mocked(db.getDb).mockResolvedValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([{ signerEmail: "other@else.com" }])),
        })),
      })),
    } as any);
    await expect(assertContractReadable(tenantUser as any, 3)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("allows platform super_admin without membership checks", async () => {
    vi.mocked(db.getContractById).mockResolvedValue({ companyId: 1, id: 5 } as any);
    const admin = { id: 1, role: "user" as const, platformRole: "super_admin" as const, email: "a@b.c" };
    await expect(assertContractReadable(admin as any, 5)).resolves.toBeUndefined();
    expect(db.getUserCompanyById).not.toHaveBeenCalled();
  });
});

describe("resolvePlatformOrCompanyScope", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
  });

  const memberUser = { id: 10, role: "user" as const, platformRole: "company_member" as const };
  const superAdmin = { id: 1, role: "user" as const, platformRole: "super_admin" as const };

  it("returns null for platform super_admin", async () => {
    await expect(resolvePlatformOrCompanyScope(superAdmin as any)).resolves.toBeNull();
    expect(db.getUserCompanies).not.toHaveBeenCalled();
  });

  it("returns company id for member", async () => {
    vi.mocked(db.getUserCompanies).mockResolvedValue([{ company: { id: 8 }, member: {} }] as any);
    await expect(resolvePlatformOrCompanyScope(memberUser as any)).resolves.toBe(8);
  });
});
