import { TRPCError } from "@trpc/server";

export type TrainingStatus = "assigned" | "in_progress" | "completed" | "overdue";

/**
 * Allowed transitions (PR-1 minimal guard). Same-state updates are no-ops.
 * completed is terminal for status changes (score/certificate may still update without status).
 */
export function assertTrainingStatusTransition(from: TrainingStatus, to: TrainingStatus): void {
  if (from === to) return;
  if (from === "completed") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Cannot change status of completed training",
    });
  }
  const allowed: Record<TrainingStatus, TrainingStatus[]> = {
    assigned: ["in_progress", "completed", "overdue"],
    in_progress: ["completed", "overdue"],
    overdue: ["in_progress", "completed"],
    completed: [],
  };
  const list = allowed[from];
  if (!list.includes(to)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid training status transition: ${from} → ${to}`,
    });
  }
}

export type SelfReviewRow = {
  reviewStatus: string;
  managerRating?: number | null;
  managerFeedback?: string | null;
};

export type SelfReviewPatch = {
  reviewStatus?: string;
  managerRating?: number;
  managerFeedback?: string;
  goalsNextPeriod?: string;
};

/**
 * Blocks mutations on closed reviews; enforces content when transitioning to reviewed.
 */
export function assertSelfReviewManagerUpdateAllowed(
  row: SelfReviewRow,
  input: SelfReviewPatch
): { transitioningToReviewed: boolean } {
  if (row.reviewStatus === "acknowledged") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Self-review is closed and cannot be modified",
    });
  }

  const effectiveNext = input.reviewStatus ?? row.reviewStatus;
  const transitioningToReviewed = effectiveNext === "reviewed" && row.reviewStatus !== "reviewed";

  if (transitioningToReviewed) {
    const rating = input.managerRating ?? row.managerRating;
    const feedback = (input.managerFeedback ?? row.managerFeedback ?? "").trim();
    const hasRating = rating != null && !Number.isNaN(Number(rating));
    const hasFeedback = feedback.length > 0;
    if (!hasRating && !hasFeedback) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Manager rating or feedback is required to mark reviewed",
      });
    }
  }

  return { transitioningToReviewed };
}
