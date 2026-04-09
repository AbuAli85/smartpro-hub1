import type { CommitmentHorizon } from "./commitmentTypes";

const LABEL: Record<CommitmentHorizon, string> = {
  today: "Today",
  next_24h: "Next 24h",
  next_48h: "Next 48h",
  this_week: "This week",
  monitor: "Monitor",
};

const HORIZON_URGENCY: Record<CommitmentHorizon, number> = {
  today: 0,
  next_24h: 1,
  next_48h: 2,
  this_week: 3,
  monitor: 4,
};

const PRIORITY_RANK: Record<"high" | "medium" | "low", number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function getCommitmentHorizonLabel(horizon: CommitmentHorizon): string {
  return LABEL[horizon];
}

/**
 * Lower = sort first (more urgent). Uses decision priority, then horizon cadence.
 */
export function getCommitmentPriorityRank(priority: "high" | "medium" | "low", horizon: CommitmentHorizon): number {
  return PRIORITY_RANK[priority] * 10 + HORIZON_URGENCY[horizon];
}
