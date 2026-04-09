import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";
import { operationsRouter } from "./routers/operations";
import * as db from "./db";
import * as membership from "./_core/membership";
import {
  payrollRuns,
  workPermits,
  governmentServiceCases,
  leaveRequests,
  employeeTasks,
  employeeDocuments,
} from "../drizzle/schema";

type AuthUser = NonNullable<TrpcContext["user"]>;

function makeCtx(overrides: Partial<AuthUser> = {}): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "open-1",
      email: "owner@test.om",
      name: "Owner",
      loginMethod: "manus",
      role: "user",
      platformRole: "company_admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      ...overrides,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function createTableAwareDb(queue: { table: object; rows: unknown[] }[]) {
  const selectImpl = () => ({
    from: (table: object) => ({
      where: () => ({
        orderBy: () => ({
          limit: (n: number) => Promise.resolve((queue.find((q) => q.table === table)?.rows ?? []).slice(0, n)),
        }),
        limit: (n: number) => Promise.resolve((queue.find((q) => q.table === table)?.rows ?? []).slice(0, n)),
      }),
    }),
  });

  return {
    select: vi.fn(selectImpl),
  };
}

describe("operations.getRoleActionQueue", () => {
  beforeEach(() => {
    vi.spyOn(membership, "requireWorkspaceMembership").mockResolvedValue({
      companyId: 1,
      role: "company_admin",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects cross-company access for non-platform user", async () => {
    vi.spyOn(db, "getDb").mockResolvedValue(createTableAwareDb([]) as never);
    vi.spyOn(membership, "requireWorkspaceMembership").mockRejectedValue(
      new TRPCError({ code: "FORBIDDEN", message: "No active company membership." }),
    );

    const caller = operationsRouter.createCaller(makeCtx({ platformRole: "company_admin", role: "user" }));
    await expect(caller.getRoleActionQueue({ companyId: 999 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("filters finance/hr data for reviewer while allowing compliance sources", async () => {
    const now = new Date();
    const mockDb = createTableAwareDb([
      {
        table: payrollRuns,
        rows: [{ id: 10, status: "draft", periodMonth: now.getMonth() + 1, periodYear: now.getFullYear(), paidAt: null }],
      },
      {
        table: workPermits,
        rows: [{ id: 11, employeeId: 9, permitStatus: "active", expiryDate: new Date(now.getTime() - 86400000) }],
      },
      {
        table: governmentServiceCases,
        rows: [{ id: 12, caseType: "renewal", assignedTo: null, dueDate: new Date(now.getTime() - 86400000), caseStatus: "submitted" }],
      },
      {
        table: leaveRequests,
        rows: [{ id: 13, status: "pending", createdAt: new Date(now.getTime() - 5 * 86400000) }],
      },
      {
        table: employeeTasks,
        rows: [{ id: 14, title: "Blocked task", status: "blocked", dueDate: now, assignedByUserId: 1 }],
      },
      {
        table: employeeDocuments,
        rows: [{ id: 15, expiresAt: null, verificationStatus: "pending" }],
      },
    ]);
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);
    vi.spyOn(membership, "requireWorkspaceMembership").mockResolvedValue({
      companyId: 1,
      role: "reviewer",
    });

    const caller = operationsRouter.createCaller(makeCtx({ role: "user", platformRole: "company_member" }));
    const rows = await caller.getRoleActionQueue({ companyId: 1 });

    expect(rows.some((r) => r.type === "payroll_blocker")).toBe(false);
    expect(rows.some((r) => r.type === "hr_approval")).toBe(false);
    expect(rows.some((r) => r.type === "task")).toBe(false);
    expect(rows.some((r) => r.type === "permit_expiry")).toBe(true);
    expect(rows.some((r) => r.type === "government_case_overdue")).toBe(true);
  });

  it("returns normalized queue items in happy path", async () => {
    const now = new Date();
    const mockDb = createTableAwareDb([
      {
        table: payrollRuns,
        rows: [{ id: 20, status: "approved", periodMonth: now.getMonth() + 1, periodYear: now.getFullYear(), paidAt: null }],
      },
      {
        table: workPermits,
        rows: [{ id: 21, employeeId: 5, permitStatus: "active", expiryDate: new Date(now.getTime() + 2 * 86400000) }],
      },
      {
        table: governmentServiceCases,
        rows: [],
      },
      {
        table: leaveRequests,
        rows: [{ id: 22, status: "pending", createdAt: new Date(now.getTime() - 2 * 86400000) }],
      },
      {
        table: employeeTasks,
        rows: [],
      },
      {
        table: employeeDocuments,
        rows: [{ id: 23, expiresAt: new Date(now.getTime() + 5 * 86400000), verificationStatus: "verified" }],
      },
    ]);
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = operationsRouter.createCaller(makeCtx());
    const rows = await caller.getRoleActionQueue({ companyId: 1, roleView: "admin" });

    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    const first = rows[0];
    expect(first?.id).toEqual(expect.any(String));
    expect(first?.type).toEqual(expect.any(String));
    expect(first?.title).toEqual(expect.any(String));
    expect(first?.severity).toEqual(expect.any(String));
    expect(first?.status).toEqual(expect.any(String));
    expect(first?.href).toEqual(expect.any(String));
    expect(first?.reason).toEqual(expect.any(String));
    expect(first?.ownerUserId == null || typeof first?.ownerUserId === "string").toBe(true);
    expect(first?.dueAt == null || typeof first?.dueAt === "string").toBe(true);
    if (first?.type === "permit_expiry") {
      expect(first.href).toMatch(/^\/workforce\/permits\?status=(expired|expiring_soon)$/);
    }
  });
});
