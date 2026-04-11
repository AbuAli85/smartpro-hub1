import { describe, expect, it } from "vitest";
import { oldestPendingAgeHours, pickTopPendingFieldKey } from "./profileChangeRequestQueueKpis";

describe("pickTopPendingFieldKey", () => {
  it("returns empty when no rows", () => {
    expect(pickTopPendingFieldKey([])).toEqual({
      fieldKey: null,
      count: 0,
      label: null,
    });
  });

  it("picks highest count", () => {
    expect(
      pickTopPendingFieldKey([
        { fieldKey: "legal_name", count: 2 },
        { fieldKey: "bank_details", count: 5 },
      ]),
    ).toMatchObject({ fieldKey: "bank_details", count: 5, label: "Bank / payroll" });
  });

  it("breaks ties lexicographically", () => {
    const r = pickTopPendingFieldKey([
      { fieldKey: "nationality", count: 3 },
      { fieldKey: "legal_name", count: 3 },
    ]);
    expect(r.fieldKey).toBe("legal_name");
  });
});

describe("oldestPendingAgeHours", () => {
  it("returns null for missing", () => {
    expect(oldestPendingAgeHours(null)).toBeNull();
  });

  it("returns non-negative hours", () => {
    const d = new Date(Date.now() - 5 * 3600000);
    expect(oldestPendingAgeHours(d)).toBe(5);
  });
});
