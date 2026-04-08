import { describe, expect, it } from "vitest";
import { isSanadIntelMissingTableError, throwIfSanadIntelSchemaMissing } from "./dbErrors";

describe("isSanadIntelMissingTableError", () => {
  it("detects MySQL ER_NO_SUCH_TABLE on sanad_intel (via cause chain)", () => {
    const cause = Object.assign(new Error("Table 'db.sanad_intel_workforce_governorate' doesn't exist"), {
      errno: 1146,
      code: "ER_NO_SUCH_TABLE",
    });
    const err = new Error("Failed query: …");
    err.cause = cause;
    expect(isSanadIntelMissingTableError(err)).toBe(true);
  });

  it("detects 'doesn't exist' message mentioning sanad_intel when errno is absent", () => {
    const err = new Error("Table 'db.sanad_intel_centers' doesn't exist");
    expect(isSanadIntelMissingTableError(err)).toBe(true);
  });

  it("does not flag unrelated tables", () => {
    const err = new Error("Failed query: select * from `users`\nparams: ");
    expect(isSanadIntelMissingTableError(err)).toBe(false);
  });

  it("does not treat unknown column / other sanad_intel query failures as missing migration", () => {
    const err = Object.assign(
      new Error("Failed query: select `sanad_intel_center_compliance_items`.`compliance_item_status` from …"),
      {
        cause: Object.assign(new Error("Unknown column 'compliance_item_status' in 'field list'"), {
          errno: 1054,
          code: "ER_BAD_FIELD_ERROR",
        }),
      },
    );
    expect(isSanadIntelMissingTableError(err)).toBe(false);
  });
});

describe("throwIfSanadIntelSchemaMissing", () => {
  it("throws TRPCError when sanad_intel table is missing", () => {
    const err = new Error("Failed query");
    err.cause = Object.assign(new Error("Table 'db.sanad_intel_centers' doesn't exist"), {
      errno: 1146,
      code: "ER_NO_SUCH_TABLE",
    });
    expect(() => throwIfSanadIntelSchemaMissing(err)).toThrow(/0025_sanad_network_intelligence/);
  });
});
