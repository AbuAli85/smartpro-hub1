/**
 * Phase 12E: Attendance invoice issuance tests.
 *
 * Tests:
 *  HTML builder:
 *   1.  renders supplier name, invoice number, client name, period, lines, subtotal, VAT, total
 *   2.  escapes XSS in client name
 *   3.  escapes XSS in notes
 *   4.  handles missing optional supplier fields (no taxNumber, no crNumber, no address)
 *   5.  uses "On receipt" when dueDateYmd is not set
 *   6.  renders due date when dueDateYmd is provided
 *   7.  handles empty billing lines gracefully
 *
 *  issueAttendanceInvoice (service, storage mocked):
 *   8.  draft → issued: artifact fields populated, status updated
 *   9.  review_ready → issued: same
 *  10.  re-issue of already-issued returns skipped:true, storagePut not called again
 *  11.  re-issue of sent returns skipped:true
 *  12.  cancelled invoice throws BAD_REQUEST
 *  13.  paid invoice throws BAD_REQUEST
 *  14.  not found throws NOT_FOUND
 *
 *  issueAttendanceInvoice router (auth):
 *  15.  hr_admin is rejected with FORBIDDEN
 *  16.  company_member is rejected with FORBIDDEN
 *
 *  voidAttendanceInvoice router:
 *  17.  issued → cancelled with reason appended to notes
 *  18.  sent → cancelled with reason appended
 *  19.  reason under 5 chars is rejected by zod
 *  20.  draft cannot be voided (use cancel instead)
 *  21.  review_ready cannot be voided
 *  22.  paid cannot be voided
 *  23.  already cancelled rejects with BAD_REQUEST
 *
 *  cancelAttendanceInvoice router (Phase 12E refactor):
 *  24.  draft → cancelled (still works)
 *  25.  review_ready → cancelled (still works)
 *  26.  issued cannot be cancelled via cancel (use void)
 *  27.  sent cannot be cancelled via cancel (use void)
 *  28.  paid cannot be cancelled
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
import * as storageMod from "./storage";
import { attendanceBillingRouter } from "./routers/attendanceBilling";
import {
  buildAttendanceInvoiceHtml,
  issueAttendanceInvoice,
} from "./services/attendanceBillingExecution.service";

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
    employeeDisplayName: "Jane Doe",
    attendanceDate: "2026-04-01",
    durationMinutes: 480,
    checkInAt: "2026-04-01T06:00:00.000Z",
    checkOutAt: "2026-04-01T14:00:00.000Z",
    sessionStatus: "closed",
    siteId: 3,
  },
];

const BASE_INVOICE = {
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
  vatRatePct: "5.00",
  vatOmr: "4.000",
  totalOmr: "84.000",
  billingLinesJson: BILLING_LINES,
  dueDateYmd: "2026-05-15",
  notes: null,
  snapshotWarningOverrideReason: null,
  issuedAt: null,
  issuedByUserId: null,
  htmlArtifactKey: null,
  htmlArtifactUrl: null,
  createdByUserId: 2,
  createdAt: new Date("2026-04-25T11:00:00Z"),
  updatedAt: new Date("2026-04-25T11:00:00Z"),
};

const DRAFT_INVOICE = { ...BASE_INVOICE, status: "draft" };
const REVIEW_READY_INVOICE = { ...BASE_INVOICE, id: 51, status: "review_ready" };
const ISSUED_INVOICE = {
  ...BASE_INVOICE,
  id: 52,
  status: "issued",
  issuedAt: new Date("2026-04-26T09:00:00Z"),
  issuedByUserId: 2,
  htmlArtifactKey: "attendance-invoices/1/52/issued.html",
  htmlArtifactUrl: "https://storage.example.com/attendance-invoices/1/52/issued.html",
};
const SENT_INVOICE = { ...ISSUED_INVOICE, id: 53, status: "sent" };
const PAID_INVOICE = { ...BASE_INVOICE, id: 54, status: "paid" };
const CANCELLED_INVOICE = { ...BASE_INVOICE, id: 55, status: "cancelled" };

const COMPANY_INFO_ROW = {
  name: "Test Supplier Co",
  taxNumber: "OM-TAX-12345",
  crNumber: "1234567",
  address: "Muscat, Oman",
};

// ─── DB mock builder ──────────────────────────────────────────────────────────

function makeSequencedDb(selectSequence: object[][], updateSpy = vi.fn()) {
  let callIndex = 0;
  const db = {
    select: vi.fn().mockImplementation(() => {
      const rows = selectSequence[callIndex] ?? [];
      callIndex++;
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(rows),
          }),
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
  vi.mocked(dbFullModule.getUserCompanies).mockResolvedValue(COMPANY_LIST as never);
  vi.mocked(storageMod.storagePut).mockResolvedValue({
    key: "attendance-invoices/1/50/issued.html",
    url: "https://storage.example.com/attendance-invoices/1/50/issued.html",
  });
});

// ─── HTML builder tests ───────────────────────────────────────────────────────

describe("buildAttendanceInvoiceHtml", () => {
  const baseInvoice = {
    invoiceNumber: "ABIN-1-99-20260401-1",
    issuedAt: new Date("2026-04-26T09:00:00Z"),
    dueDateYmd: "2026-05-15",
    clientDisplayName: "Acme Client Ltd",
    periodStart: "2026-04-01",
    periodEnd: "2026-04-30",
    billingLinesJson: BILLING_LINES,
    subtotalOmr: "80.000",
    vatRatePct: "5.00",
    vatOmr: "4.000",
    totalOmr: "84.000",
    notes: null,
  };
  const baseCompany = {
    name: "Test Supplier Co",
    taxNumber: "OM-TAX-12345",
    crNumber: "1234567",
    address: "Muscat, Oman",
  };

  it("renders supplier name, invoice number, client, period, lines, subtotal, VAT, total", () => {
    const html = buildAttendanceInvoiceHtml(baseInvoice, baseCompany);
    expect(html).toContain("Test Supplier Co");
    expect(html).toContain("ABIN-1-99-20260401-1");
    expect(html).toContain("Acme Client Ltd");
    // fmtDate renders YYYY-MM-DD as "DD Mon YYYY"
    expect(html).toContain("01 Apr 2026");
    expect(html).toContain("30 Apr 2026");
    expect(html).toContain("Jane Doe");
    expect(html).toContain("480 min");
    expect(html).toContain("80.000 OMR");
    expect(html).toContain("5.00%");
    expect(html).toContain("4.000 OMR");
    expect(html).toContain("84.000 OMR");
  });

  it("escapes XSS in client name", () => {
    const html = buildAttendanceInvoiceHtml(
      { ...baseInvoice, clientDisplayName: '<script>alert("xss")</script>' },
      baseCompany,
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes XSS in notes", () => {
    const html = buildAttendanceInvoiceHtml(
      { ...baseInvoice, notes: '<img src=x onerror="evil()">' },
      baseCompany,
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("handles missing optional supplier fields gracefully", () => {
    const html = buildAttendanceInvoiceHtml(baseInvoice, { name: "Minimal Co" });
    expect(html).toContain("Minimal Co");
    expect(html).not.toContain("Tax No.");
    expect(html).not.toContain("CR No.");
  });

  it('uses "On receipt" when dueDateYmd is not set', () => {
    const html = buildAttendanceInvoiceHtml({ ...baseInvoice, dueDateYmd: null }, baseCompany);
    expect(html).toContain("On receipt");
  });

  it("renders due date when dueDateYmd is provided", () => {
    const html = buildAttendanceInvoiceHtml(baseInvoice, baseCompany);
    expect(html).toContain("15 May 2026");
  });

  it("handles empty billing lines gracefully", () => {
    const html = buildAttendanceInvoiceHtml({ ...baseInvoice, billingLinesJson: [] }, baseCompany);
    expect(html).toContain("No billing lines");
  });
});

// ─── issueAttendanceInvoice service tests ─────────────────────────────────────

describe("issueAttendanceInvoice service", () => {
  const companyInfo = { name: "Test Co", taxNumber: null, crNumber: null, address: null };

  it("draft → issued: status updated, artifact fields populated", async () => {
    const db = makeSequencedDb([[DRAFT_INVOICE]]);
    const result = await issueAttendanceInvoice(db as never, {
      companyId: 1,
      invoiceId: 50,
      userId: 2,
      companyInfo,
    });
    expect(result.skipped).toBe(false);
    expect(result.invoice.status).toBe("issued");
    expect(result.invoice.issuedByUserId).toBe(2);
    expect(result.invoice.htmlArtifactKey).toBeTruthy();
    expect(result.invoice.htmlArtifactUrl).toBeTruthy();
    expect(result.artifactUrl).toContain("storage.example.com");
    expect(storageMod.storagePut).toHaveBeenCalledOnce();
    expect(vi.mocked(storageMod.storagePut).mock.calls[0]?.[0]).toContain("attendance-invoices/1/50");
  });

  it("review_ready → issued", async () => {
    const db = makeSequencedDb([[REVIEW_READY_INVOICE]]);
    const result = await issueAttendanceInvoice(db as never, {
      companyId: 1,
      invoiceId: 51,
      userId: 2,
      companyInfo,
    });
    expect(result.skipped).toBe(false);
    expect(result.invoice.status).toBe("issued");
  });

  it("re-issue of already-issued returns skipped:true, storagePut not called", async () => {
    const db = makeSequencedDb([[ISSUED_INVOICE]]);
    const result = await issueAttendanceInvoice(db as never, {
      companyId: 1,
      invoiceId: 52,
      userId: 2,
      companyInfo,
    });
    expect(result.skipped).toBe(true);
    expect(storageMod.storagePut).not.toHaveBeenCalled();
    expect(result.artifactUrl).toBe(ISSUED_INVOICE.htmlArtifactUrl);
  });

  it("re-issue of sent returns skipped:true", async () => {
    const db = makeSequencedDb([[SENT_INVOICE]]);
    const result = await issueAttendanceInvoice(db as never, {
      companyId: 1,
      invoiceId: 53,
      userId: 2,
      companyInfo,
    });
    expect(result.skipped).toBe(true);
    expect(storageMod.storagePut).not.toHaveBeenCalled();
  });

  it("cancelled invoice throws BAD_REQUEST", async () => {
    const db = makeSequencedDb([[CANCELLED_INVOICE]]);
    await expect(
      issueAttendanceInvoice(db as never, { companyId: 1, invoiceId: 55, userId: 2, companyInfo }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("paid invoice throws BAD_REQUEST", async () => {
    const db = makeSequencedDb([[PAID_INVOICE]]);
    await expect(
      issueAttendanceInvoice(db as never, { companyId: 1, invoiceId: 54, userId: 2, companyInfo }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("not found throws NOT_FOUND", async () => {
    const db = makeSequencedDb([[]]);
    await expect(
      issueAttendanceInvoice(db as never, { companyId: 1, invoiceId: 999, userId: 2, companyInfo }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// ─── issueAttendanceInvoice router auth tests ─────────────────────────────────

describe("issueAttendanceInvoice router — auth", () => {
  it("hr_admin is rejected with FORBIDDEN", async () => {
    vi.mocked(dbFullModule.getUserCompanyById).mockResolvedValue(HR_MEMBERSHIP as never);
    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(caller.issueAttendanceInvoice({ invoiceId: 50 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("company_member is rejected with FORBIDDEN", async () => {
    vi.mocked(dbFullModule.getUserCompanyById).mockResolvedValue(MEMBER_MEMBERSHIP as never);
    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(caller.issueAttendanceInvoice({ invoiceId: 50 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

// ─── voidAttendanceInvoice router tests ──────────────────────────────────────

describe("voidAttendanceInvoice", () => {
  it("issued → cancelled with reason appended to notes", async () => {
    const db = makeSequencedDb([[{ id: 52, status: "issued", notes: null }]]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.voidAttendanceInvoice({
      invoiceId: 52,
      voidReason: "Incorrect rate was applied",
    });
    expect(result.status).toBe("cancelled");

    const setArg = vi.mocked(db.update().set).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setArg?.status).toBe("cancelled");
    expect(String(setArg?.notes)).toContain("Incorrect rate was applied");
    expect(String(setArg?.notes)).toContain("[VOIDED");
  });

  it("sent → cancelled with reason appended", async () => {
    const db = makeSequencedDb([[{ id: 53, status: "sent", notes: "Prior note" }]]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.voidAttendanceInvoice({
      invoiceId: 53,
      voidReason: "Client requested cancellation",
    });
    expect(result.status).toBe("cancelled");
  });

  it("reason under 5 chars is rejected", async () => {
    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(
      caller.voidAttendanceInvoice({ invoiceId: 52, voidReason: "bad" }),
    ).rejects.toThrow();
  });

  it("draft cannot be voided — use cancel instead", async () => {
    const db = makeSequencedDb([[{ id: 50, status: "draft", notes: null }]]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(
      caller.voidAttendanceInvoice({ invoiceId: 50, voidReason: "Some valid reason here" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("review_ready cannot be voided", async () => {
    const db = makeSequencedDb([[{ id: 51, status: "review_ready", notes: null }]]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(
      caller.voidAttendanceInvoice({ invoiceId: 51, voidReason: "Some valid reason here" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("paid cannot be voided", async () => {
    const db = makeSequencedDb([[{ id: 54, status: "paid", notes: null }]]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(
      caller.voidAttendanceInvoice({ invoiceId: 54, voidReason: "Some valid reason here" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("already cancelled rejects with BAD_REQUEST", async () => {
    const db = makeSequencedDb([[{ id: 55, status: "cancelled", notes: null }]]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(
      caller.voidAttendanceInvoice({ invoiceId: 55, voidReason: "Some valid reason here" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

// ─── cancelAttendanceInvoice router (Phase 12E refactor) ─────────────────────

describe("cancelAttendanceInvoice — Phase 12E refactor", () => {
  it("draft → cancelled (still works)", async () => {
    const db = makeSequencedDb([[{ id: 50, status: "draft" }]]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.cancelAttendanceInvoice({ invoiceId: 50 });
    expect(result.status).toBe("cancelled");
  });

  it("review_ready → cancelled (still works)", async () => {
    const db = makeSequencedDb([[{ id: 51, status: "review_ready" }]]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    const result = await caller.cancelAttendanceInvoice({ invoiceId: 51 });
    expect(result.status).toBe("cancelled");
  });

  it("issued cannot be cancelled via cancel — use void", async () => {
    const db = makeSequencedDb([[{ id: 52, status: "issued" }]]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(caller.cancelAttendanceInvoice({ invoiceId: 52 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("sent cannot be cancelled via cancel — use void", async () => {
    const db = makeSequencedDb([[{ id: 53, status: "sent" }]]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(caller.cancelAttendanceInvoice({ invoiceId: 53 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("paid cannot be cancelled", async () => {
    const db = makeSequencedDb([[{ id: 54, status: "paid" }]]);
    (dbModule.requireDb as any).mockResolvedValue(db);

    const caller = attendanceBillingRouter.createCaller(makeCtx());
    await expect(caller.cancelAttendanceInvoice({ invoiceId: 54 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});
