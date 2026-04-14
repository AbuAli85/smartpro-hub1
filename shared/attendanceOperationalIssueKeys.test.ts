import { describe, expect, it } from "vitest";
import { operationalIssueKey } from "./attendanceOperationalIssueKeys";

describe("operationalIssueKey", () => {
  it("builds stable keys for each kind", () => {
    expect(operationalIssueKey({ kind: "overdue_checkout", attendanceRecordId: 42 })).toBe(
      "overdue_checkout:ar:42",
    );
    expect(
      operationalIssueKey({
        kind: "missed_shift",
        scheduleId: 7,
        businessDateYmd: "2026-04-14",
      }),
    ).toBe("missed_shift:sch:7:d:2026-04-14");
    expect(operationalIssueKey({ kind: "correction_pending", correctionId: 99 })).toBe(
      "correction_pending:cor:99",
    );
    expect(operationalIssueKey({ kind: "manual_pending", manualCheckinRequestId: 3 })).toBe(
      "manual_pending:mcr:3",
    );
  });

  it("throws when required ids are missing", () => {
    expect(() =>
      // @ts-expect-error — intentional incomplete payload
      operationalIssueKey({ kind: "overdue_checkout" }),
    ).toThrow();
  });
});
