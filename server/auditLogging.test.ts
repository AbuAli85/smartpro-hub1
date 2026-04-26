/**
 * server/auditLogging.test.ts
 *
 * Verifies that sensitive mutations write durable audit_events rows with the correct
 * companyId, actorUserId, entityType, action, and (where applicable) state/metadata.
 *
 * Coverage:
 *  - financeHR.reviewExpense        → expense_reviewed
 *  - payroll.updateLoanBalance      → loan_balance_updated
 *  - payroll.upsertSalaryConfig     → salary_config_upserted
 *  - hr.createDepartment            → department_created
 *  - hr.updateDepartment            → department_updated
 *  - hr.deleteDepartment            → department_deleted
 *  - hr.assignDepartment            → employee_department_assigned (one per employee)
 *  - hr.createPosition              → position_created
 *  - hr.deletePosition              → position_deleted
 *  - hr.createLeave                 → leave_created
 *
 * Also verifies:
 *  - Unauthorised callers are still denied (audit never reached)
 *  - Sensitive fields (salary amounts, banking) are NOT present in audit payloads
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";
import { financeHRRouter } from "./routers/financeHR";
import { payrollRouter } from "./routers/payroll";
import { hrRouter } from "./routers/hr";
import * as dbMod from "./db";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getUserCompanies: vi.fn(),
    getUserCompanyById: vi.fn(),
    getDb: vi.fn(),
    getEmployees: vi.fn(),
    getEmployeeById: vi.fn(),
    createLeaveRequest: vi.fn(),
  };
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

/** Build a fake DB whose insert() calls are tracked via the returned spy. */
function makeFakeDb(overrides: Record<string, unknown> = {}) {
  const auditValuesSpy = vi.fn().mockResolvedValue(undefined);
  const insertSpy = vi.fn().mockReturnValue({ values: auditValuesSpy });

  const fakeDb = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
    insert: insertSpy,
    ...overrides,
  };

  return { fakeDb, insertSpy, auditValuesSpy };
}

// ── 1. financeHR.reviewExpense ────────────────────────────────────────────────

describe("financeHR.reviewExpense — audit logging", () => {
  const input = { id: 7, action: "approved" as const, adminNotes: "Looks valid", companyId: 9 };

  beforeEach(() => {
    vi.mocked(dbMod.getUserCompanyById).mockReset();
    vi.mocked(dbMod.getDb).mockReset();
  });

  it("writes expense_reviewed audit event with correct fields on approval", async () => {
    mockMembership("finance_admin");
    const { fakeDb, auditValuesSpy } = makeFakeDb();
    // Pre-query returns pending status
    fakeDb.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ expenseStatus: "pending" }]),
        }),
      }),
    });
    vi.mocked(dbMod.getDb).mockResolvedValue(fakeDb as any);

    await financeHRRouter.createCaller(makeCtx()).reviewExpense(input);

    expect(auditValuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 9,
        actorUserId: 42,
        entityType: "expense_claim",
        entityId: 7,
        action: "expense_reviewed",
        beforeState: { expenseStatus: "pending" },
        afterState: { expenseStatus: "approved" },
        metadata: { adminNotes: "Looks valid" },
      }),
    );
  });

  it("writes expense_reviewed audit event on rejection", async () => {
    mockMembership("company_admin");
    const { fakeDb, auditValuesSpy } = makeFakeDb();
    fakeDb.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ expenseStatus: "pending" }]),
        }),
      }),
    });
    vi.mocked(dbMod.getDb).mockResolvedValue(fakeDb as any);

    await financeHRRouter.createCaller(makeCtx()).reviewExpense({ ...input, action: "rejected", adminNotes: undefined });

    expect(auditValuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "expense_reviewed",
        afterState: { expenseStatus: "rejected" },
        metadata: null,
      }),
    );
  });

  it("does NOT reach audit when company_member is denied", async () => {
    mockMembership("company_member");
    const { fakeDb, auditValuesSpy } = makeFakeDb();
    vi.mocked(dbMod.getDb).mockResolvedValue(fakeDb as any);

    await expect(financeHRRouter.createCaller(makeCtx()).reviewExpense(input))
      .rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(auditValuesSpy).not.toHaveBeenCalled();
  });

  it("audit payload does NOT include financial amounts", async () => {
    mockMembership("finance_admin");
    const { fakeDb, auditValuesSpy } = makeFakeDb();
    fakeDb.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ expenseStatus: "pending" }]),
        }),
      }),
    });
    vi.mocked(dbMod.getDb).mockResolvedValue(fakeDb as any);

    await financeHRRouter.createCaller(makeCtx()).reviewExpense(input);

    const payload = auditValuesSpy.mock.calls[0][0];
    expect(payload).not.toHaveProperty("amount");
    expect(payload.beforeState).not.toHaveProperty("amount");
    expect(payload.afterState).not.toHaveProperty("amount");
  });
});

