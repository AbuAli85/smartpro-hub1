import type { PriorityItemExecutionView } from "./escalationTypes";
import type { ExecutiveCommitment } from "./commitmentTypes";
import type { ExecutiveDecisionPrompt } from "./decisionPromptTypes";
import type { DomainNarrativeSummary } from "./domainNarrativeTypes";
import type { ExecutiveReviewItem } from "./reviewTypes";

export interface OperatingBrief {
  timestamp: string;

  situationSummary: string;

  keyPressures: string[];

  leadershipFocus: string[];

  operatingCheckpoints: string[];

  reviewFocus: string[];

  outcomeSummary?: string | null;
  /** When variant shows outcome and trend separately (e.g. weekly) */
  trendSummary?: string | null;
}

export interface OperatingBriefInputs {
  priorityItems: PriorityItemExecutionView[];
  domainNarrativeSummaries: DomainNarrativeSummary[];
  executiveDecisionPrompts: ExecutiveDecisionPrompt[];
  executiveCommitments: ExecutiveCommitment[];
  executiveReviewItems: ExecutiveReviewItem[];
  outcomeSummaryLine: string | null;
  trendSummaryLine: string | null;
}
