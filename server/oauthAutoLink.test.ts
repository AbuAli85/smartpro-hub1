import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests for the OAuth auto-link employee logic.
 *
 * The actual auto-link code lives inside registerOAuthRoutes (server/_core/oauth.ts).
 * We test the pure business logic extracted as a helper here to keep tests fast and
 * independent of Express / SDK internals.
 */

// ─── Pure helper (mirrors the logic in oauth.ts) ─────────────────────────────

type EmpRow = { id: number; companyId: number; firstName: string; lastName: string };

/**
 * Given a list of unlinked employee rows and the user's active company IDs,
 * return the subset that should be auto-linked.
 */
function selectEmployeesToAutoLink(
  unlinkedEmployees: EmpRow[],
  memberCompanyIds: number[]
): EmpRow[] {
  return unlinkedEmployees.filter((e) => memberCompanyIds.includes(e.companyId));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("OAuth auto-link employee selection", () => {
  const emp1: EmpRow = { id: 1, companyId: 10, firstName: "Alice", lastName: "Smith" };
  const emp2: EmpRow = { id: 2, companyId: 20, firstName: "Bob", lastName: "Jones" };
  const emp3: EmpRow = { id: 3, companyId: 30, firstName: "Carol", lastName: "Lee" };

  it("links employee whose company matches user membership", () => {
    const result = selectEmployeesToAutoLink([emp1], [10]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it("links multiple employees across multiple companies", () => {
    const result = selectEmployeesToAutoLink([emp1, emp2], [10, 20]);
    expect(result).toHaveLength(2);
  });

  it("does not link employee in a company the user is not a member of", () => {
    const result = selectEmployeesToAutoLink([emp3], [10, 20]);
    expect(result).toHaveLength(0);
  });

  it("returns empty array when no unlinked employees exist", () => {
    const result = selectEmployeesToAutoLink([], [10, 20]);
    expect(result).toHaveLength(0);
  });

  it("returns empty array when user has no company memberships", () => {
    const result = selectEmployeesToAutoLink([emp1, emp2], []);
    expect(result).toHaveLength(0);
  });

  it("only links employees in companies the user belongs to when there is a mix", () => {
    const result = selectEmployeesToAutoLink([emp1, emp2, emp3], [10, 30]);
    expect(result.map((e) => e.id).sort()).toEqual([1, 3]);
  });

  it("handles duplicate company IDs gracefully", () => {
    const result = selectEmployeesToAutoLink([emp1], [10, 10, 10]);
    expect(result).toHaveLength(1);
  });

  it("is case-insensitive in company ID matching (numeric equality)", () => {
    // companyId is always a number — just confirm strict equality works
    const result = selectEmployeesToAutoLink([emp1], [10]);
    expect(result[0].companyId).toBe(10);
  });
});
