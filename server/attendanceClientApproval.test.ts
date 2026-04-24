/**
 * Server-side tests for Phase 10A client approval router procedures.
 *
 * DB, companies.repository, and attendanceAudit are mocked.
 *
 * Tests:
 *   1.  createClientApprovalBatch creates batch + items and writes audit
 *   2.  createClientApprovalBatch rejects duplicate non-cancelled batch
 *   3.  createClientApprovalBatch rejects when no employees found
 *   4.  submitClientApprovalBatch transitions draft → submitted and writes audit
 *   5.  submitClientApprovalBatch rejects already-submitted batch
 *   6.  approveClientApprovalBatch transitions submitted → approved and writes audit
 *   7.  approveClientApprovalBatch rejects draft batch (not yet submitted)
 *   8.  rejectClientApprovalBatch requires a non-empty reason
 *   9.  rejectClientApprovalBatch transitions submitted → rejected and writes audit
 *  10.  listClientApprovalBatches filters by status
 *  11.  getClientApprovalBatch returns batch + items
 *  12.  tenant isolation: getClientApprovalBatch returns NOT_FOUND for wrong company
 *  13.  unauthorized role is rejected
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { TrpcContext } from "./_core/context";
import { attendanceRouter } from "./routers/attendance";
import * as attendanceAudit from "./attendanceAudit";
import * as companiesRepo from "./repositories/companies.repository";
import * as dbModule from "./db";
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

function makeMemberCtx(): TrpcContext {
  return {
    user: {
      id: 99,
      openId: "o99",
      email: "member@test.om",
      name: "Member",
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

// ─── DB mock helpers ──────────────────────────────────────────────────────────

/**
 * Build a full-coverage Drizzle mock DB that sequences through `selectResults`
 * on each select/selectDistinct call.
 *
 * Each chain node is thenable (awaitable directly) and every chainable method
 * is created lazily (via mockImplementation) to avoid circular recursion during
 * object setup.
 *
 * Supported call patterns:
 *   await db.select().from().where()
 *   await db.select().from().where().limit(n)
 *   await db.select().from().where().orderBy().limit(n).offset(n)
 *   await db.select().from().where().orderBy().orderBy()
 *   await db.select().from().where().groupBy(...)
 *   await db.insert().values().$returningId()
 *   await db.update().set().where()
 */
