/**
 * Phase 12D: Attendance invoice conversion router tests.
 *
 * Tests:
 *  1.  creates a draft invoice from a review_ready candidate
 *  2.  computes subtotal, VAT, and total correctly
 *  3.  copies billingLinesJson from candidate (not re-read from sessions)
 *  4.  uses correct invoice number format ABIN-{co}-{client}-{YYYYMMDD}-{candidateId}
 *  5.  rejects draft candidate with BAD_REQUEST
 *  6.  rejects cancelled candidate with BAD_REQUEST
 *  7.  rejects when clientCompanyId is null
 *  8.  rejects snapshotMissingCount > 0 without override reason
 *  9.  accepts snapshot warning with override reason provided
 * 10.  is idempotent — second conversion rejected when non-cancelled invoice exists
 * 11.  created invoice status is "draft"
 * 12.  hr_admin is rejected with FORBIDDEN
 * 13.  company_member is rejected with FORBIDDEN
 * 14.  listAttendanceInvoices filters by company/status
 * 15.  getAttendanceInvoice returns parsed billing lines
 * 16.  getAttendanceInvoice throws NOT_FOUND for wrong company
 * 17.  cancelAttendanceInvoice cancels a draft invoice
 * 18.  cancelAttendanceInvoice cancels a review_ready invoice
 * 19.  cancelAttendanceInvoice rejects an issued invoice
 * 20.  cancelAttendanceInvoice is idempotent on already-cancelled invoice
 * 21.  cancelAttendanceBillingCandidate rejects when non-cancelled invoice exists
 * 22.  cancelAttendanceBillingCandidate allows when invoice is cancelled
 * 23.  getAttendanceBillingCandidate returns invoiceId/invoiceStatus when invoice exists
 * 24.  getAttendanceBillingCandidate returns invoiceId:null when no invoice
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
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

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getUserCompanyById: vi.fn(), getUserCompany: vi.fn(), getUserCompanies: vi.fn() };
});

import * as dbModule from "./db.client";
import * as dbFullModule from "./db";
import { attendanceBillingRouter } from "./routers/attendanceBilling";

// ─── Context helpers ──────────────────────────────────────────────────────────

function makeCtx(userId = 2, overrides: Partial<TrpcContext["user"]> = {}): TrpcContext {
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

const COMPANY_LIST = [{ company: { id: 1, name: "Test Co" }, member: { role: "finance_admin", isActive: true } }];

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BILLING_LINES = [
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
];

const REVIEW_READY_CANDIDATE = {
  id: 1,
  batchId: 10,
  companyId: 1,
  clientCompanyId: 99,
  periodStart: "2026-04-01",
  periodEnd: "2026-04-30",
  source: "internal",
  status: "review_ready",
  approvedItemCount: 1,
  snapshotMissingCount: 0,
  totalDurationMinutes: 480,   // 8 hours
  billingLinesJson: BILLING_LINES,
  createdAt: new Date("2026-04-25T10:00:00Z"),
  updatedAt: new Date("2026-04-25T10:00:00Z"),
};

const DRAFT_CANDIDATE = { ...REVIEW_READY_CANDIDATE, id: 2, status: "draft" };
const CANCELLED_CANDIDATE = { ...REVIEW_READY_CANDIDATE, id: 3, status: "cancelled" };
const NO_CLIENT_CANDIDATE = { ...REVIEW_READY_CANDIDATE, id: 4, clientCompanyId: null };
const MISSING_SNAPSHOT_CANDIDATE = { ...REVIEW_READY_CANDIDATE, id: 5, snapshotMissingCount: 2 };

const CLIENT_COMPANY_ROW = { name: "Acme Client Ltd" };

const DRAFT_INVOICE = {
  id: 50,
  candidateId: 1,
  companyId: 1,
  clientCompanyId: 99,
  clientDisplayName: "Acme Client Ltd",
  invoiceNumber: "ABIN-1-99-20260401-1",
  periodStart: "2026-04-01",
  periodEnd: "2026-04-30",
  currencyCode: "OMR",
  ratePerHourOmr: "10.000",
  totalDurationMinutes: 480,
  subtotalOmr: "80.000",
  vatRatePct: "0.00",
  vatOmr: "0.000",
  totalOmr: "80.000",
  billingLinesJson: BILLING_LINES,
  status: "draft",
  dueDateYmd: null,
  notes: null,
  snapshotWarningOverrideReason: null,
  issuedAt: null,
  issuedByUserId: null,
  createdByUserId: 2,
  createdAt: new Date("2026-04-25T11:00:00Z"),
  updatedAt: new Date("2026-04-25T11:00:00Z"),
};

const REVIEW_READY_INVOICE = { ...DRAFT_INVOICE, id: 51, status: "review_ready" };
const ISSUED_INVOICE = { ...DRAFT_INVOICE, id: 52, status: "issued" };
const CANCELLED_INVOICE = { ...DRAFT_INVOICE, id: 53, status: "cancelled" };

// ─── Mock DB builder ──────────────────────────────────────────────────────────

/**
 * Builds a sequenced mock DB for procedures that call select() multiple times.
 * Each call to select() returns the next batch of rows from selectSequence.
 * insert() is mocked to be trackable.
 */
