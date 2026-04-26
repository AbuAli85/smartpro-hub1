import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";
import { crmRouter } from "./routers/crm";
import * as db from "./db";
import {
  getDefaultCapabilitiesForRole,
  hasCapability,
  resolveEffectiveCapabilities,
} from "../shared/capabilities";

// ── DB mock ───────────────────────────────────────────────────────────────────
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getUserCompanies: vi.fn(),
    getUserCompanyById: vi.fn(),
    getDb: vi.fn(),
    getClientCompanyById: vi.fn(),
    getClientCompanies: vi.fn(),
    createClientCompany: vi.fn(),
    updateClientCompany: vi.fn(),
    getCrmContactById: vi.fn(),
    getCrmDealById: vi.fn(),
    createCrmContact: vi.fn(),
    createCrmDeal: vi.fn(),
    updateCrmContact: vi.fn(),
    updateCrmDeal: vi.fn(),
  };
});

// ── Context factories ─────────────────────────────────────────────────────────

function makeCtx(overrides?: Partial<NonNullable<TrpcContext["user"]>>): TrpcContext {
  const user = {
    id: 1,
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

/** A reviewer-role operator context (single company membership) */
function makeReviewerCtx(): TrpcContext {
  return makeCtx({ platformRole: "reviewer" as any });
}

/** A super_admin context — bypasses tenant scoping */
function makeSuperAdminCtx(): TrpcContext {
  return makeCtx({ platformRole: "super_admin" as const });
}

const COMPANY_ID = 10;

/** Mock a single-company membership for requireActiveCompanyId resolution */
function mockSingleMembership(companyId = COMPANY_ID) {
  vi.mocked(db.getUserCompanies).mockResolvedValue([
    { company: { id: companyId }, member: { role: "company_admin", permissions: [] } },
  ] as any);
  vi.mocked(db.getUserCompanyById).mockResolvedValue({
    company: { id: companyId },
    member: { role: "company_admin", permissions: [] },
  } as any);
}

// ── Capability assertions ─────────────────────────────────────────────────────

describe("CRM/WaaS capability definitions", () => {
  it("reviewer role gets approve_quotation and convert_quotation_to_deployment", () => {
    const caps = getDefaultCapabilitiesForRole("reviewer");
    expect(caps.has("approve_quotation")).toBe(true);
    expect(caps.has("convert_quotation_to_deployment")).toBe(true);
  });

  it("finance_admin gets view_client_financials and generate_client_invoice", () => {
    const caps = getDefaultCapabilitiesForRole("finance_admin");
    expect(caps.has("view_client_financials")).toBe(true);
    expect(caps.has("generate_client_invoice")).toBe(true);
  });

  it("finance_admin does NOT get approve_quotation by default", () => {
    const caps = getDefaultCapabilitiesForRole("finance_admin");
    expect(caps.has("approve_quotation")).toBe(false);
  });

  it("hr_admin does NOT get CRM pipeline capabilities", () => {
    const caps = getDefaultCapabilitiesForRole("hr_admin");
    expect(caps.has("approve_quotation")).toBe(false);
    expect(caps.has("convert_quotation_to_deployment")).toBe(false);
    expect(caps.has("generate_client_invoice")).toBe(false);
  });

  it("hasCapability works with a resolved Set", () => {
    const caps = resolveEffectiveCapabilities("reviewer", null);
    expect(hasCapability(caps, "approve_quotation")).toBe(true);
    expect(hasCapability(caps, "generate_client_invoice")).toBe(false);
  });

  it("hasCapability works with explicit grant array", () => {
    expect(hasCapability(["approve_quotation", "view_crm"], "approve_quotation")).toBe(true);
    expect(hasCapability(["view_crm"], "approve_quotation")).toBe(false);
  });

  it("explicit denial removes a capability that was a role default", () => {
    const caps = resolveEffectiveCapabilities("reviewer", ["-approve_quotation"]);
    expect(caps.has("approve_quotation")).toBe(false);
    expect(caps.has("convert_quotation_to_deployment")).toBe(true);
  });

  it("module gating strips crm caps when crm module is disabled", () => {
    const caps = resolveEffectiveCapabilities("reviewer", null, ["hr", "finance"]);
    expect(caps.has("approve_quotation")).toBe(false);
    expect(caps.has("invite_client_portal_user")).toBe(false);
  });
});

// ── clientCompanies.list ──────────────────────────────────────────────────────

describe("crm.clientCompanies.list", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
    vi.mocked(db.getClientCompanies).mockReset();
  });

  it("returns empty array gracefully when db resolution fails", async () => {
    vi.mocked(db.getUserCompanies).mockResolvedValue([]);
    const caller = crmRouter.createCaller(makeCtx());
    const result = await caller.clientCompanies.list({});
    expect(result).toEqual([]);
  });

  it("returns companies for a single-membership user", async () => {
    mockSingleMembership();
    vi.mocked(db.getClientCompanies).mockResolvedValue([
      { id: 1, companyId: COMPANY_ID, name: "Acme LLC", status: "active" },
    ] as any);
    const caller = crmRouter.createCaller(makeCtx());
    const result = await caller.clientCompanies.list({ companyId: COMPANY_ID });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: "Acme LLC" });
  });

  it("passes status and search filters through", async () => {
    mockSingleMembership();
    vi.mocked(db.getClientCompanies).mockResolvedValue([]);
    const caller = crmRouter.createCaller(makeCtx());
    await caller.clientCompanies.list({ companyId: COMPANY_ID, status: "lead", search: "acme" });
    expect(db.getClientCompanies).toHaveBeenCalledWith(COMPANY_ID, { status: "lead", search: "acme" });
  });
});