// ── 2. payroll.updateLoanBalance ──────────────────────────────────────────────

describe("payroll.updateLoanBalance — audit logging", () => {
  beforeEach(() => {
    vi.mocked(dbMod.getUserCompanyById).mockReset();
    vi.mocked(dbMod.getDb).mockReset();
  });

  function makeLoanFakeDb(balance = "1000") {
    const auditValuesSpy = vi.fn().mockResolvedValue(undefined);
    const insertSpy = vi.fn().mockReturnValue({ values: auditValuesSpy });

    const fakeDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ companyId: 9, balanceRemaining: balance, status: "active" }]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
      insert: insertSpy,
    };

    return { fakeDb, insertSpy, auditValuesSpy };
  }

  it("writes loan_balance_updated audit event with previous and next balance", async () => {
    mockMembership("finance_admin");
    const { fakeDb, auditValuesSpy } = makeLoanFakeDb("1000");
    vi.mocked(dbMod.getDb).mockResolvedValue(fakeDb as any);

    const result = await payrollRouter.createCaller(makeCtx()).updateLoanBalance({ loanId: 3, deductedAmount: 200 });

    expect(result).toMatchObject({ newBalance: 800, status: "active" });
    expect(auditValuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 9,
        actorUserId: 42,
        entityType: "salary_loan",
        entityId: 3,
        action: "loan_balance_updated",
        beforeState: { balanceRemaining: "1000" },
        afterState: { balanceRemaining: "800", status: "active" },
        metadata: { deductedAmount: 200 },
      }),
    );
  });

  it("records completed status when balance reaches zero", async () => {
    mockMembership("finance_admin");
    const { fakeDb, auditValuesSpy } = makeLoanFakeDb("200");
    vi.mocked(dbMod.getDb).mockResolvedValue(fakeDb as any);

    await payrollRouter.createCaller(makeCtx()).updateLoanBalance({ loanId: 3, deductedAmount: 200 });

    expect(auditValuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({ afterState: { balanceRemaining: "0", status: "completed" } }),
    );
  });

  it("does NOT reach audit when company_member is denied", async () => {
    mockMembership("company_member");
    const { fakeDb, auditValuesSpy } = makeLoanFakeDb();
    vi.mocked(dbMod.getDb).mockResolvedValue(fakeDb as any);

    await expect(payrollRouter.createCaller(makeCtx()).updateLoanBalance({ loanId: 3, deductedAmount: 100 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(auditValuesSpy).not.toHaveBeenCalled();
  });
});

// ── 3. payroll.upsertSalaryConfig ─────────────────────────────────────────────

describe("payroll.upsertSalaryConfig — audit logging", () => {
  const input = {
    employeeId: 5,
    companyId: 9,
    basicSalary: 2000,
    housingAllowance: 300,
    transportAllowance: 100,
    otherAllowances: 0,
    pasiRate: 11.5,
    incomeTaxRate: 0,
    effectiveFrom: "2026-01-01",
  };

  beforeEach(() => {
    vi.mocked(dbMod.getUserCompanyById).mockReset();
    vi.mocked(dbMod.getDb).mockReset();
  });

  it("writes salary_config_upserted audit event with changedFields (no salary values)", async () => {
    mockMembership("finance_admin");
    const auditValuesSpy = vi.fn().mockResolvedValue(undefined);

    const fakeDb = {
      // employee existence check
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ id: 5 }]) }),
      }),
      // close existing config UPDATE
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
      // insert: first call = employeeSalaryConfigs (returns new id), second = audit
      insert: vi.fn()
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            $returningId: vi.fn().mockResolvedValue([{ id: 88 }]),
          }),
        })
        .mockReturnValueOnce({ values: auditValuesSpy }),
    };

    vi.mocked(dbMod.getDb).mockResolvedValue(fakeDb as any);

    const result = await payrollRouter.createCaller(makeCtx()).upsertSalaryConfig(input);

    expect(result).toMatchObject({ id: 88 });
    expect(auditValuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 9,
        actorUserId: 42,
        entityType: "employee_salary_config",
        entityId: 88,
        action: "salary_config_upserted",
        afterState: expect.objectContaining({
          employeeId: 5,
          effectiveFrom: "2026-01-01",
          changedFields: expect.arrayContaining(["basicSalary", "housingAllowance"]),
        }),
      }),
    );
  });

  it("audit payload does NOT include actual salary amounts", async () => {
    mockMembership("finance_admin");
    const auditValuesSpy = vi.fn().mockResolvedValue(undefined);

    const fakeDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ id: 5 }]) }),
      }),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
      insert: vi.fn()
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({ $returningId: vi.fn().mockResolvedValue([{ id: 88 }]) }),
        })
        .mockReturnValueOnce({ values: auditValuesSpy }),
    };

    vi.mocked(dbMod.getDb).mockResolvedValue(fakeDb as any);
    await payrollRouter.createCaller(makeCtx()).upsertSalaryConfig(input);

    const payload = auditValuesSpy.mock.calls[0][0];
    // afterState should only have safe structural fields
    expect(payload.afterState).not.toHaveProperty("basicSalary");
    expect(payload.afterState).not.toHaveProperty("housingAllowance");
    expect(payload.afterState).not.toHaveProperty("ibanNumber");
    // changedFields is the name list, not values
    expect(Array.isArray(payload.afterState.changedFields)).toBe(true);
  });

  it("does NOT reach audit when company_member is denied", async () => {
    mockMembership("company_member");
    vi.mocked(dbMod.getDb).mockResolvedValue(makeFakeDb().fakeDb as any);

    await expect(payrollRouter.createCaller(makeCtx()).upsertSalaryConfig(input))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ── 4. hr.createDepartment ────────────────────────────────────────────────────

describe("hr.createDepartment — audit logging", () => {
  beforeEach(() => {
    vi.mocked(dbMod.getUserCompanyById).mockReset();
    vi.mocked(dbMod.getDb).mockReset();
  });

  it("writes department_created audit event", async () => {
    mockMembership("hr_admin");
    const auditValuesSpy = vi.fn().mockResolvedValue(undefined);
    const fakeDb = {
      insert: vi.fn()
        .mockReturnValueOnce({ values: vi.fn().mockResolvedValue([{ insertId: 55 }]) })
        .mockReturnValueOnce({ values: auditValuesSpy }),
    };
    vi.mocked(dbMod.getDb).mockResolvedValue(fakeDb as any);

    const result = await hrRouter.createCaller(makeCtx()).createDepartment({ name: "Engineering", companyId: 9 });

    expect(result).toMatchObject({ id: 55 });
    expect(auditValuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 9,
        actorUserId: 42,
        entityType: "department",
        entityId: 55,
        action: "department_created",
        afterState: { name: "Engineering", nameAr: null, headEmployeeId: null },
      }),
    );
  });

  it("does NOT reach audit when company_member is denied", async () => {
    mockMembership("company_member");
    vi.mocked(dbMod.getDb).mockResolvedValue(makeFakeDb().fakeDb as any);

    await expect(hrRouter.createCaller(makeCtx()).createDepartment({ name: "Engineering", companyId: 9 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ── 5. hr.updateDepartment ────────────────────────────────────────────────────

describe("hr.updateDepartment — audit logging", () => {
  beforeEach(() => {
    vi.mocked(dbMod.getUserCompanyById).mockReset();
    vi.mocked(dbMod.getDb).mockReset();
  });

  it("writes department_updated audit event with before and after state", async () => {
    mockMembership("hr_admin");
    const auditValuesSpy = vi.fn().mockResolvedValue(undefined);

    const existingRow = { id: 10, name: "OldName", nameAr: null, headEmployeeId: null, companyId: 9 };
    const fakeDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([existingRow]),
        }),
      }),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
      insert: vi.fn().mockReturnValue({ values: auditValuesSpy }),
    };
    vi.mocked(dbMod.getDb).mockResolvedValue(fakeDb as any);

    await hrRouter.createCaller(makeCtx()).updateDepartment({ id: 10, name: "NewName", companyId: 9 });

    expect(auditValuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 9,
        actorUserId: 42,
        entityType: "department",
        entityId: 10,
        action: "department_updated",
        beforeState: { name: "OldName", nameAr: null, headEmployeeId: null },
        afterState: { name: "NewName", nameAr: null, headEmployeeId: null },
      }),
    );
  });
});