function makeSequencedDb(selectSequence: object[][], insertRows: object[] = [{ id: 50 }]) {
  let callIndex = 0;
  const insertedValues: object[] = [];

  const db = {
    select: vi.fn().mockImplementation(() => {
      const rows = selectSequence[callIndex] ?? [];
      callIndex++;
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(rows),
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(rows),
              }),
            }),
          }),
        }),
      };
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockImplementation((v: object) => {
        insertedValues.push(v);
        return Promise.resolve();
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  };

  return { db, insertedValues };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dbFullModule.getUserCompanyById).mockResolvedValue(FINANCE_MEMBERSHIP as never);
  vi.mocked(dbFullModule.getUserCompanies).mockResolvedValue(COMPANY_LIST as never);
});

// ─── convertAttendanceBillingCandidateToInvoice ───────────────────────────────

describe("convertAttendanceBillingCandidateToInvoice", () => {
  it("creates a draft invoice from a review_ready candidate", async () => {
    // Sequence: candidate, existing invoice (none), client company, inserted invoice id
    const { db, insertedValues } = makeSequencedDb([
      [REVIEW_READY_CANDIDATE],   // load candidate
      [],                          // no existing invoice
      [CLIENT_COMPANY_ROW],        // client company name
      [{ id: 50 }],                // newly inserted invoice id
    ]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.convertAttendanceBillingCandidateToInvoice({
      candidateId: 1,
      ratePerHourOmr: 10,
    });

    expect(result.status).toBe("draft");
    expect(result.candidateId).toBe(1);
    expect(insertedValues).toHaveLength(1);
  });

  it("computes subtotal, VAT, and total correctly (480min = 8h @ 10 OMR/h, 5% VAT)", async () => {
    const { db, insertedValues } = makeSequencedDb([
      [REVIEW_READY_CANDIDATE],
      [],
      [CLIENT_COMPANY_ROW],
      [{ id: 50 }],
    ]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await caller.convertAttendanceBillingCandidateToInvoice({
      candidateId: 1,
      ratePerHourOmr: 10,
      vatRatePct: 5,
    });

    const inserted = insertedValues[0] as any;
    expect(inserted.subtotalOmr).toBe("80.000");   // 8h × 10
    expect(inserted.vatOmr).toBe("4.000");          // 80 × 5%
    expect(inserted.totalOmr).toBe("84.000");
    expect(inserted.vatRatePct).toBe("5.00");
  });

  it("copies billingLinesJson from candidate (not live re-read)", async () => {
    const { db, insertedValues } = makeSequencedDb([
      [REVIEW_READY_CANDIDATE],
      [],
      [CLIENT_COMPANY_ROW],
      [{ id: 50 }],
    ]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await caller.convertAttendanceBillingCandidateToInvoice({
      candidateId: 1,
      ratePerHourOmr: 10,
    });

    const inserted = insertedValues[0] as any;
    expect(Array.isArray(inserted.billingLinesJson)).toBe(true);
    expect(inserted.billingLinesJson).toHaveLength(1);
    expect(inserted.billingLinesJson[0].employeeDisplayName).toBe("Jane Doe");
    expect(inserted.billingLinesJson[0].durationMinutes).toBe(480);
  });

  it("uses invoice number format ABIN-{companyId}-{clientCompanyId}-{YYYYMMDD}-{candidateId}", async () => {
    const { db, insertedValues } = makeSequencedDb([
      [REVIEW_READY_CANDIDATE],
      [],
      [CLIENT_COMPANY_ROW],
      [{ id: 50 }],
    ]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.convertAttendanceBillingCandidateToInvoice({
      candidateId: 1,
      ratePerHourOmr: 10,
    });

    // companyId=1, clientCompanyId=99, periodStart=2026-04-01, candidateId=1
    expect(result.invoiceNumber).toBe("ABIN-1-99-20260401-1");
    const inserted = insertedValues[0] as any;
    expect(inserted.invoiceNumber).toBe("ABIN-1-99-20260401-1");
  });

  it("rejects a draft candidate with BAD_REQUEST", async () => {
    const { db } = makeSequencedDb([[DRAFT_CANDIDATE], [], [], []]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(
      caller.convertAttendanceBillingCandidateToInvoice({ candidateId: 2, ratePerHourOmr: 10 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a cancelled candidate with BAD_REQUEST", async () => {
    const { db } = makeSequencedDb([[CANCELLED_CANDIDATE], [], [], []]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(
      caller.convertAttendanceBillingCandidateToInvoice({ candidateId: 3, ratePerHourOmr: 10 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects when clientCompanyId is null", async () => {
    const { db } = makeSequencedDb([[NO_CLIENT_CANDIDATE], [], [], []]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(
      caller.convertAttendanceBillingCandidateToInvoice({ candidateId: 4, ratePerHourOmr: 10 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects snapshotMissingCount > 0 without override reason", async () => {
    const { db } = makeSequencedDb([[MISSING_SNAPSHOT_CANDIDATE], [], [], []]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(
      caller.convertAttendanceBillingCandidateToInvoice({ candidateId: 5, ratePerHourOmr: 10 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("accepts conversion with snapshotMissingCount > 0 when override reason is provided", async () => {
    const { db, insertedValues } = makeSequencedDb([
      [MISSING_SNAPSHOT_CANDIDATE],
      [],
      [CLIENT_COMPANY_ROW],
      [{ id: 50 }],
    ]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.convertAttendanceBillingCandidateToInvoice({
      candidateId: 5,
      ratePerHourOmr: 10,
      snapshotWarningOverrideReason: "Reviewed manually — employee confirmed hours",
    });

    expect(result.status).toBe("draft");
    expect((insertedValues[0] as any).snapshotWarningOverrideReason).toBe(
      "Reviewed manually — employee confirmed hours",
    );
  });

  it("rejects second conversion when a non-cancelled invoice already exists", async () => {
    const { db } = makeSequencedDb([
      [REVIEW_READY_CANDIDATE],
      [DRAFT_INVOICE],            // existing non-cancelled invoice found
      [],
      [],
    ]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(
      caller.convertAttendanceBillingCandidateToInvoice({ candidateId: 1, ratePerHourOmr: 10 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("allows re-conversion when the existing invoice is cancelled", async () => {
    const { db, insertedValues } = makeSequencedDb([
      [REVIEW_READY_CANDIDATE],
      [CANCELLED_INVOICE],        // existing invoice is cancelled → allowed
      [CLIENT_COMPANY_ROW],
      [{ id: 55 }],
    ]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.convertAttendanceBillingCandidateToInvoice({
      candidateId: 1,
      ratePerHourOmr: 10,
    });

    expect(result.status).toBe("draft");
    expect(insertedValues).toHaveLength(1);
  });

  it("created invoice has status 'draft'", async () => {
    const { db, insertedValues } = makeSequencedDb([
      [REVIEW_READY_CANDIDATE],
      [],
      [CLIENT_COMPANY_ROW],
      [{ id: 50 }],
    ]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.convertAttendanceBillingCandidateToInvoice({
      candidateId: 1,
      ratePerHourOmr: 10,
    });

    expect(result.status).toBe("draft");
    expect((insertedValues[0] as any).status).toBe("draft");
  });

  it("hr_admin is rejected with FORBIDDEN", async () => {
    vi.mocked(dbFullModule.getUserCompanyById).mockResolvedValue(HR_MEMBERSHIP as never);
    const { db } = makeSequencedDb([[REVIEW_READY_CANDIDATE], [], [], []]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(
      caller.convertAttendanceBillingCandidateToInvoice({ candidateId: 1, ratePerHourOmr: 10 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("company_member is rejected with FORBIDDEN", async () => {
    vi.mocked(dbFullModule.getUserCompanyById).mockResolvedValue(MEMBER_MEMBERSHIP as never);
    const { db } = makeSequencedDb([[REVIEW_READY_CANDIDATE], [], [], []]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(
      caller.convertAttendanceBillingCandidateToInvoice({ candidateId: 1, ratePerHourOmr: 10 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ─── listAttendanceInvoices ───────────────────────────────────────────────────

describe("listAttendanceInvoices", () => {
  it("returns invoices for the active company", async () => {
    const { db } = makeSequencedDb([[DRAFT_INVOICE]]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.listAttendanceInvoices({});

    expect(result).toHaveLength(1);
    expect(result[0].invoiceNumber).toBe("ABIN-1-99-20260401-1");
  });

  it("returns empty list when no invoices exist", async () => {
    const { db } = makeSequencedDb([[]]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.listAttendanceInvoices({ status: "draft" });

    expect(result).toHaveLength(0);
  });

  it("hr_admin is rejected with FORBIDDEN", async () => {
    vi.mocked(dbFullModule.getUserCompanyById).mockResolvedValue(HR_MEMBERSHIP as never);
    const { db } = makeSequencedDb([[]]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(caller.listAttendanceInvoices({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ─── getAttendanceInvoice ─────────────────────────────────────────────────────

describe("getAttendanceInvoice", () => {
  it("returns invoice with parsed billing lines", async () => {
    const { db } = makeSequencedDb([[DRAFT_INVOICE]]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.getAttendanceInvoice({ invoiceId: 50 });

    expect(result.id).toBe(50);
    expect(Array.isArray(result.billingLinesJson)).toBe(true);
    expect(result.billingLinesJson).toHaveLength(1);
    expect(result.billingLinesJson[0].employeeDisplayName).toBe("Jane Doe");
    expect(result.totalHours).toBe(8);
  });

  it("throws NOT_FOUND for unknown invoiceId", async () => {
    const { db } = makeSequencedDb([[]]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(
      caller.getAttendanceInvoice({ invoiceId: 999 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws NOT_FOUND for invoice belonging to a different company", async () => {
    // Invoice has companyId=2 but the caller resolves to companyId=1 — the WHERE filters it out
    const { db } = makeSequencedDb([[]]); // empty because WHERE(companyId=1) matches nothing
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(
      caller.getAttendanceInvoice({ invoiceId: 50 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// ─── cancelAttendanceInvoice ──────────────────────────────────────────────────

describe("cancelAttendanceInvoice", () => {
  it("cancels a draft invoice", async () => {
    const { db } = makeSequencedDb([[DRAFT_INVOICE]]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.cancelAttendanceInvoice({ invoiceId: 50 });

    expect(result.status).toBe("cancelled");
    expect(db.update).toHaveBeenCalled();
  });

  it("cancels a review_ready invoice", async () => {
    const { db } = makeSequencedDb([[REVIEW_READY_INVOICE]]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.cancelAttendanceInvoice({ invoiceId: 51 });

    expect(result.status).toBe("cancelled");
  });

  it("rejects cancelling an issued invoice with BAD_REQUEST", async () => {
    const { db } = makeSequencedDb([[ISSUED_INVOICE]]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(
      caller.cancelAttendanceInvoice({ invoiceId: 52 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("is idempotent — returns cancelled without update when already cancelled", async () => {
    const { db } = makeSequencedDb([[CANCELLED_INVOICE]]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.cancelAttendanceInvoice({ invoiceId: 53 });

    expect(result.status).toBe("cancelled");
    expect(db.update).not.toHaveBeenCalled();
  });
});

// ─── cancelAttendanceBillingCandidate — invoice guard (Phase 12D) ─────────────

describe("cancelAttendanceBillingCandidate — invoice guard", () => {
  it("rejects candidate cancellation when a non-cancelled invoice exists", async () => {
    // Sequence: candidate, invoice (non-cancelled)
    const { db } = makeSequencedDb([
      [{ id: 1, status: "review_ready" }],  // candidate
      [DRAFT_INVOICE],                       // non-cancelled invoice blocks cancellation
    ]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(
      caller.cancelAttendanceBillingCandidate({ candidateId: 1 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("allows candidate cancellation when the associated invoice is cancelled", async () => {
    const { db } = makeSequencedDb([
      [{ id: 1, status: "review_ready" }],
      [CANCELLED_INVOICE],                  // cancelled invoice — does not block
    ]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.cancelAttendanceBillingCandidate({ candidateId: 1 });

    expect(result.status).toBe("cancelled");
    expect(db.update).toHaveBeenCalled();
  });

  it("allows candidate cancellation when no invoice exists", async () => {
    const { db } = makeSequencedDb([
      [{ id: 1, status: "draft" }],
      [],                                   // no invoice exists
    ]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.cancelAttendanceBillingCandidate({ candidateId: 1 });

    expect(result.status).toBe("cancelled");
  });
});

// ─── getAttendanceBillingCandidate — invoice enrichment (Phase 12D) ───────────

describe("getAttendanceBillingCandidate — invoice enrichment", () => {
  const BASE_CANDIDATE = {
    id: 1,
    batchId: 10,
    companyId: 1,
    clientCompanyId: 99,
    periodStart: "2026-04-01",
    periodEnd: "2026-04-30",
    source: "internal",
    status: "review_ready",
    approvedItemCount: 1,
    snapshotMissingCount: 0,
    totalDurationMinutes: 480,
    billingLinesJson: BILLING_LINES,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("returns invoiceId and invoiceStatus when an invoice exists", async () => {
    // Sequence: candidate, invoice lookup
    const { db } = makeSequencedDb([
      [BASE_CANDIDATE],
      [{ id: 50, status: "draft" }],
    ]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.getAttendanceBillingCandidate({ candidateId: 1 });

    expect(result.invoiceId).toBe(50);
    expect(result.invoiceStatus).toBe("draft");
  });

  it("returns invoiceId: null and invoiceStatus: null when no invoice exists", async () => {
    const { db } = makeSequencedDb([
      [BASE_CANDIDATE],
      [],                  // no invoice
    ]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.getAttendanceBillingCandidate({ candidateId: 1 });

    expect(result.invoiceId).toBeNull();
    expect(result.invoiceStatus).toBeNull();
  });
});
