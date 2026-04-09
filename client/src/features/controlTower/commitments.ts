import {
  buildCheckpoint,
  buildCommitmentTitle,
  buildSuccessCriteria,
  resolveReviewOwnershipHorizon,
} from "./commitmentCopy";
import { getCommitmentPriorityRank } from "./commitmentHorizon";
import type { CommitmentHorizon } from "./commitmentTypes";
import type { ExecutiveCommitment, ExecutiveCommitmentInputs } from "./commitmentTypes";
import type { ExecutiveDecisionPrompt } from "./decisionPromptTypes";

function horizonForPrompt(prompt: ExecutiveDecisionPrompt, inputs: ExecutiveCommitmentInputs): CommitmentHorizon {
  switch (prompt.type) {
    case "intervene_now":
      return "today";
    case "review_ownership":
      return resolveReviewOwnershipHorizon(inputs.domainSummaries);
    case "push_clearance":
      return "next_48h";
    case "stabilize_domain":
      return "this_week";
    case "monitor_closely":
      return "monitor";
    default:
      return "this_week";
  }
}

/**
 * One operating commitment per executive decision prompt (max 3), rule-based checkpoints and success criteria.
 */
export function buildExecutiveCommitments(inputs: ExecutiveCommitmentInputs): ExecutiveCommitment[] {
  const { decisionPrompts } = inputs;
  if (decisionPrompts.length === 0) return [];

  const ctx = {
    domainSummaries: inputs.domainSummaries,
  };

  const seen = new Set<string>();
  const rows: ExecutiveCommitment[] = [];

  for (const prompt of decisionPrompts) {
    if (seen.has(prompt.id)) continue;
    seen.add(prompt.id);

    const horizon = horizonForPrompt(prompt, inputs);
    rows.push({
      id: `commit-${prompt.id}`,
      decisionPromptId: prompt.id,
      decisionType: prompt.type,
      title: buildCommitmentTitle(prompt),
      checkpoint: buildCheckpoint(prompt),
      horizon,
      successCriteria: buildSuccessCriteria(prompt, ctx),
      domain: prompt.domain,
      href: prompt.href ?? null,
      priority: prompt.priority,
    });
  }

  rows.sort(
    (a, b) =>
      getCommitmentPriorityRank(a.priority, a.horizon) - getCommitmentPriorityRank(b.priority, b.horizon),
  );

  return rows.slice(0, 3);
}
