/**
 * Server-side tests for Phase 10B client approval token procedures.
 *
 * Tests the four new public/protected procedures added in Phase 10B:
 *   generateClientApprovalToken    (protected — HR/admin)
 *   getClientApprovalBatchByToken  (public — token-gated)
 *   clientApproveByToken           (public — token-gated)
 *   clientRejectByToken            (public — token-gated)
 *
 * The token module (attendanceApprovalToken) and DB are both mocked.
 *
 * Tests:
 *  1.  generateClientApprovalToken: rejects non-submitted batch
 *  2.  generateClientApprovalToken: returns token + approvalUrl for submitted batch
 *  3.  getClientApprovalBatchByToken: invalid/expired token → UNAUTHORIZED
 *  4.  getClientApprovalBatchByToken: valid token returns redacted batch + items
 *  5.  getClientApprovalBatchByToken: tenant isolation — wrong companyId in token → NOT_FOUND
 *  6.  getClientApprovalBatchByToken: redacted payload has no companyId or employeeId
 *  7.  clientApproveByToken: invalid token → UNAUTHORIZED
 *  8.  clientApproveByToken: draft batch → BAD_REQUEST (only submitted allowed)
 *  9.  clientApproveByToken: submitted batch → approved + audit written
 * 10.  clientApproveByToken: already approved batch → BAD_REQUEST
 * 11.  clientRejectByToken: requires non-empty rejection reason
 * 12.  clientRejectByToken: submitted batch → rejected + audit written
 * 13.  clientRejectByToken: approved batch → BAD_REQUEST (terminal)
 * 14.  internal HR approveClientApprovalBatch still passes (no regression)
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { TrpcContext } from "./_core/context";
import { attendanceRouter } from "./routers/attendance";
import * as attendanceAudit from "./attendanceAudit";
import * as companiesRepo from "./repositories/companies.repository";
import * as dbModule from "./db";
import * as tokenModule from "./attendanceApprovalToken";
import {
  ATTENDANCE_AUDIT_ACTION,
  ATTENDANCE_AUDIT_ENTITY,
} from "@shared/attendanceAuditTaxonomy";

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getDb: vi.fn(),
    requireDb: vi.fn(),
    getUserCompanies: vi.fn(),
  };
});

vi.mock("./db.client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db.client")>();
  return { ...actual, requireDb: vi.fn(), getDb: vi.fn() };
});

vi.mock("./repositories/companies.repository", () => ({
  getUserCompanyById: vi.fn(),
  getUserCompanies: vi.fn(),
}));

vi.mock("./attendanceApprovalToken", () => ({
  signClientApprovalToken: vi.fn(),
  verifyClientApprovalToken: vi.fn(),
  CLIENT_APPROVAL_TOKEN_EXPIRY_DAYS: 14,
}));

// ─── Context helpers ──────────────────────────────────────────────────────────

function makeHrCtx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "o1",
      email: "hr@test.om",
      name: "HR User",
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

/** Public caller — no user in context. */
function makePublicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── DB mock helpers ──────────────────────────────────────────────────────────

