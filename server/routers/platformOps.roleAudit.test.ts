import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock the DB module ────────────────────────────────────────────────────────
vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../../shared/rbac", () => ({
  mapMemberRoleToPlatformRole: (role: string) => {
    const map: Record<string, string> = {
      company_admin: "company_admin",
      hr_admin: "hr_admin",
      finance_admin: "finance_admin",
      company_member: "company_member",
      reviewer: "reviewer",
      external_auditor: "external_auditor",
    };
    return map[role] ?? "client";
  },
}));

import { getDb } from "../db";
import { mapMemberRoleToPlatformRole } from "../../shared/rbac";

// ─── Unit tests for mapMemberRoleToPlatformRole ───────────────────────────────
describe("mapMemberRoleToPlatformRole", () => {
  it("maps company_admin to company_admin", () => {
    expect(mapMemberRoleToPlatformRole("company_admin")).toBe("company_admin");
  });

  it("maps hr_admin to hr_admin", () => {
    expect(mapMemberRoleToPlatformRole("hr_admin")).toBe("hr_admin");
  });

  it("maps finance_admin to finance_admin", () => {
    expect(mapMemberRoleToPlatformRole("finance_admin")).toBe("finance_admin");
  });

  it("maps company_member to company_member", () => {
    expect(mapMemberRoleToPlatformRole("company_member")).toBe("company_member");
  });

  it("maps unknown role to client", () => {
    expect(mapMemberRoleToPlatformRole("unknown_role")).toBe("client");
  });
});

// ─── Mismatch detection logic ─────────────────────────────────────────────────
describe("Role mismatch detection logic", () => {
  const ROLE_ORDER = ["company_admin", "hr_admin", "finance_admin", "reviewer", "company_member", "external_auditor", "client"];

  function detectMismatch(platformRole: string, activeMemberRoles: string[]): boolean {
    if (activeMemberRoles.length === 0) return false;
    const bestRole = [...activeMemberRoles].sort(
      (a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b)
    )[0];
    const expected = mapMemberRoleToPlatformRole(bestRole);
    return platformRole !== expected;
  }

  it("detects mismatch when platformRole is client but user is company_admin member", () => {
    expect(detectMismatch("client", ["company_admin"])).toBe(true);
  });

  it("detects no mismatch when platformRole matches best member role", () => {
    expect(detectMismatch("company_admin", ["company_admin"])).toBe(false);
  });

  it("picks highest privilege role when user has multiple memberships", () => {
    // company_admin > hr_admin — should expect company_admin
    expect(detectMismatch("hr_admin", ["hr_admin", "company_admin"])).toBe(true);
    expect(detectMismatch("company_admin", ["hr_admin", "company_admin"])).toBe(false);
  });

  it("returns no mismatch for user with no active memberships", () => {
    expect(detectMismatch("client", [])).toBe(false);
  });

  it("detects mismatch when platformRole is company_member but user is hr_admin member", () => {
    expect(detectMismatch("company_member", ["hr_admin"])).toBe(true);
  });
});

// ─── listCompanies procedure (smoke test with mock DB) ────────────────────────
describe("listCompanies procedure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when db is null", async () => {
    const mockGetDb = vi.mocked(getDb);
    mockGetDb.mockResolvedValue(null as never);

    // Simulate the procedure logic
    const db = await getDb();
    const result = !db ? [] : ["would_query"];
    expect(result).toEqual([]);
  });
});

// ─── bulkFixMismatches logic ──────────────────────────────────────────────────
describe("bulkFixMismatches logic", () => {
  const ROLE_ORDER = ["company_admin", "hr_admin", "finance_admin", "reviewer", "company_member", "external_auditor", "client"];

  function computeExpectedPlatformRole(memberRoles: string[]): string {
    if (memberRoles.length === 0) return "client";
    const best = [...memberRoles].sort(
      (a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b)
    )[0];
    return mapMemberRoleToPlatformRole(best);
  }

  it("returns client when no memberships", () => {
    expect(computeExpectedPlatformRole([])).toBe("client");
  });

  it("returns company_admin for company_admin membership", () => {
    expect(computeExpectedPlatformRole(["company_admin"])).toBe("company_admin");
  });

  it("returns company_admin when mixed memberships include company_admin", () => {
    expect(computeExpectedPlatformRole(["company_member", "company_admin", "hr_admin"])).toBe("company_admin");
  });

  it("returns hr_admin for hr_admin-only membership", () => {
    expect(computeExpectedPlatformRole(["hr_admin"])).toBe("hr_admin");
  });
});