// ── 6. hr.deleteDepartment ────────────────────────────────────────────────────

describe("hr.deleteDepartment — audit logging", () => {
  beforeEach(() => {
    vi.mocked(dbMod.getUserCompanyById).mockReset();
    vi.mocked(dbMod.getDb).mockReset();
  });

  it("writes department_deleted audit event", async () => {
    mockMembership("hr_admin");
    const auditValuesSpy = vi.fn().mockResolvedValue(undefined);

    const existingRow = { id: 10, name: "Engineering", companyId: 9 };
    const fakeDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([existingRow]),
        }),
      }),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
      insert: vi.fn().mockReturnValue({ values: auditValuesSpy }),
    };
    vi.mocked(dbMod.getDb).mockResolvedValue(fakeDb as any);

    await hrRouter.createCaller(makeCtx()).deleteDepartment({ id: 10, companyId: 9 });

    expect(auditValuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 9,
        actorUserId: 42,
        entityType: "department",
        entityId: 10,
        action: "department_deleted",
        beforeState: { name: "Engineering", isActive: true },
        afterState: { isActive: false },
      }),
    );
  });
});

// ── 7. hr.assignDepartment ────────────────────────────────────────────────────

describe("hr.assignDepartment — audit logging", () => {
  beforeEach(() => {
    vi.mocked(dbMod.getUserCompanyById).mockReset();
    vi.mocked(dbMod.getDb).mockReset();
  });

  it("writes one employee_department_assigned event per employee", async () => {
    mockMembership("hr_admin");
    const auditValuesSpy = vi.fn().mockResolvedValue(undefined);

    // select() is called three times:
    //  1. resolveCanonicalDepartmentWrite → departments query → needs .limit()
    //  2. per-employee check for empId=1 → employees query → no .limit()
    //  3. per-employee check for empId=2 → employees query → no .limit()
    const selectFn = vi.fn()
      .mockReturnValueOnce({
        // resolveCanonicalDepartmentWrite: .select().from().where().limit()
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ name: "Engineering" }]),
          }),
        }),
      })
      .mockReturnValueOnce({
        // per-employee check: .select().from().where()
        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ id: 1, companyId: 9 }]) }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ id: 2, companyId: 9 }]) }),
      });

    const fakeDb = {
      select: selectFn,
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
      insert: vi.fn().mockReturnValue({ values: auditValuesSpy }),
    };

    vi.mocked(dbMod.getDb).mockResolvedValue(fakeDb as any);

    await hrRouter.createCaller(makeCtx()).assignDepartment({
      employeeIds: [1, 2],
      departmentName: "Engineering",
      companyId: 9,
    });

    expect(auditValuesSpy).toHaveBeenCalledTimes(2);
    expect(auditValuesSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ entityType: "employee", entityId: 1, action: "employee_department_assigned" }),
    );
    expect(auditValuesSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ entityType: "employee", entityId: 2, action: "employee_department_assigned" }),
    );
  });
});

