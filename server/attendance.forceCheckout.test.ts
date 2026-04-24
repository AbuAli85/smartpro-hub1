import { describe, expect, it, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";
import { attendanceRouter } from "./routers/attendance";
import * as db from "./db";

// Use plain factory mocks so every export that membership.ts / tenant.ts /
// policy.ts / helpers.ts pull from the barrel or repository is a vi.fn().
// This matches the pattern used in attendance.manualCreate.test.ts.
vi.mock("./db", () => ({
  getUserCompanyById: vi.fn().mockResolvedValue(null),
  getUserCompany: vi.fn().mockResolvedValue(null),
  getUserCompanies: vi.fn().mockResolvedValue([]),
  getDb: vi.fn().mockResolvedValue(null),
  createAttendanceRecordTx: vi.fn().mockResolvedValue(42),
}));

// requireAdminOrHR (helpers.ts) imports getUserCompanyById directly from the
// repository, not via the barrel, so we need a separate mock for that path.
vi.mock("./repositories/companies.repository", () => ({
  getUserCompanyById: vi.fn().mockResolvedValue(null),
}));
import * as companiesRepo from "./repositories/companies.repository";

function makeHrCtx(): TrpcContext {
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

/**
 * Returns a fake DB where every select → from → where → limit chain returns `result`.
 *
 * Phase 7.1 note: forceCheckout now uses requireCanForceCheckout (granular guard) which
 * does NOT call resolveVisibilityScope.  The old two-phase structure is no longer needed
 * for forceCheckout; the guard reads membership via the mocked companiesRepo.getUserCompanyById
 * and the first DB call is the business-logic attendance record lookup.
 *
 * setOperationalIssueStatus / getOperationalIssueHistory still use requireAttendanceAdmin
 * and need a DB call for resolveVisibilityScope → use makeDbWithMembership for those.
 */
function makeSimpleSelectDb(result: unknown[] = [], extra: Record<string, unknown> = {}) {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve(result)),
        })),
      })),
    })),
    ...extra,
  };
}

/**
 * Two-phase DB mock for procedures that still use requireAttendanceAdmin
 * (setOperationalIssueStatus, getOperationalIssueHistory).
 *  - call 0 (resolveVisibilityScope → companyMembers query): returns hr_admin row
 *  - call 1+ (business logic query): returns `subsequentResult`
 *
 * This satisfies the two-phase pattern introduced by requireAttendanceAdmin:
 *   requireAdminOrHR → resolveVisibilityScope (DB call 0) → business logic (DB call 1+)
 */
function makeDbWithMembership(subsequentResult: unknown[] = [], extra: Record<string, unknown> = {}) {
  let callCount = 0;
  const fakeSelect = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => {
          const result = callCount === 0
            ? Promise.resolve([{ role: "hr_admin" }])
            : Promise.resolve(subsequentResult);
          callCount++;
          return result;
        }),
      })),
    })),
  }));
  return {
    select: fakeSelect,
    ...extra,
  };
}

/**
 * Returns a fake DB where every select().from().where().limit() call returns
 * `result` directly.
 *
 * Use this for procedures that use the new granular capability guards
 * (requireCanForceCheckout, etc.) which resolve membership via getUserCompanyById
 * (barrel mock) instead of a DB select, so the first DB call is already the
 * business logic query.
 */
function makeSimpleDb(result: unknown[] = [], extra: Record<string, unknown> = {}) {
  const fakeSelect = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve(result)),
      })),
    })),
  }));
  return {
    select: fakeSelect,
    ...extra,
  };
}

const membershipRow = {
  company: { id: 10 },
  member: { role: "hr_admin" },
};

describe("attendance.forceCheckout", () => {
  beforeEach(() => {
    // requireCanForceCheckout → requireHrOrAdmin (policy.ts) → requireWorkspaceMembership
    // (membership.ts) → getUserCompanyById from the db barrel.
    // requireActiveCompanyId (tenant.ts) also calls getUserCompanyById from the barrel.
    vi.mocked(db.getUserCompanyById).mockResolvedValue(membershipRow as never);
    // requireAdminOrHR (helpers.ts) imports getUserCompanyById directly from the repository.
    vi.mocked(companiesRepo.getUserCompanyById).mockResolvedValue(membershipRow as never);
  });

  it("throws NOT_FOUND when attendance record is missing for this company", async () => {
    // forceCheckout uses requireCanForceCheckout (new capability guard) which
    // resolves membership via getUserCompanyById mock (no DB select), so the
    // first DB call is the attendance record query directly — use makeSimpleDb.
    vi.mocked(db.getDb).mockResolvedValue(
      makeSimpleDb([]) as never,
    );

    const caller = attendanceRouter.createCaller(makeHrCtx());
    await expect(
      caller.forceCheckout({
        companyId: 10,
        attendanceRecordId: 999,
        reason: "1234567890 long enough",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws BAD_REQUEST when session is already closed", async () => {
    vi.mocked(db.getDb).mockResolvedValue(
      makeSimpleDb([
        {
          id: 5,
          companyId: 10,
          employeeId: 3,
          checkOut: new Date(),
          checkIn: new Date(),
        },
      ]) as never,
    );

    const caller = attendanceRouter.createCaller(makeHrCtx());
    await expect(
      caller.forceCheckout({
        companyId: 10,
        attendanceRecordId: 5,
        reason: "1234567890 long enough",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("closed") });
  });
});

describe("attendance.setOperationalIssueStatus validation", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanyById).mockResolvedValue(membershipRow as never);
    vi.mocked(companiesRepo.getUserCompanyById).mockResolvedValue(membershipRow as never);
  });

  it("rejects resolve without a long enough note", async () => {
    vi.mocked(db.getDb).mockResolvedValue(
      makeDbWithMembership([], { transaction: vi.fn() }) as never,
    );

    const caller = attendanceRouter.createCaller(makeHrCtx());
    await expect(
      caller.setOperationalIssueStatus({
        companyId: 10,
        businessDateYmd: "2026-04-14",
        kind: "overdue_checkout",
        attendanceRecordId: 1,
        action: "resolve",
        note: "ab",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("attendance.setOperationalIssueStatus company scope", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanyById).mockResolvedValue(membershipRow as never);
    vi.mocked(companiesRepo.getUserCompanyById).mockResolvedValue(membershipRow as never);
  });

  it("throws NOT_FOUND when the correction is not in the active company", async () => {
    vi.mocked(db.getDb).mockResolvedValue(
      makeDbWithMembership([], { transaction: vi.fn() }) as never,
    );

    const caller = attendanceRouter.createCaller(makeHrCtx());
    await expect(
      caller.setOperationalIssueStatus({
        companyId: 10,
        businessDateYmd: "2026-04-14",
        kind: "correction_pending",
        correctionId: 999,
        action: "acknowledge",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("attendance.getOperationalIssueHistory", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanyById).mockResolvedValue(membershipRow as never);
    vi.mocked(companiesRepo.getUserCompanyById).mockResolvedValue(membershipRow as never);
  });

  it("throws NOT_FOUND when no operational issue row exists for this company and key", async () => {
    vi.mocked(db.getDb).mockResolvedValue(
      makeDbWithMembership([]) as never,
    );

    const caller = attendanceRouter.createCaller(makeHrCtx());
    await expect(
      caller.getOperationalIssueHistory({
        companyId: 10,
        issueKey: "correction_pending:cor:999999",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
