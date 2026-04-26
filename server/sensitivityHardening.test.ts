/**
 * Server-side role sensitivity hardening tests.
 *
 * Verifies that procedures returning commercial, compliance, or audit-sensitive data
 * enforce role restrictions at the server level — independent of any frontend guard.
 *
 * Phase 1 (prior session): pro.expiringDocuments, engagements.list, analytics.auditLogs,
 *   operations.getOwnerBusinessPulse.
 * Phase 2 (this session): payroll finance mutations, financeHR finance mutations,
 *   compliance read procedures, hr org/WPS mutations.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";
import { proRouter } from "./routers/pro";
import { engagementsRouter } from "./routers/engagements";
import { analyticsRouter } from "./routers/analytics";
import { operationsRouter } from "./routers/operations";
import { payrollRouter } from "./routers/payroll";
import { financeHRRouter } from "./routers/financeHR";
import { complianceRouter } from "./routers/compliance";
import { hrRouter } from "./routers/hr";
import * as db from "./db";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getUserCompanies: vi.fn(),
    getUserCompanyById: vi.fn(),
    getDb: vi.fn(),
    getExpiringDocuments: vi.fn(),
    getProServices: vi.fn(),
    getAllProServices: vi.fn(),
  };
});

// ── Context factories ────────────────────────────────────────────────────────

function makeCtx(platformRole = "company_admin", overrides: Partial<NonNullable<TrpcContext["user"]>> = {}): TrpcContext {
  return {
    user: {
      id: 42,
      openId: "x",
      email: "test@test.com",
      name: "Test User",
      loginMethod: "manus" as const,
      role: "user" as const,
      platformRole: platformRole as any,
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
  vi.mocked(db.getUserCompanyById).mockResolvedValue({
    company: { id: 9 },
    member: { role },
  } as any);
}

// ── Phase 1: pro.expiringDocuments ───────────────────────────────────────────

describe("pro.expiringDocuments — role sensitivity", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
    vi.mocked(db.getDb).mockReset();
    vi.mocked(db.getExpiringDocuments).mockReset();
  });

  it("denies company_member with FORBIDDEN", async () => {
    mockMembership("company_member");
    const caller = proRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.expiringDocuments({ daysAhead: 30, companyId: 9 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies client with FORBIDDEN", async () => {
    mockMembership("client");
    const caller = proRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.expiringDocuments({ daysAhead: 30, companyId: 9 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows hr_admin — proceeds past role check", async () => {
    mockMembership("hr_admin");
    vi.mocked(db.getExpiringDocuments).mockResolvedValue([]);
    const caller = proRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.expiringDocuments({ daysAhead: 30, companyId: 9 }),
    ).resolves.toEqual([]);
  });

  it("allows company_admin — proceeds past role check", async () => {
    mockMembership("company_admin");
    vi.mocked(db.getExpiringDocuments).mockResolvedValue([]);
    const caller = proRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.expiringDocuments({ daysAhead: 30, companyId: 9 }),
    ).resolves.toEqual([]);
  });
});

// ── Phase 1: engagements.list ────────────────────────────────────────────────

describe("engagements.list — role sensitivity", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
    vi.mocked(db.getDb).mockReset();
    vi.mocked(db.getDb).mockResolvedValue({} as any);
  });

  it("denies company_member with FORBIDDEN", async () => {
    mockMembership("company_member");
    const caller = engagementsRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.list({ companyId: 9 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies client with FORBIDDEN", async () => {
    mockMembership("client");
    const caller = engagementsRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.list({ companyId: 9 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows company_admin — passes role check", async () => {
    mockMembership("company_admin");
    const caller = engagementsRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.list({ companyId: 9 }),
    ).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows reviewer — passes role check", async () => {
    mockMembership("reviewer");
    const caller = engagementsRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.list({ companyId: 9 }),
    ).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ── Phase 1: analytics.auditLogs ─────────────────────────────────────────────

describe("analytics.auditLogs — role sensitivity", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
    vi.mocked(db.getDb).mockReset();
    vi.mocked(db.getDb).mockResolvedValue(null);
  });

  it("returns empty array for company_member — no audit visibility", async () => {
    mockMembership("company_member");
    const caller = analyticsRouter.createCaller(makeCtx("company_member"));
    const result = await caller.auditLogs({ limit: 10, companyId: 9 });
    expect(result).toEqual([]);
  });

  it("returns empty array for client — no audit visibility", async () => {
    mockMembership("client");
    const caller = analyticsRouter.createCaller(makeCtx("company_member"));
    const result = await caller.auditLogs({ limit: 10, companyId: 9 });
    expect(result).toEqual([]);
  });

  it("allows company_admin — does not return early empty", async () => {
    mockMembership("company_admin");
    const caller = analyticsRouter.createCaller(makeCtx("company_member"));
    const result = await caller.auditLogs({ limit: 10, companyId: 9 });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ── Phase 1: operations.getOwnerBusinessPulse ────────────────────────────────

describe("operations.getOwnerBusinessPulse — role sensitivity", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
    vi.mocked(db.getDb).mockReset();
    vi.mocked(db.getDb).mockResolvedValue(null);
  });

  it("returns null for company_member — no business pulse visibility", async () => {
    mockMembership("company_member");
    const caller = operationsRouter.createCaller(makeCtx("company_member"));
    const result = await caller.getOwnerBusinessPulse({ companyId: 9 });
    expect(result).toBeNull();
  });

  it("returns null for client — no business pulse visibility", async () => {
    mockMembership("client");
    const caller = operationsRouter.createCaller(makeCtx("company_member"));
    const result = await caller.getOwnerBusinessPulse({ companyId: 9 });
    expect(result).toBeNull();
  });
});

// ── Phase 2: payroll finance mutations ───────────────────────────────────────

describe("payroll.generatePayslip — role sensitivity", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
    vi.mocked(db.getDb).mockReset();
    vi.mocked(db.getDb).mockResolvedValue(null);
  });

  it("denies company_member with FORBIDDEN", async () => {
    mockMembership("company_member");
    const caller = payrollRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.generatePayslip({ lineId: 1, companyId: 9 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies hr_admin with FORBIDDEN (finance gate)", async () => {
    mockMembership("hr_admin");
    const caller = payrollRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.generatePayslip({ lineId: 1, companyId: 9 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies reviewer with FORBIDDEN", async () => {
    mockMembership("reviewer");
    const caller = payrollRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.generatePayslip({ lineId: 1, companyId: 9 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows finance_admin — passes role check (DB null → INTERNAL_SERVER_ERROR)", async () => {
    mockMembership("finance_admin");
    const caller = payrollRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.generatePayslip({ lineId: 1, companyId: 9 }),
    ).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows company_admin — passes role check", async () => {
    mockMembership("company_admin");
    const caller = payrollRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.generatePayslip({ lineId: 1, companyId: 9 }),
    ).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("payroll.upsertSalaryConfig — role sensitivity", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
    vi.mocked(db.getDb).mockReset();
    vi.mocked(db.getDb).mockResolvedValue(null);
  });

  it("denies company_member with FORBIDDEN", async () => {
    mockMembership("company_member");
    const caller = payrollRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.upsertSalaryConfig({ employeeId: 1, companyId: 9, basicSalary: 1000, effectiveFrom: "2026-01-01" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies hr_admin with FORBIDDEN (finance gate)", async () => {
    mockMembership("hr_admin");
    const caller = payrollRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.upsertSalaryConfig({ employeeId: 1, companyId: 9, basicSalary: 1000, effectiveFrom: "2026-01-01" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows finance_admin — passes role check", async () => {
    mockMembership("finance_admin");
    const caller = payrollRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.upsertSalaryConfig({ employeeId: 1, companyId: 9, basicSalary: 1000, effectiveFrom: "2026-01-01" }),
    ).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("payroll.createLoan — role sensitivity", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
    vi.mocked(db.getDb).mockReset();
    vi.mocked(db.getDb).mockResolvedValue(null);
  });

  it("denies company_member with FORBIDDEN", async () => {
    mockMembership("company_member");
    const caller = payrollRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.createLoan({ employeeId: 1, companyId: 9, loanAmount: 500, monthlyDeduction: 100, startMonth: 1, startYear: 2026 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows finance_admin — passes role check", async () => {
    mockMembership("finance_admin");
    const caller = payrollRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.createLoan({ employeeId: 1, companyId: 9, loanAmount: 500, monthlyDeduction: 100, startMonth: 1, startYear: 2026 }),
    ).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("payroll.cancelLoan — role sensitivity", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
    vi.mocked(db.getDb).mockReset();
    // cancelLoan loads the loan row from DB first — return a mock DB that handles the query
    vi.mocked(db.getDb).mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ companyId: 9 }]),
          }),
        }),
      }),
    } as any);
  });

  it("denies company_member with FORBIDDEN (after loading loan)", async () => {
    mockMembership("company_member");
    const caller = payrollRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.cancelLoan({ loanId: 1 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows finance_admin — passes role check", async () => {
    mockMembership("finance_admin");
    // After role check passes, the update query runs; returns a db that resolves chain
    vi.mocked(db.getDb).mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ companyId: 9 }]),
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => Promise.resolve(),
        }),
      }),
    } as any);
    const caller = payrollRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.cancelLoan({ loanId: 1 }),
    ).resolves.toBeDefined();
  });
});

// ── Phase 2: financeHR finance mutations ─────────────────────────────────────

describe("financeHR.recordRevenue — role sensitivity", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
    vi.mocked(db.getDb).mockReset();
    vi.mocked(db.getDb).mockResolvedValue(null);
  });

  it("denies company_member with FORBIDDEN", async () => {
    mockMembership("company_member");
    const caller = financeHRRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.recordRevenue({ companyId: 9, periodYear: 2026, periodMonth: 1, amountOmr: 1000 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies hr_admin with FORBIDDEN (finance gate)", async () => {
    mockMembership("hr_admin");
    const caller = financeHRRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.recordRevenue({ companyId: 9, periodYear: 2026, periodMonth: 1, amountOmr: 1000 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows finance_admin — passes role check", async () => {
    mockMembership("finance_admin");
    const caller = financeHRRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.recordRevenue({ companyId: 9, periodYear: 2026, periodMonth: 1, amountOmr: 1000 }),
    ).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows company_admin — passes role check", async () => {
    mockMembership("company_admin");
    const caller = financeHRRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.recordRevenue({ companyId: 9, periodYear: 2026, periodMonth: 1, amountOmr: 1000 }),
    ).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("financeHR.recordEmployeeCost — role sensitivity", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
    vi.mocked(db.getDb).mockReset();
    vi.mocked(db.getDb).mockResolvedValue(null);
  });

  it("denies company_member with FORBIDDEN", async () => {
    mockMembership("company_member");
    const caller = financeHRRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.recordEmployeeCost({ companyId: 9, employeeId: 1, periodYear: 2026, periodMonth: 1, basicSalary: 800 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows finance_admin — passes role check", async () => {
    mockMembership("finance_admin");
    const caller = financeHRRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.recordEmployeeCost({ companyId: 9, employeeId: 1, periodYear: 2026, periodMonth: 1, basicSalary: 800 }),
    ).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ── Phase 2: compliance read procedures ──────────────────────────────────────

describe("compliance.getOvertimeFlags — role sensitivity", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
    vi.mocked(db.getDb).mockReset();
    vi.mocked(db.getDb).mockResolvedValue(null);
  });

  it("denies company_member with FORBIDDEN", async () => {
    mockMembership("company_member");
    const caller = complianceRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.getOvertimeFlags({ companyId: 9 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies client with FORBIDDEN", async () => {
    mockMembership("client");
    const caller = complianceRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.getOvertimeFlags({ companyId: 9 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies finance_admin with FORBIDDEN (hr-only gate)", async () => {
    mockMembership("finance_admin");
    const caller = complianceRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.getOvertimeFlags({ companyId: 9 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows hr_admin — passes role check (returns empty with no DB)", async () => {
    mockMembership("hr_admin");
    const caller = complianceRouter.createCaller(makeCtx("company_member"));
    const result = await caller.getOvertimeFlags({ companyId: 9 });
    expect(result).toMatchObject({ month: "", flags: [] });
  });

  it("allows company_admin — passes role check", async () => {
    mockMembership("company_admin");
    const caller = complianceRouter.createCaller(makeCtx("company_member"));
    const result = await caller.getOvertimeFlags({ companyId: 9 });
    expect(result).toMatchObject({ flags: [] });
  });
});

describe("compliance.getComplianceScore — role sensitivity", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
    vi.mocked(db.getDb).mockReset();
    vi.mocked(db.getDb).mockResolvedValue(null);
  });

  it("denies company_member with FORBIDDEN", async () => {
    mockMembership("company_member");
    const caller = complianceRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.getComplianceScore({ companyId: 9 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies client with FORBIDDEN", async () => {
    mockMembership("client");
    const caller = complianceRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.getComplianceScore({ companyId: 9 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows hr_admin — passes operator gate", async () => {
    mockMembership("hr_admin");
    const caller = complianceRouter.createCaller(makeCtx("company_member"));
    const result = await caller.getComplianceScore({ companyId: 9 });
    expect(result).toMatchObject({ score: 0, grade: "N/A" });
  });

  it("allows finance_admin — passes operator gate", async () => {
    mockMembership("finance_admin");
    const caller = complianceRouter.createCaller(makeCtx("company_member"));
    const result = await caller.getComplianceScore({ companyId: 9 });
    expect(result).toMatchObject({ score: 0, grade: "N/A" });
  });

  it("allows company_admin — passes operator gate", async () => {
    mockMembership("company_admin");
    const caller = complianceRouter.createCaller(makeCtx("company_member"));
    const result = await caller.getComplianceScore({ companyId: 9 });
    expect(result).toMatchObject({ score: 0, grade: "N/A" });
  });
});

// ── Phase 2: hr org-structure mutations ──────────────────────────────────────

describe("hr.createLeave — role sensitivity (admin-side leave creation)", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
    vi.mocked(db.getDb).mockReset();
    vi.mocked(db.getDb).mockResolvedValue(null);
  });

  it("denies company_member with FORBIDDEN", async () => {
    mockMembership("company_member");
    const caller = hrRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.createLeave({ employeeId: 1, companyId: 9, leaveType: "annual", startDate: "2026-05-01", endDate: "2026-05-05", days: 5 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies finance_admin with FORBIDDEN (HR gate)", async () => {
    mockMembership("finance_admin");
    const caller = hrRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.createLeave({ employeeId: 1, companyId: 9, leaveType: "annual", startDate: "2026-05-01", endDate: "2026-05-05", days: 5 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows hr_admin — passes role check", async () => {
    mockMembership("hr_admin");
    const caller = hrRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.createLeave({ employeeId: 1, companyId: 9, leaveType: "annual", startDate: "2026-05-01", endDate: "2026-05-05", days: 5 }),
    ).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows company_admin — passes role check", async () => {
    mockMembership("company_admin");
    const caller = hrRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.createLeave({ employeeId: 1, companyId: 9, leaveType: "annual", startDate: "2026-05-01", endDate: "2026-05-05", days: 5 }),
    ).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("hr.createDepartment — role sensitivity", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
    vi.mocked(db.getDb).mockReset();
    vi.mocked(db.getDb).mockResolvedValue(null);
  });

  it("denies company_member with FORBIDDEN", async () => {
    mockMembership("company_member");
    const caller = hrRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.createDepartment({ name: "Engineering", companyId: 9 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows hr_admin — passes role check", async () => {
    mockMembership("hr_admin");
    const caller = hrRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.createDepartment({ name: "Engineering", companyId: 9 }),
    ).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("hr.deleteDepartment — role sensitivity", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
    vi.mocked(db.getDb).mockReset();
    vi.mocked(db.getDb).mockResolvedValue(null);
  });

  it("denies company_member with FORBIDDEN", async () => {
    mockMembership("company_member");
    const caller = hrRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.deleteDepartment({ id: 1, companyId: 9 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows hr_admin — passes role check", async () => {
    mockMembership("hr_admin");
    const caller = hrRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.deleteDepartment({ id: 1, companyId: 9 }),
    ).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("hr.validateWps — role sensitivity", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
    vi.mocked(db.getDb).mockReset();
    vi.mocked(db.getDb).mockResolvedValue(null);
  });

  it("denies company_member with FORBIDDEN", async () => {
    mockMembership("company_member");
    const caller = hrRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.validateWps({ employeeId: 1, companyId: 9 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies hr_admin with FORBIDDEN (finance gate)", async () => {
    mockMembership("hr_admin");
    const caller = hrRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.validateWps({ employeeId: 1, companyId: 9 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows finance_admin — passes role check", async () => {
    mockMembership("finance_admin");
    const caller = hrRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.validateWps({ employeeId: 1, companyId: 9 }),
    ).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows company_admin — passes role check", async () => {
    mockMembership("company_admin");
    const caller = hrRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.validateWps({ employeeId: 1, companyId: 9 }),
    ).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("hr.bulkValidateWps — role sensitivity", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
    vi.mocked(db.getDb).mockReset();
    vi.mocked(db.getDb).mockResolvedValue(null);
  });

  it("denies company_member with FORBIDDEN", async () => {
    mockMembership("company_member");
    const caller = hrRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.bulkValidateWps({ companyId: 9 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows finance_admin — passes role check", async () => {
    mockMembership("finance_admin");
    const caller = hrRouter.createCaller(makeCtx("company_member"));
    await expect(
      caller.bulkValidateWps({ companyId: 9 }),
    ).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });
});