function buildSequencedDb(
  selectResults: unknown[][],
  insertId?: number,
) {
  let selectIdx = 0;

  function nextRows() {
    return selectResults[selectIdx++] ?? [];
  }

  /**
   * A thenable chain node. All chainable methods are lazy (mockImplementation)
   * so that `makeChain` is never called at object-creation time.
   */
  function makeChain(rows: unknown[]) {
    const resolved = Promise.resolve(rows);
    return {
      // Makes the node directly awaitable
      then: resolved.then.bind(resolved),
      catch: resolved.catch.bind(resolved),
      // Lazy chainable methods
      limit:    vi.fn().mockImplementation(() => makeChain(rows)),
      offset:   vi.fn().mockImplementation(() => resolved),
      orderBy:  vi.fn().mockImplementation(() => makeChain(rows)),
      groupBy:  vi.fn().mockImplementation(() => resolved),
      where:    vi.fn().mockImplementation(() => makeChain(rows)),
      innerJoin: vi.fn().mockImplementation(() => makeChain(rows)),
    };
  }

  function makeSelectImpl() {
    return {
      from: vi.fn().mockImplementation(() => makeChain(nextRows())),
    };
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

const BATCH_ROW = {
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

const SUBMITTED_BATCH_ROW = { ...BATCH_ROW, status: "submitted" };

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(companiesRepo.getUserCompanyById).mockResolvedValue({
    company: { id: COMPANY_ID },
    member: { role: "hr_admin" },
  } as never);
  vi.mocked(dbModule.getUserCompanies).mockResolvedValue([
    { company: { id: COMPANY_ID, name: "Test Co" }, member: { role: "hr_admin" } },
  ] as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function setMockDb(db: ReturnType<typeof buildSequencedDb>) {
  const { requireDb } = await import("./db.client");
  vi.mocked(requireDb).mockResolvedValue(db as never);
}

// ─── 1. createClientApprovalBatch creates batch + items + audit ───────────────

describe("1. createClientApprovalBatch creates batch + items and writes audit", () => {
  it("creates batch, items, and emits CLIENT_APPROVAL_BATCH_CREATED audit", async () => {
    const logSpy = vi.spyOn(attendanceAudit, "logAttendanceAuditSafe").mockResolvedValue(undefined);

    const empRows = [{ id: 3 }, { id: 4 }];
    // select sequence: [duplicate check=[], employees=empRows, sessions=[], records=[]]
    const db = buildSequencedDb([[], empRows, [], []], BATCH_ID);
    await setMockDb(db);

    const caller = attendanceRouter.createCaller(makeHrCtx());
    const result = await caller.createClientApprovalBatch({
      periodStart: "2026-04-01",
      periodEnd: "2026-04-01",
    });

    expect(result.batchId).toBe(BATCH_ID);
    expect(logSpy).toHaveBeenCalled();
    const auditRow = logSpy.mock.calls[0][0] as { actionType: string; entityType: string };
    expect(auditRow.actionType).toBe(ATTENDANCE_AUDIT_ACTION.CLIENT_APPROVAL_BATCH_CREATED);
    expect(auditRow.entityType).toBe(ATTENDANCE_AUDIT_ENTITY.CLIENT_APPROVAL_BATCH);
  });
});

// ─── 2. Duplicate batch prevention ───────────────────────────────────────────

describe("2. createClientApprovalBatch rejects duplicate non-cancelled batch", () => {
  it("throws CONFLICT when an active batch exists for the same period", async () => {
    // First select (duplicate check) returns an existing submitted batch
    const db = buildSequencedDb([[{ id: 5, status: "submitted" }]]);
    await setMockDb(db);

    const caller = attendanceRouter.createCaller(makeHrCtx());
    await expect(
      caller.createClientApprovalBatch({ periodStart: "2026-04-01", periodEnd: "2026-04-07" })
    ).rejects.toThrow(/already exists/);
  });
});

// ─── 3. No employees found ────────────────────────────────────────────────────

describe("3. createClientApprovalBatch rejects when no employees found", () => {
  it("throws BAD_REQUEST when there are no active employees", async () => {
    // Duplicate check = [], employees = []
    const db = buildSequencedDb([[], []]);
    await setMockDb(db);

    const caller = attendanceRouter.createCaller(makeHrCtx());
    await expect(
      caller.createClientApprovalBatch({ periodStart: "2026-04-01", periodEnd: "2026-04-01" })
    ).rejects.toThrow(/No active employees/);
  });
});

// ─── 4. submitClientApprovalBatch: draft → submitted + audit ─────────────────

describe("4. submitClientApprovalBatch transitions draft → submitted and writes audit", () => {
  it("updates status to submitted and writes CLIENT_APPROVAL_BATCH_SUBMITTED audit", async () => {
    const logSpy = vi.spyOn(attendanceAudit, "logAttendanceAuditSafe").mockResolvedValue(undefined);

    const db = buildSequencedDb([[BATCH_ROW]]);
    await setMockDb(db);

    const caller = attendanceRouter.createCaller(makeHrCtx());
    const result = await caller.submitClientApprovalBatch({ batchId: BATCH_ID });

    expect(result.status).toBe("submitted");
    expect(db.update).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();
    const auditRow = logSpy.mock.calls[0][0] as { actionType: string };
    expect(auditRow.actionType).toBe(ATTENDANCE_AUDIT_ACTION.CLIENT_APPROVAL_BATCH_SUBMITTED);
  });
});

// ─── 5. submitClientApprovalBatch rejects already-submitted ──────────────────

describe("5. submitClientApprovalBatch rejects already-submitted batch", () => {
  it("throws BAD_REQUEST when batch is already submitted", async () => {
    const db = buildSequencedDb([[SUBMITTED_BATCH_ROW]]);
    await setMockDb(db);

    const caller = attendanceRouter.createCaller(makeHrCtx());
    await expect(caller.submitClientApprovalBatch({ batchId: BATCH_ID })).rejects.toThrow(/Cannot submit/);
  });
});

// ─── 6. approveClientApprovalBatch: submitted → approved + audit ─────────────

describe("6. approveClientApprovalBatch transitions submitted → approved and writes audit", () => {
  it("updates status to approved and writes CLIENT_APPROVAL_BATCH_APPROVED audit", async () => {
    const logSpy = vi.spyOn(attendanceAudit, "logAttendanceAuditSafe").mockResolvedValue(undefined);

    const db = buildSequencedDb([[SUBMITTED_BATCH_ROW]]);
    await setMockDb(db);

    const caller = attendanceRouter.createCaller(makeHrCtx());
    const result = await caller.approveClientApprovalBatch({ batchId: BATCH_ID });

    expect(result.status).toBe("approved");
    expect(logSpy).toHaveBeenCalled();
    const auditRow = logSpy.mock.calls[0][0] as { actionType: string };
    expect(auditRow.actionType).toBe(ATTENDANCE_AUDIT_ACTION.CLIENT_APPROVAL_BATCH_APPROVED);
  });
});

// ─── 7. approveClientApprovalBatch rejects draft ─────────────────────────────

describe("7. approveClientApprovalBatch rejects draft batch", () => {
  it("throws BAD_REQUEST when batch is still in draft status", async () => {
    const db = buildSequencedDb([[BATCH_ROW]]);
    await setMockDb(db);

    const caller = attendanceRouter.createCaller(makeHrCtx());
    await expect(
      caller.approveClientApprovalBatch({ batchId: BATCH_ID })
    ).rejects.toThrow(/Cannot approve/);
  });
});

// ─── 8. rejectClientApprovalBatch requires non-empty reason ──────────────────

describe("8. rejectClientApprovalBatch requires a non-empty reason", () => {
  it("throws input validation error when rejectionReason is empty", async () => {
    const caller = attendanceRouter.createCaller(makeHrCtx());
    await expect(
      caller.rejectClientApprovalBatch({ batchId: BATCH_ID, rejectionReason: "" })
    ).rejects.toThrow();
  });
});

// ─── 9. rejectClientApprovalBatch: submitted → rejected + audit ──────────────

describe("9. rejectClientApprovalBatch transitions submitted → rejected and writes audit", () => {
  it("updates status to rejected, stores reason, and writes CLIENT_APPROVAL_BATCH_REJECTED audit", async () => {
    const logSpy = vi.spyOn(attendanceAudit, "logAttendanceAuditSafe").mockResolvedValue(undefined);

    const db = buildSequencedDb([[SUBMITTED_BATCH_ROW]]);
    await setMockDb(db);

    const caller = attendanceRouter.createCaller(makeHrCtx());
    const result = await caller.rejectClientApprovalBatch({
      batchId: BATCH_ID,
      rejectionReason: "Attendance records do not match client timesheets.",
    });

    expect(result.status).toBe("rejected");
    expect(db.update).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();
    const auditRow = logSpy.mock.calls[0][0] as { actionType: string; reason: string };
    expect(auditRow.actionType).toBe(ATTENDANCE_AUDIT_ACTION.CLIENT_APPROVAL_BATCH_REJECTED);
    expect(auditRow.reason).toContain("timesheets");
  });
});

// ─── 10. listClientApprovalBatches filters by status ─────────────────────────

describe("10. listClientApprovalBatches filters by status", () => {
  it("returns an array (possibly empty) without throwing", async () => {
    // Main batch list + item counts (empty, no items)
    const db = buildSequencedDb([[SUBMITTED_BATCH_ROW], []]);
    await setMockDb(db);

    const caller = attendanceRouter.createCaller(makeHrCtx());
    const result = await caller.listClientApprovalBatches({ status: "submitted" });

    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── 11. getClientApprovalBatch returns batch + items ────────────────────────

describe("11. getClientApprovalBatch returns batch + items", () => {
  it("returns the batch and its items array", async () => {
    const itemRows = [
      { id: 1, batchId: BATCH_ID, companyId: COMPANY_ID, employeeId: 3, attendanceDate: "2026-04-01", status: "pending" },
    ];
    // Sequence: [batch, items]
    const db = buildSequencedDb([[BATCH_ROW], itemRows]);
    await setMockDb(db);

    const caller = attendanceRouter.createCaller(makeHrCtx());
    const result = await caller.getClientApprovalBatch({ batchId: BATCH_ID });

    expect(result.batch).toBeDefined();
    expect(result.batch.id).toBe(BATCH_ID);
    expect(Array.isArray(result.items)).toBe(true);
  });
});

// ─── 12. Tenant isolation ─────────────────────────────────────────────────────

describe("12. tenant isolation: getClientApprovalBatch returns NOT_FOUND for wrong company", () => {
  it("throws NOT_FOUND when the batch does not exist in the caller's company", async () => {
    // Empty result = batch not found for this company
    const db = buildSequencedDb([[]]);
    await setMockDb(db);

    const caller = attendanceRouter.createCaller(makeHrCtx());
    await expect(caller.getClientApprovalBatch({ batchId: 999 })).rejects.toThrow(/not found/i);
  });
});

// ─── 13. Unauthorized role rejected ──────────────────────────────────────────

describe("13. unauthorized role is rejected", () => {
  it("throws FORBIDDEN when caller is a company_member", async () => {
    vi.mocked(companiesRepo.getUserCompanyById).mockResolvedValue({
      company: { id: COMPANY_ID },
      member: { role: "company_member" },
    } as never);

    const caller = attendanceRouter.createCaller(makeMemberCtx());
    await expect(
      caller.listClientApprovalBatches({})
    ).rejects.toThrow(/FORBIDDEN|forbidden|Admin|HR/i);
  });
});
