import { describe, expect, it } from "vitest";
import { classifyAttendanceMismatch } from "./promoterAssignmentMismatchSignals";

describe("classifyAttendanceMismatch", () => {
  it("returns none when linked assignment is active and on date", () => {
    const { signal } = classifyAttendanceMismatch({
      businessDateYmd: "2026-04-01",
      attendanceSiteId: 1,
      resolution: null,
      linkedAssignment: {
        id: "a1",
        assignmentStatus: "active",
        startDate: "2026-01-01",
        endDate: null,
        clientSiteId: 1,
      },
    });
    expect(signal).toBe("none");
  });

  it("classifies unlinked with no resolution as unlinked_attendance", () => {
    const { signal } = classifyAttendanceMismatch({
      businessDateYmd: "2026-04-01",
      attendanceSiteId: 1,
      resolution: null,
      linkedAssignment: null,
    });
    expect(signal).toBe("unlinked_attendance");
  });
});