// ── 8. hr.createPosition ──────────────────────────────────────────────────────

describe("hr.createPosition — audit logging", () => {
  beforeEach(() => {
    vi.mocked(dbMod.getUserCompanyById).mockReset();
    vi.mocked(dbMod.getDb).mockReset();
  });

  it("writes position_created audit event", async () => {
    mockMembership("hr_admin");
    const auditValuesSpy = vi.fn().mockResolvedValue(undefined);
    const fakeDb = {
      insert: vi.fn()
        .mockReturnValueOnce({ values: vi.fn().mockResolvedValue([{ insertId: 77 }]) })
        .mockReturnValueOnce({ values: auditValuesSpy }),
    };
    vi.mocked(dbMod.getDb).mockResolvedValue(fakeDb as any);

    const result = await hrRouter.createCaller(makeCtx()).createPosition({
      title: "Senior Engineer",
      companyId: 9,
    });

    expect(result).toMatchObject({ id: 77 });
    expect(auditValuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 9,
        actorUserId: 42,
        entityType: "position",
        entityId: 77,
        action: "position_created",
        afterState: { title: "Senior Engineer", departmentId: null },
      }),
    );
  });
});

// ── 9. hr.deletePosition ──────────────────────────────────────────────────────

describe("hr.deletePosition — audit logging", () => {
  beforeEach(() => {
    vi.mocked(dbMod.getUserCompanyById).mockReset();
    vi.mocked(dbMod.getDb).mockReset();
  });

  it("writes position_deleted audit event", async () => {
    mockMembership("hr_admin");
    const auditValuesSpy = vi.fn().mockResolvedValue(undefined);

    const existingPos = { id: 20, title: "Analyst", companyId: 9, isActive: true };
    const fakeDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([existingPos]) }),
      }),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
      insert: vi.fn().mockReturnValue({ values: auditValuesSpy }),
    };
    vi.mocked(dbMod.getDb).mockResolvedValue(fakeDb as any);

    await hrRouter.createCaller(makeCtx()).deletePosition({ id: 20, companyId: 9 });

    expect(auditValuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 9,
        actorUserId: 42,
        entityType: "position",
        entityId: 20,
        action: "position_deleted",
        beforeState: { title: "Analyst", isActive: true },
        afterState: { isActive: false },
      }),
    );
  });
});

