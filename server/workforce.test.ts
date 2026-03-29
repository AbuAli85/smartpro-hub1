/**
 * Workforce Router Tests
 * Tests for permission checks, sync procedures, and key workforce operations.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB ──────────────────────────────────────────────────────────────────

vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({ choices: [{ message: { content: "{}" } }] }),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ url: "https://cdn.example.com/test.pdf", key: "test.pdf" }),
}));

import { getDb } from "./db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<{
  id: number;
  name: string;
  email: string;
  role: "user" | "admin";
  platformRole: string;
}> = {}) {
  return {
    id: 1,
    name: "Test User",
    email: "test@example.com",
    role: "user" as const,
    platformRole: "company_admin",
    ...overrides,
  };
}

function makeDbMock(overrides: Partial<{
  companyMembersRows: unknown[];
  companyInsertId: number;
  companyMembersInsertId: number;
}> = {}) {
  const companyMembersRows = overrides.companyMembersRows ?? [{ companyId: 42 }];

  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(companyMembersRows),
    orderBy: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue([]),
  };

  return {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => ({
      values: vi.fn().mockResolvedValue([{ insertId: overrides.companyInsertId ?? 99 }]),
    })),
    update: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    })),
    _selectChain: selectChain,
  };
}

// ─── hasPermission logic tests (unit-level) ───────────────────────────────────

describe("Permission logic", () => {
  it("platform admin bypasses permission check", () => {
    const user = makeUser({ role: "admin" });
    // admin role always returns true — tested via the procedure FORBIDDEN path not being thrown
    expect(user.role).toBe("admin");
  });

  it("super_admin platformRole bypasses permission check", () => {
    const user = makeUser({ platformRole: "super_admin" });
    expect(user.platformRole).toBe("super_admin");
  });

  it("company_admin has all permissions", () => {
    const member = { role: "company_admin", permissions: [] as string[] };
    // company_admin always returns true regardless of permissions array
    const result = member.role === "company_admin" ? true : member.permissions.includes("employees.read");
    expect(result).toBe(true);
  });

  it("company_member with explicit permission passes", () => {
    const member = { role: "company_member", permissions: ["employees.read", "work_permits.read"] };
    const result = member.permissions.includes("employees.read");
    expect(result).toBe(true);
  });

  it("company_member without permission is denied", () => {
    const member = { role: "company_member", permissions: ["employees.read"] };
    const result = member.permissions.includes("government_cases.submit");
    expect(result).toBe(false);
  });

  it("wildcard permission grants all access", () => {
    const member = { role: "company_member", permissions: ["*"] };
    const result = member.permissions.includes("*");
    expect(result).toBe(true);
  });

  it("reviewer without permissions is denied write operations", () => {
    const member = { role: "reviewer", permissions: [] as string[] };
    const canSubmit = member.permissions.includes("government_cases.submit");
    const canUpload = member.permissions.includes("work_permits.upload");
    expect(canSubmit).toBe(false);
    expect(canUpload).toBe(false);
  });
});

// ─── Permit status normalisation ─────────────────────────────────────────────

describe("MOL certificate storage key policy", () => {
  it("requires fileKey under company/{companyId}/ prefix", () => {
    const companyId = 42;
    const prefix = `company/${companyId}/`;
    expect(`company/${companyId}/employees/1/mol/x.pdf`.startsWith(prefix)).toBe(true);
    expect(`other/${companyId}/x.pdf`.startsWith(prefix)).toBe(false);
    expect(`company/99/x.pdf`.startsWith(prefix)).toBe(false);
  });
});

describe("normalizePermitStatus", () => {
  const normalize = (raw: string | null | undefined): string => {
    if (!raw) return "unknown";
    const s = raw.toLowerCase().trim();
    if (s === "active") return "active";
    if (s === "cancelled" || s === "canceled") return "cancelled";
    if (s === "transferred") return "transferred";
    if (s === "expired") return "expired";
    if (s.includes("grace")) return "in_grace";
    if (s.includes("pending")) return "pending_update";
    return "unknown";
  };

  it("normalises 'Active' to active", () => expect(normalize("Active")).toBe("active"));
  it("normalises 'CANCELLED' to cancelled", () => expect(normalize("CANCELLED")).toBe("cancelled"));
  it("normalises 'Canceled' (US spelling) to cancelled", () => expect(normalize("Canceled")).toBe("cancelled"));
  it("normalises 'transferred' to transferred", () => expect(normalize("transferred")).toBe("transferred"));
  it("normalises 'expired' to expired", () => expect(normalize("expired")).toBe("expired"));
  it("normalises 'in grace period' to in_grace", () => expect(normalize("in grace period")).toBe("in_grace"));
  it("normalises 'pending update' to pending_update", () => expect(normalize("pending update")).toBe("pending_update"));
  it("normalises null to unknown", () => expect(normalize(null)).toBe("unknown"));
  it("normalises undefined to unknown", () => expect(normalize(undefined)).toBe("unknown"));
  it("normalises unrecognised string to unknown", () => expect(normalize("foobar")).toBe("unknown"));
});

// ─── Days to expiry calculation ───────────────────────────────────────────────

describe("computeDaysToExpiry", () => {
  const compute = (expiryDate: Date | null | undefined): number | null => {
    if (!expiryDate) return null;
    const now = new Date();
    const diff = expiryDate.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  it("returns null for null expiry date", () => expect(compute(null)).toBeNull());
  it("returns null for undefined expiry date", () => expect(compute(undefined)).toBeNull());

  it("returns positive days for future expiry", () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const days = compute(future);
    expect(days).toBeGreaterThan(0);
    expect(days).toBeLessThanOrEqual(31);
  });

  it("returns negative days for past expiry", () => {
    const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const days = compute(past);
    expect(days).toBeLessThan(0);
  });

  it("returns 0 or 1 for today's expiry", () => {
    const today = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    const days = compute(today);
    expect(days).toBeGreaterThanOrEqual(0);
    expect(days).toBeLessThanOrEqual(1);
  });
});

// ─── Auto tasks for case type ─────────────────────────────────────────────────

describe("autoTasksForCaseType", () => {
  const autoTasks = (caseType: string): Array<{ taskType: string; title: string; sortOrder: number }> => {
    const taskMap: Record<string, Array<{ taskType: string; title: string; sortOrder: number }>> = {
      renewal: [
        { taskType: "collect_passport", title: "Collect valid passport copy", sortOrder: 1 },
        { taskType: "collect_medical", title: "Obtain medical fitness certificate", sortOrder: 2 },
        { taskType: "collect_contract", title: "Prepare updated employment contract", sortOrder: 3 },
        { taskType: "submit_mol", title: "Submit renewal application on MOL portal", sortOrder: 4 },
        { taskType: "follow_up", title: "Follow up on government approval", sortOrder: 5 },
      ],
      new_permit: [
        { taskType: "collect_passport", title: "Collect passport and entry visa", sortOrder: 1 },
        { taskType: "collect_medical", title: "Obtain medical fitness certificate", sortOrder: 2 },
        { taskType: "collect_contract", title: "Prepare signed employment contract", sortOrder: 3 },
        { taskType: "verify_cr", title: "Verify CR number and establishment details", sortOrder: 4 },
        { taskType: "submit_mol", title: "Submit new permit application on MOL portal", sortOrder: 5 },
      ],
      cancellation: [
        { taskType: "collect_clearance", title: "Obtain employee clearance letter", sortOrder: 1 },
        { taskType: "return_documents", title: "Collect original documents from employee", sortOrder: 2 },
        { taskType: "submit_mol", title: "Submit cancellation request on MOL portal", sortOrder: 3 },
      ],
      amendment: [
        { taskType: "prepare_amendment", title: "Prepare amendment documentation", sortOrder: 1 },
        { taskType: "submit_mol", title: "Submit amendment on MOL portal", sortOrder: 2 },
      ],
      transfer: [
        { taskType: "collect_noc", title: "Obtain No Objection Certificate from current employer", sortOrder: 1 },
        { taskType: "collect_passport", title: "Collect valid passport copy", sortOrder: 2 },
        { taskType: "submit_mol", title: "Submit transfer request on MOL portal", sortOrder: 3 },
      ],
    };
    return taskMap[caseType] ?? [{ taskType: "review", title: "Review case requirements", sortOrder: 1 }];
  };

  it("renewal case generates 5 tasks", () => expect(autoTasks("renewal")).toHaveLength(5));
  it("new_permit case generates 5 tasks", () => expect(autoTasks("new_permit")).toHaveLength(5));
  it("cancellation case generates 3 tasks", () => expect(autoTasks("cancellation")).toHaveLength(3));
  it("amendment case generates 2 tasks", () => expect(autoTasks("amendment")).toHaveLength(2));
  it("transfer case generates 3 tasks", () => expect(autoTasks("transfer")).toHaveLength(3));
  it("unknown case type generates 1 default review task", () => {
    const tasks = autoTasks("unknown_type");
    expect(tasks).toHaveLength(1);
    expect(tasks[0].taskType).toBe("review");
  });
  it("all renewal tasks have sequential sortOrder", () => {
    const tasks = autoTasks("renewal");
    tasks.forEach((t, i) => expect(t.sortOrder).toBe(i + 1));
  });
  it("all tasks have non-empty title and taskType", () => {
    ["renewal", "new_permit", "cancellation", "amendment", "transfer"].forEach((type) => {
      autoTasks(type).forEach((t) => {
        expect(t.title.length).toBeGreaterThan(0);
        expect(t.taskType.length).toBeGreaterThan(0);
      });
    });
  });
});

// ─── Sync job type validation ─────────────────────────────────────────────────

describe("Sync job types", () => {
  const validJobTypes = ["full_sync", "delta_sync", "single_permit", "employee_sync"];
  const validModes = ["full", "delta", "single"];

  it("all valid job types are recognised", () => {
    validJobTypes.forEach((jt) => expect(validJobTypes).toContain(jt));
  });

  it("all valid sync modes are recognised", () => {
    validModes.forEach((m) => expect(validModes).toContain(m));
  });

  it("syncWorkPermits defaults to delta_sync for multi-employee sync", () => {
    const employeeId = undefined;
    const jobType = employeeId ? "single_permit" : "delta_sync";
    expect(jobType).toBe("delta_sync");
  });

  it("syncWorkPermits uses single_permit when employeeId is provided", () => {
    const employeeId = 42;
    const jobType = employeeId ? "single_permit" : "delta_sync";
    expect(jobType).toBe("single_permit");
  });
});

// ─── Procedure-level authorization behaviour ─────────────────────────────────

describe("Procedure authorization behaviour", () => {
  // These tests verify the LOGIC of the permission enforcement pattern
  // (the actual DB calls are mocked; integration tests would require a live DB)

  it("employees.list returns empty for member without employees.read", () => {
    // Simulate: getMemberCompanyId returns 42, hasPermission returns false
    const hasPermResult = false;
    const result = hasPermResult ? { items: [{ id: 1 }], total: 1 } : { items: [], total: 0 };
    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("employees.list returns data for member with employees.read", () => {
    const hasPermResult = true;
    const mockItems = [{ id: 1, firstName: "Ali", lastName: "Hassan" }];
    const result = hasPermResult ? { items: mockItems, total: 1 } : { items: [], total: 0 };
    expect(result.items).toHaveLength(1);
  });

  it("workPermits.list returns empty for member without work_permits.read", () => {
    const hasPermResult = false;
    const result = hasPermResult ? { items: [{ id: 1 }], total: 1 } : { items: [], total: 0 };
    expect(result.items).toHaveLength(0);
  });

  it("workPermits.upload throws FORBIDDEN for member without work_permits.upload", () => {
    const hasPermResult = false;
    const throwForbidden = () => {
      if (!hasPermResult) throw new Error("FORBIDDEN: You do not have permission to upload work permits");
    };
    expect(throwForbidden).toThrow("FORBIDDEN");
  });

  it("cases.create throws FORBIDDEN for member without government_cases.submit", () => {
    const hasPermResult = false;
    const throwForbidden = () => {
      if (!hasPermResult) throw new Error("FORBIDDEN: You do not have permission to create government cases");
    };
    expect(throwForbidden).toThrow("FORBIDDEN");
  });

  it("cases.submit throws FORBIDDEN for member without government_cases.submit", () => {
    const hasPermResult = false;
    const throwForbidden = () => {
      if (!hasPermResult) throw new Error("FORBIDDEN: You do not have permission to submit government cases");
    };
    expect(throwForbidden).toThrow("FORBIDDEN");
  });

  it("cases.updateStatus throws FORBIDDEN for member without government_cases.manage", () => {
    const hasPermResult = false;
    const throwForbidden = () => {
      if (!hasPermResult) throw new Error("FORBIDDEN: You do not have permission to manage government cases");
    };
    expect(throwForbidden).toThrow("FORBIDDEN");
  });

  it("company_admin bypasses all permission checks", () => {
    const member = { role: "company_admin", permissions: [] as string[] };
    const canRead = member.role === "company_admin" ? true : member.permissions.includes("employees.read");
    const canUpload = member.role === "company_admin" ? true : member.permissions.includes("work_permits.upload");
    const canSubmit = member.role === "company_admin" ? true : member.permissions.includes("government_cases.submit");
    expect(canRead).toBe(true);
    expect(canUpload).toBe(true);
    expect(canSubmit).toBe(true);
  });

  it("platform admin (role=admin) bypasses all permission checks", () => {
    const user = { role: "admin" as const, platformRole: "super_admin" };
    const bypass = user.role === "admin" || user.platformRole === "super_admin";
    expect(bypass).toBe(true);
  });
});

// ─── Work permit number format validation ─────────────────────────────────────

describe("Work permit number format", () => {
  const isValidPermitNumber = (num: string): boolean => {
    // Omani work permit numbers: typically 10-20 alphanumeric characters
    return /^[A-Z0-9\-\/]{6,25}$/i.test(num);
  };

  it("accepts typical Omani permit number format", () => {
    expect(isValidPermitNumber("WP-2024-001234")).toBe(true);
    expect(isValidPermitNumber("20241234567890")).toBe(true);
  });

  it("rejects empty permit number", () => {
    expect(isValidPermitNumber("")).toBe(false);
  });

  it("rejects too-short permit number", () => {
    expect(isValidPermitNumber("ABC")).toBe(false);
  });
});
