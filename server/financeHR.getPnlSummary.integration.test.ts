import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { financeHRRouter } from "./routers/financeHR";
import {
  companyRevenueRecords,
  employeeCostRecords,
  employeeWpsValidations,
} from "../drizzle/schema";

type WpsResultRow = {
  id: number;
  employeeId: number;
  result: "ready" | "invalid" | "missing";
  validatedAt: Date;
};

function makeCtx(userId = 1): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `open-${userId}`,
      email: "ops@test.om",
      name: "Ops User",
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

function createAwaitableQueryResult<T>(rows: T[]) {
  return {
    groupBy: vi.fn(() => Promise.resolve(rows)),
    then: (onFulfilled: (value: T[]) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(onFulfilled, onRejected),
    catch: (onRejected: (reason: unknown) => unknown) => Promise.resolve(rows).catch(onRejected),
    finally: (onFinally: (() => void) | undefined) => Promise.resolve(rows).finally(onFinally),
  };
}

function createPnlSummaryDbMock(params: {
  periodRows: WpsResultRow[];
  genericRows: WpsResultRow[];
}) {
  const counters = {
    revenue: 0,
    cost: 0,
    wps: 0,
  };

  return {
    select: vi.fn((shape?: Record<string, unknown>) => ({
      from: vi.fn((table: object) => ({
        where: vi.fn(() => {
          let rows: unknown[] = [];

          if (table === companyRevenueRecords) {
            counters.revenue += 1;
            rows = counters.revenue === 1 ? [{ total: "1000.000" }] : [{ total: 1 }];
          } else if (table === employeeCostRecords) {
            counters.cost += 1;
            if (counters.cost === 1) rows = [{ total: "700.000" }];
            else if (counters.cost === 2) rows = [{ total: "100.000" }];
            else if (counters.cost === 3) rows = [{ total: 2 }];
            else rows = [{ employeeId: 11 }, { employeeId: 12 }];
          } else if (table === employeeWpsValidations) {
            counters.wps += 1;
            rows = counters.wps === 1 ? params.periodRows : params.genericRows;
          } else if (shape && "total" in shape) {
            rows = [{ total: 0 }];
          }

          return createAwaitableQueryResult(rows);
        }),
      })),
    })),
  };
}

describe("financeHR.getPnlSummary WPS precedence integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(db, "getUserCompanyById").mockResolvedValue({
      company: { id: 1, name: "Acme", slug: "acme", country: "OM", status: "active" },
      member: { role: "company_admin", permissions: [] },
    } as never);
    vi.spyOn(db, "getUserCompanies").mockResolvedValue([
      {
        company: { id: 1, name: "Acme", slug: "acme", country: "OM", status: "active" },
        member: { role: "company_admin", permissions: [] },
      },
    ] as never);
  });

  it("uses period-scoped WPS rows over generic fallback rows", async () => {
    const mockDb = createPnlSummaryDbMock({
      periodRows: [
        { id: 101, employeeId: 11, result: "ready", validatedAt: new Date("2026-04-20T10:00:00Z") },
        { id: 102, employeeId: 12, result: "ready", validatedAt: new Date("2026-04-20T10:00:00Z") },
      ],
      genericRows: [
        { id: 201, employeeId: 11, result: "invalid", validatedAt: new Date("2026-03-01T10:00:00Z") },
        { id: 202, employeeId: 12, result: "missing", validatedAt: new Date("2026-03-01T10:00:00Z") },
      ],
    });
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = financeHRRouter.createCaller(makeCtx());
    const result = await caller.getPnlSummary({
      companyId: 1,
      periodYear: 2026,
      periodMonth: 4,
    });

    expect(result?.wpsQualityScope).toBe("period");
    expect(result?.dataQualityStatus).toBe("complete");
    expect(result?.recordCounts.wpsInvalid).toBe(0);
    expect(result?.recordCounts.wpsMissing).toBe(0);
    expect(result?.dataQualityMessages).not.toContain(
      "Using company-level WPS validation fallback; period-specific validation is unavailable.",
    );
  });

  it("uses generic fallback only when period rows are absent", async () => {
    const mockDb = createPnlSummaryDbMock({
      periodRows: [],
      genericRows: [
        { id: 301, employeeId: 11, result: "ready", validatedAt: new Date("2026-03-05T10:00:00Z") },
        { id: 302, employeeId: 12, result: "invalid", validatedAt: new Date("2026-03-05T10:00:00Z") },
      ],
    });
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = financeHRRouter.createCaller(makeCtx());
    const result = await caller.getPnlSummary({
      companyId: 1,
      periodYear: 2026,
      periodMonth: 4,
    });

    expect(result?.wpsQualityScope).toBe("company_fallback");
    expect(result?.dataQualityStatus).toBe("partial");
    expect(result?.recordCounts.wpsInvalid).toBe(1);
    expect(result?.dataQualityMessages).toEqual(
      expect.arrayContaining([
        "Using company-level WPS validation fallback; period-specific validation is unavailable.",
        "WPS readiness issues found for 1 employee record(s).",
      ]),
    );
  });

  it("returns none scope when neither period nor generic WPS rows exist", async () => {
    const mockDb = createPnlSummaryDbMock({
      periodRows: [],
      genericRows: [],
    });
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = financeHRRouter.createCaller(makeCtx());
    const result = await caller.getPnlSummary({
      companyId: 1,
      periodYear: 2026,
      periodMonth: 4,
    });

    expect(result?.wpsQualityScope).toBe("none");
    expect(result?.dataQualityStatus).toBe("partial");
    expect(result?.recordCounts.wpsInvalid).toBe(0);
    expect(result?.recordCounts.wpsMissing).toBe(0);
    expect(result?.dataQualityMessages).toContain(
      "No WPS validation records were found for this period.",
    );
  });
});