// ── 10. hr.createLeave ────────────────────────────────────────────────────────

describe("hr.createLeave — audit logging (replaces note-prefix pattern)", () => {
  beforeEach(() => {
    vi.mocked(dbMod.getUserCompanyById).mockReset();
    vi.mocked(dbMod.getDb).mockReset();
    vi.mocked(dbMod.getEmployeeById).mockReset();
    vi.mocked(dbMod.createLeaveRequest).mockReset();
  });

  it("writes leave_created audit event with leave details", async () => {
    mockMembership("hr_admin");
    vi.mocked(dbMod.getEmployeeById).mockResolvedValue({ id: 3, companyId: 9 } as any);
    vi.mocked(dbMod.createLeaveRequest).mockResolvedValue(undefined as any);

    const auditValuesSpy = vi.fn().mockResolvedValue(undefined);
    const fakeDb = { insert: vi.fn().mockReturnValue({ values: auditValuesSpy }) };
    vi.mocked(dbMod.getDb).mockResolvedValue(fakeDb as any);

    await hrRouter.createCaller(makeCtx()).createLeave({
      employeeId: 3,
      leaveType: "annual",
      startDate: "2026-06-01",
      endDate: "2026-06-05",
      days: 5,
      companyId: 9,
    });

    expect(auditValuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 9,
        actorUserId: 42,
        entityType: "leave_request",
        entityId: 3,
        action: "leave_created",
        afterState: {
          leaveType: "annual",
          startDate: "2026-06-01",
          endDate: "2026-06-05",
          days: 5,
        },
      }),
    );
  });

  it("does NOT reach audit when finance_admin is denied (HR gate)", async () => {
    mockMembership("finance_admin");
    vi.mocked(dbMod.getDb).mockResolvedValue(makeFakeDb().fakeDb as any);

    await expect(
      hrRouter.createCaller(makeCtx()).createLeave({
        employeeId: 3,
        leaveType: "annual",
        startDate: "2026-06-01",
        endDate: "2026-06-05",
        days: 5,
        companyId: 9,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("audit payload does NOT include PII fields", async () => {
    mockMembership("hr_admin");
    vi.mocked(dbMod.getEmployeeById).mockResolvedValue({ id: 3, companyId: 9 } as any);
    vi.mocked(dbMod.createLeaveRequest).mockResolvedValue(undefined as any);

    const auditValuesSpy = vi.fn().mockResolvedValue(undefined);
    vi.mocked(dbMod.getDb).mockResolvedValue({
      insert: vi.fn().mockReturnValue({ values: auditValuesSpy }),
    } as any);

    await hrRouter.createCaller(makeCtx()).createLeave({
      employeeId: 3,
      leaveType: "sick",
      startDate: "2026-07-01",
      endDate: "2026-07-03",
      days: 3,
      companyId: 9,
    });

    const payload = auditValuesSpy.mock.calls[0][0];
    expect(payload.afterState).not.toHaveProperty("salary");
    expect(payload.afterState).not.toHaveProperty("ibanNumber");
    expect(payload.afterState).not.toHaveProperty("passportNumber");
  });
});
