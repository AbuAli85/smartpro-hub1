import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { financeHRRouter } from "./routers/financeHR";
import type { TrpcContext } from "./_core/context";
import { companyMembers, employeeSelfReviews, employees, trainingRecords } from "../drizzle/schema";

function makeCtx(userId = 1): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `open-${userId}`,
      email: "u@test.om",
      name: "Test",
      loginMethod: "manus",
      role: "user",
      platformRole: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function createTableAwareDb(queue: { table: object; rows: unknown[] }[]) {
  const mock: Record<string, unknown> = {
    select: vi.fn(() => ({
      from: vi.fn((table: object) => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => {
            const entry = queue.find((q) => q.table === table);
            const rows = entry?.rows ?? [];
            return Promise.resolve(rows);
          }),
        })),
        leftJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => Promise.resolve([])),
          })),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => Promise.resolve([{ insertId: 1 }])),
    })),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mock)),
  };
  return mock;
}

/** Spread overrides onto a DB mock and rebind `transaction` so `tx` is the merged object (insert spy works). */
function mergeMockDb(queue: { table: object; rows: unknown[] }[], overrides: Record<string, unknown> = {}) {
  const m = { ...createTableAwareDb(queue), ...overrides } as Record<string, unknown>;
  m.transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(m));
  return m;
}

