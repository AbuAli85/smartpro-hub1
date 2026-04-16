import { describe, expect, it } from "vitest";
import { countOverlapCalendarDays, getAssignmentEffectiveOverlap } from "./promoterAssignmentPeriodHelpers";

describe("promoterAssignmentPeriodHelpers", () => {
  it("open-ended assignment overlaps period", () => {
    const o = getAssignmentEffectiveOverlap("2026-04-01", "2026-04-30", {
      assignmentStatus: "active",
      startDate: "2026-01-01",
      endDate: null,
    });
    expect(o).not.toBeNull();
    expect(countOverlapCalendarDays(o!)).toBeGreaterThan(0);
  });

  it("returns null when assignment ended before period", () => {
    const o = getAssignmentEffectiveOverlap("2026-04-01", "2026-04-30", {
      assignmentStatus: "completed",
      startDate: "2026-01-01",
      endDate: "2026-03-01",
    });
    expect(o).toBeNull();
  });
});
