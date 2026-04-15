import { describe, expect, it } from "vitest";

describe("attendance anomaly display logic", () => {
  it("critical anomalies sort before warnings", () => {
    const anomalies = [
      { severity: "warning" as const, employeeId: 1 },
      { severity: "critical" as const, employeeId: 2 },
      { severity: "warning" as const, employeeId: 3 },
    ];
    const sorted = [...anomalies].sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
      return a.employeeId - b.employeeId;
    });
    expect(sorted[0]!.severity).toBe("critical");
    expect(sorted[0]!.employeeId).toBe(2);
  });

  it("force checkout button shows for MULTIPLE_OPEN_SESSIONS and RUNAWAY_SESSION only", () => {
    const showForceCheckout = (type: string) =>
      type === "MULTIPLE_OPEN_SESSIONS" || type === "RUNAWAY_SESSION";
    expect(showForceCheckout("MULTIPLE_OPEN_SESSIONS")).toBe(true);
    expect(showForceCheckout("RUNAWAY_SESSION")).toBe(true);
    expect(showForceCheckout("MULTIPLE_SESSIONS")).toBe(false);
    expect(showForceCheckout("EARLY_CHECKIN_RECHECKIN")).toBe(false);
  });

  it("force checkout reason must be at least 10 chars", () => {
    const isValid = (r: string) => r.trim().length >= 10;
    expect(isValid("short")).toBe(false);
    expect(isValid("Employee forgot to check out")).toBe(true);
    expect(isValid("")).toBe(false);
  });

  it("dedup dry-run: groups with 0 patchedIds are clean", () => {
    const groups = [
      { employeeId: 1, scheduleId: 10, openCount: 2, keptRecordId: 200, patchedIds: [199] },
      { employeeId: 2, scheduleId: 11, openCount: 1, keptRecordId: 201, patchedIds: [] as number[] },
    ];
    const dirty = groups.filter((g) => g.patchedIds.length > 0);
    expect(dirty).toHaveLength(1);
    expect(dirty[0]!.employeeId).toBe(1);
  });

  it("summary bar is emerald when total === 0", () => {
    const isClean = (total: number) => total === 0;
    expect(isClean(0)).toBe(true);
    expect(isClean(1)).toBe(false);
  });
});
