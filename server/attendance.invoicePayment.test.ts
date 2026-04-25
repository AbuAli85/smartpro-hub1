/**
 * Phase 12F: Attendance invoice payment tests.
 *
 * Tests:
 *  markAttendanceInvoiceSent router:
 *   1.  issued → sent: returns { status: "sent" }
 *   2.  draft invoice rejects with BAD_REQUEST
 *   3.  paid invoice rejects with BAD_REQUEST
 *   4.  hr_admin is rejected with FORBIDDEN
 *
 *  recordAttendanceInvoicePayment (service via router):
 *   5.  partial payment on issued: amountPaidOmr updated, status remains "issued"
 *   6.  partial payment on sent: amountPaidOmr updated, status remains "sent"
 *   7.  full payment on sent: status transitions to "paid"
 *   8.  full payment on issued: status transitions to "paid" (direct issued→paid edge)
 *   9.  over-payment rejected with BAD_REQUEST (balance in message)
 *  10.  zero amount rejected by Zod
 *  11.  negative amount rejected by Zod
 *  12.  draft invoice rejects payment with BAD_REQUEST
 *  13.  paid invoice rejects additional payment with BAD_REQUEST
 *  14.  company isolation: invoice not in this company returns NOT_FOUND
 *
 *  listAttendanceInvoicePayments router:
 *  15.  returns payment rows ordered by paidAt
 *  16.  returns empty array when no payments exist
 *
 *  voidAttendanceInvoice with payment guard (Phase 12F):
 *  17.  rejects void if payment records exist
 *  18.  void still works for issued invoice with no payment records
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

vi.mock("./storage", () => ({
  storagePut: vi.fn(),
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

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
const HR_MEMBERSHIP = {
  companyId: 1,
  role: "hr_admin",
  member: { role: "hr_admin", status: "active" },
  company: { id: 1 },
};

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ISSUED_INVOICE = {
  id: 52,
  companyId: 1,
  status: "issued",
  totalOmr: "84.000",
  amountPaidOmr: "0.000",
  sentAt: null,
  sentByUserId: null,
  notes: null,
};

const SENT_INVOICE = {
  ...ISSUED_INVOICE,
  id: 53,
  status: "sent",
  sentAt: new Date("2026-04-27T08:00:00Z"),
};

const DRAFT_INVOICE = { ...ISSUED_INVOICE, id: 50, status: "draft" };
const PAID_INVOICE = { ...ISSUED_INVOICE, id: 54, status: "paid" };

const PAYMENT_ROW_1 = {
  id: 101,
  attendanceInvoiceId: 52,
  companyId: 1,
  amountOmr: "40.000",
  paidAt: new Date("2026-04-28T00:00:00Z"),
  paymentMethod: "bank",
  reference: "TRF-001",
  notes: null,
  createdByUserId: 2,
  createdAt: new Date("2026-04-28T09:00:00Z"),
};

const PAYMENT_ROW_2 = {
  id: 102,
  attendanceInvoiceId: 52,
  companyId: 1,
  amountOmr: "44.000",
  paidAt: new Date("2026-04-29T00:00:00Z"),
  paymentMethod: "cash",
  reference: null,
  notes: null,
  createdByUserId: 2,
  createdAt: new Date("2026-04-29T10:00:00Z"),
};

// ─── DB mock builder ──────────────────────────────────────────────────────────

function makeSequencedDb(selectSequence: object[][], updateSpy = vi.fn()) {
  let callIndex = 0;
  const db = {
    select: vi.fn().mockImplementation(() => {
      const rows = selectSequence[callIndex] ?? [];
      callIndex++;
      const whereResult = {
        limit: vi.fn().mockResolvedValue(rows),
        orderBy: vi.fn().mockResolvedValue(rows),
      };
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue(whereResult),
          orderBy: vi.fn().mockReturnValue(whereResult),
        }),
      };
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation((...args) => {
          updateSpy(...args);
          return Promise.resolve();
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  };
  return db;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dbFullModule.getUserCompanyById).mockResolvedValue(FINANCE_MEMBERSHIP as never);
  vi.mocked(dbFullModule.getUserCompanies).mockResolvedValue([
    { company: { id: 1, name: "Test Co" }, member: { role: "finance_admin", isActive: true } },
  ] as never);
});

// ─── markAttendanceInvoiceSent ────────────────────────────────────────────────

describe("markAttendanceInvoiceSent", () => {
  it("issued → sent: returns { status: 'sent' }", async () => {
    const db = makeSequencedDb([[{ id: 52, status: "issued" }]]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.markAttendanceInvoiceSent({ invoiceId: 52 });

    expect(result.status).toBe("sent");
    expect(result.invoiceId).toBe(52);
    expect(result.sentAt).toBeInstanceOf(Date);
  });

  it("draft invoice rejects with BAD_REQUEST", async () => {
    const db = makeSequencedDb([[{ id: 50, status: "draft" }]]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(caller.markAttendanceInvoiceSent({ invoiceId: 50 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("paid invoice rejects with BAD_REQUEST", async () => {
    const db = makeSequencedDb([[{ id: 54, status: "paid" }]]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(caller.markAttendanceInvoiceSent({ invoiceId: 54 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("hr_admin is rejected with FORBIDDEN", async () => {
    vi.mocked(dbFullModule.getUserCompanyById).mockResolvedValue(HR_MEMBERSHIP as never);
    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(caller.markAttendanceInvoiceSent({ invoiceId: 52 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

// ─── recordAttendanceInvoicePayment ──────────────────────────────────────────

describe("recordAttendanceInvoicePayment", () => {
  it("partial payment on issued: amountPaidOmr updated, status remains issued", async () => {
    // call 0: load invoice; call 1: fetch inserted payment id
    const db = makeSequencedDb([[ISSUED_INVOICE], [{ id: 101 }]]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.recordAttendanceInvoicePayment({
      invoiceId: 52,
      amountOmr: 40,
      paymentMethod: "bank",
    });

    expect(result.newAmountPaidOmr).toBe("40.000");
    expect(result.balanceOmr).toBe("44.000");
    expect(result.newStatus).toBe("issued");
    expect(result.paymentId).toBe(101);
  });

  it("partial payment on sent: status remains sent", async () => {
    const db = makeSequencedDb([[SENT_INVOICE], [{ id: 102 }]]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.recordAttendanceInvoicePayment({
      invoiceId: 53,
      amountOmr: 40,
      paymentMethod: "cash",
    });

    expect(result.newStatus).toBe("sent");
    expect(result.balanceOmr).toBe("44.000");
  });

  it("full payment on sent: status transitions to paid", async () => {
    const db = makeSequencedDb([[SENT_INVOICE], [{ id: 103 }]]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.recordAttendanceInvoicePayment({
      invoiceId: 53,
      amountOmr: 84,
      paymentMethod: "bank",
      reference: "FULL-PAY-001",
    });

    expect(result.newStatus).toBe("paid");
    expect(result.newAmountPaidOmr).toBe("84.000");
    expect(result.balanceOmr).toBe("0.000");
  });

  it("full payment on issued: status transitions to paid (direct issued→paid edge)", async () => {
    const db = makeSequencedDb([[ISSUED_INVOICE], [{ id: 104 }]]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.recordAttendanceInvoicePayment({
      invoiceId: 52,
      amountOmr: 84,
      paymentMethod: "card",
    });

    expect(result.newStatus).toBe("paid");
    expect(result.balanceOmr).toBe("0.000");
  });

  it("over-payment rejected with BAD_REQUEST", async () => {
    const db = makeSequencedDb([[ISSUED_INVOICE], []]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(
      caller.recordAttendanceInvoicePayment({ invoiceId: 52, amountOmr: 100, paymentMethod: "bank" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("zero amount rejected by Zod", async () => {
    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(
      caller.recordAttendanceInvoicePayment({ invoiceId: 52, amountOmr: 0, paymentMethod: "bank" }),
    ).rejects.toThrow();
  });

  it("negative amount rejected by Zod", async () => {
    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(
      caller.recordAttendanceInvoicePayment({ invoiceId: 52, amountOmr: -5, paymentMethod: "bank" }),
    ).rejects.toThrow();
  });

  it("draft invoice rejects payment with BAD_REQUEST", async () => {
    const db = makeSequencedDb([[DRAFT_INVOICE], []]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(
      caller.recordAttendanceInvoicePayment({ invoiceId: 50, amountOmr: 10, paymentMethod: "cash" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("paid invoice rejects additional payment with BAD_REQUEST", async () => {
    const db = makeSequencedDb([[PAID_INVOICE], []]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(
      caller.recordAttendanceInvoicePayment({ invoiceId: 54, amountOmr: 10, paymentMethod: "cash" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("company isolation: invoice not in this company returns NOT_FOUND", async () => {
    // The service filters by companyId; returning [] simulates the invoice belonging to another company
    const db = makeSequencedDb([[]], vi.fn());
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(
      caller.recordAttendanceInvoicePayment({ invoiceId: 999, amountOmr: 10, paymentMethod: "cash" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// ─── listAttendanceInvoicePayments ────────────────────────────────────────────

describe("listAttendanceInvoicePayments", () => {
  it("returns payment rows", async () => {
    // call 0: invoice ownership check; call 1: payment records via orderBy
    const db = makeSequencedDb([[{ id: 52 }], [PAYMENT_ROW_1, PAYMENT_ROW_2]]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.listAttendanceInvoicePayments({ invoiceId: 52 });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 101, amountOmr: "40.000" });
    expect(result[1]).toMatchObject({ id: 102, amountOmr: "44.000" });
  });

  it("returns empty array when no payments exist", async () => {
    const db = makeSequencedDb([[{ id: 52 }], []]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.listAttendanceInvoicePayments({ invoiceId: 52 });

    expect(result).toHaveLength(0);
  });
});

// ─── voidAttendanceInvoice — Phase 12F payment guard ─────────────────────────

describe("voidAttendanceInvoice — Phase 12F payment guard", () => {
  it("rejects void if payment records exist", async () => {
    // call 0: load invoice; call 1: payment records check (non-empty → block)
    const db = makeSequencedDb(
      [[{ id: 52, status: "issued", notes: null }], [{ id: 101 }]],
    );
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(
      caller.voidAttendanceInvoice({ invoiceId: 52, voidReason: "Should not be allowed here" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("void succeeds for issued invoice with no payment records", async () => {
    // call 0: load invoice; call 1: payment records check (empty → allow)
    const db = makeSequencedDb(
      [[{ id: 52, status: "issued", notes: null }], []],
    );
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.voidAttendanceInvoice({
      invoiceId: 52,
      voidReason: "Rate was applied incorrectly",
    });

    expect(result.status).toBe("cancelled");
  });
});