function buildSequencedDb(selectResults: unknown[][], insertId?: number) {
  let selectIdx = 0;

  function nextRows() {
    return selectResults[selectIdx++] ?? [];
  }

  function makeChain(rows: unknown[]) {
    const resolved = Promise.resolve(rows);
    return {
      then: resolved.then.bind(resolved),
      catch: resolved.catch.bind(resolved),
      limit:    vi.fn().mockImplementation(() => makeChain(rows)),
      offset:   vi.fn().mockImplementation(() => resolved),
      orderBy:  vi.fn().mockImplementation(() => makeChain(rows)),
      groupBy:  vi.fn().mockImplementation(() => resolved),
      where:    vi.fn().mockImplementation(() => makeChain(rows)),
      innerJoin: vi.fn().mockImplementation(() => makeChain(rows)),
    };
  }

  function makeSelectImpl() {
    return { from: vi.fn().mockImplementation(() => makeChain(nextRows())) };
  }

  let insertCount = 0;
  function makeInsertImpl() {
    insertCount++;
    if (insertCount === 1 && insertId != null) {
      const returningId = vi.fn().mockResolvedValue([{ id: insertId }]);
      return { values: vi.fn().mockReturnValue({ $returningId: returningId }) };
    }
    return { values: vi.fn().mockResolvedValue(undefined) };
  }

  const update = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  });

  return {
    select: vi.fn().mockImplementation(makeSelectImpl),
    selectDistinct: vi.fn().mockImplementation(makeSelectImpl),
    update,
    insert: vi.fn().mockImplementation(makeInsertImpl),
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPANY_ID = 10;
const BATCH_ID = 42;
const FAKE_TOKEN = "test.jwt.token";

const DRAFT_BATCH = {
  id: BATCH_ID,
  companyId: COMPANY_ID,
  siteId: null,
  clientCompanyId: null,
  promoterAssignmentId: null,
  periodStart: "2026-04-01",
  periodEnd: "2026-04-07",
  status: "draft",
  submittedAt: null,
  submittedByUserId: null,
  approvedAt: null,
  approvedByUserId: null,
  rejectedAt: null,
  rejectedByUserId: null,
  rejectionReason: null,
  clientComment: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const SUBMITTED_BATCH = { ...DRAFT_BATCH, status: "submitted", submittedAt: new Date() };
const APPROVED_BATCH = { ...DRAFT_BATCH, status: "approved", approvedAt: new Date() };

// Redacted batch shape returned by getClientApprovalBatchByToken
const REDACTED_BATCH = {
  id: BATCH_ID,
  periodStart: "2026-04-01",
  periodEnd: "2026-04-07",
  status: "submitted",
  submittedAt: new Date(),
  approvedAt: null,
  rejectedAt: null,
  rejectionReason: null,
  clientComment: null,
};

// Item rows with employee names (as the JOIN returns them)
const ITEM_ROWS_WITH_NAMES = [
  {
    id: 1,
    attendanceDate: "2026-04-01",
    status: "pending",
    clientComment: null,
    employeeFirstName: "Ahmed",
    employeeLastName: "Al-Rashidi",
  },
  {
    id: 2,
    attendanceDate: "2026-04-01",
    status: "pending",
    clientComment: null,
    employeeFirstName: "Sara",
    employeeLastName: "Khalil",
  },
];

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(companiesRepo.getUserCompanyById).mockResolvedValue({
    company: { id: COMPANY_ID },
    member: { role: "hr_admin" },
  } as never);
  vi.mocked(dbModule.getUserCompanies).mockResolvedValue([
    { company: { id: COMPANY_ID, name: "Test Co" }, member: { role: "hr_admin" } },
  ] as never);
  // Default: token module returns controllable mocks per test
  vi.mocked(tokenModule.signClientApprovalToken).mockResolvedValue(FAKE_TOKEN);
  vi.mocked(tokenModule.verifyClientApprovalToken).mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function setMockDb(db: ReturnType<typeof buildSequencedDb>) {
  const { requireDb } = await import("./db.client");
  vi.mocked(requireDb).mockResolvedValue(db as never);
}

// ─── 1. generateClientApprovalToken: non-submitted batch ─────────────────────

describe("1. generateClientApprovalToken: rejects non-submitted batch", () => {
  it("throws BAD_REQUEST when batch is draft", async () => {
    // Select returns draft batch
    const db = buildSequencedDb([[DRAFT_BATCH]]);
    await setMockDb(db);

    const caller = attendanceRouter.createCaller(makeHrCtx());
    await expect(
      caller.generateClientApprovalToken({ batchId: BATCH_ID })
    ).rejects.toThrow(/Only submitted batches/);
  });
});

// ─── 2. generateClientApprovalToken: returns token for submitted ──────────────

describe("2. generateClientApprovalToken: returns token + approvalUrl for submitted", () => {
  it("returns token, expiresInDays, and approvalUrl", async () => {
    const db = buildSequencedDb([[SUBMITTED_BATCH]]);
    await setMockDb(db);

    const caller = attendanceRouter.createCaller(makeHrCtx());
    const result = await caller.generateClientApprovalToken({ batchId: BATCH_ID });

    expect(result.token).toBe(FAKE_TOKEN);
    expect(result.expiresInDays).toBe(14);
    expect(result.approvalUrl).toContain(FAKE_TOKEN);
    expect(tokenModule.signClientApprovalToken).toHaveBeenCalledWith({
      batchId: BATCH_ID,
      companyId: COMPANY_ID,
    });
  });
});

// ─── 3. getClientApprovalBatchByToken: invalid/expired token ─────────────────

describe("3. getClientApprovalBatchByToken: invalid token → UNAUTHORIZED", () => {
  it("throws UNAUTHORIZED for an invalid token", async () => {
    vi.mocked(tokenModule.verifyClientApprovalToken).mockResolvedValue(null);
    const caller = attendanceRouter.createCaller(makePublicCtx());
    await expect(
      caller.getClientApprovalBatchByToken({ token: "bad.token" })
    ).rejects.toThrow(/Invalid or expired/);
  });
});

// ─── 4. getClientApprovalBatchByToken: valid token returns redacted data ──────

describe("4. getClientApprovalBatchByToken: valid token returns redacted batch + items", () => {
  it("returns batch and items with employee names", async () => {
    vi.mocked(tokenModule.verifyClientApprovalToken).mockResolvedValue({
      batchId: BATCH_ID,
      companyId: COMPANY_ID,
    });
    // select 1: batch query, select 2: items + JOIN
    const db = buildSequencedDb([[REDACTED_BATCH], ITEM_ROWS_WITH_NAMES]);
    await setMockDb(db);

    const caller = attendanceRouter.createCaller(makePublicCtx());
    const result = await caller.getClientApprovalBatchByToken({ token: FAKE_TOKEN });

    expect(result.batch.id).toBe(BATCH_ID);
    expect(result.batch.periodStart).toBe("2026-04-01");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].employeeDisplayName).toBe("Ahmed Al-Rashidi");
    expect(result.items[1].employeeDisplayName).toBe("Sara Khalil");
  });
});

