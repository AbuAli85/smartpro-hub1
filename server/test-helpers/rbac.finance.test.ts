/**
 * RBAC Integration Tests — Finance, Payroll & Collections Domains
 *
 * Tests requireFinanceOrAdmin enforcement on:
 *   - payroll.getSummary
 *   - payroll.getGratuityEstimate
 *   - financeHR.adminListExpenses  ← AUTH INCONSISTENCY (see below)
 *   - financeHR.expenseSummary     ← AUTH INCONSISTENCY (see below)
 *   - collections.upsertWorkItem
 *
 * AUTH INCONSISTENCY FOUND (documented in rbac-inconsistencies.md):
 *   financeHR.adminListExpenses and financeHR.expenseSummary call:
 *     const db = await getDb();
 *     if (!db) return [];   ← returns empty data WITHOUT checking roles
 *   This means when the DB is unavailable, any authenticated user can call
 *   these procedures and receive an empty (but not forbidden) response.
 *   The auth guard is only reached when the DB is available.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "../_core/context";
import { payrollRouter } from "../routers/payroll";
import { financeHRRouter } from "../routers/financeHR";
import { collectionsRouter } from "../routers/collections";
import * as db from "../db";
import * as companiesRepo from "../repositories/companies.repository";

vi.mock("../db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db")>();
  return {
    ...actual,
    getUserCompanies: vi.fn(),
    getUserCompanyById: vi.fn(),
    getDb: vi.fn(),
  };
});

vi.mock("../repositories/companies.repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../repositories/companies.repository")>();
  return {
    ...actual,
    getUserCompanyById: vi.fn(),
    getCompanyById: vi.fn(),
  };
});

function makeCtx(overrides: Record<string, unknown> = {}): TrpcContext {
  const user = {
    id: 20,
    openId: "finance-user",
    email: "finance@smartpro.om",
    name: "Finance User",
    displayName: "Finance User",
    loginMethod: "manus" as const,
    role: "user" as const,
    platformRole: "company_admin" as const,
    isActive: true,
    twoFactorEnabled: false,
    platformRoles: [] as string[],
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    accountStatus: "active" as const,
    ...overrides,
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

/**
 * Build a vi.fn()-based fake drizzle db that properly handles chained queries.
 * Each method returns `this` (the same chainable) until the terminal await.
 * The terminal await is handled by the `then` method which resolves to [].
 */
function makeFakeDb(): any {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    having: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    then: (resolve: any, reject: any) => Promise.resolve([]).then(resolve, reject),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue([{ insertId: 1 }]),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
     delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  };
}
function mockRole(companyId: number, role: string) {
  const membership = { company: { id: companyId }, member: { role } } as any;
  vi.mocked(db.getUserCompanyById).mockResolvedValue(membership);
  vi.mocked(db.getUserCompanies).mockResolvedValue([membership]);
  vi.mocked(db.getDb).mockResolvedValue(makeFakeDb());
  vi.mocked(companiesRepo.getUserCompanyById).mockResolvedValue(membership);
}

function mockCrossTenant() {
  vi.mocked(db.getUserCompanyById).mockResolvedValue(null as any);
  vi.mocked(db.getUserCompanies).mockResolvedValue([]);
  vi.mocked(db.getDb).mockResolvedValue(makeFakeDb());
  vi.mocked(companiesRepo.getUserCompanyById).mockResolvedValue(null as any);
}

beforeEach(() => {
  vi.mocked(db.getUserCompanyById).mockReset();
  vi.mocked(db.getUserCompanies).mockReset();
  vi.mocked(db.getDb).mockReset();
  vi.mocked(companiesRepo.getUserCompanyById).mockReset();
  vi.mocked(companiesRepo.getCompanyById).mockReset();
});

// ─── payroll.getSummary ───────────────────────────────────────────────────────

