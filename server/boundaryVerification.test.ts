/**
 * server/boundaryVerification.test.ts
 *
 * Boundary verification for three remaining router sensitivity risks from the
 * router sensitivity sweep (Phase 2 continuation):
 *
 *  1. financeHR.reviewExpense — hardened from requireActiveCompanyId → requireFinanceOrAdmin
 *  2. payroll.updateLoanBalance — verify requireFinanceOrAdmin guard (post-DB auth pattern)
 *  3. hr.listEmployees — scope routing, field redaction, cross-company isolation
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";
import { financeHRRouter } from "./routers/financeHR";
import { hrRouter } from "./routers/hr";
import { payrollRouter } from "./routers/payroll";
import * as dbMod from "./db";
import * as policyMod from "./_core/policy";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getUserCompanies: vi.fn(),
    getUserCompanyById: vi.fn(),
    getDb: vi.fn(),
    getEmployees: vi.fn(),
  };
});

vi.mock("./_core/policy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./_core/policy")>();
  return { ...actual, resolveVisibilityScope: vi.fn() };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<NonNullable<TrpcContext["user"]>> = {}): TrpcContext {
  return {
    user: {
      id: 42,
      openId: "x",
      email: "test@test.com",
      name: "Test User",
      loginMethod: "manus" as const,
      role: "user" as const,
      platformRole: "user" as any,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      ...overrides,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function mockMembership(role: string) {
  vi.mocked(dbMod.getUserCompanyById).mockResolvedValue({
    company: { id: 9 },
    member: { role },
  } as any);
}

function makeLoanDb() {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ companyId: 9, balanceRemaining: "1000", status: "active" }]),
        }),
      }),
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  } as any;
}

// ── 1. financeHR.reviewExpense ────────────────────────────────────────────────
//
// Hardened from requireActiveCompanyId (any authenticated member) →
// requireFinanceOrAdmin (company_admin | finance_admin only).
// Previously, any company_member could approve or reject expense claims.

describe("financeHR.reviewExpense — access control (hardened from requireActiveCompanyId)", () => {
  const input = { id: 1, action: "approved" as const, companyId: 9 };

  beforeEach(() => {
    vi.mocked(dbMod.getUserCompanyById).mockReset();
    vi.mocked(dbMod.getDb).mockReset();
    vi.mocked(dbMod.getDb).mockResolvedValue(null);
  });

  it("denies company_member with FORBIDDEN", async () => {
    mockMembership("company_member");
    const caller = financeHRRouter.createCaller(makeCtx());
    await expect(caller.reviewExpense(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies hr_admin with FORBIDDEN (not in finance gate)", async () => {
    mockMembership("hr_admin");
    const caller = financeHRRouter.createCaller(makeCtx());
    await expect(caller.reviewExpense(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies reviewer with FORBIDDEN", async () => {
    mockMembership("reviewer");
    const caller = financeHRRouter.createCaller(makeCtx());
    await expect(caller.reviewExpense(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies client with FORBIDDEN", async () => {
    mockMembership("client");
    const caller = financeHRRouter.createCaller(makeCtx());
    await expect(caller.reviewExpense(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows finance_admin — passes finance gate, updates expense status", async () => {
    mockMembership("finance_admin");
    vi.mocked(dbMod.getDb).mockResolvedValue({
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    } as any);
    const caller = financeHRRouter.createCaller(makeCtx());
    await expect(caller.reviewExpense(input)).resolves.toMatchObject({ success: true });
  });

  it("allows company_admin — passes finance gate, updates expense status", async () => {
    mockMembership("company_admin");
    vi.mocked(dbMod.getDb).mockResolvedValue({
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    } as any);
    const caller = financeHRRouter.createCaller(makeCtx());
    await expect(caller.reviewExpense(input)).resolves.toMatchObject({ success: true });
  });
});

// ── 2. payroll.updateLoanBalance ──────────────────────────────────────────────
//
// Guard pattern: auth runs AFTER the loan row is fetched (companyId is derived
// from the DB row, not the request). requireFinanceOrAdmin is the correct gate.
// Classification: Type A public mutation used by payroll execution flow.

describe("payroll.updateLoanBalance — access control (requireFinanceOrAdmin, post-DB guard)", () => {
  beforeEach(() => {
    vi.mocked(dbMod.getUserCompanyById).mockReset();
    vi.mocked(dbMod.getDb).mockReset();
  });

  it("denies company_member with FORBIDDEN (after loan fetch, before update)", async () => {
    mockMembership("company_member");
    vi.mocked(dbMod.getDb).mockResolvedValue(makeLoanDb());
    const caller = payrollRouter.createCaller(makeCtx());
    await expect(
      caller.updateLoanBalance({ loanId: 1, deductedAmount: 100 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies hr_admin with FORBIDDEN (not in finance gate)", async () => {
    mockMembership("hr_admin");
    vi.mocked(dbMod.getDb).mockResolvedValue(makeLoanDb());
    const caller = payrollRouter.createCaller(makeCtx());
    await expect(
      caller.updateLoanBalance({ loanId: 1, deductedAmount: 100 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows finance_admin — passes gate, returns updated balance", async () => {
    mockMembership("finance_admin");
    vi.mocked(dbMod.getDb).mockResolvedValue(makeLoanDb());
    const caller = payrollRouter.createCaller(makeCtx());
    const result = await caller.updateLoanBalance({ loanId: 1, deductedAmount: 100 });
    expect(result).toMatchObject({ newBalance: 900, status: "active" });
  });

  it("allows company_admin — passes gate, returns updated balance", async () => {
    mockMembership("company_admin");
    vi.mocked(dbMod.getDb).mockResolvedValue(makeLoanDb());
    const caller = payrollRouter.createCaller(makeCtx());
    const result = await caller.updateLoanBalance({ loanId: 1, deductedAmount: 100 });
    expect(result).toMatchObject({ newBalance: 900, status: "active" });
  });

  it("marks loan completed when balance reaches zero", async () => {
    mockMembership("finance_admin");
    vi.mocked(dbMod.getDb).mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ companyId: 9, balanceRemaining: "100", status: "active" }]),
          }),
        }),
      }),
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    } as any);
    const caller = payrollRouter.createCaller(makeCtx());
    const result = await caller.updateLoanBalance({ loanId: 1, deductedAmount: 100 });
    expect(result).toMatchObject({ newBalance: 0, status: "completed" });
  });

  it("returns NOT_FOUND when loan does not exist", async () => {
    vi.mocked(dbMod.getDb).mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () => ({ limit: () => Promise.resolve([]) }),
        }),
      }),
    } as any);
    const caller = payrollRouter.createCaller(makeCtx());
    await expect(
      caller.updateLoanBalance({ loanId: 999, deductedAmount: 100 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("prevents cross-company access — FORBIDDEN when loan belongs to a different company", async () => {
    // Loan row returns companyId=99; user has no membership in company 99
    vi.mocked(dbMod.getDb).mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ companyId: 99, balanceRemaining: "500", status: "active" }]),
          }),
        }),
      }),
    } as any);
    vi.mocked(dbMod.getUserCompanyById).mockResolvedValue(null);
    const caller = payrollRouter.createCaller(makeCtx());
    await expect(
      caller.updateLoanBalance({ loanId: 1, deductedAmount: 50 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ── 3. hr.listEmployees — scope routing ───────────────────────────────────────
//
// Access is visibility-scoped, not hard-gated:
//  - company_admin / hr_admin / external_auditor: company-wide (pass view_hr capability)
//  - finance_admin / reviewer: FORBIDDEN — view_hr not in their default capability set
//  - company_member team manager: team-scoped
//  - company_member with no reports: self-only (empty when no employee record)
//  - cross-company: FORBIDDEN via requireCapableMembership

describe("hr.listEmployees — scope routing and capability gate", () => {
  beforeEach(() => {
    vi.mocked(dbMod.getUserCompanyById).mockReset();
    vi.mocked(dbMod.getDb).mockReset();
    vi.mocked(dbMod.getDb).mockResolvedValue(null);
    vi.mocked(dbMod.getEmployees).mockReset();
    vi.mocked(dbMod.getEmployees).mockResolvedValue([]);
    vi.mocked(policyMod.resolveVisibilityScope).mockReset();
  });

  it("allows company_admin — passes view_hr gate, returns company-wide list", async () => {
    mockMembership("company_admin");
    vi.mocked(policyMod.resolveVisibilityScope).mockResolvedValue({ type: "company", companyId: 9 });
    const caller = hrRouter.createCaller(makeCtx());
    const result = await caller.listEmployees({ companyId: 9 });
    expect(result).toEqual([]);
  });

  it("allows hr_admin — passes view_hr gate, returns company-wide list", async () => {
    mockMembership("hr_admin");
    vi.mocked(policyMod.resolveVisibilityScope).mockResolvedValue({ type: "company", companyId: 9 });
    const caller = hrRouter.createCaller(makeCtx());
    const result = await caller.listEmployees({ companyId: 9 });
    expect(result).toEqual([]);
  });

  it("allows external_auditor — has view_hr, returns company-wide list", async () => {
    mockMembership("external_auditor");
    vi.mocked(policyMod.resolveVisibilityScope).mockResolvedValue({ type: "company", companyId: 9 });
    const caller = hrRouter.createCaller(makeCtx());
    const result = await caller.listEmployees({ companyId: 9 });
    expect(result).toEqual([]);
  });

  it("denies finance_admin with FORBIDDEN — view_hr not in finance role defaults", async () => {
    mockMembership("finance_admin");
    const caller = hrRouter.createCaller(makeCtx());
    await expect(caller.listEmployees({ companyId: 9 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies reviewer with FORBIDDEN — view_hr not in reviewer role defaults", async () => {
    mockMembership("reviewer");
    const caller = hrRouter.createCaller(makeCtx());
    await expect(caller.listEmployees({ companyId: 9 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("company_member with self scope (no employee record) — returns empty array, not FORBIDDEN", async () => {
    mockMembership("company_member");
    vi.mocked(policyMod.resolveVisibilityScope).mockResolvedValue({
      type: "self",
      companyId: 9,
      selfEmployeeId: null,
    });
    const caller = hrRouter.createCaller(makeCtx());
    const result = await caller.listEmployees({ companyId: 9 });
    expect(result).toEqual([]);
  });

  it("company_member with team scope — returns only direct-report records", async () => {
    mockMembership("company_member");
    vi.mocked(policyMod.resolveVisibilityScope).mockResolvedValue({
      type: "team",
      companyId: 9,
      selfEmployeeId: 10,
      managedEmployeeIds: [10, 11],
    });
    const teamMember = { id: 11, firstName: "Alice", companyId: 9, salary: "3000", ibanNumber: "GB999" };
    vi.mocked(dbMod.getDb).mockResolvedValue({
      select: () => ({ from: () => ({ where: () => Promise.resolve([teamMember]) }) }),
    } as any);
    const caller = hrRouter.createCaller(makeCtx());
    const result = await caller.listEmployees({ companyId: 9 });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 11 });
    // company_member cannot see salary or banking details even for their team
    expect(result[0].salary).toBeNull();
    expect((result[0] as any).ibanNumber).toBeNull();
  });

  it("prevents cross-company leakage — FORBIDDEN when user has no membership in the requested company", async () => {
    vi.mocked(dbMod.getUserCompanyById).mockResolvedValue(null);
    const caller = hrRouter.createCaller(makeCtx());
    await expect(caller.listEmployees({ companyId: 99 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ── 4. hr.listEmployees — field redaction by role ─────────────────────────────
//
// applyEmployeePayloadPolicy strips sensitive fields based on deriveCapabilities output:
//  - company_admin: no redaction (ALL_CAPS)
//  - hr_admin: salary + banking redacted; identity docs + HR notes visible
//  - external_auditor: salary + banking + identity + HR notes all redacted

describe("hr.listEmployees — field redaction by role", () => {
  const fakeEmployee = {
    id: 1,
    firstName: "Jane",
    lastName: "Doe",
    companyId: 9,
    salary: "5000",
    ibanNumber: "GB12BARC00001234567891",
    bankName: "Barclays",
    bankAccountNumber: "12345678",
    hrNotes: "Excellent performer",
    nationalId: "A12345",
    passportNumber: "P999888",
    pasiNumber: "PASI001",
  };

  beforeEach(() => {
    vi.mocked(dbMod.getUserCompanyById).mockReset();
    vi.mocked(dbMod.getDb).mockReset();
    vi.mocked(dbMod.getDb).mockResolvedValue(null);
    vi.mocked(dbMod.getEmployees).mockReset();
    vi.mocked(dbMod.getEmployees).mockResolvedValue([fakeEmployee] as any);
    vi.mocked(policyMod.resolveVisibilityScope).mockReset();
    vi.mocked(policyMod.resolveVisibilityScope).mockResolvedValue({ type: "company", companyId: 9 });
  });

  it("company_admin — all fields visible (no redaction)", async () => {
    mockMembership("company_admin");
    const caller = hrRouter.createCaller(makeCtx());
    const [emp] = await caller.listEmployees({ companyId: 9 });
    expect(emp.salary).toBe("5000");
    expect((emp as any).ibanNumber).toBe("GB12BARC00001234567891");
    expect((emp as any).hrNotes).toBe("Excellent performer");
    expect((emp as any).passportNumber).toBe("P999888");
  });

  it("hr_admin — salary and banking redacted; identity docs and HR notes visible", async () => {
    mockMembership("hr_admin");
    const caller = hrRouter.createCaller(makeCtx());
    const [emp] = await caller.listEmployees({ companyId: 9 });
    expect(emp.salary).toBeNull();
    expect((emp as any).ibanNumber).toBeNull();
    expect((emp as any).bankName).toBeNull();
    expect((emp as any).hrNotes).toBe("Excellent performer");
    expect((emp as any).passportNumber).toBe("P999888");
  });

  it("external_auditor — salary, banking, identity, and HR notes all redacted", async () => {
    mockMembership("external_auditor");
    const caller = hrRouter.createCaller(makeCtx());
    const [emp] = await caller.listEmployees({ companyId: 9 });
    expect(emp.salary).toBeNull();
    expect((emp as any).ibanNumber).toBeNull();
    expect((emp as any).hrNotes).toBeNull();
    expect((emp as any).nationalId).toBeNull();
    expect((emp as any).passportNumber).toBeNull();
  });
});
