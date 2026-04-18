import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";
import { requiredActiveWorkspace } from "./_core/workspaceInput";
import { clientWorkspaceRouter } from "./routers/clientWorkspace";
import * as db from "./db";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getUserCompanyById: vi.fn(),
    getDb: vi.fn(),
  };
});

function makeCtx(overrides?: Partial<NonNullable<TrpcContext["user"]>>): TrpcContext {
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

describe("requiredActiveWorkspace", () => {
  it("requires a positive company id", () => {
    expect(requiredActiveWorkspace.safeParse({}).success).toBe(false);
    expect(requiredActiveWorkspace.safeParse({ companyId: 0 }).success).toBe(false);
    expect(requiredActiveWorkspace.safeParse({ companyId: 1 }).success).toBe(true);
  });
});

describe("clientWorkspaceRouter company scoping", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanyById).mockReset();
    vi.mocked(db.getDb).mockReset();
  });

  it("listEngagements rejects when companyId is omitted", async () => {
    const caller = clientWorkspaceRouter.createCaller(makeCtx());
    await expect(
      caller.listEngagements({ page: 1, pageSize: 10, filter: "all", sort: "recently_updated" } as Record<
        string,
        unknown
      >),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("listEngagements rejects when user is not a member of the requested company", async () => {
    vi.mocked(db.getUserCompanyById).mockResolvedValue(null);
    const caller = clientWorkspaceRouter.createCaller(makeCtx({ platformRole: "client" }));
    await expect(
      caller.listEngagements({
        companyId: 77,
        page: 1,
        pageSize: 10,
        filter: "all",
        sort: "recently_updated",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("listEngagements rejects when user is a member but not customer (client) role", async () => {
    vi.mocked(db.getUserCompanyById).mockResolvedValue({
      company: { id: 3 },
      member: { role: "company_admin" },
    } as any);
    const caller = clientWorkspaceRouter.createCaller(makeCtx({ platformRole: "company_admin" }));
    await expect(
      caller.listEngagements({
        companyId: 3,
        page: 1,
        pageSize: 10,
        filter: "all",
        sort: "recently_updated",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("listEngagements verifies membership before returning empty when db is unavailable", async () => {
    vi.mocked(db.getUserCompanyById).mockResolvedValue({
      company: { id: 3 },
      member: { role: "client" },
    } as any);
    vi.mocked(db.getDb).mockResolvedValue(null);
    const caller = clientWorkspaceRouter.createCaller(makeCtx({ platformRole: "client" }));
    await expect(
      caller.listEngagements({
        companyId: 3,
        page: 1,
        pageSize: 10,
        filter: "all",
        sort: "recently_updated",
      }),
    ).resolves.toEqual({ items: [], total: 0 });
  });

  it("getHomeSummary rejects omitted companyId", async () => {
    const caller = clientWorkspaceRouter.createCaller(makeCtx());
    await expect(caller.getHomeSummary({} as Record<string, unknown>)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("listTeam requires companyId for portal-only shaped users", async () => {
    vi.mocked(db.getUserCompanyById).mockResolvedValue({
      company: { id: 2 },
      member: { role: "client" },
    } as any);
    vi.mocked(db.getDb).mockResolvedValue(null);
    const caller = clientWorkspaceRouter.createCaller(makeCtx({ platformRole: "client" }));
    await expect(caller.listTeam({ companyId: 2 })).resolves.toEqual([]);
  });
});