// ─── 5. getClientApprovalBatchByToken: tenant isolation ──────────────────────

describe("5. getClientApprovalBatchByToken: tenant isolation — wrong companyId → NOT_FOUND", () => {
  it("returns NOT_FOUND when DB has no matching batch for the token companyId", async () => {
    vi.mocked(tokenModule.verifyClientApprovalToken).mockResolvedValue({
      batchId: BATCH_ID,
      companyId: 999, // different company
    });
    // select 1 returns empty (no batch for company 999)
    const db = buildSequencedDb([[]]);
    await setMockDb(db);

    const caller = attendanceRouter.createCaller(makePublicCtx());
    await expect(
      caller.getClientApprovalBatchByToken({ token: FAKE_TOKEN })
    ).rejects.toThrow(/not found/i);
  });
});

// ─── 6. getClientApprovalBatchByToken: redaction — no internal fields ─────────

describe("6. getClientApprovalBatchByToken: redacted payload has no companyId or employeeId", () => {
  it("batch result does not expose companyId or internal user IDs", async () => {
    vi.mocked(tokenModule.verifyClientApprovalToken).mockResolvedValue({
      batchId: BATCH_ID,
      companyId: COMPANY_ID,
    });
    const db = buildSequencedDb([[REDACTED_BATCH], ITEM_ROWS_WITH_NAMES]);
    await setMockDb(db);

    const caller = attendanceRouter.createCaller(makePublicCtx());
    const result = await caller.getClientApprovalBatchByToken({ token: FAKE_TOKEN });

    // Batch: no companyId, no internal user IDs
    expect((result.batch as Record<string, unknown>).companyId).toBeUndefined();
    expect((result.batch as Record<string, unknown>).submittedByUserId).toBeUndefined();
    expect((result.batch as Record<string, unknown>).approvedByUserId).toBeUndefined();
    expect((result.batch as Record<string, unknown>).rejectedByUserId).toBeUndefined();

    // Items: no employeeId, no attendanceRecordId, no dailyStateJson
    const item = result.items[0] as Record<string, unknown>;
    expect(item.employeeId).toBeUndefined();
    expect(item.companyId).toBeUndefined();
    expect(item.attendanceRecordId).toBeUndefined();
    expect(item.dailyStateJson).toBeUndefined();
    // Display name is present
    expect(typeof item.employeeDisplayName).toBe("string");
  });
});

