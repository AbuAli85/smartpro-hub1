import { domainLabel } from "./decisionPromptCopy";
import type { ControlTowerDomain } from "./domainNarrativeTypes";
import type { ExecutiveCommitment } from "./commitmentTypes";

function phrase(d: ControlTowerDomain | undefined): string | null {
  if (!d || d === "general") return null;
  return domainLabel(d).toLowerCase();
}

export function buildReviewItemTitle(commitment: ExecutiveCommitment): string {
  switch (commitment.decisionType) {
    case "intervene_now":
      return "Breaches & escalations";
    case "review_ownership":
      return "Ownership coverage";
    case "push_clearance":
      return "Stale backlog clearance";
    case "stabilize_domain":
      return "Domain pressure";
    case "monitor_closely":
      return "Concentrated risk";
    default:
      return "Operating review";
  }
}

export function buildReviewQuestion(commitment: ExecutiveCommitment): string {
  const p = phrase(commitment.domain);
  switch (commitment.decisionType) {
    case "intervene_now":
      return p
        ? `Are breached and escalated ${p} items declining?`
        : `Are breached and escalated items declining?`;
    case "review_ownership":
      return p
        ? `Have high-risk ${p} items been assigned to clear owners?`
        : `Have high-risk items been assigned to clear owners?`;
    case "push_clearance":
      return `Is the stale backlog being cleared without new escalation?`;
    case "stabilize_domain":
      return p ? `Is ${p} pressure continuing to decline?` : `Is domain pressure continuing to decline?`;
    case "monitor_closely":
      return p ? `Is ${p} risk remaining stable or improving?` : `Is concentrated risk stable or improving?`;
    default:
      return `Are queue signals moving in the right direction?`;
  }
}

export function buildAccountabilityCheck(commitment: ExecutiveCommitment): string {
  const p = phrase(commitment.domain);
  switch (commitment.decisionType) {
    case "intervene_now":
      return p
        ? `Are all high-risk ${p} items assigned and actively progressing?`
        : `Are all high-risk items assigned and actively progressing?`;
    case "review_ownership":
      return `Are any unassigned high-risk items still aging?`;
    case "push_clearance":
      return `Are aging items moving out of the queue?`;
    case "stabilize_domain":
      return `Are remaining high-risk items progressing without delay?`;
    case "monitor_closely":
      return `Are owners maintaining progress on existing items?`;
    default:
      return `Are owners accountable for follow-through?`;
  }
}

export function buildReviewSignal(commitment: ExecutiveCommitment): string {
  const p = phrase(commitment.domain);
  switch (commitment.decisionType) {
    case "intervene_now":
      return p
        ? `No new breaches and fewer escalated ${p} items`
        : `No new breaches and fewer escalated items`;
    case "review_ownership":
      return `Ownership gaps reduced and no increase in unassigned risk`;
    case "push_clearance":
      return `Stale queue reduced and no new escalations`;
    case "stabilize_domain":
      return `No new breaches and continued reduction in high-risk items`;
    case "monitor_closely":
      return `No increase in escalation or breach signals`;
    default:
      return `Measurable queue risk signals stable or improving`;
  }
}
