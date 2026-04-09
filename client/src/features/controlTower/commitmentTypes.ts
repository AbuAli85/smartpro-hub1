import type { ActionQueueItemExecutionView } from "./escalationTypes";
import type { PriorityItemExecutionView } from "./escalationTypes";
import type { ExecutiveDecisionPrompt } from "./decisionPromptTypes";
import type { ControlTowerDomain, DomainNarrativeSummary } from "./domainNarrativeTypes";
import type { ControlTowerOutcomeSummary } from "./outcomeTypes";
import type { TrendComparison } from "./trendTypes";

export type CommitmentHorizon =
  | "today"
  | "next_24h"
  | "next_48h"
  | "this_week"
  | "monitor";

export interface ExecutiveCommitment {
  id: string;
  decisionPromptId: string;
  title: string;
  checkpoint: string;
  horizon: CommitmentHorizon;
  successCriteria: string;
  domain?: ControlTowerDomain;
  href?: string | null;
  priority: "high" | "medium" | "low";
}

export interface ExecutiveCommitmentInputs {
  decisionPrompts: ExecutiveDecisionPrompt[];
  queueItems: ActionQueueItemExecutionView[];
  priorityItems: PriorityItemExecutionView[];
  domainSummaries: DomainNarrativeSummary[];
  outcomeSummary?: ControlTowerOutcomeSummary | null;
  trendComparison?: TrendComparison | null;
}
