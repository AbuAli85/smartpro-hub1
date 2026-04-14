import { describe, expect, it } from "vitest";
import { missedShiftIssueIdsToAutoResolve } from "./attendanceOperationalIssueSync";

describe("missedShiftIssueIdsToAutoResolve", () => {
  it("returns issue ids when schedule is no longer absent on the board", () => {
    const absent = new Set([1, 2]);
    const stale = [
      { id: 10, scheduleId: 3 },
      { id: 11, scheduleId: 1 },
      { id: 12, scheduleId: null },
    ];
    expect(missedShiftIssueIdsToAutoResolve(stale, absent)).toEqual([10]);
  });

  it("returns empty when every stale row is still absent", () => {
    const absent = new Set([7, 8]);
    const stale = [
      { id: 1, scheduleId: 7 },
      { id: 2, scheduleId: 8 },
    ];
    expect(missedShiftIssueIdsToAutoResolve(stale, absent)).toEqual([]);
  });
});
