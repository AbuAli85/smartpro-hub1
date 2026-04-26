/**
 * CRM WaaS Flow Tests
 *
 * Covers the end-to-end operating flow:
 *   quotations.createFromDeal     → create quotation draft from a CRM deal
 *   quotations.accept             → mark quotation accepted
 *   quotations.convertToDeployment → accepted quotation → deployment draft
 *   crm.clientCompanies.inviteToPortal → portal invitation stub
 *
 * DB strategy:
 *   - Helper functions (getClientCompanyById, getCrmContactById, getUserCompanyById…)
 *     are mocked directly on the `./db` module.
 *   - Raw Drizzle chains (getDb → DbClient) are replaced with a queue-based fake
 *     whose .limit() pops successive results from a pre-seeded array.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";
import { crmRouter } from "./routers/crm";
import { quotationsRouter } from "./routers/quotations";
import * as db from "./db";

// ── DB mock ───────────────────────────────────────────────────────────────────

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getUserCompanies: vi.fn(),
    getUserCompanyById: vi.fn(),
    getDb: vi.fn(),
    getClientCompanyById: vi.fn(),
    getCrmContactById: vi.fn(),
    getCrmDealById: vi.fn(),
  };
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const COMPANY_ID = 10;
const USER_ID = 1;

// ── Context factories ─────────────────────────────────────────────────────────

function makeCtx(overrides?: Partial<NonNullable<TrpcContext["user"]>>): TrpcContext {
  const user = {
    id: USER_ID,
    openId: "u1",
    email: "user@test.com",
    name: "Test User",
    loginMethod: "manus" as const,
    role: "user" as const,
    platformRole: "company_member" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function mockSingleMembership(companyId = COMPANY_ID) {
  const membership = {
    company: { id: companyId },
    member: { role: "company_admin", permissions: [] },
  } as any;
  vi.mocked(db.getUserCompanies).mockResolvedValue([membership]);
  vi.mocked(db.getUserCompanyById).mockResolvedValue(membership);
}

/**
 * Queue-based fake Drizzle db client.
 * Each call to .limit() pops the next entry from selectQueue.
 * insert().$returningId() resolves to [{ id: insertId }].
 * await insert().values() (without $returningId) is also supported via thenable.
 */
function makeFakeDb(selectQueue: Array<any[]> = [], insertId = 100): any {
  let selectIdx = 0;

  // Single insert chain shared by all insert calls.
  // Thenable so `await db.insert(...).values(...)` works without $returningId.
  const insertChain: any = {};
  insertChain.values = vi.fn().mockReturnValue(insertChain);
  insertChain.$returningId = vi.fn().mockResolvedValue([{ id: insertId }]);
  insertChain.then = (res: any, rej?: any) => Promise.resolve(undefined).then(res, rej);
  insertChain.catch = (rej: any) => Promise.resolve(undefined).catch(rej);

  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockImplementation(() =>
    Promise.resolve(selectQueue[selectIdx++] ?? []),
  );
  chain.insert = vi.fn().mockReturnValue(insertChain);
  chain.update = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });
  chain.delete = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  });

  return chain;
}

// Minimal line item for createFromDeal calls
const ONE_LINE_ITEM = [
  { serviceName: "Security Guards", qty: 10, unitPriceOmr: 150, discountPct: 0 },
];

// ── quotations.createFromDeal ─────────────────────────────────────────────────

