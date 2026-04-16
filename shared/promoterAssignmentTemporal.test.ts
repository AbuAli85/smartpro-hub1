import { describe, expect, it } from "vitest";
import {
  getAssignmentTemporalState,
  isAssignmentCurrentlyOperational,
  isAssignmentFutureScheduled,
} from "./promoterAssignmentTemporal";

describe("promoterAssignmentTemporal", () => {
  const ref = "2026-04-17";

  it("treats active with no end date as operational when started on or before reference", () => {
    expect(
      getAssignmentTemporalState(
        { assignmentStatus: "active", startDate: "2026-01-01", endDate: null },
        ref,
      ),
    ).toBe("operational");
  });

  it("active with future start is scheduled, not operational", () => {
    expect(
      getAssignmentTemporalState(
        { assignmentStatus: "active", startDate: "2026-06-01", endDate: null },
        ref,
      ),
    ).toBe("scheduled_future");
    expect(
      isAssignmentCurrentlyOperational(
        { assignmentStatus: "active", startDate: "2026-06-01", endDate: null },
        ref,
      ),
    ).toBe(false);
    expect(
      isAssignmentFutureScheduled(
        { assignmentStatus: "active", startDate: "2026-06-01", endDate: null },
        ref,
      ),
    ).toBe(true);
  });

  it("suspended is never operational even if dates cover today", () => {
    expect(
      getAssignmentTemporalState(
        { assignmentStatus: "suspended", startDate: "2026-01-01", endDate: null },
        ref,
      ),
    ).toBe("suspended");
  });
});
