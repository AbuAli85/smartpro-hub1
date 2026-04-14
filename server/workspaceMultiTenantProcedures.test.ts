import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";
import { automationSlaRouter } from "./routers/automationSla";
import { officersRouter } from "./routers/officers";
import { shiftRequestsRouter } from "./routers/shiftRequests";
import { hrRouter } from "./routers/hr";
import { contractsRouter } from "./routers/contracts";
import { financeHRRouter } from "./routers/financeHR";
import { recruitmentRouter } from "./routers/recruitment";
import * as db from "./db";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getUserCompanies: vi.fn(),
    getUserCompanyById: vi.fn(),
    getDb: vi.fn(),
  };
});

function makeMemberCtx(overrides?: Partial<NonNullable<TrpcContext["user"]>>): TrpcContext {
  const user = {
    id: 42,
    openId: "x",
    email: "a@b.c",
    name: "T",
    loginMethod: "manus" as const,
    role: "user" as const,
    platformRole: "company_member" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("workspace authority on user-facing routers", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
    vi.mocked(db.getDb).mockReset();
  });

  it("automationSla.checkSLAs rejects when multiple memberships and companyId omitted", async () => {
    vi.mocked(db.getUserCompanies).mockResolvedValue([
      { company: { id: 1 }, member: {} },
      { company: { id: 2 }, member: {} },
    ] as any);
    const caller = automationSlaRouter.createCaller(makeMemberCtx());
    await expect(caller.checkSLAs({})).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("companyId"),
    });
  });

  it("shiftRequests.adminList rejects when multiple memberships and companyId omitted", async () => {
    vi.mocked(db.getUserCompanies).mockResolvedValue([
      { company: { id: 1 }, member: {} },
      { company: { id: 2 }, member: {} },
    ] as any);
    const caller = shiftRequestsRouter.createCaller(makeMemberCtx());
    await expect(caller.adminList({})).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("hr.listJobs rejects when multiple memberships and companyId omitted", async () => {
    vi.mocked(db.getUserCompanies).mockResolvedValue([
      { company: { id: 1 }, member: {} },
      { company: { id: 2 }, member: {} },
    ] as any);
    const caller = hrRouter.createCaller(makeMemberCtx());
    await expect(caller.listJobs({})).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("contracts.list rejects when multiple memberships and companyId omitted", async () => {
    vi.mocked(db.getUserCompanies).mockResolvedValue([
      { company: { id: 1 }, member: {} },
      { company: { id: 2 }, member: {} },
    ] as any);
    const caller = contractsRouter.createCaller(makeMemberCtx());
    await expect(caller.list({})).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("financeHR.myExpenses rejects when multiple memberships and companyId omitted", async () => {
    vi.mocked(db.getUserCompanies).mockResolvedValue([
      { company: { id: 1 }, member: {} },
      { company: { id: 2 }, member: {} },
    ] as any);
    const caller = financeHRRouter.createCaller(makeMemberCtx());
    await expect(caller.myExpenses({})).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("recruitment.listJobs rejects when multiple memberships and companyId omitted", async () => {
    vi.mocked(db.getUserCompanies).mockResolvedValue([
      { company: { id: 1 }, member: {} },
      { company: { id: 2 }, member: {} },
    ] as any);
    const caller = recruitmentRouter.createCaller(makeMemberCtx());
    await expect(caller.listJobs({})).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("officers.listCertificates resolves workspace when companyId is explicit", async () => {
    vi.mocked(db.getUserCompanyById).mockResolvedValue({
      company: { id: 9 },
      member: { role: "company_admin" },
    } as any);
    vi.mocked(db.getDb).mockResolvedValue(null);
    const caller = officersRouter.createCaller(makeMemberCtx());
    await expect(caller.listCertificates({ companyId: 9 })).resolves.toEqual([]);
  });
});