describe("quotations.createFromDeal", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
    vi.mocked(db.getDb).mockReset();
  });

  it("creates a quotation draft and advances the deal to quotation_sent", async () => {
    mockSingleMembership(COMPANY_ID);
    // createFromDeal fetches the deal once directly, then resolveQuotationCrmLinks fetches it again
    const deal = { id: 5, companyId: COMPANY_ID, contactId: null, clientCompanyId: null, stage: "lead" };
    vi.mocked(db.getDb).mockResolvedValue(makeFakeDb([[deal], [deal]]) as any);

    const caller = quotationsRouter.createCaller(makeCtx());
    const result = await caller.createFromDeal({
      companyId: COMPANY_ID,
      dealId: 5,
      clientName: "Acme Corp",
      lineItems: ONE_LINE_ITEM,
    });

    expect(result).toMatchObject({ id: 100 });
    expect(result.referenceNumber).toMatch(/^QT-\d{4}-\d{4}$/);
  });

  it("rejects when deal belongs to a different tenant", async () => {
    mockSingleMembership(COMPANY_ID);
    const crossTenantDeal = { id: 5, companyId: 777, contactId: null };
    vi.mocked(db.getDb).mockResolvedValue(makeFakeDb([[crossTenantDeal]]) as any);

    const caller = quotationsRouter.createCaller(makeCtx());
    await expect(
      caller.createFromDeal({
        companyId: COMPANY_ID,
        dealId: 5,
        clientName: "Acme",
        lineItems: ONE_LINE_ITEM,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects when deal is not found", async () => {
    mockSingleMembership(COMPANY_ID);
    vi.mocked(db.getDb).mockResolvedValue(makeFakeDb([[]]) as any);

    const caller = quotationsRouter.createCaller(makeCtx());
    await expect(
      caller.createFromDeal({
        companyId: COMPANY_ID,
        dealId: 999,
        clientName: "Ghost Corp",
        lineItems: ONE_LINE_ITEM,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// ── quotations.accept ─────────────────────────────────────────────────────────

describe("quotations.accept", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
    vi.mocked(db.getDb).mockReset();
  });

  it("marks a quotation as accepted", async () => {
    mockSingleMembership(COMPANY_ID);
    const quotation = { companyId: COMPANY_ID, createdBy: USER_ID };
    vi.mocked(db.getDb).mockResolvedValue(makeFakeDb([[quotation]]) as any);

    const caller = quotationsRouter.createCaller(makeCtx());
    const result = await caller.accept({ id: 50 });

    expect(result).toMatchObject({ success: true });
  });

  it("throws NOT_FOUND when quotation does not exist", async () => {
    mockSingleMembership(COMPANY_ID);
    vi.mocked(db.getDb).mockResolvedValue(makeFakeDb([[]]) as any);

    const caller = quotationsRouter.createCaller(makeCtx());
    await expect(caller.accept({ id: 999 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// ── quotations.convertToDeployment ────────────────────────────────────────────

describe("quotations.convertToDeployment", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
    vi.mocked(db.getDb).mockReset();
  });

  const CONVERT_INPUT = {
    companyId: COMPANY_ID,
    quotationId: 20,
    billingCustomerId: 5,
    effectiveFrom: "2025-01-01",
    effectiveTo: "2025-06-30",
  };

  it("creates a deployment draft from an accepted quotation", async () => {
    mockSingleMembership(COMPANY_ID);
    const quotation = {
      id: 20,
      companyId: COMPANY_ID,
      createdBy: USER_ID,
      status: "accepted",
      clientCompanyId: null,
      crmDealId: null,
    };
    const billingCustomer = { id: 5 };
    vi.mocked(db.getDb).mockResolvedValue(makeFakeDb([[quotation], [billingCustomer]]) as any);

    const caller = quotationsRouter.createCaller(makeCtx());
    const result = await caller.convertToDeployment(CONVERT_INPUT);

    expect(result).toMatchObject({ deploymentId: 100, success: true });
  });

  it("rejects with BAD_REQUEST when quotation status is draft", async () => {
    mockSingleMembership(COMPANY_ID);
    const quotation = { id: 20, companyId: COMPANY_ID, createdBy: USER_ID, status: "draft" };
    vi.mocked(db.getDb).mockResolvedValue(makeFakeDb([[quotation]]) as any);

    const caller = quotationsRouter.createCaller(makeCtx());
    await expect(caller.convertToDeployment(CONVERT_INPUT)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("accepted"),
    });
  });

  it("rejects with BAD_REQUEST when quotation status is declined", async () => {
    mockSingleMembership(COMPANY_ID);
    const quotation = { id: 20, companyId: COMPANY_ID, createdBy: USER_ID, status: "declined" };
    vi.mocked(db.getDb).mockResolvedValue(makeFakeDb([[quotation]]) as any);

    const caller = quotationsRouter.createCaller(makeCtx());
    await expect(caller.convertToDeployment(CONVERT_INPUT)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("rejects with NOT_FOUND when billing customer belongs to a different tenant", async () => {
    mockSingleMembership(COMPANY_ID);
    const quotation = {
      id: 20,
      companyId: COMPANY_ID,
      createdBy: USER_ID,
      status: "accepted",
      clientCompanyId: null,
      crmDealId: null,
    };
    // Billing customer query returns empty — not found under this tenant
    vi.mocked(db.getDb).mockResolvedValue(makeFakeDb([[quotation], []]) as any);

    const caller = quotationsRouter.createCaller(makeCtx());
    await expect(caller.convertToDeployment(CONVERT_INPUT)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("rejects with NOT_FOUND when quotation does not exist", async () => {
    mockSingleMembership(COMPANY_ID);
    vi.mocked(db.getDb).mockResolvedValue(makeFakeDb([[]]) as any);

    const caller = quotationsRouter.createCaller(makeCtx());
    await expect(caller.convertToDeployment(CONVERT_INPUT)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("moves the linked deal to won stage on successful conversion", async () => {
    mockSingleMembership(COMPANY_ID);
    const quotation = {
      id: 20,
      companyId: COMPANY_ID,
      createdBy: USER_ID,
      status: "accepted",
      clientCompanyId: null,
      crmDealId: 7,
    };
    const billingCustomer = { id: 5 };
    const fakeDb = makeFakeDb([[quotation], [billingCustomer]]);
    vi.mocked(db.getDb).mockResolvedValue(fakeDb as any);

    const caller = quotationsRouter.createCaller(makeCtx());
    const result = await caller.convertToDeployment(CONVERT_INPUT);

    expect(result).toMatchObject({ success: true });
    // The deal update chain should have been invoked
    expect(fakeDb.update).toHaveBeenCalled();
  });
});

// ── crm.clientCompanies.inviteToPortal ────────────────────────────────────────

describe("crm.clientCompanies.inviteToPortal", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
    vi.mocked(db.getClientCompanyById).mockReset();
    vi.mocked(db.getCrmContactById).mockReset();
  });

  it("returns stub success for a valid client company", async () => {
    mockSingleMembership(COMPANY_ID);
    vi.mocked(db.getClientCompanyById).mockResolvedValue({
      id: 3,
      companyId: COMPANY_ID,
    } as any);

    const caller = crmRouter.createCaller(makeCtx());
    const result = await caller.clientCompanies.inviteToPortal({
      companyId: COMPANY_ID,
      clientCompanyId: 3,
    });

    expect(result).toMatchObject({ success: true, stub: true });
  });

  it("rejects when clientCompanyId belongs to a different tenant", async () => {
    mockSingleMembership(COMPANY_ID);
    vi.mocked(db.getClientCompanyById).mockResolvedValue({
      id: 3,
      companyId: 999,
    } as any);

    const caller = crmRouter.createCaller(makeCtx());
    await expect(
      caller.clientCompanies.inviteToPortal({
        companyId: COMPANY_ID,
        clientCompanyId: 3,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects when clientCompanyId is not found", async () => {
    mockSingleMembership(COMPANY_ID);
    vi.mocked(db.getClientCompanyById).mockResolvedValue(null as any);

    const caller = crmRouter.createCaller(makeCtx());
    await expect(
      caller.clientCompanies.inviteToPortal({
        companyId: COMPANY_ID,
        clientCompanyId: 999,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects when contactId belongs to a different company", async () => {
    mockSingleMembership(COMPANY_ID);
    vi.mocked(db.getClientCompanyById).mockResolvedValue({
      id: 3,
      companyId: COMPANY_ID,
    } as any);
    vi.mocked(db.getCrmContactById).mockResolvedValue({
      id: 7,
      companyId: 999,
    } as any);

    const caller = crmRouter.createCaller(makeCtx());
    await expect(
      caller.clientCompanies.inviteToPortal({
        companyId: COMPANY_ID,
        clientCompanyId: 3,
        contactId: 7,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("succeeds with a valid contactId from the same tenant", async () => {
    mockSingleMembership(COMPANY_ID);
    vi.mocked(db.getClientCompanyById).mockResolvedValue({
      id: 3,
      companyId: COMPANY_ID,
    } as any);
    vi.mocked(db.getCrmContactById).mockResolvedValue({
      id: 7,
      companyId: COMPANY_ID,
    } as any);

    const caller = crmRouter.createCaller(makeCtx());
    const result = await caller.clientCompanies.inviteToPortal({
      companyId: COMPANY_ID,
      clientCompanyId: 3,
      contactId: 7,
    });

    expect(result).toMatchObject({ success: true, stub: true });
  });
});
