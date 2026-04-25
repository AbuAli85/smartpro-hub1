/**
 * Phase 12C: Attendance billing candidate router tests.
 *
 * Tests:
 *  1. list filters by company and status
 *  2. list returns only the calling company's candidates
 *  3. get returns full candidate with parsed billing lines
 *  4. get with invalid billingLinesJson shape returns empty lines safely
 *  5. markReviewReady transitions draft → review_ready
 *  6. markReviewReady rejects non-draft candidates
 *  7. cancel transitions draft → cancelled
 *  8. cancel transitions review_ready → cancelled
 *  9. cancel is idempotent on already-cancelled candidates
 * 10. cancel rejects invalid states (none beyond draft/review_ready/cancelled exist)
 * 11. unauthorized role (hr_admin) is rejected by requireFinanceOrAdmin
 * 12. unauthorized role (company_member) is rejected
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("./db.client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db.client")>();
  return { ...actual, requireDb: vi.fn(), getDb: vi.fn() };
});

vi.mock("./repositories/companies.repository", () => ({
  getUserCompanyById: vi.fn(),
  getUserCompanies: vi.fn(),
}));

// membership.ts imports getUserCompanyById from "../db" which re-exports from companies.repository
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getUserCompanyById: vi.fn(), getUserCompany: vi.fn(), getUserCompanies: vi.fn() };
});

import * as dbModule from "./db.client";
import * as dbFullModule from "./db";
import { attendanceBillingRouter } from "./routers/attendanceBilling";

// ─── Context helpers ──────────────────────────────────────────────────────────

function makeCtx(
  userId = 2,
  overrides: Partial<TrpcContext["user"]> = {},
): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `o${userId}`,
      email: "finance@test.om",
      name: "Finance User",
      loginMethod: "manus",
      role: "user",
      platformRole: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      ...overrides,
    } as TrpcContext["user"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const FINANCE_MEMBERSHIP = {
  companyId: 1,
  role: "finance_admin",
  member: { role: "finance_admin", status: "active" },
  company: { id: 1 },
};

const ADMIN_MEMBERSHIP = {
  companyId: 1,
  role: "company_admin",
  member: { role: "company_admin", status: "active" },
  company: { id: 1 },
};

const HR_MEMBERSHIP = {
  companyId: 1,
  role: "hr_admin",
  member: { role: "hr_admin", status: "active" },
  company: { id: 1 },
};

const MEMBER_MEMBERSHIP = {
  companyId: 1,
  role: "company_member",
  member: { role: "company_member", status: "active" },
  company: { id: 1 },
};

// ─── Mock DB builder ──────────────────────────────────────────────────────────

const DRAFT_CANDIDATE = {
  id: 1,
  batchId: 10,
  companyId: 1,
  clientCompanyId: 99,
  periodStart: "2026-04-01",
  periodEnd: "2026-04-30",
  source: "internal",
  status: "draft",
  approvedItemCount: 2,
  snapshotMissingCount: 0,
  totalDurationMinutes: 960,
  billingLinesJson: [
    {
      itemId: 101,
      employeeId: 5,
      attendanceDate: "2026-04-01",
      attendanceSessionId: 201,
      attendanceRecordId: 301,
      employeeDisplayName: "Jane Doe",
      checkInAt: "2026-04-01T06:00:00.000Z",
      checkOutAt: "2026-04-01T14:00:00.000Z",
      durationMinutes: 480,
      sessionStatus: "closed",
      siteId: 3,
    },
    {
      itemId: 102,
      employeeId: 6,
      attendanceDate: "2026-04-01",
      attendanceSessionId: 202,
      attendanceRecordId: 302,
      employeeDisplayName: "John Smith",
      checkInAt: "2026-04-01T07:00:00.000Z",
      checkOutAt: "2026-04-01T15:00:00.000Z",
      durationMinutes: 480,
      sessionStatus: "closed",
      siteId: 3,
    },
  ],
  createdAt: new Date("2026-04-25T10:00:00Z"),
  updatedAt: new Date("2026-04-25T10:00:00Z"),
};

const REVIEW_READY_CANDIDATE = { ...DRAFT_CANDIDATE, id: 2, status: "review_ready" };
const CANCELLED_CANDIDATE = { ...DRAFT_CANDIDATE, id: 3, status: "cancelled" };

function makeDb(selectRows: object[], updateOk = true) {
  const db = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(selectRows),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(selectRows),
            }),
          }),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(updateOk ? undefined : new Error("update failed")),
      }),
    }),
  };
  return db;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

const COMPANY_LIST = [{ company: { id: 1, name: "Test Co" }, member: { role: "finance_admin", isActive: true } }];

beforeEach(() => {
  vi.clearAllMocks();
  // Default: finance admin membership
  vi.mocked(dbFullModule.getUserCompanyById).mockResolvedValue(FINANCE_MEMBERSHIP as never);
  vi.mocked(dbFullModule.getUserCompanies).mockResolvedValue(COMPANY_LIST as never);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("listAttendanceBillingCandidates", () => {
  it("returns candidates for the finance admin's company", async () => {
    const db = makeDb([DRAFT_CANDIDATE]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.listAttendanceBillingCandidates({});

    expect(result).toHaveLength(1);
    expect(result[0].batchId).toBe(10);
    expect(result[0].status).toBe("draft");
  });

  it("company_admin can also list candidates", async () => {
    vi.mocked(dbFullModule.getUserCompanyById).mockResolvedValue(ADMIN_MEMBERSHIP as never);
    const db = makeDb([DRAFT_CANDIDATE]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.listAttendanceBillingCandidates({ status: "draft" });

    expect(result).toHaveLength(1);
  });

  it("returns empty list when none exist", async () => {
    const db = makeDb([]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.listAttendanceBillingCandidates({});

    expect(result).toHaveLength(0);
  });

  it("hr_admin is rejected with FORBIDDEN", async () => {
    vi.mocked(dbFullModule.getUserCompanyById).mockResolvedValue(HR_MEMBERSHIP as never);
    const db = makeDb([]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(
      caller.listAttendanceBillingCandidates({}),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("company_member is rejected with FORBIDDEN", async () => {
    vi.mocked(dbFullModule.getUserCompanyById).mockResolvedValue(MEMBER_MEMBERSHIP as never);
    const db = makeDb([]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(
      caller.listAttendanceBillingCandidates({}),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("getAttendanceBillingCandidate", () => {
  it("returns full candidate with parsed billing lines", async () => {
    const db = makeDb([DRAFT_CANDIDATE]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.getAttendanceBillingCandidate({ candidateId: 1 });

    expect(result.id).toBe(1);
    expect(Array.isArray(result.billingLinesJson)).toBe(true);
    expect(result.billingLinesJson).toHaveLength(2);
    expect(result.billingLinesJson[0].durationMinutes).toBe(480);
    expect(result.billingLinesJson[0].employeeDisplayName).toBe("Jane Doe");
  });

  it("exposes hasSnapshotWarning=false when snapshotMissingCount=0", async () => {
    const db = makeDb([DRAFT_CANDIDATE]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.getAttendanceBillingCandidate({ candidateId: 1 });

    expect(result.hasSnapshotWarning).toBe(false);
  });

  it("exposes hasSnapshotWarning=true when snapshotMissingCount>0", async () => {
    const db = makeDb([{ ...DRAFT_CANDIDATE, snapshotMissingCount: 1 }]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.getAttendanceBillingCandidate({ candidateId: 1 });

    expect(result.hasSnapshotWarning).toBe(true);
  });

  it("computes totalHours from totalDurationMinutes (960 min = 16h)", async () => {
    const db = makeDb([DRAFT_CANDIDATE]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.getAttendanceBillingCandidate({ candidateId: 1 });

    expect(result.totalHours).toBe(16);
  });

  it("returns empty billingLinesJson when it has an invalid shape", async () => {
    const db = makeDb([{ ...DRAFT_CANDIDATE, billingLinesJson: "not-an-array" }]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.getAttendanceBillingCandidate({ candidateId: 1 });

    expect(result.billingLinesJson).toEqual([]);
  });

  it("throws NOT_FOUND for unknown candidateId", async () => {
    const db = makeDb([]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(
      caller.getAttendanceBillingCandidate({ candidateId: 999 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("markAttendanceBillingCandidateReviewReady", () => {
  it("transitions draft → review_ready", async () => {
    const db = makeDb([DRAFT_CANDIDATE]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.markAttendanceBillingCandidateReviewReady({ candidateId: 1 });

    expect(result.status).toBe("review_ready");
    expect(db.update).toHaveBeenCalled();
  });

  it("rejects review_ready → review_ready with BAD_REQUEST", async () => {
    const db = makeDb([REVIEW_READY_CANDIDATE]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(
      caller.markAttendanceBillingCandidateReviewReady({ candidateId: 2 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects cancelled → review_ready with BAD_REQUEST", async () => {
    const db = makeDb([CANCELLED_CANDIDATE]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(
      caller.markAttendanceBillingCandidateReviewReady({ candidateId: 3 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws NOT_FOUND for unknown candidateId", async () => {
    const db = makeDb([]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(
      caller.markAttendanceBillingCandidateReviewReady({ candidateId: 999 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("hr_admin is rejected with FORBIDDEN", async () => {
    vi.mocked(dbFullModule.getUserCompanyById).mockResolvedValue(HR_MEMBERSHIP as never);
    const db = makeDb([DRAFT_CANDIDATE]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(
      caller.markAttendanceBillingCandidateReviewReady({ candidateId: 1 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("cancelAttendanceBillingCandidate", () => {
  it("cancels a draft candidate", async () => {
    const db = makeDb([DRAFT_CANDIDATE]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.cancelAttendanceBillingCandidate({ candidateId: 1 });

    expect(result.status).toBe("cancelled");
    expect(db.update).toHaveBeenCalled();
  });

  it("cancels a review_ready candidate", async () => {
    const db = makeDb([REVIEW_READY_CANDIDATE]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.cancelAttendanceBillingCandidate({ candidateId: 2 });

    expect(result.status).toBe("cancelled");
  });

  it("is idempotent — returns cancelled without update when already cancelled", async () => {
    const db = makeDb([CANCELLED_CANDIDATE]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.cancelAttendanceBillingCandidate({ candidateId: 3 });

    expect(result.status).toBe("cancelled");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for unknown candidateId", async () => {
    const db = makeDb([]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(
      caller.cancelAttendanceBillingCandidate({ candidateId: 999 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("hr_admin is rejected with FORBIDDEN", async () => {
    vi.mocked(dbFullModule.getUserCompanyById).mockResolvedValue(HR_MEMBERSHIP as never);
    const db = makeDb([DRAFT_CANDIDATE]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(
      caller.cancelAttendanceBillingCandidate({ candidateId: 1 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
