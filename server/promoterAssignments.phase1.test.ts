import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";
import { promoterAssignmentsRouter } from "./routers/promoterAssignments";
import * as db from "./db";
import * as membership from "./_core/membership";
import * as visibilityScope from "./_core/visibilityScope";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getDb: vi.fn(),
  };
});

vi.mock("./_core/membership", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./_core/membership")>();
  return {
    ...actual,
    requireWorkspaceMembership: vi.fn(),
  };
});

// resolveVisibilityScope is now called inside requireCanManagePromoterAssignments
// (which uses deriveCapabilities). Mock it so the DB-unavailable test can pass
// the auth guard before reaching the summary procedure's own DB check.
vi.mock("./_core/visibilityScope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./_core/visibilityScope")>();
  return {
    ...actual,
    resolveVisibilityScope: vi.fn(),
  };
});

function makeCtx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "o1",
      email: "hr@test.om",
      name: "HR",
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

describe("promoterAssignments Phase 1", () => {
  beforeEach(() => {
    vi.mocked(membership.requireWorkspaceMembership).mockResolvedValue({
      role: "hr_admin",
    } as never);
    // Provide a company-scoped visibility so deriveCapabilities grants
    // canManagePromoterAssignments = true for hr_admin.
    vi.mocked(visibilityScope.resolveVisibilityScope).mockResolvedValue({
      type: "company",
      companyId: 10,
    });
  });

  it("summary returns empty shape when database is unavailable", async () => {
    vi.spyOn(db, "getDb").mockResolvedValue(null);
    vi.spyOn(db, "getUserCompanyById").mockResolvedValue({
      company: { id: 10 },
      member: { role: "hr_admin" },
    } as never);

    const caller = promoterAssignmentsRouter.createCaller(makeCtx());
    const r = await caller.summary({ companyId: 10 });
    expect(r.total).toBe(0);
    expect(r.byStatus.active).toBe(0);
    expect(r.activeHeadcountByBrand).toEqual([]);
    expect(r.coverageByBrand).toEqual([]);
    expect(r.operationalTodayTotal).toBe(0);
  });
});
