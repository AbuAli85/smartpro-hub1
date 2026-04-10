import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

// ─── Mock DB ─────────────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  // Core
  getAllUsers: vi.fn().mockResolvedValue([]),
  // Sanad
  getAllSanadOffices: vi.fn().mockResolvedValue([]),
  getAllSanadApplications: vi.fn().mockResolvedValue([]),
  // PRO
  getAllProServices: vi.fn().mockResolvedValue([]),
  getExpiringDocuments: vi.fn().mockResolvedValue([]),
  // Contracts
  getAllContracts: vi.fn().mockResolvedValue([]),
  // Marketplace
  getProviderById: vi.fn().mockResolvedValue(null),
  createProvider: vi.fn().mockResolvedValue({ id: 1 }),
  updateProvider: vi.fn().mockResolvedValue({}),
  getProviderServices: vi.fn().mockResolvedValue([]),
  // HR
  getEmployeeById: vi.fn().mockResolvedValue(null),
  getJobPostings: vi.fn().mockResolvedValue([]),
  createJobPosting: vi.fn().mockResolvedValue({ id: 1 }),
  updateJobPosting: vi.fn().mockResolvedValue({}),
  updatePayrollRecord: vi.fn().mockResolvedValue({}),
  getPerformanceReviews: vi.fn().mockResolvedValue([]),
  createPerformanceReview: vi.fn().mockResolvedValue({ id: 1 }),
  // CRM
  updateCrmContact: vi.fn().mockResolvedValue({}),
  getCrmContactById: vi.fn().mockResolvedValue(null),
  getCrmDealById: vi.fn().mockResolvedValue(null),
  getCrmCommunications: vi.fn().mockResolvedValue([]),
  createCrmCommunication: vi.fn().mockResolvedValue({ id: 1 }),
  // Notifications
  getUserNotifications: vi.fn().mockResolvedValue([]),
  createNotification: vi.fn().mockResolvedValue(1),
  markNotificationsRead: vi.fn().mockResolvedValue({}),
  createAuditLog: vi.fn().mockResolvedValue({ id: 1 }),
  getAnalyticsReports: vi.fn().mockResolvedValue([]),
  getCompanyInvoices: vi.fn().mockResolvedValue([]),
  // Subscriptions
  getSubscriptionPlans: vi.fn().mockResolvedValue([]),
  getCompanySubscription: vi.fn().mockResolvedValue(null),
  getDb: vi.fn().mockResolvedValue(null),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
  getUserCompany: vi.fn().mockResolvedValue(null),
  getUserCompanyById: vi.fn().mockResolvedValue(null),
  getUserCompanies: vi.fn().mockResolvedValue([]),
  getCompanyStats: vi.fn().mockResolvedValue({ employees: 0, contracts: 0, proServices: 0, sanadApplications: 0, contacts: 0, deals: 0, pendingLeave: 0 }),
  getPlatformStats: vi.fn().mockResolvedValue({ companies: 5, users: 42, contracts: 18, proServices: 7, sanadApplications: 3, marketplaceProviders: 12, contacts: 88 }),
  getCompanies: vi.fn().mockResolvedValue([]),
  getCompanyById: vi.fn().mockResolvedValue(null),
  createCompany: vi.fn().mockResolvedValue({ id: 1, name: "Test Co" }),
  updateCompany: vi.fn().mockResolvedValue({}),
  getContracts: vi.fn().mockResolvedValue([]),
  getContractById: vi.fn().mockResolvedValue(null),
  createContract: vi.fn().mockResolvedValue({ id: 1 }),
  updateContract: vi.fn().mockResolvedValue({}),
  getContractTemplates: vi.fn().mockResolvedValue([]),
  getProServices: vi.fn().mockResolvedValue([]),
  createProService: vi.fn().mockResolvedValue({ id: 1 }),
  updateProService: vi.fn().mockResolvedValue({}),
  getSanadApplications: vi.fn().mockResolvedValue([]),
  getSanadApplicationById: vi.fn().mockResolvedValue(null),
  createSanadApplication: vi.fn().mockResolvedValue({ id: 1 }),
  updateSanadApplication: vi.fn().mockResolvedValue({}),
  getSanadOffices: vi.fn().mockResolvedValue([]),
  createSanadOffice: vi.fn().mockResolvedValue({ id: 1 }),
  getMarketplaceProviders: vi.fn().mockResolvedValue([]),
  createMarketplaceProvider: vi.fn().mockResolvedValue({ id: 1 }),
  getMarketplaceBookings: vi.fn().mockResolvedValue([]),
  createMarketplaceBooking: vi.fn().mockResolvedValue({ id: 1 }),
  getEmployees: vi.fn().mockResolvedValue([]),
  createEmployee: vi.fn().mockResolvedValue({ id: 1 }),
  updateEmployee: vi.fn().mockResolvedValue({}),
  getJobListings: vi.fn().mockResolvedValue([]),
  createJobListing: vi.fn().mockResolvedValue({ id: 1 }),
  getJobApplications: vi.fn().mockResolvedValue([]),
  createJobApplication: vi.fn().mockResolvedValue({ id: 1 }),
  updateJobApplication: vi.fn().mockResolvedValue({}),
  getLeaveRequests: vi.fn().mockResolvedValue([]),
  createLeaveRequest: vi.fn().mockResolvedValue({ id: 1 }),
  updateLeaveRequest: vi.fn().mockResolvedValue({}),
  getPayrollRecords: vi.fn().mockResolvedValue([]),
  createPayrollRecord: vi.fn().mockResolvedValue({ id: 1 }),
  getCrmContacts: vi.fn().mockResolvedValue([]),
  createCrmContact: vi.fn().mockResolvedValue({ id: 1 }),
  getCrmDeals: vi.fn().mockResolvedValue([]),
  createCrmDeal: vi.fn().mockResolvedValue({ id: 1 }),
  updateCrmDeal: vi.fn().mockResolvedValue({}),
  getAuditLogs: vi.fn().mockResolvedValue([]),
  // Attendance
  getAttendance: vi.fn().mockResolvedValue([]),
  createAttendanceRecord: vi.fn().mockResolvedValue(1),
  createAttendanceRecordTx: vi.fn().mockResolvedValue(42),
  updateAttendanceRecord: vi.fn().mockResolvedValue({}),
  deleteAttendanceRecord: vi.fn().mockResolvedValue({}),
  getAttendanceStats: vi.fn().mockResolvedValue({ present: 5, absent: 1, late: 2, half_day: 0, remote: 3, byDay: [] }),
  // Analytics reports & system settings
  listAnalyticsReports: vi.fn().mockResolvedValue([]),
  createAnalyticsReport: vi.fn().mockResolvedValue({ id: 1 }),
  updateAnalyticsReport: vi.fn().mockResolvedValue({}),
  deleteAnalyticsReport: vi.fn().mockResolvedValue({}),
  getSystemSettings: vi.fn().mockResolvedValue(null),
  upsertSystemSettings: vi.fn().mockResolvedValue({}),
  // Marketplace reviews
  getProviderReviews: vi.fn().mockResolvedValue([]),
  createProviderReview: vi.fn().mockResolvedValue({ id: 1 }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────
type AuthUser = NonNullable<TrpcContext["user"]>;

function makeCtx(overrides: Partial<AuthUser> = {}): TrpcContext {
  const clearedCookies: Array<{ name: string; options: Record<string, unknown> }> = [];
  const user: AuthUser = {
    id: 1,
    openId: "test-open-id",
    email: "test@smartpro.om",
    name: "Test User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };
}

function makePublicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Auth Tests ───────────────────────────────────────────────────────────────
describe("auth", () => {
  it("me returns null for unauthenticated user", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("me returns user for authenticated user", async () => {
    const ctx = makeCtx({ name: "Alice", email: "alice@example.com" });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).not.toBeNull();
    expect(result?.name).toBe("Alice");
    expect(result?.email).toBe("alice@example.com");
  });

  it("logout clears session cookie", async () => {
    const clearedCookies: Array<{ name: string; options: Record<string, unknown> }> = [];
    const ctx: TrpcContext = {
      user: makeCtx().user,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {
        clearCookie: (name: string, options: Record<string, unknown>) => {
          clearedCookies.push({ name, options });
        },
      } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.options).toMatchObject({ maxAge: -1 });
  });
});

// ─── Companies Tests ──────────────────────────────────────────────────────────
describe("companies", () => {
  it("list returns empty array when no DB", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.companies.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("myCompany returns null when user has no company", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.companies.myCompany();
    expect(result).toBeNull();
  });

  it("myStats returns null when no company", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.companies.myStats();
    // Returns null when user has no company linked
    expect(result).toBeNull();
  });
});

// ─── Analytics Tests ──────────────────────────────────────────────────────────
describe("analytics", () => {
  it("platformStats returns platform-wide stats for admin", async () => {
    const caller = appRouter.createCaller(makeCtx({ role: "admin" }));
    const result = await caller.analytics.platformStats();
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("companies");
    expect(result).toHaveProperty("users");
    expect(result).toHaveProperty("contracts");
  });

  it("companyStats returns null when no company", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.analytics.companyStats();
    // Returns null when user has no company linked
    expect(result).toBeNull();
  });

  it("contractsOverview returns array", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.analytics.contractsOverview();
    expect(Array.isArray(result)).toBe(true);
  });

  it("proServicesOverview returns array", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.analytics.proServicesOverview();
    expect(Array.isArray(result)).toBe(true);
  });

  it("dealsPipeline returns array", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.analytics.dealsPipeline();
    expect(Array.isArray(result)).toBe(true);
  });

  it("hrOverview returns null when no company", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.analytics.hrOverview();
    expect(result).toBeNull();
  });

  it("auditLogs returns company-scoped logs for non-admin", async () => {
    const caller = appRouter.createCaller(makeCtx({ role: "user" }));
    // Non-admin gets company-scoped logs (empty when no company)
    const result = await caller.analytics.auditLogs({ limit: 10 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("auditLogs returns array for admin", async () => {
    const caller = appRouter.createCaller(makeCtx({ role: "admin" }));
    const result = await caller.analytics.auditLogs({ limit: 10 });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── Sanad Tests ──────────────────────────────────────────────────────────────
describe("sanad", () => {
  it("listOffices returns empty array when no company", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.sanad.listOffices();
    expect(Array.isArray(result)).toBe(true);
  });

  it("listApplications returns empty array when no company", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.sanad.listApplications({});
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── PRO Services Tests ───────────────────────────────────────────────────────
describe("pro", () => {
  it("list returns empty array when no company", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.pro.list({});
    expect(Array.isArray(result)).toBe(true);
  });

  it("expiringDocuments returns empty array when no company", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.pro.expiringDocuments({ daysAhead: 30 });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── Contracts Tests ──────────────────────────────────────────────────────────
describe("contracts", () => {
  it("list returns empty array when no company", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.contracts.list({});
    expect(Array.isArray(result)).toBe(true);
  });

  it("templates rejects without company membership", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.contracts.templates()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ─── HR Tests ─────────────────────────────────────────────────────────────────
describe("hr", () => {
  it("listEmployees returns empty array when no company", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.hr.listEmployees({});
    expect(Array.isArray(result)).toBe(true);
  });

  it("listJobs returns empty array when no company", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.hr.listJobs();
    expect(Array.isArray(result)).toBe(true);
  });

  it("listLeave returns empty array when no company", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.hr.listLeave({});
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── CRM Tests ────────────────────────────────────────────────────────────────
describe("crm", () => {
  it("listContacts returns empty array when no company", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.crm.listContacts({});
    expect(Array.isArray(result)).toBe(true);
  });

  it("listDeals returns empty array when no company", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.crm.listDeals({});
    expect(Array.isArray(result)).toBe(true);
  });

  it("pipelineStats returns stage data", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.crm.pipelineStats();
    // Returns array of pipeline stages (may be empty when no company)
    expect(result).toBeDefined();
  });

  it("updateContact returns NOT_FOUND when contact belongs to another company", async () => {
    const { getCrmContactById, getUserCompanies } = await import("./db");
    vi.mocked(getCrmContactById).mockResolvedValueOnce({ id: 1, companyId: 2 } as any);
    vi.mocked(getUserCompanies).mockResolvedValueOnce([
      {
        company: { id: 1, name: "Co", slug: "co", country: "OM", status: "active" },
        member: { role: "company_member" },
      } as any,
    ]);
    const caller = appRouter.createCaller(
      makeCtx({ role: "user", platformRole: "company_member" }),
    );
    await expect(caller.crm.updateContact({ id: 1, firstName: "X" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

// ─── Marketplace Tests ────────────────────────────────────────────────────────
describe("marketplace", () => {
  it("listProviders returns empty array", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.marketplace.listProviders({});
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── Billing / reports (tenant & platform gates) ─────────────────────────────
describe("billing.getBillingDashboard", () => {
  it("rejects non-platform users", async () => {
    const caller = appRouter.createCaller(
      makeCtx({ role: "user", platformRole: "company_member" }),
    );
    await expect(caller.billing.getBillingDashboard({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("reports.generateOfficerPayoutReport", () => {
  it("rejects non-platform users before touching officer data", async () => {
    const caller = appRouter.createCaller(
      makeCtx({ role: "user", platformRole: "company_member" }),
    );
    await expect(
      caller.reports.generateOfficerPayoutReport({ officerId: 1, month: 3, year: 2026 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("reports company-scoped PDF exports", () => {
  it("generateBillingSummary returns FORBIDDEN without active company membership", async () => {
    vi.mocked(db.getUserCompany).mockReset();
    vi.mocked(db.getUserCompany).mockResolvedValue(null);
    vi.mocked(db.getUserCompanies).mockResolvedValueOnce([]);
    const caller = appRouter.createCaller(
      makeCtx({ role: "user", platformRole: "company_member" }),
    );
    await expect(
      caller.reports.generateBillingSummary({ month: 3, year: 2026 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("officers.listCertificates", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompany).mockReset();
    vi.mocked(db.getUserCompany).mockResolvedValue(null);
  });

  it("returns empty when DB is unavailable", async () => {
    vi.mocked(db.getUserCompany).mockResolvedValueOnce({
      company: { id: 1 },
      member: { role: "company_admin" },
    } as any);
    const caller = appRouter.createCaller(
      makeCtx({ role: "user", platformRole: "company_member" }),
    );
    await expect(caller.officers.listCertificates({})).resolves.toEqual([]);
  });

  it("returns NOT_FOUND when tenant passes another companyId", async () => {
    vi.mocked(db.getUserCompany).mockResolvedValueOnce({
      company: { id: 5 },
      member: { role: "company_admin" },
    } as any);
    const caller = appRouter.createCaller(
      makeCtx({ role: "user", platformRole: "company_member" }),
    );
    await expect(caller.officers.listCertificates({ companyId: 99 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("returns FORBIDDEN without company membership", async () => {
    vi.mocked(db.getUserCompany).mockResolvedValueOnce(null);
    const caller = appRouter.createCaller(
      makeCtx({ role: "user", platformRole: "company_member" }),
    );
    await expect(caller.officers.listCertificates({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("workforce.cases.updateTask", () => {
  it("requires company context (no silent cross-tenant updates)", async () => {
    const caller = appRouter.createCaller(
      makeCtx({ role: "user", platformRole: "company_member" }),
    );
    await expect(
      caller.workforce.cases.updateTask({ taskId: 999, taskStatus: "completed" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ─── Subscriptions Tests ──────────────────────────────────────────────────────
describe("subscriptions", () => {
  it("plans returns empty array when no DB", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.subscriptions.plans();
    expect(Array.isArray(result)).toBe(true);
  });

  it("current returns null when no company", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.subscriptions.current();
    expect(result).toBeNull();
  });

  it("subscribe throws FORBIDDEN without active company membership", async () => {
    vi.mocked(db.getUserCompanies).mockResolvedValueOnce([]);
    const caller = appRouter.createCaller(
      makeCtx({ role: "user", platformRole: "company_member" }),
    );
    await expect(caller.subscriptions.subscribe({ planId: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("generateInvoice throws FORBIDDEN without active company membership", async () => {
    vi.mocked(db.getUserCompanies).mockResolvedValueOnce([]);
    const caller = appRouter.createCaller(
      makeCtx({ role: "user", platformRole: "company_member" }),
    );
    await expect(caller.subscriptions.generateInvoice()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

// ─── Attendance Tests ─────────────────────────────────────────────────────────
describe("hr.attendance", () => {
  it("listAttendance returns empty array when no company", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.hr.listAttendance({ month: "2026-03" });
    expect(Array.isArray(result)).toBe(true);
  });

  it("attendanceStats returns zero stats when no company", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.hr.attendanceStats({ month: "2026-03" });
    // Returns zero-filled stats object (not null) when no company
    expect(result).toHaveProperty("present");
    expect(result).toHaveProperty("absent");
    expect(result).toHaveProperty("byDay");
  });

  it("createAttendance requires authentication", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    await expect(
      caller.hr.createAttendance({
        employeeId: 1,
        date: "2026-03-01",
        status: "present",
        notes: "Audit reason text required for manual HR entry (min 10 chars).",
      })
    ).rejects.toThrow();
  });

  it("createAttendance succeeds when membership and employee match company", async () => {
    const valuesFn = vi.fn().mockResolvedValue([{ insertId: 42 }]);
    const mockTx = {
      insert: vi.fn(() => ({ values: valuesFn })),
    };
    const m = {
      company: { id: 1, name: "Co", slug: "co", country: "OM", status: "active" },
      member: { role: "company_admin" },
    } as any;
    const byIdSpy = vi.mocked(db.getUserCompanyById).mockResolvedValue(m);
    try {
      vi.mocked(db.getDb).mockResolvedValueOnce({
        transaction: async (fn: (tx: typeof mockTx) => Promise<void>) => {
          await fn(mockTx);
        },
      } as any);
      vi.mocked(db.getEmployeeById).mockResolvedValueOnce({ id: 1, companyId: 1 } as any);
      const caller = appRouter.createCaller(makeCtx({ role: "user", platformRole: "company_admin" }));
      // Pass explicit workspace so `requireActiveCompanyId` uses `getUserCompanyById` (not `getUserCompanies`),
      // which matches the hoisted `./db` mock reliably in Vitest.
      const result = await caller.hr.createAttendance({
        employeeId: 1,
        companyId: 1,
        date: "2026-03-01",
        status: "present",
        notes: "Manager confirmed present after site visit — audit trail entry.",
      });
      expect(result).toHaveProperty("success", true);
    } finally {
      byIdSpy.mockRestore();
    }
  });
});

// ─── Contract Export Tests ────────────────────────────────────────────────────
describe("contracts.export", () => {
  it("exportHtml throws NOT_FOUND for missing contract", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.contracts.exportHtml({ id: 9999 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("exportHtml returns html and title for existing contract", async () => {
    const { getContractById } = await import("./db");
    (getContractById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 1,
      companyId: 1,
      title: "Test Employment Contract",
      contractNumber: "CON-001",
      status: "active",
      partyAName: "Acme Corp",
      partyBName: "John Doe",
      value: "5000",
      currency: "OMR",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      content: "This is a test contract.",
    });
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.contracts.exportHtml({ id: 1 });
    expect(result).toHaveProperty("html");
    expect(result.html).toContain("Test Employment Contract");
    expect(result.html).toContain("CON-001");
    expect(result).toHaveProperty("title", "Test Employment Contract");
    expect(result).toHaveProperty("contractNumber", "CON-001");
  });
});

// ─── Subscriptions Feature Gating Tests ──────────────────────────────────────
describe("subscriptions.featureGating", () => {
  it("checkFeature returns false when no subscription", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.subscriptions.checkFeature({ feature: "marketplace" });
    expect(result).toHaveProperty("allowed");
    expect(typeof result.allowed).toBe("boolean");
  });

  it("invoices returns empty array when no company", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.subscriptions.invoices();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── Onboarding Flow Tests ────────────────────────────────────────────────────
describe("companies.onboarding", () => {
  it("create company returns success and id", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.companies.create({
      name: "SmartPRO Test LLC",
      industry: "technology",
      country: "OM",
      city: "Muscat",
    });
    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("id", 1);
    expect(result).toHaveProperty("teammatesAdded", 0);
  });

  it("create company allows tenant users who already have a workspace (multi-company support)", async () => {
    vi.mocked(db.getUserCompany).mockResolvedValueOnce({
      company: { id: 99 },
      member: {},
    } as any);
    const caller = appRouter.createCaller(makeCtx({ role: "user", platformRole: "company_member" }));
    // Users can now create multiple companies — no restriction
    const result = await caller.companies.create({ name: "Another LLC", country: "OM" });
    expect(result).toHaveProperty("success", true);
  });

  it("subscriptionPlans returns array of plans", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.companies.subscriptionPlans();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── Company Member Management Tests ─────────────────────────────────────────
describe("companies.memberManagement", () => {
  it("members returns empty array when user has no company", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.companies.members();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("members requires authentication", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    await expect(caller.companies.members()).rejects.toThrow();
  });

  it("updateMemberRole requires authentication", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    await expect(
      caller.companies.updateMemberRole({ memberId: 1, role: "company_member" })
    ).rejects.toThrow();
  });

  it("updateMemberRole throws when user has no company (no DB in test env)", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.companies.updateMemberRole({ memberId: 1, role: "company_member" })
    ).rejects.toThrow();
  });

  it("removeMember requires authentication", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    await expect(caller.companies.removeMember({ memberId: 1 })).rejects.toThrow();
  });

  it("removeMember throws when user has no company (no DB in test env)", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.companies.removeMember({ memberId: 1 })
    ).rejects.toThrow();
  });

  it("addMemberByEmail requires authentication", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    await expect(
      caller.companies.addMemberByEmail({ email: "test@example.com", role: "company_member" })
    ).rejects.toThrow();
  });

  it("addMemberByEmail throws when user has no company (no DB in test env)", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.companies.addMemberByEmail({ email: "test@example.com", role: "company_member" })
    ).rejects.toThrow();
  });

  it("reactivateMember requires authentication", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    await expect(caller.companies.reactivateMember({ memberId: 1 })).rejects.toThrow();
  });

  it("reactivateMember throws when user has no company (no DB in test env)", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.companies.reactivateMember({ memberId: 1 })
    ).rejects.toThrow();
  });

  it("update requires authentication", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    await expect(
      caller.companies.update({ id: 1, name: "New Name" })
    ).rejects.toThrow();
  });
});

// ─── Officers Router Tests ────────────────────────────────────────────────────
describe("officers router", () => {
  it("list requires authentication", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    await expect(caller.officers.list({})).rejects.toThrow();
  });

  it("list returns empty array when DB is unavailable (test env)", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.officers.list({});
    expect(Array.isArray(result)).toBe(true);
  });

  it("stats requires authentication", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    await expect(caller.officers.stats()).rejects.toThrow();
  });

  it("stats returns null when DB is unavailable (test env)", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.officers.stats();
    expect(result).toBeNull();
  });

  it("register requires authentication", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    await expect(
      caller.officers.register({
        fullName: "Ahmed Al-Rashdi",
        nationalId: "12345678",
        employmentTrack: "platform",
        monthlySalary: 500,
      })
    ).rejects.toThrow();
  });

  it("register throws when DB is unavailable (test env)", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.officers.register({
        fullName: "Ahmed Al-Rashdi",
        nationalId: "12345678",
        employmentTrack: "platform",
        monthlySalary: 500,
      })
    ).rejects.toThrow();
  });

  it("assignCompany requires authentication", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    await expect(
      caller.officers.assignCompany({ officerId: 1, companyId: 1, monthlyFee: 100 })
    ).rejects.toThrow();
  });

  it("assignCompany throws when DB is unavailable (test env)", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.officers.assignCompany({ officerId: 1, companyId: 1, monthlyFee: 100 })
    ).rejects.toThrow();
  });

  it("removeCompany requires authentication", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    await expect(
      caller.officers.removeCompany({ officerId: 1, companyId: 1 })
    ).rejects.toThrow();
  });

  it("generateCertificate requires authentication", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    await expect(
      caller.officers.generateCertificate({ companyId: 1, month: 3, year: 2026 })
    ).rejects.toThrow();
  });

  it("generateCertificate throws when DB is unavailable (test env)", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.officers.generateCertificate({ companyId: 1, month: 3, year: 2026 })
    ).rejects.toThrow();
  });
});

// ─── Phase 17: Sanad Office Dashboard Procedures ─────────────────────────────

describe("sanad.officeDashboard", () => {
  it("returns null when DB is unavailable (mock env)", async () => {
    const ctx = makeCtx({ role: "admin" });
    const result = await appRouter.createCaller(ctx).sanad.officeDashboard({ officeId: 1 });
    expect(result).toBeNull();
  });

  it("requires authentication", async () => {
    await expect(
      appRouter.createCaller(makePublicCtx()).sanad.officeDashboard({ officeId: 1 })
    ).rejects.toThrow();
  });

  it("returns null when DB is unavailable before office RBAC (mock env; same short-circuit as admin)", async () => {
    const ctx = makeCtx({ role: "user", platformRole: "company_member" });
    const result = await appRouter.createCaller(ctx).sanad.officeDashboard({ officeId: 1 });
    expect(result).toBeNull();
  });
});

describe("sanad.officerPerformance", () => {
  it("returns empty array when DB is unavailable (mock env)", async () => {
    const ctx = makeCtx({ role: "admin" });
    const result = await appRouter.createCaller(ctx).sanad.officerPerformance({ officeId: 1 });
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("requires authentication", async () => {
    await expect(
      appRouter.createCaller(makePublicCtx()).sanad.officerPerformance({ officeId: 1 })
    ).rejects.toThrow();
  });
});

describe("sanad.earningsTrend", () => {
  it("returns empty array when DB is unavailable (mock env)", async () => {
    const ctx = makeCtx({ role: "admin" });
    const result = await appRouter.createCaller(ctx).sanad.earningsTrend({ officeId: 1 });
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("requires authentication", async () => {
    await expect(
      appRouter.createCaller(makePublicCtx()).sanad.earningsTrend({ officeId: 1 })
    ).rejects.toThrow();
  });
});

describe("sanad.workOrderStats", () => {
  it("returns empty stats object when DB is unavailable (mock env)", async () => {
    const ctx = makeCtx({ role: "admin" });
    const result = await appRouter.createCaller(ctx).sanad.workOrderStats({ officeId: 1 });
    expect(result).toMatchObject({
      byServiceType: [],
      byStatus: [],
      recentOrders: [],
    });
  });

  it("requires authentication", async () => {
    await expect(
      appRouter.createCaller(makePublicCtx()).sanad.workOrderStats({ officeId: 1 })
    ).rejects.toThrow();
  });
});

// ─── Phase 18: Sanad Marketplace Tests ────────────────────────────────────────

describe("sanad.listPublicProviders", () => {
  it("returns empty array when DB is unavailable (mock env)", async () => {
    const ctx = makeCtx({ role: "user" });
    const result = await appRouter.createCaller(ctx).sanad.listPublicProviders({});
    expect(Array.isArray(result)).toBe(true);
  });
  it("accepts governorate and serviceType filters", async () => {
    const ctx = makeCtx({ role: "user" });
    const result = await appRouter.createCaller(ctx).sanad.listPublicProviders({
      governorate: "Muscat",
      serviceType: "work_permit",
    });
    expect(Array.isArray(result)).toBe(true);
  });
  it("is accessible without authentication (public procedure)", async () => {
    // listPublicProviders is a public procedure — no auth required
    const result = await appRouter.createCaller(makePublicCtx()).sanad.listPublicProviders({});
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("sanad.getPublicProfile", () => {
  it("returns null when DB is unavailable (mock env)", async () => {
    const ctx = makeCtx({ role: "user" });
    const result = await appRouter.createCaller(ctx).sanad.getPublicProfile({ officeId: 1 });
    expect(result).toBeNull();
  });
  it("is accessible without authentication (public procedure)", async () => {
    // getPublicProfile is a public procedure — no auth required
    const result = await appRouter.createCaller(makePublicCtx()).sanad.getPublicProfile({ officeId: 1 });
    expect(result).toBeNull();
  });
});

describe("sanad.submitServiceRequest", () => {
  it("throws INTERNAL_SERVER_ERROR when DB is unavailable (mock env)", async () => {
    const ctx = makeCtx({ role: "user" });
    await expect(
      appRouter.createCaller(ctx).sanad.submitServiceRequest({
        officeId: 1,
        serviceType: "work_permit",
        description: "Test request",
        contactName: "Test User",
        contactPhone: "99999999",
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
  it("requires authentication", async () => {
    await expect(
      appRouter.createCaller(makePublicCtx()).sanad.submitServiceRequest({
        officeId: 1,
        serviceType: "work_permit",
        description: "Test",
        contactName: "Test",
        contactPhone: "99999999",
      })
    ).rejects.toThrow();
  });
});

describe("sanad.listServiceCatalogue", () => {
  it("returns empty array when DB is unavailable (mock env)", async () => {
    const ctx = makeCtx({ role: "user" });
    const result = await appRouter.createCaller(ctx).sanad.listServiceCatalogue({ officeId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });
  it("requires authentication", async () => {
    await expect(
      appRouter.createCaller(makePublicCtx()).sanad.listServiceCatalogue({ officeId: 1 })
    ).rejects.toThrow();
  });
});

describe("sanad.getMyOfficeProfile", () => {
  it("returns null when DB is unavailable (mock env)", async () => {
    const ctx = makeCtx({ role: "admin" });
    const result = await appRouter.createCaller(ctx).sanad.getMyOfficeProfile({});
    expect(result).toBeNull();
  });
  it("returns null for non-platform users without calling DB", async () => {
    const ctx = makeCtx({ role: "user", platformRole: "company_member" });
    const result = await appRouter.createCaller(ctx).sanad.getMyOfficeProfile({});
    expect(result).toBeNull();
  });
  it("requires authentication", async () => {
    await expect(
      appRouter.createCaller(makePublicCtx()).sanad.getMyOfficeProfile({})
    ).rejects.toThrow();
  });
});

describe("sanad.addCatalogueItem", () => {
  it("throws INTERNAL_SERVER_ERROR when DB is unavailable (mock env)", async () => {
    const ctx = makeCtx({ role: "admin" });
    await expect(
      appRouter.createCaller(ctx).sanad.addCatalogueItem({
        officeId: 1,
        serviceName: "Work Permit",
        serviceType: "work_permit",
        priceOmr: "25.000",
        processingDays: 5,
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
  it("requires authentication", async () => {
    await expect(
      appRouter.createCaller(makePublicCtx()).sanad.addCatalogueItem({
        officeId: 1,
        serviceName: "Test",
        serviceType: "work_permit",
        priceOmr: "10.000",
        processingDays: 3,
      })
    ).rejects.toThrow();
  });
  it("returns INTERNAL_SERVER_ERROR when DB is unavailable (before catalogue RBAC)", async () => {
    const ctx = makeCtx({ role: "user", platformRole: "company_member" });
    await expect(
      appRouter.createCaller(ctx).sanad.addCatalogueItem({
        officeId: 1,
        serviceName: "Test",
        serviceType: "work_permit",
        priceOmr: "10.000",
        processingDays: 3,
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});

describe("officers.generateCertificate tenant guard", () => {
  it("returns NOT_FOUND when company user targets another company", async () => {
    const m = {
      company: { id: 5, name: "Co", slug: "co", country: "OM", status: "active" },
      member: { role: "company_member" },
    } as any;
    vi.mocked(db.getUserCompany).mockResolvedValueOnce(m);
    const ctx = makeCtx({ role: "user", platformRole: "company_member" });
    await expect(
      appRouter.createCaller(ctx).officers.generateCertificate({ companyId: 99, month: 1, year: 2026 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("sla service rule management", () => {
  it("rejects company users for listRules", async () => {
    const ctx = makeCtx({ role: "user", platformRole: "company_member" });
    await expect(appRouter.createCaller(ctx).sla.listRules()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects company users for upsertRule", async () => {
    const ctx = makeCtx({ role: "user", platformRole: "company_member" });
    await expect(
      appRouter.createCaller(ctx).sla.upsertRule({
        serviceType: "work_permit",
        priority: "normal",
        targetHours: 24,
        escalationHours: 48,
        breachAction: "notify",
        isActive: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects company users for deleteRule", async () => {
    const ctx = makeCtx({ role: "user", platformRole: "company_member" });
    await expect(appRouter.createCaller(ctx).sla.deleteRule({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
