import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapMemberRoleToPlatformRole } from "@shared/rbac";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getDb: vi.fn(),
    getUserCompanyById: vi.fn(),
    /** Used by platform-operator paths in `updateMemberRole` / `resolveCompanyWorkspaceOrPlatformTarget`. */
    getCompanyById: vi.fn(),
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
import { syncPlatformRoleForCompanyMembership } from "./routers/companies";
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
    platformRole: "super_admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    isActive: true,
    phone: null,
    avatarUrl: null,
    ...overrides,
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("syncPlatformRoleForCompanyMembership", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("updates users.platformRole when it differs from mapped membership role", async () => {
    let selectCall = 0;
    const userUpdates: unknown[] = [];
    const fakeDb = {
      select: vi.fn(() => {
        selectCall += 1;
        if (selectCall === 1) {
          return {
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                orderBy: vi.fn(async () => [{ id: 10, role: "hr_admin" }]),
              })),
            })),
          };
        }
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => [{ platformRole: "company_member" }]),
            })),
          })),
        };
      }),
      update: vi.fn(() => ({
        set: vi.fn((data: unknown) => ({
          where: vi.fn(async () => {
            userUpdates.push(data);
          }),
        })),
      })),
    };

    await syncPlatformRoleForCompanyMembership(fakeDb as any, 5, 10);

    expect(userUpdates).toEqual([{ platformRole: mapMemberRoleToPlatformRole("hr_admin") }]);
  });

  it("no-op when platformRole already matches mapped role", async () => {
    let selectCall = 0;
    const fakeDb = {
      select: vi.fn(() => {
        selectCall += 1;
        if (selectCall === 1) {
          return {
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                orderBy: vi.fn(async () => [{ id: 10, role: "hr_admin" }]),
              })),
            })),
          };
        }
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => [{ platformRole: "company_admin" }]),
            })),
          })),
        };
      }),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(async () => {
            throw new Error("users.update should not run");
          }),
        })),
      })),
    };

    await syncPlatformRoleForCompanyMembership(fakeDb as any, 5, 10);
    expect(fakeDb.update).not.toHaveBeenCalled();
  });

  it("warns and does not update users when users row is missing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let selectCall = 0;
    const fakeDb = {
      select: vi.fn(() => {
        selectCall += 1;
        if (selectCall === 1) {
          return {
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                orderBy: vi.fn(async () => [{ id: 10, role: "hr_admin" }]),
              })),
            })),
          };
        }
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => []),
            })),
          })),
        };
      }),
      update: vi.fn(),
    };

    await syncPlatformRoleForCompanyMembership(fakeDb as any, 5, 10);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("users row missing"),
      expect.objectContaining({ companyId: 10, userId: 5 }),
    );
    expect(fakeDb.update).not.toHaveBeenCalled();
  });

  it("returns early when no membership rows", async () => {
    const fakeDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(async () => []),
          })),
        })),
      })),
      update: vi.fn(),
    };

    await syncPlatformRoleForCompanyMembership(fakeDb as any, 5, 10);
    expect(fakeDb.update).not.toHaveBeenCalled();
  });

  it("warns when duplicate membership rows exist and uses lowest id", async () => {
    let selectCall = 0;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fakeDb = {
      select: vi.fn(() => {
        selectCall += 1;
        if (selectCall === 1) {
          return {
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                orderBy: vi.fn(async () => [
                  { id: 2, role: "company_member" },
                  { id: 9, role: "company_admin" },
                ]),
              })),
            })),
          };
        }
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => [{ platformRole: "client" }]),
            })),
          })),
        };
      }),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(async () => {}),
        })),
      })),
    };

    await syncPlatformRoleForCompanyMembership(fakeDb as any, 5, 10);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("duplicate company_members rows"),
      expect.objectContaining({
        companyId: 10,
        userId: 5,
        memberIds: [2, 9],
        chosenMemberId: 2,
      }),
    );
  });
});

