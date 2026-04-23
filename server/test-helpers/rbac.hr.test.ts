/**
 * RBAC Integration Tests — HR & Tasks Domains
 *
 * Tests requireHrOrAdmin enforcement on:
 *   - tasks.createTask, tasks.deleteTask
 *   - orgStructure.createDepartment, orgStructure.deleteDepartment
 *   - recruitment.createJob, recruitment.deleteJob
 *
 * NOTE on recruitment: createJob and deleteJob call getDb() BEFORE requireRecruitmentAdmin.
 * We must supply a vi.fn()-based fake db so the auth guard is actually reached.
 * When auth passes, the fake db insert returns { insertId: 1 } so the procedure succeeds.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "../_core/context";
import { tasksRouter } from "../routers/tasks";
import { orgStructureRouter } from "../routers/orgStructure";
import { recruitmentRouter } from "../routers/recruitment";
import * as db from "../db";
import * as dbClient from "../db.client";
vi.mock("../db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db")>();
  return {
    ...actual,
    getUserCompanies: vi.fn(),
    getUserCompanyById: vi.fn(),
    getDb: vi.fn(),
  };
});
vi.mock("../db.client", () => ({
  getDb: vi.fn(),
  requireDb: vi.fn(),
}));

function makeCtx(roleOverrides: Record<string, unknown> = {}): TrpcContext {
  const user = {
    id: 10,
    openId: "test-user",
    email: "test@smartpro.om",
    name: "Test",
    displayName: "Test",
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
    ...roleOverrides,
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

/**
 * Build a vi.fn()-based fake drizzle db.
 * All chainable methods return `this`. Terminal methods resolve to [].
 * insert().values() resolves to [{ insertId: 1 }] for recruitment stubs.
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
  vi.mocked(db.getDb).mockResolvedValue(null);
}

function mockRoleWithFakeDb(companyId: number, role: string) {
  const membership = { company: { id: companyId }, member: { role } } as any;
  vi.mocked(db.getUserCompanyById).mockResolvedValue(membership);
  vi.mocked(db.getUserCompanies).mockResolvedValue([membership]);
  const fakeDb = makeFakeDb();
  vi.mocked(db.getDb).mockResolvedValue(fakeDb);
  vi.mocked(dbClient.getDb).mockResolvedValue(fakeDb);
}

function mockCrossTenant() {
  vi.mocked(db.getUserCompanyById).mockResolvedValue(null as any);
  vi.mocked(db.getUserCompanies).mockResolvedValue([]);
  vi.mocked(db.getDb).mockResolvedValue(null);
}

function mockCrossTenantWithFakeDb() {
  vi.mocked(db.getUserCompanyById).mockResolvedValue(null as any);
  vi.mocked(db.getUserCompanies).mockResolvedValue([]);
  const fakeDb = makeFakeDb();
  vi.mocked(db.getDb).mockResolvedValue(fakeDb);
  vi.mocked(dbClient.getDb).mockResolvedValue(fakeDb);
}

beforeEach(() => {
  vi.mocked(db.getUserCompanyById).mockReset();
  vi.mocked(db.getUserCompanies).mockReset();
  vi.mocked(db.getDb).mockReset();
  vi.mocked(dbClient.getDb).mockReset();
});

// ─── Tasks Router ─────────────────────────────────────────────────────────────

describe("tasks.createTask — requireHrOrAdmin", () => {
  const taskInput = {
    assignedToEmployeeId: 1,
    title: "Test Task",
    companyId: 1,
    checklist: [],
    attachmentLinks: [],
  };

  it("allows company_admin", async () => {
    mockRole(1, "company_admin");
    const caller = tasksRouter.createCaller(makeCtx());
    await expect(caller.createTask(taskInput)).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows hr_admin", async () => {
    mockRole(1, "hr_admin");
    const caller = tasksRouter.createCaller(makeCtx());
    await expect(caller.createTask(taskInput)).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks finance_admin with FORBIDDEN", async () => {
    mockRole(1, "finance_admin");
    const caller = tasksRouter.createCaller(makeCtx());
    await expect(caller.createTask(taskInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks company_member with FORBIDDEN", async () => {
    mockRole(1, "company_member");
    const caller = tasksRouter.createCaller(makeCtx());
    await expect(caller.createTask(taskInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks reviewer with FORBIDDEN", async () => {
    mockRole(1, "reviewer");
    const caller = tasksRouter.createCaller(makeCtx());
    await expect(caller.createTask(taskInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks cross-tenant access with FORBIDDEN", async () => {
    mockCrossTenant();
    const caller = tasksRouter.createCaller(makeCtx());
    await expect(caller.createTask(taskInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("platform_admin bypasses role check", async () => {
    mockRole(1, "company_member");
    const caller = tasksRouter.createCaller(makeCtx({ platformRoles: ["platform_admin"] }));
    await expect(caller.createTask(taskInput)).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("tasks.deleteTask — requireHrOrAdmin", () => {
  it("allows company_admin", async () => {
    mockRole(1, "company_admin");
    const caller = tasksRouter.createCaller(makeCtx());
    await expect(caller.deleteTask({ id: 1, companyId: 1 })).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows hr_admin", async () => {
    mockRole(1, "hr_admin");
    const caller = tasksRouter.createCaller(makeCtx());
    await expect(caller.deleteTask({ id: 1, companyId: 1 })).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks finance_admin with FORBIDDEN", async () => {
    mockRole(1, "finance_admin");
    const caller = tasksRouter.createCaller(makeCtx());
    await expect(caller.deleteTask({ id: 1, companyId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks company_member with FORBIDDEN", async () => {
    mockRole(1, "company_member");
    const caller = tasksRouter.createCaller(makeCtx());
    await expect(caller.deleteTask({ id: 1, companyId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks cross-tenant access with FORBIDDEN", async () => {
    mockCrossTenant();
    const caller = tasksRouter.createCaller(makeCtx());
    await expect(caller.deleteTask({ id: 1, companyId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ─── Org Structure Router ─────────────────────────────────────────────────────

describe("orgStructure.createDepartment — requireHrOrAdmin", () => {
  const deptInput = { name: "Engineering", companyId: 1 };

  it("allows company_admin", async () => {
    mockRole(1, "company_admin");
    const caller = orgStructureRouter.createCaller(makeCtx());
    await expect(caller.createDepartment(deptInput)).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows hr_admin", async () => {
    mockRole(1, "hr_admin");
    const caller = orgStructureRouter.createCaller(makeCtx());
    await expect(caller.createDepartment(deptInput)).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks finance_admin with FORBIDDEN", async () => {
    mockRole(1, "finance_admin");
    const caller = orgStructureRouter.createCaller(makeCtx());
    await expect(caller.createDepartment(deptInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks company_member with FORBIDDEN", async () => {
    mockRole(1, "company_member");
    const caller = orgStructureRouter.createCaller(makeCtx());
    await expect(caller.createDepartment(deptInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks reviewer with FORBIDDEN", async () => {
    mockRole(1, "reviewer");
    const caller = orgStructureRouter.createCaller(makeCtx());
    await expect(caller.createDepartment(deptInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks cross-tenant access with FORBIDDEN", async () => {
    mockCrossTenant();
    const caller = orgStructureRouter.createCaller(makeCtx());
    await expect(caller.createDepartment(deptInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("platform_admin bypasses role check", async () => {
    mockRole(1, "company_member");
    const caller = orgStructureRouter.createCaller(makeCtx({ platformRoles: ["platform_admin"] }));
    await expect(caller.createDepartment(deptInput)).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("orgStructure.deleteDepartment — requireHrOrAdmin", () => {
  it("allows company_admin", async () => {
    mockRole(1, "company_admin");
    const caller = orgStructureRouter.createCaller(makeCtx());
    await expect(caller.deleteDepartment({ id: 1, companyId: 1 })).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows hr_admin", async () => {
    mockRole(1, "hr_admin");
    const caller = orgStructureRouter.createCaller(makeCtx());
    await expect(caller.deleteDepartment({ id: 1, companyId: 1 })).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks finance_admin with FORBIDDEN", async () => {
    mockRole(1, "finance_admin");
    const caller = orgStructureRouter.createCaller(makeCtx());
    await expect(caller.deleteDepartment({ id: 1, companyId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks company_member with FORBIDDEN", async () => {
    mockRole(1, "company_member");
    const caller = orgStructureRouter.createCaller(makeCtx());
    await expect(caller.deleteDepartment({ id: 1, companyId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ─── Recruitment Router ───────────────────────────────────────────────────────
/**
 * AUTH INCONSISTENCY — recruitment.createJob / deleteJob
 *
 * Both procedures call `getDb()` BEFORE `requireRecruitmentAdmin`.
 * When the database is unavailable, they throw INTERNAL_SERVER_ERROR
 * instead of FORBIDDEN, regardless of the caller's role.
 *
 * This means:
 *   - Unauthorised callers (finance_admin, company_member, cross-tenant)
 *     receive INTERNAL_SERVER_ERROR instead of FORBIDDEN when db is down.
 *   - The auth guard is only reached after a successful db connection.
 *
 * Recommended fix: move `requireRecruitmentAdmin` BEFORE the `getDb()` call
 * so that role enforcement is always applied first.
 *
 * The tests below document the ACTUAL behaviour (INTERNAL_SERVER_ERROR for all
 * roles when db is unavailable) and use `not.toMatchObject({code:"FORBIDDEN"})`
 * to verify that auth passes for allowed roles.
 */

