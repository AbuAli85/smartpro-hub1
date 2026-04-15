import { describe, it, expect, vi, beforeEach } from "vitest";
import { hasReportPermission } from "@shared/reportPermissions";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getDb: vi.fn(), getUserCompanyById: vi.fn() };
});

type AuthUser = NonNullable<TrpcContext["user"]>;

function makeCtx(overrides: Partial<AuthUser> = {}): TrpcContext {
  const user: AuthUser = {
    id: 1,
    openId: "test-open-id",
    email: "test@smartpro.om",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    platformRole: "company_member",
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

function seedMembership(role: string) {
  vi.mocked(db.getUserCompanyById).mockResolvedValue({
    company: { id: 1, name: "Test Co", slug: "test-co", status: "active" } as never,
    member: { role, isActive: true } as never,
  });
}

describe("report delegation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hasReportPermission returns true when key is in array", () => {
    expect(hasReportPermission(["view_reports"], "view_reports")).toBe(true);
    expect(hasReportPermission([], "view_reports")).toBe(false);
    expect(hasReportPermission(null, "view_reports")).toBe(false);
  });

  it("getReportDelegations requires company admin", async () => {
    seedMembership("company_member");
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ role: "company_member" }]),
          }),
        }),
      }),
    };
    vi.mocked(db.getDb).mockResolvedValue(mockDb as never);

    const caller = appRouter.createCaller(makeCtx({ platformRole: "company_member" }));
    await expect(caller.companies.getReportDelegations({ companyId: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("setReportDelegations rejects setting permissions on company_admin members", async () => {
    seedMembership("company_admin");
    let selectN = 0;
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn(async () => {
              selectN++;
              if (selectN === 1) return [{ role: "company_admin" }];
              return [{ id: 9, role: "company_admin" }];
            }),
          }),
        }),
      }),
    };
    vi.mocked(db.getDb).mockResolvedValue(mockDb as never);

    const caller = appRouter.createCaller(makeCtx({ platformRole: "company_admin" }));
    await expect(
      caller.companies.setReportDelegations({
        companyId: 1,
        memberId: 9,
        permissions: ["view_reports"],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("setReportDelegations stores permissions array", async () => {
    seedMembership("company_admin");
    const whereUpdate = vi.fn().mockResolvedValue(undefined);
    let selectN = 0;
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn(async () => {
              selectN++;
              if (selectN === 1) return [{ role: "company_admin" }];
              return [{ id: 10, role: "company_member" }];
            }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: whereUpdate,
        }),
      }),
    };
    vi.mocked(db.getDb).mockResolvedValue(mockDb as never);

    const caller = appRouter.createCaller(makeCtx({ platformRole: "company_admin" }));
    const out = await caller.companies.setReportDelegations({
      companyId: 1,
      memberId: 10,
      permissions: ["view_reports", "view_payroll"],
    });
    expect(out).toEqual({
      success: true,
      memberId: 10,
      permissions: ["view_reports", "view_payroll"],
    });
    expect(mockDb.update).toHaveBeenCalled();
  });
});