describe("payroll.getSummary — requireFinanceOrAdmin", () => {
  // NOTE: getSummary calls getDb() before auth; due to ESM live-binding constraints
  // the real db is used after auth passes. We assert auth passes (non-FORBIDDEN error).
  it("allows company_admin — auth passes (non-FORBIDDEN error)", async () => {
    mockRole(1, "company_admin");
    const caller = payrollRouter.createCaller(makeCtx());
    await expect(caller.getSummary({ companyId: 1 })).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows finance_admin — auth passes (non-FORBIDDEN error)", async () => {
    mockRole(1, "finance_admin");
    const caller = payrollRouter.createCaller(makeCtx());
    await expect(caller.getSummary({ companyId: 1 })).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks hr_admin with FORBIDDEN", async () => {
    mockRole(1, "hr_admin");
    const caller = payrollRouter.createCaller(makeCtx());
    await expect(caller.getSummary({ companyId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks company_member with FORBIDDEN", async () => {
    mockRole(1, "company_member");
    const caller = payrollRouter.createCaller(makeCtx());
    await expect(caller.getSummary({ companyId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks reviewer with FORBIDDEN", async () => {
    mockRole(1, "reviewer");
    const caller = payrollRouter.createCaller(makeCtx());
    await expect(caller.getSummary({ companyId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks external_auditor with FORBIDDEN", async () => {
    mockRole(1, "external_auditor");
    const caller = payrollRouter.createCaller(makeCtx());
    await expect(caller.getSummary({ companyId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks cross-tenant access with FORBIDDEN", async () => {
    mockCrossTenant();
    const caller = payrollRouter.createCaller(makeCtx());
    await expect(caller.getSummary({ companyId: 99 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("platform_admin bypasses role check — auth passes (non-FORBIDDEN error)", async () => {
    mockRole(1, "company_member");
    const caller = payrollRouter.createCaller(makeCtx({ platformRoles: ["platform_admin"] }));
    await expect(caller.getSummary({ companyId: 1 })).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });

  it("super_admin bypasses role check — auth passes (non-FORBIDDEN error)", async () => {
    mockRole(1, "reviewer");
    const caller = payrollRouter.createCaller(makeCtx({ platformRoles: ["super_admin"] }));
    await expect(caller.getSummary({ companyId: 1 })).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ─── payroll.getGratuityEstimate ──────────────────────────────────────────────

describe("payroll.getGratuityEstimate — requireFinanceOrAdmin", () => {
  it("allows finance_admin — auth passes (NOT_FOUND for missing employee)", async () => {
    mockRole(1, "finance_admin");
    const caller = payrollRouter.createCaller(makeCtx());
    await expect(caller.getGratuityEstimate({ employeeId: 1, companyId: 1 })).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows company_admin — auth passes", async () => {
    mockRole(1, "company_admin");
    const caller = payrollRouter.createCaller(makeCtx());
    await expect(caller.getGratuityEstimate({ employeeId: 1, companyId: 1 })).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks hr_admin with FORBIDDEN", async () => {
    mockRole(1, "hr_admin");
    const caller = payrollRouter.createCaller(makeCtx());
    await expect(caller.getGratuityEstimate({ employeeId: 1, companyId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks company_member with FORBIDDEN", async () => {
    mockRole(1, "company_member");
    const caller = payrollRouter.createCaller(makeCtx());
    await expect(caller.getGratuityEstimate({ employeeId: 1, companyId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks cross-tenant access with FORBIDDEN", async () => {
    mockCrossTenant();
    const caller = payrollRouter.createCaller(makeCtx());
    await expect(caller.getGratuityEstimate({ employeeId: 1, companyId: 99 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("platform_admin bypasses role check", async () => {
    mockRole(1, "company_member");
    const caller = payrollRouter.createCaller(makeCtx({ platformRoles: ["platform_admin"] }));
    await expect(caller.getGratuityEstimate({ employeeId: 1, companyId: 1 })).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ─── financeHR.adminListExpenses ──────────────────────────────────────────────
// AUTH INCONSISTENCY: When DB is available, requireFinanceOrAdmin is enforced.
// The tests below verify the INTENDED behaviour (DB available path).

describe("financeHR.adminListExpenses — requireFinanceOrAdmin (DB-available path)", () => {
  // NOTE: adminListExpenses calls getDb() before auth; due to ESM live-binding constraints
  // the real db is used after auth passes. We assert auth passes (non-FORBIDDEN error).
  it("allows company_admin — auth passes (non-FORBIDDEN error)", async () => {
    mockRole(1, "company_admin");
    const caller = financeHRRouter.createCaller(makeCtx());
    await expect(caller.adminListExpenses({ companyId: 1 })).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows finance_admin — auth passes (non-FORBIDDEN error)", async () => {
    mockRole(1, "finance_admin");
    const caller = financeHRRouter.createCaller(makeCtx());
    await expect(caller.adminListExpenses({ companyId: 1 })).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks hr_admin with FORBIDDEN", async () => {
    mockRole(1, "hr_admin");
    const caller = financeHRRouter.createCaller(makeCtx());
    await expect(caller.adminListExpenses({ companyId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks company_member with FORBIDDEN", async () => {
    mockRole(1, "company_member");
    const caller = financeHRRouter.createCaller(makeCtx());
    await expect(caller.adminListExpenses({ companyId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks reviewer with FORBIDDEN", async () => {
    mockRole(1, "reviewer");
    const caller = financeHRRouter.createCaller(makeCtx());
    await expect(caller.adminListExpenses({ companyId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks external_auditor with FORBIDDEN", async () => {
    mockRole(1, "external_auditor");
    const caller = financeHRRouter.createCaller(makeCtx());
    await expect(caller.adminListExpenses({ companyId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks cross-tenant access with FORBIDDEN", async () => {
    mockCrossTenant();
    const caller = financeHRRouter.createCaller(makeCtx());
    await expect(caller.adminListExpenses({ companyId: 99 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("platform_admin bypasses role check — auth passes (non-FORBIDDEN error)", async () => {
    mockRole(1, "company_member");
    const caller = financeHRRouter.createCaller(makeCtx({ platformRoles: ["platform_admin"] }));
    await expect(caller.adminListExpenses({ companyId: 1 })).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });

  /**
   * INCONSISTENCY TEST: When DB is unavailable (getDb returns null), the procedure
   * returns [] without enforcing the role check. This is a security gap.
   */
  it("[INCONSISTENCY] returns empty data for hr_admin when DB is unavailable (no FORBIDDEN thrown)", async () => {
    vi.mocked(db.getUserCompanyById).mockResolvedValue({ company: { id: 1 }, member: { role: "hr_admin" } } as any);
    vi.mocked(db.getUserCompanies).mockResolvedValue([{ company: { id: 1 }, member: { role: "hr_admin" } }] as any);
    vi.mocked(db.getDb).mockResolvedValue(null);
    const caller = financeHRRouter.createCaller(makeCtx());
    // This resolves [] instead of throwing FORBIDDEN — documents the inconsistency
    const result = await caller.adminListExpenses({ companyId: 1 });
    expect(result).toEqual([]);
  });
});

// ─── financeHR.expenseSummary ─────────────────────────────────────────────────

describe("financeHR.expenseSummary — requireFinanceOrAdmin (DB-available path)", () => {
  // NOTE: expenseSummary calls getDb() before auth; due to ESM live-binding constraints
  // the real db is used after auth passes. We assert auth passes (non-FORBIDDEN error).
  it("allows finance_admin — auth passes (non-FORBIDDEN error)", async () => {
    mockRole(1, "finance_admin");
    const caller = financeHRRouter.createCaller(makeCtx());
    await expect(caller.expenseSummary({ companyId: 1 })).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows company_admin — auth passes (non-FORBIDDEN error)", async () => {
    mockRole(1, "company_admin");
    const caller = financeHRRouter.createCaller(makeCtx());
    await expect(caller.expenseSummary({ companyId: 1 })).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks hr_admin with FORBIDDEN", async () => {
    mockRole(1, "hr_admin");
    const caller = financeHRRouter.createCaller(makeCtx());
    await expect(caller.expenseSummary({ companyId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks company_member with FORBIDDEN", async () => {
    mockRole(1, "company_member");
    const caller = financeHRRouter.createCaller(makeCtx());
    await expect(caller.expenseSummary({ companyId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks cross-tenant access with FORBIDDEN", async () => {
    mockCrossTenant();
    const caller = financeHRRouter.createCaller(makeCtx());
    await expect(caller.expenseSummary({ companyId: 99 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  /**
   * INCONSISTENCY TEST: When DB is unavailable, expenseSummary returns a default
   * object without enforcing the role check.
   */
  it("[INCONSISTENCY] returns default summary for company_member when DB is unavailable (no FORBIDDEN thrown)", async () => {
    vi.mocked(db.getUserCompanyById).mockResolvedValue({ company: { id: 1 }, member: { role: "company_member" } } as any);
    vi.mocked(db.getUserCompanies).mockResolvedValue([{ company: { id: 1 }, member: { role: "company_member" } }] as any);
    vi.mocked(db.getDb).mockResolvedValue(null);
    const caller = financeHRRouter.createCaller(makeCtx());
    const result = await caller.expenseSummary({ companyId: 1 });
    expect(result).toMatchObject({ total: 0 });
  });
});

// ─── collections.upsertWorkItem ───────────────────────────────────────────────
// Guard: canActOnCollectionsQueue → company_admin | finance_admin only

describe("collections.upsertWorkItem — canActOnCollectionsQueue (company_admin | finance_admin)", () => {
  const upsertInput = {
    companyId: 1,
    sourceType: "subscription_invoice" as const,
    sourceId: 1,
    workflowStatus: "needs_follow_up" as const,
  };

  it("allows company_admin — auth passes", async () => {
    mockRole(1, "company_admin");
    const caller = collectionsRouter.createCaller(makeCtx());
    await expect(caller.upsertWorkItem(upsertInput)).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows finance_admin — auth passes", async () => {
    mockRole(1, "finance_admin");
    const caller = collectionsRouter.createCaller(makeCtx());
    await expect(caller.upsertWorkItem(upsertInput)).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks hr_admin with FORBIDDEN", async () => {
    mockRole(1, "hr_admin");
    const caller = collectionsRouter.createCaller(makeCtx());
    await expect(caller.upsertWorkItem(upsertInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks company_member with FORBIDDEN", async () => {
    mockRole(1, "company_member");
    const caller = collectionsRouter.createCaller(makeCtx());
    await expect(caller.upsertWorkItem(upsertInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks reviewer with FORBIDDEN", async () => {
    mockRole(1, "reviewer");
    const caller = collectionsRouter.createCaller(makeCtx());
    await expect(caller.upsertWorkItem(upsertInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks external_auditor with FORBIDDEN", async () => {
    mockRole(1, "external_auditor");
    const caller = collectionsRouter.createCaller(makeCtx());
    await expect(caller.upsertWorkItem(upsertInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks cross-tenant access with NOT_FOUND (workspace not found)", async () => {
    vi.mocked(db.getUserCompanyById).mockResolvedValue(null as any);
    vi.mocked(db.getUserCompanies).mockResolvedValue([]);
    vi.mocked(db.getDb).mockResolvedValue(makeFakeDb());
    vi.mocked(companiesRepo.getUserCompanyById).mockResolvedValue(null as any);
    const caller = collectionsRouter.createCaller(makeCtx());
    await expect(caller.upsertWorkItem({ ...upsertInput, companyId: 99 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("platform_admin bypasses canActOnCollectionsQueue check", async () => {
    mockRole(1, "company_member");
    const caller = collectionsRouter.createCaller(makeCtx({ platformRoles: ["platform_admin"] }));
    await expect(caller.upsertWorkItem(upsertInput)).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });
});
