import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  assertQuotationTenantAccess,
  assertRowBelongsToActiveCompany,
  normalizeEmail,
  requireActiveCompanyId,
} from "./_core/tenant";
import * as db from "./db";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getUserCompany: vi.fn(),
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
    vi.mocked(db.getUserCompany).mockReset();
  });

  it("throws FORBIDDEN when user has no company", async () => {
    vi.mocked(db.getUserCompany).mockResolvedValue(null);
    await expect(requireActiveCompanyId(1)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns active company id", async () => {
    vi.mocked(db.getUserCompany).mockResolvedValue({ company: { id: 7 }, member: {} } as any);
    await expect(requireActiveCompanyId(2)).resolves.toBe(7);
  });
});

describe("assertRowBelongsToActiveCompany", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompany).mockReset();
  });

  const memberUser = { id: 1, role: "user" as const, platformRole: "company_member" as const };

  it("throws NOT_FOUND when row company differs from membership", async () => {
    vi.mocked(db.getUserCompany).mockResolvedValue({ company: { id: 1 }, member: {} } as any);
    await expect(assertRowBelongsToActiveCompany(memberUser as any, 2, "Row")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("allows when companies match", async () => {
    vi.mocked(db.getUserCompany).mockResolvedValue({ company: { id: 3 }, member: {} } as any);
    await expect(assertRowBelongsToActiveCompany(memberUser as any, 3, "Row")).resolves.toBeUndefined();
  });

  it("platform super_admin bypasses tenant check", async () => {
    const admin = { id: 1, role: "user" as const, platformRole: "super_admin" as const };
    await expect(assertRowBelongsToActiveCompany(admin as any, 999, "Row")).resolves.toBeUndefined();
    expect(db.getUserCompany).not.toHaveBeenCalled();
  });
});

describe("assertQuotationTenantAccess", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompany).mockReset();
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
    vi.mocked(db.getUserCompany).mockResolvedValue({ company: { id: 4 }, member: {} } as any);
    await expect(
      assertQuotationTenantAccess(memberUser as any, { companyId: 4, createdBy: 99 }),
    ).resolves.toBeUndefined();
  });
});
