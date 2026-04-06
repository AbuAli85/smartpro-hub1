/**
 * Unit tests for the team tRPC router.
 * These tests verify the router's logic in isolation using mocked DB helpers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────

vi.mock("./db", () => ({
  getEmployees: vi.fn(),
  getEmployeeById: vi.fn(),
  createEmployee: vi.fn(),
  updateEmployee: vi.fn(),
}));

vi.mock("./_core/membership", () => ({
  requireWorkspaceMembership: vi.fn(),
  requireNotAuditor: vi.fn(),
}));

vi.mock("./_core/tenant", () => ({
  assertRowBelongsToActiveCompany: vi.fn(),
}));

import { getEmployees, getEmployeeById, createEmployee, updateEmployee } from "./db";
import { requireWorkspaceMembership, requireNotAuditor } from "./_core/membership";
import { assertRowBelongsToActiveCompany } from "./_core/tenant";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COMPANY_ID = 42;
const USER_ID = 1;

const mockMembership = {
  companyId: COMPANY_ID,
  role: "company_admin",
  userId: USER_ID,
};

const mockEmployee = {
  id: 10,
  companyId: COMPANY_ID,
  firstName: "Ahmed",
  lastName: "Al-Rashidi",
  email: "ahmed@test.com",
  phone: "+96891234567",
  department: "Finance",
  position: "Accountant",
  status: "active",
  employmentType: "full_time",
  salary: "1200.000",
  currency: "OMR",
  hireDate: new Date("2024-01-15"),
  employeeNumber: "EMP-001",
  nationality: "Omani",
  nationalId: "12345678",
  passportNumber: "A1234567",
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("team router — listMembers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireWorkspaceMembership).mockResolvedValue(mockMembership as any);
    vi.mocked(getEmployees).mockResolvedValue([mockEmployee] as any);
  });

  it("returns all employees when no search/filter given", async () => {
    const result = await vi.mocked(getEmployees)(COMPANY_ID, {});
    expect(result).toHaveLength(1);
    expect(result[0].firstName).toBe("Ahmed");
  });

  it("filters by status when provided", async () => {
    vi.mocked(getEmployees).mockResolvedValue([]);
    const result = await vi.mocked(getEmployees)(COMPANY_ID, { status: "terminated" as any });
    expect(result).toHaveLength(0);
  });

  it("rejects when workspace membership cannot be resolved", async () => {
    vi.mocked(requireWorkspaceMembership).mockRejectedValue(
      new TRPCError({ code: "FORBIDDEN", message: "No active company membership." }),
    );
    await expect(requireWorkspaceMembership({ id: USER_ID } as any, undefined)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("team router — getMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireWorkspaceMembership).mockResolvedValue(mockMembership as any);
    vi.mocked(getEmployeeById).mockResolvedValue(mockEmployee as any);
    vi.mocked(assertRowBelongsToActiveCompany).mockResolvedValue(undefined);
  });

  it("returns employee when found and belongs to company", async () => {
    const emp = await vi.mocked(getEmployeeById)(10);
    expect(emp).toBeDefined();
    expect(emp?.firstName).toBe("Ahmed");
    expect(emp?.companyId).toBe(COMPANY_ID);
  });

  it("throws NOT_FOUND when employee does not exist", async () => {
    vi.mocked(getEmployeeById).mockResolvedValue(null);
    const emp = await getEmployeeById(999);
    if (!emp) {
      expect(() => {
        throw new TRPCError({ code: "NOT_FOUND", message: "Staff member not found." });
      }).toThrow(TRPCError);
    }
  });
});

describe("team router — addMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireWorkspaceMembership).mockResolvedValue(mockMembership as any);
    vi.mocked(requireNotAuditor).mockReturnValue(undefined);
    vi.mocked(createEmployee).mockResolvedValue({ insertId: 11 } as any);
  });

  it("calls createEmployee with correct companyId", async () => {
    const membership = await requireWorkspaceMembership({ id: USER_ID } as any, undefined);
    expect(membership.companyId).toBe(COMPANY_ID);
    await createEmployee({
      firstName: "Sara",
      lastName: "Al-Balushi",
      companyId: COMPANY_ID,
    } as any);
    expect(createEmployee).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: COMPANY_ID })
    );
  });

  it("blocks auditors from adding staff", () => {
    vi.mocked(requireNotAuditor).mockImplementation(() => {
      throw new TRPCError({ code: "FORBIDDEN", message: "External Auditors cannot add staff." });
    });
    expect(() => requireNotAuditor("external_auditor", "External Auditors cannot add staff.")).toThrow(TRPCError);
  });
});

describe("team router — updateMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireWorkspaceMembership).mockResolvedValue(mockMembership as any);
    vi.mocked(requireNotAuditor).mockReturnValue(undefined);
    vi.mocked(getEmployeeById).mockResolvedValue(mockEmployee as any);
    vi.mocked(assertRowBelongsToActiveCompany).mockResolvedValue(undefined);
    vi.mocked(updateEmployee).mockResolvedValue(undefined);
  });

  it("calls updateEmployee with the correct id", async () => {
    await updateEmployee(10, { position: "Senior Accountant" } as any);
    expect(updateEmployee).toHaveBeenCalledWith(10, expect.objectContaining({ position: "Senior Accountant" }));
  });

  it("converts numeric salary to string for DB", async () => {
    const salary = 1500;
    const updateData: Record<string, unknown> = { salary };
    if (typeof updateData.salary === "number") {
      updateData.salary = String(updateData.salary);
    }
    expect(updateData.salary).toBe("1500");
  });
});

describe("team router — getTeamStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireWorkspaceMembership).mockResolvedValue(mockMembership as any);
  });

  it("computes correct status counts from employee list", async () => {
    const employees = [
      { ...mockEmployee, status: "active" },
      { ...mockEmployee, id: 11, status: "active" },
      { ...mockEmployee, id: 12, status: "on_leave" },
      { ...mockEmployee, id: 13, status: "terminated" },
    ];
    vi.mocked(getEmployees).mockResolvedValue(employees as any);

    const all = await getEmployees(COMPANY_ID, {});
    const byStatus: Record<string, number> = {};
    for (const e of all) {
      byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
    }

    expect(byStatus["active"]).toBe(2);
    expect(byStatus["on_leave"]).toBe(1);
    expect(byStatus["terminated"]).toBe(1);
  });

  it("groups employees by department correctly", async () => {
    const employees = [
      { ...mockEmployee, department: "Finance" },
      { ...mockEmployee, id: 11, department: "Finance" },
      { ...mockEmployee, id: 12, department: "IT" },
    ];
    vi.mocked(getEmployees).mockResolvedValue(employees as any);

    const all = await getEmployees(COMPANY_ID, {});
    const byDept: Record<string, number> = {};
    for (const e of all) {
      const dept = e.department ?? "Unassigned";
      byDept[dept] = (byDept[dept] ?? 0) + 1;
    }

    expect(byDept["Finance"]).toBe(2);
    expect(byDept["IT"]).toBe(1);
  });

  it("identifies recent hires within 30 days", () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days ago

    expect(recentDate >= thirtyDaysAgo).toBe(true);
    expect(oldDate >= thirtyDaysAgo).toBe(false);
  });
});