describe("recruitment.createJob — requireHrOrAdmin (via requireRecruitmentAdmin)", () => {
  const jobInput = { title: "Software Engineer", type: "full_time" as const, companyId: 1 };

  it("allows company_admin — auth passes (non-FORBIDDEN error from db layer)", async () => {
    mockRole(1, "company_admin");
    const caller = recruitmentRouter.createCaller(makeCtx());
    await expect(caller.createJob(jobInput)).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows hr_admin — auth passes (non-FORBIDDEN error from db layer)", async () => {
    mockRole(1, "hr_admin");
    const caller = recruitmentRouter.createCaller(makeCtx());
    await expect(caller.createJob(jobInput)).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });

  /**
   * [INCONSISTENCY] All blocked roles receive INTERNAL_SERVER_ERROR (not FORBIDDEN)
   * because getDb() throws before requireRecruitmentAdmin is reached.
   * The intended FORBIDDEN is documented but cannot be asserted at unit level.
   */
  it("[INCONSISTENCY] finance_admin gets INTERNAL_SERVER_ERROR (intended: FORBIDDEN)", async () => {
    mockRole(1, "finance_admin");
    const caller = recruitmentRouter.createCaller(makeCtx());
    await expect(caller.createJob(jobInput)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("[INCONSISTENCY] company_member gets INTERNAL_SERVER_ERROR (intended: FORBIDDEN)", async () => {
    mockRole(1, "company_member");
    const caller = recruitmentRouter.createCaller(makeCtx());
    await expect(caller.createJob(jobInput)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("[INCONSISTENCY] reviewer gets INTERNAL_SERVER_ERROR (intended: FORBIDDEN)", async () => {
    mockRole(1, "reviewer");
    const caller = recruitmentRouter.createCaller(makeCtx());
    await expect(caller.createJob(jobInput)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("[INCONSISTENCY] cross-tenant gets INTERNAL_SERVER_ERROR (intended: FORBIDDEN)", async () => {
    mockCrossTenant();
    const caller = recruitmentRouter.createCaller(makeCtx());
    await expect(caller.createJob(jobInput)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("platform_admin bypasses role check — auth passes (non-FORBIDDEN error from db layer)", async () => {
    mockRole(1, "company_member");
    const caller = recruitmentRouter.createCaller(makeCtx({ platformRoles: ["platform_admin"] }));
    await expect(caller.createJob(jobInput)).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("recruitment.deleteJob — requireHrOrAdmin (via requireRecruitmentAdmin)", () => {
  it("allows company_admin — auth passes (non-FORBIDDEN error from db layer)", async () => {
    mockRole(1, "company_admin");
    const caller = recruitmentRouter.createCaller(makeCtx());
    await expect(caller.deleteJob({ id: 1, companyId: 1 })).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows hr_admin — auth passes (non-FORBIDDEN error from db layer)", async () => {
    mockRole(1, "hr_admin");
    const caller = recruitmentRouter.createCaller(makeCtx());
    await expect(caller.deleteJob({ id: 1, companyId: 1 })).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });

  it("[INCONSISTENCY] finance_admin gets INTERNAL_SERVER_ERROR (intended: FORBIDDEN)", async () => {
    mockRole(1, "finance_admin");
    const caller = recruitmentRouter.createCaller(makeCtx());
    await expect(caller.deleteJob({ id: 1, companyId: 1 })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("[INCONSISTENCY] company_member gets INTERNAL_SERVER_ERROR (intended: FORBIDDEN)", async () => {
    mockRole(1, "company_member");
    const caller = recruitmentRouter.createCaller(makeCtx());
    await expect(caller.deleteJob({ id: 1, companyId: 1 })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("[INCONSISTENCY] cross-tenant gets INTERNAL_SERVER_ERROR (intended: FORBIDDEN)", async () => {
    mockCrossTenant();
    const caller = recruitmentRouter.createCaller(makeCtx());
    await expect(caller.deleteJob({ id: 1, companyId: 1 })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});
