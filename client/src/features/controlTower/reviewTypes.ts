import type { ActionQueueItemExecutionView, PriorityItemExecutionView } from "./escalationTypes";
import type { ControlTowerDomain, DomainNarrativeSummary } from "./domainNarrativeTypes";
import type { ControlTowerOutcomeSummary } from "./outcomeTypes";
import type { TrendComparison } from "./trendTypes";

export interface ExecutiveReviewItem {
  id: string;
  commitmentId: string;

  title: string;

  reviewQuestion: string;
  accountabilityCheck: string;
  reviewSignal: string;

  domain?: ControlTowerDomain;
  priority: "high" | "medium" | "low";
}

export interface ExecutiveReviewContext {
  queueItems: ActionQueueItemExecutionView[];
  priorityItems: PriorityItemExecutionView[];
  outcomeSummary?: ControlTowerOutcomeSummary | null;
  trendComparison?: TrendComparison | null;
  domainSummaries: DomainNarrativeSummary[];
}
