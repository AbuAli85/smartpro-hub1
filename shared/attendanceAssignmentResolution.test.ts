import { describe, expect, it } from "vitest";
import { resolvePromoterAssignmentForAttendance } from "./attendanceAssignmentResolution";

describe("resolvePromoterAssignmentForAttendance", () => {
  it("resolves single operational assignment with matching site", () => {
    const r = resolvePromoterAssignmentForAttendance(
      [
        {
          id: "a1",
          assignmentStatus: "active",
          startDate: "2026-01-01",
          endDate: null,
          clientSiteId: 10,
        },
      ],
      { businessDateYmd: "2026-04-17", attendanceSiteId: 10 },
    );
    expect(r.kind).toBe("resolved");
    if (r.kind === "resolved") expect(r.promoterAssignmentId).toBe("a1");
  });

  it("returns site_mismatch when site required does not match", () => {
    const r = resolvePromoterAssignmentForAttendance(
      [
        {
          id: "a1",
          assignmentStatus: "active",
          startDate: "2026-01-01",
          endDate: null,
          clientSiteId: 10,
        },
      ],
      { businessDateYmd: "2026-04-17", attendanceSiteId: 99 },
    );
    expect(r.kind).toBe("no_match");
    if (r.kind === "no_match") expect(r.reason).toBe("site_mismatch");
  });

  it("returns ambiguous for two operational matches", () => {
    const r = resolvePromoterAssignmentForAttendance(
      [
        {
          id: "a1",
          assignmentStatus: "active",
          startDate: "2026-01-01",
          endDate: null,
          clientSiteId: null,
        },
        {
          id: "a2",
          assignmentStatus: "active",
          startDate: "2026-01-01",
          endDate: null,
          clientSiteId: null,
        },
      ],
      { businessDateYmd: "2026-04-17", attendanceSiteId: 5 },
    );
    expect(r.kind).toBe("ambiguous");
  });
});
