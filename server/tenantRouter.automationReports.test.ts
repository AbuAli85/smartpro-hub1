import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { automationRouter } from "./routers/automation";
import { reportsRouter } from "./routers/reports";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";

function makeCtx(overrides: Partial<NonNullable<TrpcContext["user"]>> = {}): TrpcContext {
  return {
    user: {
      id: 42,
      openId: "o42",
      email: "u@test.om",
      name: "Tester",
      loginMethod: "manus",
      role: "user",
      platformRole: "company_member",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      ...overrides,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

/** Minimal chain for automation listRules (select → from → where → orderBy). */
const emptyAutomationDb = {
  select: () => ({
    from: () => ({
      where: () => ({
        orderBy: () => Promise.resolve([]),
      }),
    }),
  }),
};

describe("automation router — active workspace", () => {
  beforeEach(() => {
    vi.spyOn(db, "getDb").mockResolvedValue(emptyAutomationDb as never);
    vi.spyOn(db, "getUserCompanyById").mockReset();
    vi.spyOn(db, "getUserCompanies").mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("listRules rejects multi-membership user without companyId", async () => {
    vi.mocked(db.getUserCompanies).mockResolvedValue([
      { company: { id: 1 }, member: {} },
      { company: { id: 2 }, member: {} },
    ] as never);

    const caller = automationRouter.createCaller(makeCtx({ id: 99 }));
    await expect(caller.listRules()).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("companyId"),
    });
  });

  it("listRules succeeds for multi-membership when companyId matches membership", async () => {
    vi.mocked(db.getUserCompanies).mockResolvedValue([
      { company: { id: 1 }, member: {} },
      { company: { id: 2 }, member: {} },
    ] as never);
    vi.mocked(db.getUserCompanyById).mockResolvedValue({ company: { id: 2 }, member: {} } as never);

    const caller = automationRouter.createCaller(makeCtx({ id: 99 }));
    await expect(caller.listRules({ companyId: 2 })).resolves.toEqual([]);
  });
});

describe("reports router — platform company disambiguation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generateBillingSummary requires platform staff to pass companyId", async () => {
    const caller = reportsRouter.createCaller(
      makeCtx({ platformRole: "super_admin" }),
    );
    await expect(caller.generateBillingSummary({ month: 1, year: 2026 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("companyId"),
    });
  });
});
