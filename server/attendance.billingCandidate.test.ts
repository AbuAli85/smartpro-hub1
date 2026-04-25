/**
 * Phase 12B: Draft billing candidate creation tests.
 *
 * Tests the REAL onClientApprovalComplete hook implementation —
 * this file does NOT mock attendanceClientApprovalHooks so the actual
 * billing logic runs. Only requireDb is mocked.
 *
 * Tests:
 *  1. Creates one draft billing candidate for an approved batch.
 *  2. Token approval path creates one draft billing candidate.
 *  3. Disputed items are excluded from billing lines.
 *  4. Zero approved items creates no artifact and no error.
 *  5. Duplicate call does not create a second artifact (idempotent).
 *  6. Billing line duration comes from dailyStateJson, not live rows.
 *  7. Missing dailyStateJson generates snapshotMissing line, not error.
 *  8. totalDurationMinutes sums only items that have a snapshot.
 *  9. Hook failure is best-effort (db error does not propagate).
 * 10. Does not insert if batch is not in approved state.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Mock requireDb only ──────────────────────────────────────────────────────

vi.mock("./db.client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db.client")>();
  return { ...actual, requireDb: vi.fn(), getDb: vi.fn() };
});

import * as dbModule from "./db.client";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const APPROVED_BATCH = {
  id: 10,
  companyId: 1,
  status: "approved",
  periodStart: "2026-04-01",
  periodEnd: "2026-04-30",
  clientCompanyId: 99,
  siteId: null,
  promoterAssignmentId: null,
  approvedAt: new Date("2026-04-25T10:00:00Z"),
  approvedByUserId: 2,
};

const ITEM_APPROVED = {
  id: 101,
  batchId: 10,
  companyId: 1,
  employeeId: 5,
  attendanceDate: "2026-04-01",
  attendanceSessionId: 201,
  attendanceRecordId: 301,
  status: "approved",
  clientComment: null,
  dailyStateJson: {
    source: "client_approval_batch_creation",
    snapshotCreatedAt: "2026-04-25T08:00:00.000Z",
    attendanceDate: "2026-04-01",
    employeeId: 5,
    employeeDisplayName: "Jane Doe",
    attendanceSessionId: 201,
    attendanceRecordId: 301,
    checkInAt: "2026-04-01T06:00:00.000Z",
    checkOutAt: "2026-04-01T14:00:00.000Z",
    durationMinutes: 480,
    sessionStatus: "closed",
    siteId: 3,
  },
};

const ITEM_DISPUTED = {
  ...ITEM_APPROVED,
  id: 102,
  employeeId: 6,
  status: "disputed",
};

const ITEM_NO_SNAPSHOT = {
  id: 103,
  batchId: 10,
  companyId: 1,
  employeeId: 7,
  attendanceDate: "2026-04-02",
  attendanceSessionId: null,
  attendanceRecordId: null,
  status: "approved",
  clientComment: null,
  dailyStateJson: null,
};

// ─── Mock DB builder ──────────────────────────────────────────────────────────

/** Builds a sequenced mock DB. Select calls return results in order:
 *  1st call → batch row
 *  2nd call → existing candidate (idempotency check)
 *  3rd call → items
 */
