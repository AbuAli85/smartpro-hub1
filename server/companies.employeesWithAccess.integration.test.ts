import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getDb: vi.fn(),
    getUserCompanyById: vi.fn(),
  };
});

vi.mock("./_core/membership", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./_core/membership")>();
  return {
    ...actual,
    getActiveCompanyMembership: vi.fn(),
  };
});

import { companiesRouter } from "./routers/companies";
import * as db from "./db";
import * as membershipCore from "./_core/membership";

type AuthUser = NonNullable<TrpcContext["user"]>;

function makeCtx(overrides: Partial<AuthUser> = {}): TrpcContext {
  const user: AuthUser = {
    id: 1,
    openId: "test-open-id",
    email: "owner@acme.com",
    name: "Owner",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makeFakeDb(params: {
  employeesRows: any[];
  memberRows: any[];
  userRows: any[];
}) {
  let selectCall = 0;
  return {
    select: vi.fn(() => {
      const call = selectCall++;
      return {
        from: vi.fn(() => ({
          where: vi.fn(() => {
            if (call === 0) {
              return {
                orderBy: vi.fn(async () => params.employeesRows),
              };
            }
            if (call === 1) return Promise.resolve(params.memberRows);
            if (call === 2) return Promise.resolve(params.userRows);
            return Promise.resolve([]);
          }),
        })),
      };
    }),
  };
}

describe("companies.employeesWithAccess integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(membershipCore.getActiveCompanyMembership).mockResolvedValue({
      companyId: 10,
      role: "company_admin",
    });
    vi.mocked(db.getUserCompanyById).mockResolvedValue({
      company: { id: 10, name: "Acme LLC" } as any,
      member: { role: "company_admin", isActive: true } as any,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("preserves legacy API contract with active/inactive/no_access status mapping", async () => {
    const fakeDb = makeFakeDb({
      employeesRows: [
        {
          id: 1,
          firstName: "Ali",
          lastName: "One",
          firstNameAr: null,
          lastNameAr: null,
          email: "ali@acme.com",
          department: "Ops",
          position: "Lead",
          status: "active",
          userId: 101,
          employeeNumber: "E-001",
          nationality: "OM",
          hireDate: null,
        },
        {
          id: 2,
          firstName: "Basma",
          lastName: "Two",
          firstNameAr: null,
          lastNameAr: null,
          email: "basma@acme.com",
          department: "HR",
          position: "Generalist",
          status: "on_leave",
          userId: null,
          employeeNumber: "E-002",
          nationality: "OM",
          hireDate: null,
        },
      ],
      memberRows: [
        { id: 501, userId: 101, role: "company_member", isActive: true, joinedAt: new Date() },
      ],
      userRows: [
        { id: 101, name: "Ali One", email: "ali@acme.com", lastSignedIn: new Date("2026-01-02T00:00:00.000Z") },
      ],
    });
    vi.mocked(db.getDb).mockResolvedValue(fakeDb as any);

    const caller = companiesRouter.createCaller(makeCtx());
    const result = await caller.employeesWithAccess({ companyId: 10 });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      employeeId: 1,
      accessStatus: "active",
      memberRole: "company_member",
      memberId: 501,
      hasLogin: true,
    });
    expect(result[1]).toMatchObject({
      employeeId: 2,
      accessStatus: "no_access",
      memberRole: null,
      memberId: null,
      hasLogin: false,
    });
    for (const row of result) {
      expect(["active", "inactive", "no_access"]).toContain(row.accessStatus);
      expect(typeof row.hasLogin).toBe("boolean");
    }
  });

  it("maps suspended resolver state to legacy accessStatus=inactive", async () => {
    const fakeDb = makeFakeDb({
      employeesRows: [
        {
          id: 3,
          firstName: "Khalid",
          lastName: "Three",
          firstNameAr: null,
          lastNameAr: null,
          email: "khalid@acme.com",
          department: "Finance",
          position: "Accountant",
          status: "active",
          userId: 103,
          employeeNumber: "E-003",
          nationality: "OM",
          hireDate: null,
        },
      ],
      memberRows: [
        { id: 503, userId: 103, role: "finance_admin", isActive: false, joinedAt: new Date() },
      ],
      userRows: [
        { id: 103, name: "Khalid Three", email: "khalid@acme.com", lastSignedIn: null },
      ],
    });
    vi.mocked(db.getDb).mockResolvedValue(fakeDb as any);

    const caller = companiesRouter.createCaller(makeCtx());
    const result = await caller.employeesWithAccess({ companyId: 10 });

    expect(result).toHaveLength(1);
    expect(result[0]?.accessStatus).toBe("inactive");
    expect(result[0]?.memberRole).toBe("finance_admin");
    expect(result[0]?.hasLogin).toBe(true);
  });

  it("keeps hasLogin true for link-drift identity match via email when employee.userId is null", async () => {
    const fakeDb = makeFakeDb({
      employeesRows: [
        {
          id: 4,
          firstName: "Noor",
          lastName: "Four",
          firstNameAr: null,
          lastNameAr: null,
          email: "noor@acme.com",
          department: "HR",
          position: "Manager",
          status: "active",
          userId: null,
          employeeNumber: "E-004",
          nationality: "OM",
          hireDate: null,
        },
      ],
      memberRows: [
        { id: 504, userId: 104, role: "hr_admin", isActive: true, joinedAt: new Date() },
      ],
      userRows: [
        { id: 104, name: "Noor Four", email: "NOOR@ACME.COM", lastSignedIn: new Date("2026-01-03T00:00:00.000Z") },
      ],
    });
    vi.mocked(db.getDb).mockResolvedValue(fakeDb as any);

    const caller = companiesRouter.createCaller(makeCtx());
    const result = await caller.employeesWithAccess({ companyId: 10 });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      accessStatus: "active",
      memberRole: "hr_admin",
      memberId: 504,
      hasLogin: true,
      loginEmail: "NOOR@ACME.COM",
    });
  });
});
