import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  assertSelfReviewManagerUpdateAllowed,
  assertTrainingStatusTransition,
} from "./hrPerformanceGuards";

describe("assertTrainingStatusTransition", () => {
  it("allows assigned → in_progress", () => {
    expect(() => assertTrainingStatusTransition("assigned", "in_progress")).not.toThrow();
  });
  it("blocks assigned → completed (must go through in_progress or overdue)", () => {
    expect(() => assertTrainingStatusTransition("assigned", "completed")).toThrow(TRPCError);
  });
  it("allows overdue → in_progress", () => {
    expect(() => assertTrainingStatusTransition("overdue", "in_progress")).not.toThrow();
  });
  it("blocks in_progress → assigned (P7)", () => {
    expect(() => assertTrainingStatusTransition("in_progress", "assigned")).toThrow(TRPCError);
  });
  it("blocks completed → any status change (P7)", () => {
    expect(() => assertTrainingStatusTransition("completed", "in_progress")).toThrow(TRPCError);
  });
});

describe("assertSelfReviewManagerUpdateAllowed", () => {
  it("blocks updates when acknowledged (closed)", () => {
    expect(() =>
      assertSelfReviewManagerUpdateAllowed(
        { reviewStatus: "acknowledged", managerRating: 3 },
        { managerFeedback: "x" }
      )
    ).toThrow(TRPCError);
  });
  it("requires content when transitioning to reviewed (P5)", () => {
    expect(() =>
      assertSelfReviewManagerUpdateAllowed({ reviewStatus: "submitted" }, { reviewStatus: "reviewed" })
    ).toThrow(TRPCError);
  });
  it("allows reviewed transition with manager rating", () => {
    const r = assertSelfReviewManagerUpdateAllowed(
      { reviewStatus: "submitted" },
      { reviewStatus: "reviewed", managerRating: 4 }
    );
    expect(r.transitioningToReviewed).toBe(true);
  });
  it("does not treat already-reviewed as transitioningToReviewed", () => {
    const r = assertSelfReviewManagerUpdateAllowed(
      { reviewStatus: "reviewed", managerRating: 4 },
      { managerFeedback: "more detail" }
    );
    expect(r.transitioningToReviewed).toBe(false);
  });
});
