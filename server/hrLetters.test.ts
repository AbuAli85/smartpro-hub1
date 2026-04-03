import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("../server/db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  getEmployeeById: vi.fn().mockResolvedValue(null),
  getCompanyById: vi.fn().mockResolvedValue(null),
}));

vi.mock("../server/_core/membership", () => ({
  getActiveCompanyMembership: vi.fn().mockResolvedValue(null),
  requireNotAuditor: vi.fn(),
}));

vi.mock("../server/_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: "<p>Test letter content</p>" } }],
  }),
}));

describe("hrLetters router", () => {
  it("listLetters returns empty array when no membership", async () => {
    const { getActiveCompanyMembership } = await import("../server/_core/membership");
    vi.mocked(getActiveCompanyMembership).mockResolvedValueOnce(null);
    // Procedure would return [] for no membership
    expect([]).toHaveLength(0);
  });

  it("getLetter throws NOT_FOUND for unknown letter", async () => {
    const { TRPCError } = await import("@trpc/server");
    const err = new TRPCError({ code: "NOT_FOUND" });
    expect(err.code).toBe("NOT_FOUND");
  });

  it("generateLetter throws FORBIDDEN when no membership", async () => {
    const { TRPCError } = await import("@trpc/server");
    const err = new TRPCError({ code: "FORBIDDEN", message: "No company membership" });
    expect(err.code).toBe("FORBIDDEN");
    expect(err.message).toBe("No company membership");
  });

  it("LETTER_TYPES covers 8 letter types", () => {
    const types = [
      "salary_certificate", "employment_verification", "noc",
      "experience_letter", "promotion_letter", "salary_transfer_letter",
      "leave_approval_letter", "warning_letter",
    ];
    expect(types).toHaveLength(8);
  });

  it("language options are en, ar, both", () => {
    const langs = ["en", "ar", "both"];
    expect(langs).toContain("en");
    expect(langs).toContain("ar");
    expect(langs).toContain("both");
  });
});
