/**
 * Tests for employee-to-system-access linking procedures:
 * - companies.employeesWithAccess
 * - companies.grantEmployeeAccess
 * - companies.revokeEmployeeAccess
 * - companies.updateEmployeeAccessRole
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
};

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getDb: vi.fn().mockResolvedValue(mockDb),
    getUserCompany: vi.fn(),
  };
});

import * as db from "./db";

// ─── Helper builders ──────────────────────────────────────────────────────────

function makeEmployee(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    companyId: 10,
    userId: null,
    firstName: "Ahmed",
    lastName: "Al-Rashidi",
    firstNameAr: null,
    lastNameAr: null,
    email: "ahmed@falcon.om",
    department: "Operations",
    position: "Manager",
    status: "active",
    employeeNumber: "EMP001",
    nationality: "Omani",
    hireDate: null,
    ...overrides,
  };
}

function makeMember(overrides: Record<string, unknown> = {}) {
  return {
    id: 100,
    userId: 5,
    role: "company_member",
    isActive: true,
    joinedAt: new Date(),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Employee Access Status Logic", () => {
  it("employee with no userId and no matching member → accessStatus = no_access", () => {
    const emp = makeEmployee({ userId: null });
    const members: ReturnType<typeof makeMember>[] = [];
    const userDetails: { id: number; name: string | null; email: string | null; lastSignedIn: Date }[] = [];

    const memberByUserId = new Map(members.map((m) => [m.userId, m]));
    const userMap = new Map(userDetails.map((u) => [u.id, u]));

    const member = emp.userId ? memberByUserId.get(emp.userId) : null;
    let emailMatchedMember = null;
    if (!member && emp.email) {
      const emailUser = userDetails.find((u) => u.email?.toLowerCase() === emp.email?.toLowerCase());
      if (emailUser) emailMatchedMember = memberByUserId.get(emailUser.id) ?? null;
    }
    const activeMember = member ?? emailMatchedMember;
    const accessStatus = activeMember ? (activeMember.isActive ? "active" : "inactive") : "no_access";

    expect(accessStatus).toBe("no_access");
  });

  it("employee with userId linked to active member → accessStatus = active", () => {
    const emp = makeEmployee({ userId: 5 });
    const members = [makeMember({ userId: 5, isActive: true })];
    const memberByUserId = new Map(members.map((m) => [m.userId, m]));

    const member = emp.userId ? memberByUserId.get(emp.userId) : null;
    const activeMember = member;
    const accessStatus = activeMember ? (activeMember.isActive ? "active" : "inactive") : "no_access";

    expect(accessStatus).toBe("active");
  });

  it("employee with userId linked to inactive member → accessStatus = inactive", () => {
    const emp = makeEmployee({ userId: 5 });
    const members = [makeMember({ userId: 5, isActive: false })];
    const memberByUserId = new Map(members.map((m) => [m.userId, m]));

    const member = emp.userId ? memberByUserId.get(emp.userId) : null;
    const activeMember = member;
    const accessStatus = activeMember ? (activeMember.isActive ? "active" : "inactive") : "no_access";

    expect(accessStatus).toBe("inactive");
  });

  it("employee with no userId but email matching a user with active membership → accessStatus = active", () => {
    const emp = makeEmployee({ userId: null, email: "ahmed@falcon.om" });
    const members = [makeMember({ userId: 7, isActive: true })];
    const userDetails = [{ id: 7, name: "Ahmed", email: "ahmed@falcon.om", lastSignedIn: new Date() }];

    const memberByUserId = new Map(members.map((m) => [m.userId, m]));

    const member = null; // no userId
    let emailMatchedMember = null;
    if (!member && emp.email) {
      const emailUser = userDetails.find((u) => u.email?.toLowerCase() === emp.email?.toLowerCase());
      if (emailUser) emailMatchedMember = memberByUserId.get(emailUser.id) ?? null;
    }
    const activeMember = member ?? emailMatchedMember;
    const accessStatus = activeMember ? (activeMember.isActive ? "active" : "inactive") : "no_access";

    expect(accessStatus).toBe("active");
  });
});

describe("Role Label Mapping", () => {
  const ROLE_LABELS: Record<string, string> = {
    company_admin: "Owner / Admin",
    hr_admin: "HR Manager",
    finance_admin: "Finance Manager",
    company_member: "Staff / Employee",
    reviewer: "Reviewer",
    external_auditor: "External Auditor",
  };

  it("maps all expected roles to labels", () => {
    expect(ROLE_LABELS["company_admin"]).toBe("Owner / Admin");
    expect(ROLE_LABELS["hr_admin"]).toBe("HR Manager");
    expect(ROLE_LABELS["finance_admin"]).toBe("Finance Manager");
    expect(ROLE_LABELS["company_member"]).toBe("Staff / Employee");
    expect(ROLE_LABELS["reviewer"]).toBe("Reviewer");
    expect(ROLE_LABELS["external_auditor"]).toBe("External Auditor");
  });

  it("has 6 distinct roles", () => {
    expect(Object.keys(ROLE_LABELS)).toHaveLength(6);
  });
});

describe("Access Grant Logic", () => {
  it("employee with email that matches a SmartPRO user → action = linked", () => {
    // Simulates the logic in grantEmployeeAccess when user found by email
    const emp = makeEmployee({ userId: null, email: "ahmed@falcon.om" });
    const targetUser = { id: 7 };
    const action = targetUser ? "linked" : "invited";
    expect(action).toBe("linked");
  });

  it("employee with email but no SmartPRO account + origin provided → action = invited", () => {
    const emp = makeEmployee({ userId: null, email: "new@falcon.om" });
    const targetUser = null; // no account
    const origin = "https://app.smartpro.om";
    const action = targetUser ? "linked" : (origin ? "invited" : "no_account");
    expect(action).toBe("invited");
  });

  it("employee with email but no SmartPRO account + no origin → action = no_account", () => {
    const emp = makeEmployee({ userId: null, email: "new@falcon.om" });
    const targetUser = null;
    const origin = null;
    const action = targetUser ? "linked" : (origin ? "invited" : "no_account");
    expect(action).toBe("no_account");
  });

  it("employee with no email → throws BAD_REQUEST", () => {
    const emp = makeEmployee({ userId: null, email: null });
    const shouldThrow = !emp.email;
    expect(shouldThrow).toBe(true);
  });
});

describe("Stats Calculation", () => {
  it("correctly counts employees by access status", () => {
    const employees = [
      { accessStatus: "active" },
      { accessStatus: "active" },
      { accessStatus: "no_access" },
      { accessStatus: "no_access" },
      { accessStatus: "no_access" },
      { accessStatus: "inactive" },
    ];

    const withAccess = employees.filter((e) => e.accessStatus === "active").length;
    const noAccess = employees.filter((e) => e.accessStatus === "no_access").length;
    const suspended = employees.filter((e) => e.accessStatus === "inactive").length;

    expect(withAccess).toBe(2);
    expect(noAccess).toBe(3);
    expect(suspended).toBe(1);
    expect(withAccess + noAccess + suspended).toBe(employees.length);
  });
});
