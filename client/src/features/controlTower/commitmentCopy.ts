import { domainLabel } from "./decisionPromptCopy";
import type { ControlTowerDomain } from "./domainNarrativeTypes";
import type { ExecutiveDecisionPrompt } from "./decisionPromptTypes";
import type { DomainNarrativeSummary } from "./domainNarrativeTypes";
import type { CommitmentHorizon } from "./commitmentTypes";

function domainPhrase(d: ControlTowerDomain | undefined): string | null {
  if (!d || d === "general") return null;
  return domainLabel(d).toLowerCase();
}

export function buildCommitmentTitle(prompt: ExecutiveDecisionPrompt): string {
  const phrase = domainPhrase(prompt.domain);
  switch (prompt.type) {
    case "intervene_now":
      return phrase ? `Address ${phrase} breach and escalation load` : "Address breach and escalation load";
    case "review_ownership":
      return phrase ? `Close ownership gaps in ${phrase}` : "Close ownership gaps on high-risk items";
    case "push_clearance":
      return "Clear aging queue before escalation";
    case "stabilize_domain":
      return phrase ? `Stabilize ${phrase} until pressure normalizes` : "Stabilize domain until pressure normalizes";
    case "monitor_closely":
      return phrase ? `Sustain ${phrase} oversight` : "Sustain oversight on concentrated risk";
    default:
      return prompt.title;
  }
}

export function buildCheckpoint(prompt: ExecutiveDecisionPrompt): string {
  const phrase = domainPhrase(prompt.domain);
  switch (prompt.type) {
    case "intervene_now":
      return phrase
        ? `Review the highest-risk ${phrase} items with owners and confirm immediate follow-through.`
        : `Review the highest-risk items with owners and confirm immediate follow-through.`;
    case "review_ownership":
      return phrase
        ? `Assign clear owners to unresolved high-risk ${phrase} items.`
        : `Assign clear owners to unresolved high-risk items.`;
    case "push_clearance":
      return "Clear aging queue items before they move into escalation.";
    case "stabilize_domain":
      return phrase
        ? `Maintain follow-through on remaining high-risk ${phrase} items until pressure normalizes.`
        : `Maintain follow-through on remaining high-risk items until pressure normalizes.`;
    case "monitor_closely":
      return phrase
        ? `Track remaining high-risk ${phrase} items and verify owners are progressing them.`
        : `Track remaining high-risk items and verify owners are progressing them.`;
    default:
      return prompt.recommendedMove;
  }
}

export type SuccessCriteriaContext = {
  domainSummaries: DomainNarrativeSummary[];
};

export function buildSuccessCriteria(prompt: ExecutiveDecisionPrompt, _ctx: SuccessCriteriaContext): string {
  const phrase = domainPhrase(prompt.domain);
  switch (prompt.type) {
    case "intervene_now":
      return phrase
        ? `Escalated and breached ${phrase} items begin to decline.`
        : `Escalated and breached items begin to decline.`;
    case "review_ownership":
      return phrase
        ? `Ownership gaps reduce and high-risk unassigned ${phrase} items stop increasing.`
        : `Ownership gaps reduce and high-risk unassigned items stop increasing.`;
    case "push_clearance":
      return "Stale backlog reduces and queue pressure does not rise.";
    case "stabilize_domain":
      return phrase
        ? `High-risk ${phrase} pressure continues to fall without new breaches.`
        : `High-risk pressure continues to fall without new breaches.`;
    case "monitor_closely":
      if (prompt.domain && prompt.domain !== "general") {
        return `${domainLabel(prompt.domain)} pressure remains stable or improves without new escalations.`;
      }
      return `Pressure remains stable or improves without new escalations.`;
    default:
      return "Measurable queue risk signals improve on the next snapshot.";
  }
}

/**
 * Ownership concentration: heavy unassigned load → next 24h; otherwise this week.
 */
export function resolveReviewOwnershipHorizon(summaries: DomainNarrativeSummary[]): CommitmentHorizon {
  const maxUnassigned = summaries.reduce((m, s) => Math.max(m, s.unassignedHighCount), 0);
  if (maxUnassigned >= 3) return "next_24h";
  return "this_week";
}