// ── clientCompanies.create ────────────────────────────────────────────────────

describe("crm.clientCompanies.create", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
    vi.mocked(db.createClientCompany).mockReset();
  });

  it("creates a company and returns its id", async () => {
    mockSingleMembership();
    vi.mocked(db.createClientCompany).mockResolvedValue({ id: 42 } as any);
    const caller = crmRouter.createCaller(makeCtx());
    const result = await caller.clientCompanies.create({
      companyId: COMPANY_ID,
      name: "Acme LLC",
      status: "lead",
    });
    expect(result).toMatchObject({ id: 42, success: true });
    expect(db.createClientCompany).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Acme LLC", companyId: COMPANY_ID }),
    );
  });

  it("rejects name shorter than 1 character", async () => {
    mockSingleMembership();
    const caller = crmRouter.createCaller(makeCtx());
    await expect(
      caller.clientCompanies.create({ companyId: COMPANY_ID, name: "" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects unauthenticated (no user)", async () => {
    const caller = crmRouter.createCaller({ user: null } as any);
    await expect(
      caller.clientCompanies.create({ companyId: COMPANY_ID, name: "X" }),
    ).rejects.toBeDefined();
  });
});

// ── clientCompanies.getById ───────────────────────────────────────────────────

describe("crm.clientCompanies.getById", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
    vi.mocked(db.getClientCompanyById).mockReset();
    vi.mocked(db.getDb).mockReset();
  });

  it("throws NOT_FOUND when company belongs to a different tenant", async () => {
    mockSingleMembership(COMPANY_ID);
    vi.mocked(db.getClientCompanyById).mockResolvedValue({
      id: 5,
      companyId: 999,
      name: "Other Tenant",
    } as any);
    const caller = crmRouter.createCaller(makeCtx());
    await expect(
      caller.clientCompanies.getById({ id: 5, companyId: COMPANY_ID }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws NOT_FOUND when record does not exist", async () => {
    mockSingleMembership(COMPANY_ID);
    vi.mocked(db.getClientCompanyById).mockResolvedValue(null);
    const caller = crmRouter.createCaller(makeCtx());
    await expect(
      caller.clientCompanies.getById({ id: 999, companyId: COMPANY_ID }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns company with empty related arrays when db is unavailable", async () => {
    mockSingleMembership(COMPANY_ID);
    vi.mocked(db.getClientCompanyById).mockResolvedValue({
      id: 5,
      companyId: COMPANY_ID,
      name: "Acme",
    } as any);
    vi.mocked(db.getDb).mockResolvedValue(null);
    const caller = crmRouter.createCaller(makeCtx());
    const result = await caller.clientCompanies.getById({ id: 5, companyId: COMPANY_ID });
    expect(result).toMatchObject({ name: "Acme", contacts: [], deals: [], recentQuotations: [] });
  });
});

// ── clientCompanies.update ────────────────────────────────────────────────────

describe("crm.clientCompanies.update", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
    vi.mocked(db.getClientCompanyById).mockReset();
    vi.mocked(db.updateClientCompany).mockReset();
  });

  it("updates and returns success", async () => {
    mockSingleMembership();
    vi.mocked(db.getClientCompanyById).mockResolvedValue({
      id: 5,
      companyId: COMPANY_ID,
      name: "Old Name",
    } as any);
    vi.mocked(db.updateClientCompany).mockResolvedValue(undefined);
    const caller = crmRouter.createCaller(makeCtx());
    const result = await caller.clientCompanies.update({
      id: 5,
      companyId: COMPANY_ID,
      name: "New Name",
    });
    expect(result).toMatchObject({ success: true });
    expect(db.updateClientCompany).toHaveBeenCalledWith(5, expect.objectContaining({ name: "New Name" }));
  });

  it("rejects cross-tenant update", async () => {
    mockSingleMembership(COMPANY_ID);
    vi.mocked(db.getClientCompanyById).mockResolvedValue({
      id: 5,
      companyId: 888,
      name: "Other",
    } as any);
    const caller = crmRouter.createCaller(makeCtx());
    await expect(
      caller.clientCompanies.update({ id: 5, companyId: COMPANY_ID, name: "Hack" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// ── createContact with clientCompanyId ───────────────────────────────────────

describe("crm.createContact with clientCompanyId", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
    vi.mocked(db.getClientCompanyById).mockReset();
    vi.mocked(db.createCrmContact).mockReset();
  });

  it("rejects clientCompanyId that belongs to a different tenant", async () => {
    mockSingleMembership(COMPANY_ID);
    vi.mocked(db.getClientCompanyById).mockResolvedValue({
      id: 7,
      companyId: 999,
    } as any);
    const caller = crmRouter.createCaller(makeCtx());
    await expect(
      caller.createContact({
        companyId: COMPANY_ID,
        firstName: "Ali",
        lastName: "Hassan",
        clientCompanyId: 7,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: expect.stringContaining("Client company") });
  });

  it("creates contact when clientCompanyId belongs to same tenant", async () => {
    mockSingleMembership(COMPANY_ID);
    vi.mocked(db.getClientCompanyById).mockResolvedValue({
      id: 7,
      companyId: COMPANY_ID,
    } as any);
    vi.mocked(db.createCrmContact).mockResolvedValue(undefined);
    const caller = crmRouter.createCaller(makeCtx());
    const result = await caller.createContact({
      companyId: COMPANY_ID,
      firstName: "Ali",
      lastName: "Hassan",
      clientCompanyId: 7,
      roleType: "decision_maker",
    });
    expect(result).toMatchObject({ success: true });
    expect(db.createCrmContact).toHaveBeenCalledWith(
      expect.objectContaining({ clientCompanyId: 7, roleType: "decision_maker" }),
    );
  });

  it("creates contact without clientCompanyId (backward-compat)", async () => {
    mockSingleMembership(COMPANY_ID);
    vi.mocked(db.createCrmContact).mockResolvedValue(undefined);
    const caller = crmRouter.createCaller(makeCtx());
    const result = await caller.createContact({
      companyId: COMPANY_ID,
      firstName: "Sara",
      lastName: "Al-Farsi",
    });
    expect(result).toMatchObject({ success: true });
    expect(db.getClientCompanyById).not.toHaveBeenCalled();
  });
});

// ── createDeal with clientCompanyId / serviceType ─────────────────────────────

describe("crm.createDeal with CRM extensions", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
    vi.mocked(db.getClientCompanyById).mockReset();
    vi.mocked(db.getCrmContactById).mockReset();
    vi.mocked(db.createCrmDeal).mockReset();
  });

  it("creates deal with serviceType and clientCompanyId", async () => {
    mockSingleMembership(COMPANY_ID);
    vi.mocked(db.getClientCompanyById).mockResolvedValue({
      id: 3,
      companyId: COMPANY_ID,
    } as any);
    vi.mocked(db.createCrmDeal).mockResolvedValue(undefined);
    const caller = crmRouter.createCaller(makeCtx());
    const result = await caller.createDeal({
      companyId: COMPANY_ID,
      title: "Manpower Supply Q3",
      clientCompanyId: 3,
      serviceType: "manpower",
      stage: "lead",
    });
    expect(result).toMatchObject({ success: true });
    expect(db.createCrmDeal).toHaveBeenCalledWith(
      expect.objectContaining({ clientCompanyId: 3, serviceType: "manpower" }),
    );
  });

  it("rejects clientCompanyId from another tenant", async () => {
    mockSingleMembership(COMPANY_ID);
    vi.mocked(db.getClientCompanyById).mockResolvedValue({
      id: 3,
      companyId: 777,
    } as any);
    const caller = crmRouter.createCaller(makeCtx());
    await expect(
      caller.createDeal({
        companyId: COMPANY_ID,
        title: "Bad deal",
        clientCompanyId: 3,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("accepts all valid service types", async () => {
    const serviceTypes = ["manpower", "promoter", "pro_service", "project", "other"] as const;
    mockSingleMembership(COMPANY_ID);
    vi.mocked(db.createCrmDeal).mockResolvedValue(undefined);
    const caller = crmRouter.createCaller(makeCtx());
    for (const st of serviceTypes) {
      await expect(
        caller.createDeal({ companyId: COMPANY_ID, title: `Deal ${st}`, serviceType: st }),
      ).resolves.toMatchObject({ success: true });
    }
  });

  it("rejects invalid stage values", async () => {
    mockSingleMembership(COMPANY_ID);
    const caller = crmRouter.createCaller(makeCtx());
    await expect(
      caller.createDeal({
        companyId: COMPANY_ID,
        title: "Bad",
        stage: "invalid_stage" as any,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

// ── updateDeal stage transitions ──────────────────────────────────────────────

describe("crm.updateDeal stage transitions", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
    vi.mocked(db.getCrmDealById).mockReset();
    vi.mocked(db.getClientCompanyById).mockReset();
    vi.mocked(db.updateCrmDeal).mockReset();
  });

  const closingStages = ["closed_won", "closed_lost", "won", "lost"] as const;

  it.each(closingStages)("sets closedAt when stage is %s", async (stage) => {
    mockSingleMembership(COMPANY_ID);
    vi.mocked(db.getCrmDealById).mockResolvedValue({
      id: 20,
      companyId: COMPANY_ID,
      stage: "negotiation",
    } as any);
    vi.mocked(db.updateCrmDeal).mockResolvedValue(undefined);
    const caller = crmRouter.createCaller(makeCtx());
    await caller.updateDeal({ id: 20, companyId: COMPANY_ID, stage });
    expect(db.updateCrmDeal).toHaveBeenCalledWith(
      20,
      expect.objectContaining({ closedAt: expect.any(Date) }),
    );
  });

  it("does not set closedAt for non-closing stages", async () => {
    mockSingleMembership(COMPANY_ID);
    vi.mocked(db.getCrmDealById).mockResolvedValue({
      id: 21,
      companyId: COMPANY_ID,
      stage: "lead",
    } as any);
    vi.mocked(db.updateCrmDeal).mockResolvedValue(undefined);
    const caller = crmRouter.createCaller(makeCtx());
    await caller.updateDeal({ id: 21, companyId: COMPANY_ID, stage: "qualified" });
    expect(db.updateCrmDeal).toHaveBeenCalledWith(
      21,
      expect.not.objectContaining({ closedAt: expect.anything() }),
    );
  });
});

// ── pipelineStats covers new stages ──────────────────────────────────────────

describe("crm.pipelineStats", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
  });

  it("returns null when company resolution fails", async () => {
    vi.mocked(db.getUserCompanies).mockResolvedValue([]);
    const caller = crmRouter.createCaller(makeCtx());
    const result = await caller.pipelineStats({});
    expect(result).toBeNull();
  });
});

// ── Cross-tenant isolation ────────────────────────────────────────────────────

describe("cross-tenant isolation", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanies).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
    vi.mocked(db.getClientCompanyById).mockReset();
  });

  it("clientCompanies.update: user cannot update a company from another tenant", async () => {
    mockSingleMembership(COMPANY_ID);
    vi.mocked(db.getClientCompanyById).mockResolvedValue({
      id: 99,
      companyId: 555,
      name: "Foreign Co",
    } as any);
    const caller = crmRouter.createCaller(makeCtx());
    await expect(
      caller.clientCompanies.update({ id: 99, companyId: COMPANY_ID, name: "Hijacked" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("super_admin with explicit companyId can access any tenant's companies", async () => {
    vi.mocked(db.getClientCompanies).mockResolvedValue([
      { id: 1, companyId: 77, name: "Tenant 77 Co" },
    ] as any);
    const caller = crmRouter.createCaller(makeSuperAdminCtx());
    const result = await caller.clientCompanies.list({ companyId: 77 });
    expect(result).toHaveLength(1);
  });
});