function makeMockDb(
  batchRow: object | null,
  existingCandidate: object | null,
  itemRows: object[],
) {
  const insertValues: object[] = [];
  let selectCallCount = 0;

  const selectResults = [
    batchRow ? [batchRow] : [],
    existingCandidate ? [existingCandidate] : [],
    itemRows,
  ];

  const db = {
    select: vi.fn().mockImplementation(() => {
      const rows = selectResults[selectCallCount] ?? [];
      selectCallCount++;
      // Return a chain that supports both `.limit()` (for batch/candidate lookups)
      // and direct `await` (for the items query which has no .limit()).
      const whereResult = {
        limit: vi.fn().mockResolvedValue(rows),
        // Make it thenable so `await db.select().from().where()` resolves directly.
        then: (resolve: (v: any) => any, reject?: (e: any) => any) =>
          Promise.resolve(rows).then(resolve, reject),
      };
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue(whereResult),
        }),
      };
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockImplementation((v: object) => {
        insertValues.push(v);
        return Promise.resolve();
      }),
    }),
  };

  return { db, insertValues };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("P12B onClientApprovalComplete — draft billing candidate creation", () => {
  it("creates one draft billing candidate for an approved batch", async () => {
    const { db, insertValues } = makeMockDb(APPROVED_BATCH, null, [ITEM_APPROVED]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const { onClientApprovalComplete } = await import("./lib/attendanceClientApprovalHooks");
    await onClientApprovalComplete({ batchId: 10, companyId: 1, source: "internal" });

    expect(insertValues).toHaveLength(1);
    const candidate = insertValues[0] as any;
    expect(candidate.batchId).toBe(10);
    expect(candidate.companyId).toBe(1);
    expect(candidate.status).toBe("draft");
    expect(candidate.approvedItemCount).toBe(1);
    expect(candidate.snapshotMissingCount).toBe(0);
    expect(Array.isArray(candidate.billingLinesJson)).toBe(true);
    expect(candidate.billingLinesJson).toHaveLength(1);
  });

  it("token approval path creates one draft billing candidate", async () => {
    const { db, insertValues } = makeMockDb(APPROVED_BATCH, null, [ITEM_APPROVED]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const { onClientApprovalComplete } = await import("./lib/attendanceClientApprovalHooks");
    await onClientApprovalComplete({ batchId: 10, companyId: 1, source: "client_portal_token" });

    expect(insertValues).toHaveLength(1);
    expect((insertValues[0] as any).source).toBe("client_portal_token");
  });

  it("excludes disputed items from billing lines", async () => {
    const { db, insertValues } = makeMockDb(APPROVED_BATCH, null, [ITEM_APPROVED, ITEM_DISPUTED]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const { onClientApprovalComplete } = await import("./lib/attendanceClientApprovalHooks");
    await onClientApprovalComplete({ batchId: 10, companyId: 1, source: "internal" });

    expect(insertValues).toHaveLength(1);
    const candidate = insertValues[0] as any;
    expect(candidate.approvedItemCount).toBe(1);
    expect(candidate.billingLinesJson).toHaveLength(1);
    expect(candidate.billingLinesJson[0].employeeId).toBe(5);
  });

  it("creates no artifact and no error when there are zero approved items", async () => {
    const { db, insertValues } = makeMockDb(APPROVED_BATCH, null, [ITEM_DISPUTED]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const { onClientApprovalComplete } = await import("./lib/attendanceClientApprovalHooks");
    await expect(
      onClientApprovalComplete({ batchId: 10, companyId: 1, source: "internal" }),
    ).resolves.toBeUndefined();

    expect(insertValues).toHaveLength(0);
  });

  it("duplicate call does not create a second artifact (idempotent)", async () => {
    const existingCandidate = { id: 55 };
    const { db, insertValues } = makeMockDb(APPROVED_BATCH, existingCandidate, [ITEM_APPROVED]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const { onClientApprovalComplete } = await import("./lib/attendanceClientApprovalHooks");
    await onClientApprovalComplete({ batchId: 10, companyId: 1, source: "internal" });

    expect(insertValues).toHaveLength(0);
  });

  it("billing line duration comes from dailyStateJson snapshot, not live session", async () => {
    const { db, insertValues } = makeMockDb(APPROVED_BATCH, null, [ITEM_APPROVED]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const { onClientApprovalComplete } = await import("./lib/attendanceClientApprovalHooks");
    await onClientApprovalComplete({ batchId: 10, companyId: 1, source: "internal" });

    const line = (insertValues[0] as any).billingLinesJson[0];
    expect(line.durationMinutes).toBe(480);
    expect(line.checkInAt).toBe("2026-04-01T06:00:00.000Z");
    expect(line.checkOutAt).toBe("2026-04-01T14:00:00.000Z");
    expect(line.employeeDisplayName).toBe("Jane Doe");
    expect(line.sessionStatus).toBe("closed");
  });

  it("missing dailyStateJson generates a line with snapshotMissing=true, not an error", async () => {
    const { db, insertValues } = makeMockDb(APPROVED_BATCH, null, [ITEM_APPROVED, ITEM_NO_SNAPSHOT]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const { onClientApprovalComplete } = await import("./lib/attendanceClientApprovalHooks");
    await onClientApprovalComplete({ batchId: 10, companyId: 1, source: "internal" });

    const candidate = insertValues[0] as any;
    expect(candidate.snapshotMissingCount).toBe(1);
    expect(candidate.billingLinesJson).toHaveLength(2);

    const missingLine = candidate.billingLinesJson.find((l: any) => l.snapshotMissing === true);
    expect(missingLine).toBeDefined();
    expect(missingLine.durationMinutes).toBeNull();
    expect(missingLine.checkInAt).toBeNull();
    expect(typeof missingLine.snapshotWarning).toBe("string");
  });

  it("totalDurationMinutes sums only items that have a snapshot", async () => {
    const { db, insertValues } = makeMockDb(APPROVED_BATCH, null, [ITEM_APPROVED, ITEM_NO_SNAPSHOT]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const { onClientApprovalComplete } = await import("./lib/attendanceClientApprovalHooks");
    await onClientApprovalComplete({ batchId: 10, companyId: 1, source: "internal" });

    // Only ITEM_APPROVED contributes 480 minutes; ITEM_NO_SNAPSHOT has no snapshot
    expect((insertValues[0] as any).totalDurationMinutes).toBe(480);
  });

  it("hook failure is best-effort — db error does not propagate to approval caller", async () => {
    (dbModule.requireDb as any).mockRejectedValue(new Error("db connection failed"));

    const { onClientApprovalComplete } = await import("./lib/attendanceClientApprovalHooks");
    await expect(
      onClientApprovalComplete({ batchId: 10, companyId: 1, source: "internal" }),
    ).resolves.toBeUndefined();
  });

  it("does not insert if batch is not in approved state", async () => {
    const submittedBatch = { ...APPROVED_BATCH, status: "submitted" };
    const { db, insertValues } = makeMockDb(submittedBatch, null, [ITEM_APPROVED]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const { onClientApprovalComplete } = await import("./lib/attendanceClientApprovalHooks");
    await onClientApprovalComplete({ batchId: 10, companyId: 1, source: "internal" });

    expect(insertValues).toHaveLength(0);
  });
});