describe("companiesRouter role mutations sync platformRole", () => {
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
    vi.mocked(db.getCompanyById).mockResolvedValue({ id: 10, name: "Acme LLC" } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("updateMemberRole updates users.platformRole after membership role change", async () => {
    let selectCall = 0;
    const userSets: unknown[] = [];
    const fakeDb = {
      select: vi.fn(() => {
        selectCall += 1;
        if (selectCall === 1) {
          return {
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: vi.fn(async () => [{ userId: 5, role: "company_member" }]),
              })),
            })),
          };
        }
        if (selectCall === 2) {
          return {
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                orderBy: vi.fn(async () => [{ id: 99, role: "hr_admin" }]),
              })),
            })),
          };
        }
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => [{ platformRole: "company_member" }]),
            })),
          })),
        };
      }),
      update: vi.fn(() => ({
        set: vi.fn((data: unknown) => ({
          where: vi.fn(async () => {
            if ("platformRole" in (data as object)) userSets.push(data);
          }),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(async () => {}),
      })),
    };

    vi.mocked(db.getDb).mockResolvedValue(fakeDb as any);

    const caller = companiesRouter.createCaller(makeCtx());
    await caller.updateMemberRole({
      memberId: 99,
      companyId: 10,
      role: "hr_admin",
    });

    expect(userSets).toContainEqual({ platformRole: mapMemberRoleToPlatformRole("hr_admin") });
  });

  it("updateMemberRole (company_admin caller) updates users.platformRole after assertCompanyAdmin", async () => {
    let selectCall = 0;
    const userSets: unknown[] = [];
    const fakeDb = {
      select: vi.fn(() => {
        selectCall += 1;
        if (selectCall === 1) {
          return {
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: vi.fn(async () => [{ role: "company_admin" }]),
              })),
            })),
          };
        }
        if (selectCall === 2) {
          return {
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: vi.fn(async () => [{ userId: 5, role: "company_member" }]),
              })),
            })),
          };
        }
        if (selectCall === 3) {
          return {
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                orderBy: vi.fn(async () => [{ id: 99, role: "hr_admin" }]),
              })),
            })),
          };
        }
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => [{ platformRole: "company_member" }]),
            })),
          })),
        };
      }),
      update: vi.fn(() => ({
        set: vi.fn((data: unknown) => ({
          where: vi.fn(async () => {
            if ("platformRole" in (data as object)) userSets.push(data);
          }),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(async () => {}),
      })),
    };

    vi.mocked(db.getDb).mockResolvedValue(fakeDb as any);

    const caller = companiesRouter.createCaller(
      makeCtx({ role: "user", platformRole: "company_admin" }),
    );
    await caller.updateMemberRole({
      memberId: 99,
      companyId: 10,
      role: "hr_admin",
    });

    expect(userSets).toContainEqual({ platformRole: mapMemberRoleToPlatformRole("hr_admin") });
  });

  it("updateEmployeeAccessRole updates users.platformRole after membership role change", async () => {
    const employeeRowId = 42;
    let selectCall = 0;
    const userSets: unknown[] = [];
    const fakeDb = {
      select: vi.fn(() => {
        selectCall += 1;
        if (selectCall === 1) {
          return {
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: vi.fn(async () => [{ id: employeeRowId, email: "e@acme.com", userId: 5 }]),
              })),
            })),
          };
        }
        if (selectCall === 2) {
          return {
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: vi.fn(async () => [{ id: 200 }]),
              })),
            })),
          };
        }
        if (selectCall === 3) {
          return {
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                orderBy: vi.fn(async () => [{ id: 200, role: "finance_admin" }]),
              })),
            })),
          };
        }
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => [{ platformRole: "company_member" }]),
            })),
          })),
        };
      }),
      update: vi.fn(() => ({
        set: vi.fn((data: unknown) => ({
          where: vi.fn(async () => {
            if ("platformRole" in (data as object)) userSets.push(data);
          }),
        })),
      })),
    };

    vi.mocked(db.getDb).mockResolvedValue(fakeDb as any);

    const caller = companiesRouter.createCaller(makeCtx());
    await caller.updateEmployeeAccessRole({
      employeeId: employeeRowId,
      companyId: 10,
      role: "finance_admin",
    });

    expect(userSets).toContainEqual({ platformRole: mapMemberRoleToPlatformRole("finance_admin") });
  });
});