describe("financeHR performance admin procedures (PR-1 / PR-2)", () => {
  beforeEach(() => {
    vi.spyOn(db, "getUserCompany").mockResolvedValue({
      company: { id: 1, name: "Co", slug: "co", country: "OM", status: "active" } as never,
      member: { role: "company_member", permissions: [] } as never,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("adminListTraining FORBIDDEN without HR performance overview permission", async () => {
    const mockDb = createTableAwareDb([
      { table: companyMembers, rows: [{ role: "company_member", permissions: [] }] },
    ]);
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = financeHRRouter.createCaller(makeCtx());
    await expect(caller.adminListTraining()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("adminListSelfReviews FORBIDDEN for finance_admin (generic hr.performance.read is not enough)", async () => {
    const mockDb = createTableAwareDb([
      { table: companyMembers, rows: [{ role: "finance_admin", permissions: [] }] },
    ]);
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = financeHRRouter.createCaller(makeCtx());
    await expect(caller.adminListSelfReviews()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("updateTrainingStatus BAD_REQUEST when skipping in_progress (assigned → completed)", async () => {
    const mockDb = {
      select: vi.fn(() => ({
        from: vi.fn((table: object) => {
          if (table === employees) {
            return {
              where: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve([])),
              })),
            };
          }
          if (table === trainingRecords) {
            return {
              where: vi.fn(() => ({
                limit: vi.fn(() =>
                  Promise.resolve([
                    {
                      id: 1,
                      companyId: 1,
                      employeeUserId: 1,
                      trainingStatus: "assigned",
                    },
                  ])
                ),
              })),
            };
          }
          return { where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([])) })) };
        }),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve()),
        })),
      })),
    };
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = financeHRRouter.createCaller(makeCtx());
    await expect(caller.updateTrainingStatus({ id: 1, status: "completed" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("P1 adminUpdateTraining FORBIDDEN without permission", async () => {
    const mockDb = createTableAwareDb([
      { table: companyMembers, rows: [{ role: "company_member", permissions: [] }] },
    ]);
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = financeHRRouter.createCaller(makeCtx());
    await expect(caller.adminUpdateTraining({ id: 1, trainingStatus: "in_progress" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("P2 adminUpdateTraining FORBIDDEN when training belongs to another company", async () => {
    const mockDb = createTableAwareDb([
      { table: companyMembers, rows: [{ role: "company_member", permissions: ["hr.training.manage"] }] },
      {
        table: trainingRecords,
        rows: [{ id: 1, companyId: 2, employeeUserId: 10, trainingStatus: "assigned" }],
      },
    ]);
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = financeHRRouter.createCaller(makeCtx());
    await expect(
      caller.adminUpdateTraining({ id: 1, trainingStatus: "in_progress" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("P3 adminUpdateTraining NOT_FOUND for missing training row", async () => {
    const mockDb = createTableAwareDb([
      { table: companyMembers, rows: [{ role: "company_member", permissions: ["hr.training.manage"] }] },
      { table: trainingRecords, rows: [] },
    ]);
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = financeHRRouter.createCaller(makeCtx());
    await expect(caller.adminUpdateTraining({ id: 999, score: 80 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("P6 adminUpdateSelfReview FORBIDDEN when review belongs to another company", async () => {
    const mockDb = createTableAwareDb([
      { table: companyMembers, rows: [{ role: "company_member", permissions: ["hr.self_reviews.review"] }] },
      {
        table: employeeSelfReviews,
        rows: [{ id: 1, companyId: 2, employeeUserId: 10, reviewStatus: "submitted" }],
      },
    ]);
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = financeHRRouter.createCaller(makeCtx());
    await expect(
      caller.adminUpdateSelfReview({ id: 1, managerRating: 4 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("P7 adminUpdateTraining BAD_REQUEST on invalid transition", async () => {
    const mockDb = createTableAwareDb([
      { table: companyMembers, rows: [{ role: "company_member", permissions: ["hr.training.manage"] }] },
      {
        table: trainingRecords,
        rows: [{ id: 1, companyId: 1, employeeUserId: 10, trainingStatus: "completed" }],
      },
      { table: employees, rows: [{ id: 10, companyId: 1 }] },
    ]);
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = financeHRRouter.createCaller(makeCtx());
    await expect(
      caller.adminUpdateTraining({ id: 1, trainingStatus: "in_progress" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("adminUpdateTraining succeeds for hr_admin via PR-3 role defaults (no JSON permissions)", async () => {
    const mockDb = createTableAwareDb([
      { table: companyMembers, rows: [{ role: "hr_admin", permissions: [] }] },
      {
        table: trainingRecords,
        rows: [{ id: 1, companyId: 1, employeeUserId: 10, trainingStatus: "assigned" }],
      },
      { table: employees, rows: [{ id: 10, companyId: 1 }] },
    ]);
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = financeHRRouter.createCaller(makeCtx());
    const result = await caller.adminUpdateTraining({ id: 1, trainingStatus: "in_progress" });
    expect(result).toEqual({ success: true });
  });

  it("adminUpdateTraining succeeds with company_admin membership", async () => {
    const mockDb = createTableAwareDb([
      { table: companyMembers, rows: [{ role: "company_admin", permissions: [] }] },
      {
        table: trainingRecords,
        rows: [{ id: 1, companyId: 1, employeeUserId: 10, trainingStatus: "assigned" }],
      },
      { table: employees, rows: [{ id: 10, companyId: 1 }] },
    ]);
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = financeHRRouter.createCaller(makeCtx());
    const result = await caller.adminUpdateTraining({ id: 1, trainingStatus: "in_progress" });
    expect(result).toEqual({ success: true });
  });

  it("P4 adminListSelfReviews returns rows only for tenant (happy path with permission)", async () => {
    const joinedRows = [
      {
        review: { id: 1, companyId: 1, employeeUserId: 5, reviewStatus: "submitted" },
        empFirst: "A",
        empLast: "B",
        empDept: "Sales",
        empPosition: "Rep",
      },
    ];
    const mockDb = {
      select: vi.fn(() => ({
        from: vi.fn((table: object) => {
          if (table === companyMembers) {
            return {
              where: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve([{ role: "company_member", permissions: ["hr.self_reviews.read"] }])),
              })),
            };
          }
          if (table === employeeSelfReviews) {
            return {
              leftJoin: vi.fn(() => ({
                where: vi.fn(() => ({
                  orderBy: vi.fn(() => Promise.resolve(joinedRows)),
                })),
              })),
            };
          }
          return { where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([])) })) };
        }),
      })),
    };
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = financeHRRouter.createCaller(makeCtx());
    const rows = await caller.adminListSelfReviews();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.companyId).toBe(1);
  });

  it("P5 adminUpdateSelfReview sets reviewedAt only when transitioning to reviewed", async () => {
    const setSpy = vi.fn().mockReturnValue({
      where: vi.fn(() => Promise.resolve()),
    });
    const mockDb: Record<string, unknown> = {
      select: vi.fn(() => ({
        from: vi.fn((table: object) => {
          if (table === companyMembers) {
            return {
              where: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve([{ role: "company_member", permissions: ["hr.self_reviews.review"] }])),
              })),
            };
          }
          if (table === employeeSelfReviews) {
            return {
              where: vi.fn(() => ({
                limit: vi.fn(() =>
                  Promise.resolve([
                    {
                      id: 1,
                      companyId: 1,
                      employeeUserId: 10,
                      reviewStatus: "submitted",
                      managerRating: null,
                      managerFeedback: null,
                    },
                  ])
                ),
              })),
            };
          }
          if (table === employees) {
            return {
              where: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve([{ id: 10, companyId: 1 }])),
              })),
            };
          }
          return { where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([])) })) };
        }),
      })),
      update: vi.fn(() => ({ set: setSpy })),
      insert: vi.fn(() => ({
        values: vi.fn(() => Promise.resolve([{ insertId: 1 }])),
      })),
    };
    mockDb.transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockDb));
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = financeHRRouter.createCaller(makeCtx());
    await caller.adminUpdateSelfReview({ id: 1, reviewStatus: "reviewed", managerRating: 4 });

    expect(setSpy).toHaveBeenCalled();
    const payload = setSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.reviewedAt).toBeInstanceOf(Date);
    expect(payload.reviewedByUserId).toBe(1);
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it("PR-2 adminUpdateTraining emits audit with training.updated action", async () => {
    const auditValuesSpy = vi.fn(() => Promise.resolve([{ insertId: 1 }]));
    const insertSpy = vi.fn(() => ({ values: auditValuesSpy }));
    const mockDb = mergeMockDb(
      [
        { table: companyMembers, rows: [{ role: "company_admin", permissions: [] }] },
        {
          table: trainingRecords,
          rows: [{ id: 1, companyId: 1, employeeUserId: 10, trainingStatus: "assigned" }],
        },
        { table: employees, rows: [{ id: 10, companyId: 1 }] },
      ],
      { insert: insertSpy }
    );
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = financeHRRouter.createCaller(makeCtx());
    await caller.adminUpdateTraining({ id: 1, trainingStatus: "in_progress" });

    expect(auditValuesSpy).toHaveBeenCalled();
    const auditRow = auditValuesSpy.mock.calls[0]?.[0] as {
      action?: string;
      entityType?: string;
      beforeState?: unknown;
      afterState?: unknown;
    };
    expect(auditRow?.action).toBe("training.updated");
    expect(auditRow?.entityType).toBe("training_record");
    expect(auditRow?.beforeState).toBeDefined();
    expect(auditRow?.afterState).toBeDefined();
  });
});

describe("financeHR performance overview read models (PR-4)", () => {
  beforeEach(() => {
    vi.spyOn(db, "getUserCompany").mockResolvedValue({
      company: { id: 1, name: "Co", slug: "co", country: "OM", status: "active" } as never,
      member: { role: "company_member", permissions: [] } as never,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getHrPerformanceDashboard returns null when database is unavailable", async () => {
    vi.spyOn(db, "getDb").mockResolvedValue(null as never);

    const caller = financeHRRouter.createCaller(makeCtx());
    const result = await caller.getHrPerformanceDashboard();
    expect(result).toBeNull();
  });

  it("getHrPerformanceDashboard FORBIDDEN without HR overview permission", async () => {
    const mockDb = createTableAwareDb([
      { table: companyMembers, rows: [{ role: "company_member", permissions: [] }] },
    ]);
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = financeHRRouter.createCaller(makeCtx());
    await expect(caller.getHrPerformanceDashboard()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
