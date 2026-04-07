import { describe, expect, it } from "vitest";
import { mergeReviewWithInterventions } from "./universalPerformanceSignal";

describe("mergeReviewWithInterventions", () => {
  it("keeps under_review when self-review pending", () => {
    expect(
      mergeReviewWithInterventions("under_review", { activeCount: 1, hasEscalated: false, nextFollowUpAt: null })
    ).toBe("under_review");
  });

  it("escalates when intervention is escalated", () => {
    expect(
      mergeReviewWithInterventions("none", { activeCount: 1, hasEscalated: true, nextFollowUpAt: null })
    ).toBe("escalated");
  });

  it("sets recovery when open intervention and no stronger state", () => {
    expect(
      mergeReviewWithInterventions("none", { activeCount: 2, hasEscalated: false, nextFollowUpAt: "2026-04-10" })
    ).toBe("recovery_active");
  });
});
