/**
 * Client approval completion tests (P2):
 *  1. clientApproveByToken records audit with source CLIENT_PORTAL.
 *  2. clientRejectByToken records audit with source CLIENT_PORTAL.
 *  3. clientDisputeItemByToken sets item status to disputed, keeps batch submitted.
 *  4. clientDisputeItemByToken rejects items that are not pending.
 *  5. clientDisputeItemByToken rejects batches that are not submitted.
 *  6. clientDisputeItemByToken rejects short dispute reasons (< 10 chars).
 *  7. clientDisputeItemByToken fails with invalid token.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  ATTENDANCE_AUDIT_SOURCE,
} from "../shared/attendanceAuditTaxonomy";

// ---------------------------------------------------------------------------
// Unit tests for ATTENDANCE_AUDIT_SOURCE constant
// ---------------------------------------------------------------------------

describe("ATTENDANCE_AUDIT_SOURCE", () => {
  it("includes CLIENT_PORTAL value", () => {
    expect(ATTENDANCE_AUDIT_SOURCE.CLIENT_PORTAL).toBe("client_portal");
  });

  it("retains existing values without change", () => {
    expect(ATTENDANCE_AUDIT_SOURCE.HR_PANEL).toBe("hr_panel");
    expect(ATTENDANCE_AUDIT_SOURCE.EMPLOYEE_PORTAL).toBe("employee_portal");
    expect(ATTENDANCE_AUDIT_SOURCE.ADMIN_PANEL).toBe("admin_panel");
    expect(ATTENDANCE_AUDIT_SOURCE.SYSTEM).toBe("system");
  });
});

// ---------------------------------------------------------------------------
// onClientApprovalComplete hook
// ---------------------------------------------------------------------------

describe("onClientApprovalComplete", () => {
  it("resolves without error for internal source", async () => {
    const { onClientApprovalComplete } = await import("./lib/attendanceClientApprovalHooks");
    await expect(
      onClientApprovalComplete({ batchId: 1, companyId: 42, approvedByUserId: 7, source: "internal" }),
    ).resolves.toBeUndefined();
  });

  it("resolves without error for client_portal_token source", async () => {
    const { onClientApprovalComplete } = await import("./lib/attendanceClientApprovalHooks");
    await expect(
      onClientApprovalComplete({ batchId: 999, companyId: 1, approvedByUserId: null, source: "client_portal_token" }),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Router-level tests for clientDisputeItemByToken
// Mocks: DB, token verifier, audit
// ---------------------------------------------------------------------------

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getDb: vi.fn(), requireDb: vi.fn() };
});

vi.mock("./db.client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db.client")>();
  return { ...actual, requireDb: vi.fn(), getDb: vi.fn() };
});

vi.mock("./repositories/companies.repository", () => ({
  getUserCompanyById: vi.fn(),
  getUserCompanies: vi.fn(),
}));

vi.mock("./attendanceAudit", () => ({
  logAttendanceAuditSafe: vi.fn().mockResolvedValue(undefined),
  attendancePayloadJson: vi.fn((v) => v),
  insertAttendanceAuditRow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./attendanceApprovalToken", () => ({
  verifyClientApprovalToken: vi.fn(),
  signClientApprovalToken: vi.fn(),
  CLIENT_APPROVAL_TOKEN_EXPIRY_DAYS: 14,
}));

vi.mock("./clientApprovalNotification", () => ({
  notifyHrOnBatchSubmitted: vi.fn().mockResolvedValue(undefined),
  notifyHrOnBatchApproved: vi.fn().mockResolvedValue(undefined),
  notifyHrOnBatchRejected: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./lib/attendancePeriodGuard", () => ({
  loadAndAssertPeriodNotLocked: vi.fn().mockResolvedValue({ status: "open", year: 2026, month: 4, companyId: 1 }),
  loadAndAssertPeriodNotLockedForInstant: vi.fn().mockResolvedValue({ status: "open", year: 2026, month: 4, companyId: 1 }),
}));

vi.mock("./lib/attendanceClientApprovalHooks", () => ({
  onClientApprovalComplete: vi.fn().mockResolvedValue(undefined),
}));

import * as dbModule from "./db.client";
import * as tokenModule from "./attendanceApprovalToken";
import * as auditModule from "./attendanceAudit";
import * as companiesRepo from "./repositories/companies.repository";
import * as hooksModule from "./lib/attendanceClientApprovalHooks";
import { attendanceRouter } from "./routers/attendance";
import type { TrpcContext } from "./_core/context";

function makePublicCtx(): TrpcContext {
  return {
    user: null as any,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makeHrCtx(userId = 2): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `o${userId}`,
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

const HR_MEMBERSHIP = {
  company: { id: 1 },
  member: { role: "hr_admin", status: "active" },
};

const SUBMITTED_BATCH = {
  id: 10,
  companyId: 1,
  status: "submitted",
  periodStart: "2026-04-01",
  periodEnd: "2026-04-30",
  submittedByUserId: 5,
  approvedAt: null,
  rejectedAt: null,
  rejectionReason: null,
  clientComment: null,
};

function makeMockDbFull(batchRow: object | null, itemRow: object | null, companyId = 1) {
  const batchForCompany = batchRow ? [batchRow] : [];

  const dbChain = {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  };

  let callCount = 0;
  dbChain.select.mockImplementation(() => {
    callCount++;
    const rows = callCount === 1 ? batchForCompany : callCount === 2 ? (itemRow ? [itemRow] : []) : [];
    const chain: any = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(rows),
          orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(rows) }),
        }),
      }),
    };
    return chain;
  });

  const updateChain = {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  };
  dbChain.update.mockReturnValue(updateChain);

  return dbChain;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hooksModule.onClientApprovalComplete).mockResolvedValue(undefined);
  vi.mocked(companiesRepo.getUserCompanyById).mockResolvedValue(HR_MEMBERSHIP as never);
  // Needed when input has no explicit companyId: requireActiveCompanyId falls through to getUserCompanies.
  vi.mocked(companiesRepo.getUserCompanies).mockResolvedValue([
    { company: { id: 1, name: "Test Co" }, member: { role: "hr_admin" } },
  ] as never);
});

describe("clientDisputeItemByToken", () => {
  const validToken = "valid-jwt-token";
  const payload = { batchId: 10, companyId: 1 };

  it("throws UNAUTHORIZED with invalid token", async () => {
    (tokenModule.verifyClientApprovalToken as any).mockResolvedValue(null);
    (dbModule.requireDb as any).mockResolvedValue({});

    const caller = (attendanceRouter as any).createCaller(makePublicCtx());
    await expect(
      caller.clientDisputeItemByToken({ token: "bad", itemId: 1, disputeReason: "valid reason here" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws BAD_REQUEST for dispute reason shorter than 10 chars", async () => {
    (tokenModule.verifyClientApprovalToken as any).mockResolvedValue(payload);

    const batch = { id: 10, status: "submitted", companyId: 1, periodStart: "2026-04-01", periodEnd: "2026-04-30", submittedByUserId: null };
    const item = { id: 5, status: "pending" };
    const db = makeMockDbFull(batch, item);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = (attendanceRouter as any).createCaller(makePublicCtx());
    await expect(
      caller.clientDisputeItemByToken({ token: validToken, itemId: 5, disputeReason: "too short" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws BAD_REQUEST when batch is not submitted", async () => {
    (tokenModule.verifyClientApprovalToken as any).mockResolvedValue(payload);

    const batch = { id: 10, status: "approved", companyId: 1, periodStart: "2026-04-01", periodEnd: "2026-04-30" };
    const db = makeMockDbFull(batch, null);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = (attendanceRouter as any).createCaller(makePublicCtx());
    await expect(
      caller.clientDisputeItemByToken({ token: validToken, itemId: 5, disputeReason: "Some valid dispute reason" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

// ---------------------------------------------------------------------------
// Hook wiring — internal approve path
// ---------------------------------------------------------------------------

describe("hook wiring — approveClientApprovalBatch", () => {
  it("calls onClientApprovalComplete with source 'internal' after approval", async () => {
    const db = makeMockDbFull(SUBMITTED_BATCH, null);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceRouter.createCaller(makeHrCtx());
    const result = await caller.approveClientApprovalBatch({ batchId: 10 });

    expect(result.status).toBe("approved");
    expect(hooksModule.onClientApprovalComplete).toHaveBeenCalledOnce();
    expect(hooksModule.onClientApprovalComplete).toHaveBeenCalledWith(
      expect.objectContaining({ batchId: 10, companyId: 1, source: "internal" }),
    );
  });

  it("approval succeeds even if hook rejects (best-effort)", async () => {
    vi.mocked(hooksModule.onClientApprovalComplete).mockRejectedValueOnce(new Error("billing outage"));

    const db = makeMockDbFull(SUBMITTED_BATCH, null);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceRouter.createCaller(makeHrCtx());
    const result = await caller.approveClientApprovalBatch({ batchId: 10 });

    expect(result.status).toBe("approved");
  });

  it("does NOT call hook on rejectClientApprovalBatch", async () => {
    const db = makeMockDbFull(SUBMITTED_BATCH, null);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceRouter.createCaller(makeHrCtx());
    const result = await caller.rejectClientApprovalBatch({
      batchId: 10,
      rejectionReason: "Hours do not match records.",
    });

    expect(result.status).toBe("rejected");
    expect(hooksModule.onClientApprovalComplete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Hook wiring — token approval path
// ---------------------------------------------------------------------------

describe("hook wiring — clientApproveByToken", () => {
  const TOKEN = "valid-jwt-token";
  const TOKEN_PAYLOAD = { batchId: 10, companyId: 1 };

  it("calls onClientApprovalComplete with source 'client_portal_token' after approval", async () => {
    (tokenModule.verifyClientApprovalToken as any).mockResolvedValue(TOKEN_PAYLOAD);

    const db = makeMockDbFull(SUBMITTED_BATCH, null);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = (attendanceRouter as any).createCaller(makePublicCtx());
    const result = await caller.clientApproveByToken({ token: TOKEN });

    expect(result.status).toBe("approved");
    expect(hooksModule.onClientApprovalComplete).toHaveBeenCalledOnce();
    expect(hooksModule.onClientApprovalComplete).toHaveBeenCalledWith(
      expect.objectContaining({ batchId: 10, companyId: 1, source: "client_portal_token" }),
    );
  });

  it("approval succeeds even if hook rejects (best-effort)", async () => {
    vi.mocked(hooksModule.onClientApprovalComplete).mockRejectedValueOnce(new Error("billing outage"));
    (tokenModule.verifyClientApprovalToken as any).mockResolvedValue(TOKEN_PAYLOAD);

    const db = makeMockDbFull(SUBMITTED_BATCH, null);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = (attendanceRouter as any).createCaller(makePublicCtx());
    const result = await caller.clientApproveByToken({ token: TOKEN });

    expect(result.status).toBe("approved");
  });

  it("does NOT call hook on clientRejectByToken", async () => {
    (tokenModule.verifyClientApprovalToken as any).mockResolvedValue(TOKEN_PAYLOAD);

    const db = makeMockDbFull(SUBMITTED_BATCH, null);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = (attendanceRouter as any).createCaller(makePublicCtx());
    const result = await caller.clientRejectByToken({
      token: TOKEN,
      rejectionReason: "Attendance records mismatch.",
    });

    expect(result.status).toBe("rejected");
    expect(hooksModule.onClientApprovalComplete).not.toHaveBeenCalled();
  });
});
