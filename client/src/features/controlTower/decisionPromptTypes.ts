import type { ActionQueueItemExecutionView } from "./escalationTypes";
import type { PriorityItemExecutionView } from "./escalationTypes";
import type { ControlTowerDomain, DomainNarrativeSummary } from "./domainNarrativeTypes";
import type { ControlTowerOutcomeSummary } from "./outcomeTypes";
import type { TrendComparison } from "./trendTypes";

export type ExecutiveDecisionType =
  | "intervene_now"
  | "review_ownership"
  | "push_clearance"
  | "stabilize_domain"
  | "monitor_closely";

export interface ExecutiveDecisionPrompt {
  id: string;
  type: ExecutiveDecisionType;
  title: string;
  rationale: string;
  recommendedMove: string;
  priority: "high" | "medium" | "low";
  domain?: ControlTowerDomain;
  href?: string | null;
}

export interface ExecutiveDecisionInputs {
  queueItems: ActionQueueItemExecutionView[];
  priorityItems: PriorityItemExecutionView[];
  domainSummaries: DomainNarrativeSummary[];
  outcomeSummary: ControlTowerOutcomeSummary | null;
  trendComparison: TrendComparison | null;
  outcomeComparable: boolean;
  domainBaseline: boolean;
}