// ─── 7. clientApproveByToken: invalid token ───────────────────────────────────

describe("7. clientApproveByToken: invalid token → UNAUTHORIZED", () => {
  it("throws UNAUTHORIZED for a bad token", async () => {
    vi.mocked(tokenModule.verifyClientApprovalToken).mockResolvedValue(null);
    const caller = attendanceRouter.createCaller(makePublicCtx());
    await expect(
      caller.clientApproveByToken({ token: "bad.token" })
    ).rejects.toThrow(/Invalid or expired/);
  });
});

// ─── 8. clientApproveByToken: draft batch → BAD_REQUEST ──────────────────────

describe("8. clientApproveByToken: draft batch → BAD_REQUEST", () => {
  it("throws BAD_REQUEST when batch is draft", async () => {
    vi.mocked(tokenModule.verifyClientApprovalToken).mockResolvedValue({
      batchId: BATCH_ID,
      companyId: COMPANY_ID,
    });
    const db = buildSequencedDb([[DRAFT_BATCH]]);
    await setMockDb(db);

    const caller = attendanceRouter.createCaller(makePublicCtx());
    await expect(
      caller.clientApproveByToken({ token: FAKE_TOKEN })
    ).rejects.toThrow(/Cannot approve/);
  });
});

// ─── 9. clientApproveByToken: submitted → approved + audit ───────────────────

describe("9. clientApproveByToken: submitted batch → approved + audit written", () => {
  it("approves the batch and writes CLIENT_APPROVAL_BATCH_APPROVED audit", async () => {
    const logSpy = vi.spyOn(attendanceAudit, "logAttendanceAuditSafe").mockResolvedValue(undefined);

    vi.mocked(tokenModule.verifyClientApprovalToken).mockResolvedValue({
      batchId: BATCH_ID,
      companyId: COMPANY_ID,
    });
    const db = buildSequencedDb([[SUBMITTED_BATCH]]);
    await setMockDb(db);

    const caller = attendanceRouter.createCaller(makePublicCtx());
    const result = await caller.clientApproveByToken({ token: FAKE_TOKEN });

    expect(result.status).toBe("approved");
    expect(logSpy).toHaveBeenCalled();

    const auditRow = logSpy.mock.calls[0][0] as {
      actionType: string;
      entityType: string;
      actorRole: string;
      actorUserId: number;
    };
    expect(auditRow.actionType).toBe(ATTENDANCE_AUDIT_ACTION.CLIENT_APPROVAL_BATCH_APPROVED);
    expect(auditRow.entityType).toBe(ATTENDANCE_AUDIT_ENTITY.CLIENT_APPROVAL_BATCH);
    expect(auditRow.actorRole).toBe("client_portal_token");
    expect(auditRow.actorUserId).toBe(0);
  });
});

// ─── 10. clientApproveByToken: already approved → BAD_REQUEST ────────────────

describe("10. clientApproveByToken: already approved batch → BAD_REQUEST", () => {
  it("throws BAD_REQUEST when batch is already approved", async () => {
    vi.mocked(tokenModule.verifyClientApprovalToken).mockResolvedValue({
      batchId: BATCH_ID,
      companyId: COMPANY_ID,
    });
    const db = buildSequencedDb([[APPROVED_BATCH]]);
    await setMockDb(db);

    const caller = attendanceRouter.createCaller(makePublicCtx());
    await expect(
      caller.clientApproveByToken({ token: FAKE_TOKEN })
    ).rejects.toThrow(/Cannot approve/);
  });
});

