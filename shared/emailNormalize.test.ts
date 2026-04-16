import { describe, expect, it } from "vitest";
import { normalizeEmail } from "./emailNormalize";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Test@EXAMPLE.com ")).toBe("test@example.com");
  });

  it("returns null for empty", () => {
    expect(normalizeEmail("   ")).toBe(null);
    expect(normalizeEmail(null)).toBe(null);
  });
});
