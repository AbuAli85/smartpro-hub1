import type { UnderperformanceAssessment } from "./underperformanceDetection";
import type { PerformanceStatus } from "./underperformanceDetection";

export type TrendLabel = "improving" | "stable" | "declining";

export type ReviewState = "none" | "under_review" | "recovery_active" | "escalated";

export type InterventionSignalContext = {
  /** Open or escalated (active) rows */
  activeCount: number;
  hasEscalated: boolean;
  /** Earliest upcoming follow-up (ISO date) */
  nextFollowUpAt: string | null;
};

/**
 * Single user-facing performance snapshot — capped lists, stable labels.
 * All roles share this shape; inputs differ behind the scenes.
 */
export type UniversalPerformanceSignal = {
  status: PerformanceStatus;
  /** Short label for UI chips */
  statusLabel: string;
  /** Top 2–4 human-readable reasons (why this status) */
  keyReasons: string[];
  /** Top 2–4 suggested next steps (manager or self) */
  topPriorities: string[];
  trend: TrendLabel;
  reviewState: ReviewState;
  /** 0–100 heuristic, optional display */
  compositeScore: number;
  /** When manager follow-up is scheduled */
  interventionFollowUpAt: string | null;
};

const STATUS_LABEL: Record<PerformanceStatus, string> = {
  on_track: "On track",
  watch: "Watch",
  at_risk: "At risk",
  critical: "Critical",
};

function cap<T>(arr: T[], n: number): T[] {
  return arr.slice(0, n);
}

/**
 * Map internal task trend to user-facing "stable" instead of "flat".
 */
export function toTrendLabel(internal: "improving" | "flat" | "declining"): TrendLabel {
  if (internal === "flat") return "stable";
  return internal;
}

/**
 * Review state is lightweight — derived from performance status + self-review pipeline.
 */
export function deriveReviewState(
  assessment: UnderperformanceAssessment,
  lastSelfReviewStatus: string | null
): ReviewState {
  if (assessment.status === "critical") return "escalated";
  if (lastSelfReviewStatus === "submitted") return "under_review";
  if (assessment.status === "at_risk" || assessment.status === "watch") return "recovery_active";
  return "none";
}

/**
 * Active manager interventions tune review state (without exposing raw counts in the label).
 */
export function mergeReviewWithInterventions(
  base: ReviewState,
  inv: InterventionSignalContext | null | undefined
): ReviewState {
  if (!inv || inv.activeCount === 0) return base;
  if (inv.hasEscalated) return "escalated";
  if (base === "under_review") return "under_review";
  return "recovery_active";
}

/**
 * Build the universal signal from existing assessment + score (single choke point for UI).
 */
export function buildUniversalPerformanceSignal(
  assessment: UnderperformanceAssessment,
  compositeScore: number,
  taskTrend: "improving" | "flat" | "declining",
  lastSelfReviewStatus: string | null,
  intervention?: InterventionSignalContext | null
): UniversalPerformanceSignal {
  const keyReasons = cap(assessment.reasons, 3);
  const topPriorities = cap(assessment.recommendedManagerActions, 3);
  let reviewState = deriveReviewState(assessment, lastSelfReviewStatus);
  reviewState = mergeReviewWithInterventions(reviewState, intervention ?? null);
  return {
    status: assessment.status,
    statusLabel: STATUS_LABEL[assessment.status],
    keyReasons,
    topPriorities,
    trend: toTrendLabel(taskTrend),
    reviewState,
    compositeScore,
    interventionFollowUpAt: intervention?.nextFollowUpAt ?? null,
  };
}