// ─── 11. clientRejectByToken: empty reason → BAD_REQUEST ─────────────────────

describe("11. clientRejectByToken: requires non-empty rejection reason", () => {
  it("throws validation error when rejectionReason is empty", async () => {
    vi.mocked(tokenModule.verifyClientApprovalToken).mockResolvedValue({
      batchId: BATCH_ID,
      companyId: COMPANY_ID,
    });
    const db = buildSequencedDb([[SUBMITTED_BATCH]]);
    await setMockDb(db);

    const caller = attendanceRouter.createCaller(makePublicCtx());
    await expect(
      caller.clientRejectByToken({ token: FAKE_TOKEN, rejectionReason: "" })
    ).rejects.toThrow();
  });
});

// ─── 12. clientRejectByToken: submitted → rejected + audit ───────────────────

describe("12. clientRejectByToken: submitted batch → rejected + audit written", () => {
  it("rejects the batch with reason and writes CLIENT_APPROVAL_BATCH_REJECTED audit", async () => {
    const logSpy = vi.spyOn(attendanceAudit, "logAttendanceAuditSafe").mockResolvedValue(undefined);

    vi.mocked(tokenModule.verifyClientApprovalToken).mockResolvedValue({
      batchId: BATCH_ID,
      companyId: COMPANY_ID,
    });
    const db = buildSequencedDb([[SUBMITTED_BATCH]]);
    await setMockDb(db);

    const caller = attendanceRouter.createCaller(makePublicCtx());
    const result = await caller.clientRejectByToken({
      token: FAKE_TOKEN,
      rejectionReason: "Hours do not match our records.",
    });

    expect(result.status).toBe("rejected");
    expect(logSpy).toHaveBeenCalled();

    const auditRow = logSpy.mock.calls[0][0] as {
      actionType: string;
      actorRole: string;
      reason: string;
    };
    expect(auditRow.actionType).toBe(ATTENDANCE_AUDIT_ACTION.CLIENT_APPROVAL_BATCH_REJECTED);
    expect(auditRow.actorRole).toBe("client_portal_token");
    expect(auditRow.reason).toBe("Hours do not match our records.");
  });
});

// ─── 13. clientRejectByToken: approved batch → BAD_REQUEST ───────────────────

describe("13. clientRejectByToken: approved batch → BAD_REQUEST (terminal)", () => {
  it("throws BAD_REQUEST when batch is already approved", async () => {
    vi.mocked(tokenModule.verifyClientApprovalToken).mockResolvedValue({
      batchId: BATCH_ID,
      companyId: COMPANY_ID,
    });
    const db = buildSequencedDb([[APPROVED_BATCH]]);
    await setMockDb(db);

    const caller = attendanceRouter.createCaller(makePublicCtx());
    await expect(
      caller.clientRejectByToken({
        token: FAKE_TOKEN,
        rejectionReason: "Too late to reject.",
      })
    ).rejects.toThrow(/Cannot reject/);
  });
});

// ─── 14. Internal HR approveClientApprovalBatch regression ───────────────────

describe("14. internal HR approveClientApprovalBatch still passes (no regression)", () => {
  it("HR approve still works after Phase 10B changes", async () => {
    const logSpy = vi.spyOn(attendanceAudit, "logAttendanceAuditSafe").mockResolvedValue(undefined);

    const db = buildSequencedDb([[SUBMITTED_BATCH]]);
    await setMockDb(db);

    const caller = attendanceRouter.createCaller(makeHrCtx());
    const result = await caller.approveClientApprovalBatch({ batchId: BATCH_ID });

    expect(result.status).toBe("approved");
    expect(logSpy).toHaveBeenCalled();
  });
});
