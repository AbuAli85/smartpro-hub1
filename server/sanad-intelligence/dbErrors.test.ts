import { describe, expect, it } from "vitest";
import { isSanadIntelMissingTableError, throwIfSanadIntelSchemaMissing } from "./dbErrors";

describe("isSanadIntelMissingTableError", () => {
  it("detects Drizzle-style error with .query containing sanad_intel", () => {
    const err = Object.assign(new Error("Failed query: …"), {
      query: "select * from `sanad_intel_workforce_governorate`",
    });
    expect(isSanadIntelMissingTableError(err)).toBe(true);
  });

  it("detects Failed query message with sanad_intel when .query is absent", () => {
    const err = new Error(
      "Failed query: select `id` from `sanad_intel_centers`\nparams: ",
    );
    expect(isSanadIntelMissingTableError(err)).toBe(true);
  });

  it("does not flag unrelated tables", () => {
    const err = new Error("Failed query: select * from `users`\nparams: ");
    expect(isSanadIntelMissingTableError(err)).toBe(false);
  });
});

describe("throwIfSanadIntelSchemaMissing", () => {
  it("throws TRPCError for sanad_intel Drizzle query errors", () => {
    const err = Object.assign(new Error("wrap"), {
      query: "from `sanad_intel_centers`",
    });
    expect(() => throwIfSanadIntelSchemaMissing(err)).toThrow(/0025_sanad_network_intelligence/);
  });
});
