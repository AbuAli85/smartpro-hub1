import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { kpiRouter } from "./routers/kpi";
import type { TrpcContext } from "./_core/context";
import { companyMembers, employees, kpiTargets } from "../drizzle/schema";

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
        groupBy: vi.fn(() => ({
          orderBy: vi.fn(() => Promise.resolve([])),
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
    delete: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    })),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mock)),
  };
  return mock;
}

function mergeMockDb(queue: { table: object; rows: unknown[] }[], overrides: Record<string, unknown> = {}) {
  const m = { ...createTableAwareDb(queue), ...overrides } as Record<string, unknown>;
  m.transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(m));
  return m;
}

describe("kpi router (PR-5 targets)", () => {
  beforeEach(() => {
    vi.spyOn(db, "getUserCompany").mockResolvedValue({
      company: { id: 1, name: "Co", slug: "co", country: "OM", status: "active" } as never,
      member: { role: "company_member", permissions: [] } as never,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("setTarget FORBIDDEN without KPI target manage permission", async () => {
    const mockDb = createTableAwareDb([
      { table: companyMembers, rows: [{ role: "company_member", permissions: [] }] },
    ]);
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = kpiRouter.createCaller(makeCtx());
    await expect(
      caller.setTarget({
        employeeUserId: 5,
        year: 2026,
        month: 4,
        metricName: "Sales",
        metricType: "custom",
        targetValue: 100,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("transitionKpiTarget rejects invalid transition (completed → active)", async () => {
    const row = {
      id: 1,
      companyId: 1,
      employeeUserId: 10,
      periodYear: 2026,
      periodMonth: 4,
      metricName: "M",
      metricType: "custom",
      targetValue: "100",
      commissionRate: "0",
      commissionType: "percentage",
      currency: "OMR",
      notes: null,
      setByUserId: 1,
      targetStatus: "completed",
    };
    const mockDb = createTableAwareDb([
      { table: companyMembers, rows: [{ role: "hr_admin", permissions: [] }] },
      { table: kpiTargets, rows: [row] },
    ]);
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = kpiRouter.createCaller(makeCtx());
    await expect(caller.transitionKpiTarget({ id: 1, to: "active" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("logActivity rejects logging against a non-active target", async () => {
    const mockDb = createTableAwareDb([
      { table: kpiTargets, rows: [{ id: 7, companyId: 1, employeeUserId: 1, targetStatus: "completed" }] },
    ]);
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = kpiRouter.createCaller(makeCtx());
    await expect(
      caller.logActivity({
        logDate: "2026-04-05",
        metricName: "M",
        metricType: "custom",
        valueAchieved: 10,
        kpiTargetId: 7,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("setTarget rejects duplicate draft/active target for same period + metric", async () => {
    const mockDb = createTableAwareDb([
      { table: companyMembers, rows: [{ role: "hr_admin", permissions: [] }] },
      {
        table: employees,
        rows: [{ id: 5, companyId: 1, userId: 5, firstName: "A", lastName: "B" }],
      },
      {
        table: kpiTargets,
        rows: [
          {
            id: 99,
            companyId: 1,
            employeeUserId: 5,
            periodYear: 2026,
            periodMonth: 4,
            metricName: "Dup",
            targetStatus: "active",
          },
        ],
      },
    ]);
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = kpiRouter.createCaller(makeCtx());
    await expect(
      caller.setTarget({
        employeeUserId: 5,
        year: 2026,
        month: 4,
        metricName: "Dup",
        metricType: "custom",
        targetValue: 50,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("transitionKpiTarget rejects when audit insert fails (error propagates from transaction)", async () => {
    const auditValuesSpy = vi.fn(() => Promise.reject(new Error("audit insert failed")));
    const insertSpy = vi.fn(() => ({ values: auditValuesSpy }));
    const row = {
      id: 3,
      companyId: 1,
      employeeUserId: 10,
      periodYear: 2026,
      periodMonth: 4,
      metricName: "M",
      metricType: "custom",
      targetValue: "100",
      commissionRate: "0",
      commissionType: "percentage",
      currency: "OMR",
      notes: null,
      setByUserId: 1,
      targetStatus: "active",
    };
    const mockDb = mergeMockDb(
      [
        { table: companyMembers, rows: [{ role: "hr_admin", permissions: [] }] },
        { table: kpiTargets, rows: [row] },
      ],
      { insert: insertSpy }
    );
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = kpiRouter.createCaller(makeCtx());
    await expect(caller.transitionKpiTarget({ id: 3, to: "completed" })).rejects.toThrow("audit insert failed");
    expect(auditValuesSpy).toHaveBeenCalled();
  });

  it("deleteTarget (soft cancel) runs in transaction and writes audit", async () => {
    const auditValuesSpy = vi.fn(() => Promise.resolve([{ insertId: 1 }]));
    const insertSpy = vi.fn(() => ({ values: auditValuesSpy }));
    const row = {
      id: 2,
      companyId: 1,
      employeeUserId: 10,
      periodYear: 2026,
      periodMonth: 4,
      metricName: "M",
      metricType: "custom",
      targetValue: "100",
      commissionRate: "0",
      commissionType: "percentage",
      currency: "OMR",
      notes: null,
      setByUserId: 1,
      targetStatus: "active",
    };
    const mockDb = mergeMockDb(
      [
        { table: companyMembers, rows: [{ role: "hr_admin", permissions: [] }] },
        { table: kpiTargets, rows: [row] },
      ],
      { insert: insertSpy }
    );
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = kpiRouter.createCaller(makeCtx());
    await caller.deleteTarget({ id: 2 });

    expect(auditValuesSpy).toHaveBeenCalled();
    const auditRow = auditValuesSpy.mock.calls[0]?.[0] as { action?: string; entityType?: string };
    expect(auditRow?.entityType).toBe("kpi_target");
    expect(auditRow?.action).toBe("kpi_target.cancelled");
  });
});
