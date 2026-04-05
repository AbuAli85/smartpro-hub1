import { describe, expect, it } from "vitest";
import { trainingRecordAuditSnapshot, selfReviewAuditSnapshot } from "./hrPerformanceAudit";

describe("hrPerformanceAudit snapshots", () => {
  it("trainingRecordAuditSnapshot serializes dates to ISO strings", () => {
    const d = new Date("2026-04-05T12:00:00.000Z");
    const s = trainingRecordAuditSnapshot({
      trainingStatus: "completed",
      score: 88,
      certificateUrl: "https://x/y",
      completedAt: d,
      employeeUserId: 42,
    });
    expect(s.completedAt).toBe("2026-04-05T12:00:00.000Z");
    expect(s.employeeUserId).toBe(42);
  });

  it("selfReviewAuditSnapshot includes manager fields", () => {
    const s = selfReviewAuditSnapshot({
      reviewStatus: "reviewed",
      managerRating: 4,
      managerFeedback: "Good",
      goalsNextPeriod: "More",
      reviewedAt: new Date("2026-04-05T12:00:00.000Z"),
      reviewedByUserId: 7,
    });
    expect(s.reviewedAt).toBe("2026-04-05T12:00:00.000Z");
    expect(s.reviewedByUserId).toBe(7);
  });
});
