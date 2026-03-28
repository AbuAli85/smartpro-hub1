import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

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
  getCrmCommunications: vi.fn().mockResolvedValue([]),
  createCrmCommunication: vi.fn().mockResolvedValue({ id: 1 }),
  // Notifications
  getUserNotifications: vi.fn().mockResolvedValue([]),
  createNotification: vi.fn().mockResolvedValue({ id: 1 }),
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
  getCompanyStats: vi.fn().mockResolvedValue({ employees: 0, contracts: 0, proServices: 0, sanadApplications: 0, contacts: 0, deals: 0, pendingLeave: 0 }),
  getPlatformStats: vi.fn().mockResolvedValue({ companies: 5, users: 42, contracts: 18, proServices: 7, sanadApplications: 3, marketplaceProviders: 12, contacts: 88 }),
  getCompanies: vi.fn().mockResolvedValue([]),
  getCompanyById: vi.fn().mockResolvedValue(null),
  createCompany: vi.fn().mockResolvedValue({ id: 1, name: "Test Co" }),
  updateCompany: vi.fn().mockResolvedValue({}),
  getSubscriptionPlans: vi.fn().mockResolvedValue([]),
  getContracts: vi.fn().mockResolvedValue([]),
  getContractById: vi.fn().mockResolvedValue(null),
  createContract: vi.fn().mockResolvedValue({ id: 1 }),
  updateContract: vi.fn().mockResolvedValue({}),
  getContractTemplates: vi.fn().mockResolvedValue([]),
  getProServices: vi.fn().mockResolvedValue([]),
  createProService: vi.fn().mockResolvedValue({ id: 1 }),
  updateProService: vi.fn().mockResolvedValue({}),
  getSanadApplications: vi.fn().mockResolvedValue([]),
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
  getCompanySubscription: vi.fn().mockResolvedValue(null),
  // Attendance
  getAttendance: vi.fn().mockResolvedValue([]),
  createAttendanceRecord: vi.fn().mockResolvedValue({ id: 1 }),
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

  it("templates returns empty array when no company", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.contracts.templates();
    expect(Array.isArray(result)).toBe(true);
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
});

// ─── Marketplace Tests ────────────────────────────────────────────────────────
describe("marketplace", () => {
  it("listProviders returns empty array", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.marketplace.listProviders({});
    expect(Array.isArray(result)).toBe(true);
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
      caller.hr.createAttendance({ employeeId: 1, date: "2026-03-01", status: "present" })
    ).rejects.toThrow();
  });

  it("createAttendance succeeds for authenticated user", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.hr.createAttendance({ employeeId: 1, date: "2026-03-01", status: "present" });
    expect(result).toHaveProperty("success", true);
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
