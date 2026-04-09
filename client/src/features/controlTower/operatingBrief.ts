import { domainLabel } from "./decisionPromptCopy";
import { getTopPressureDomains, pressureScore } from "./domainNarrative";
import type { ExecutiveCommitment } from "./commitmentTypes";
import type { ExecutiveDecisionPrompt } from "./decisionPromptTypes";
import type { ControlTowerDomain, DomainNarrativeSummary } from "./domainNarrativeTypes";
import type { ExecutiveReviewItem } from "./reviewTypes";
import type { OperatingBrief, OperatingBriefInputs } from "./operatingBriefTypes";

function domainTitle(d: ControlTowerDomain): string {
  return domainLabel(d);
}

/**
 * One sentence: top pressure domain + escalation/breach context + improvement/worsening hint.
 */
export function buildSituationSummary(summaries: DomainNarrativeSummary[]): string {
  const tops = getTopPressureDomains(summaries, 1);
  const top = tops[0];
  if (!top || pressureScore(top) === 0) {
    return "Queue pressure is minimal in this scope based on current signals.";
  }

  const name = domainTitle(top.domain);
  if (top.domain === "general") {
    return "Operational pressure is most visible in general queue items, with mixed aging and attention signals.";
  }

  const worsening = top.breachesAdded > 0 || top.escalationsAdded > 0;
  const recovering =
    (top.breachesRecovered > 0 || top.escalationsCleared > 0) && !worsening;

  if (recovering && (top.breachedCount > 0 || top.escalatedCount > 0)) {
    return `Risk is stabilizing, with reduced escalations or breaches but continued pressure in ${name.toLowerCase()}.`;
  }
  if (recovering) {
    return `Risk is stabilizing in ${name.toLowerCase()}, with fewer escalations and breaches versus the prior snapshot.`;
  }
  if (worsening) {
    return `Operational pressure is concentrated in ${name.toLowerCase()}, with breached and escalated items increasing.`;
  }
  if (top.breachedCount > 0 && top.escalatedCount > 0) {
    return `Operational pressure is concentrated in ${name.toLowerCase()}, with both breached and escalated items requiring attention.`;
  }
  if (top.netChange != null && top.netChange < 0) {
    return `Operational pressure is concentrated in ${name.toLowerCase()}, with backlog shrinking but attention items remaining.`;
  }
  return `Operational pressure is concentrated in ${name.toLowerCase()}, with sustained workload and follow-through required.`;
}

function pressureLineForDomain(s: DomainNarrativeSummary): string | null {
  if (pressureScore(s) === 0) return null;
  const label = domainTitle(s.domain);

  if (s.breachedCount > 0 || s.escalatedCount > 0) {
    return `${label}: high concentration of breached and escalated items`;
  }
  if (s.ownershipGapsAdded > 0 || s.unassignedHighCount >= 2) {
    return `${label}: ownership gaps on high-risk items`;
  }
  if (s.stuckCount > 0) {
    return `${label}: stuck and aging items`;
  }
  if (s.currentCount > 0) {
    return `${label}: elevated queue load contributing to backlog`;
  }
  return `${label}: attention items present`;
}

/**
 * Up to 3 domain-first pressure lines from narrative + escalation signals.
 */
export function buildKeyPressures(summaries: DomainNarrativeSummary[]): string[] {
  const ranked = getTopPressureDomains(summaries, 6);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of ranked) {
    if (out.length >= 3) break;
    const line = pressureLineForDomain(s);
    if (!line) continue;
    const key = s.domain;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

/**
 * Leadership intervention titles from decision prompts (max 3, preserve order, deduped).
 */
export function buildLeadershipFocus(prompts: ExecutiveDecisionPrompt[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of prompts) {
    if (out.length >= 3) break;
    const t = p.title.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function shortCheckpoint(c: ExecutiveCommitment): string {
  const phrase =
    c.domain && c.domain !== "general" ? domainLabel(c.domain).toLowerCase() : null;
  switch (c.decisionType) {
    case "intervene_now":
      return phrase
        ? `Review highest-risk ${phrase} items with owners`
        : "Review highest-risk items with owners";
    case "review_ownership":
      return phrase
        ? `Assign owners to unresolved high-risk ${phrase} items`
        : "Assign owners to unresolved high-risk items";
    case "push_clearance":
      return "Clear aging queue items before escalation";
    case "stabilize_domain":
      return phrase
        ? `Maintain follow-through on ${phrase} until pressure eases`
        : "Maintain follow-through until pressure eases";
    case "monitor_closely":
      return phrase
        ? `Track progress on high-risk ${phrase} items`
        : "Track progress on high-risk items";
    default:
      return c.checkpoint.length > 80 ? `${c.checkpoint.slice(0, 77)}…` : c.checkpoint;
  }
}

/**
 * Short checkpoint lines from commitments (max 3).
 */
export function buildOperatingCheckpoints(commitments: ExecutiveCommitment[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of commitments) {
    if (out.length >= 3) break;
    const line = shortCheckpoint(c);
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}

/**
 * Review lens lines from review items (max 3).
 */
export function buildReviewFocus(items: ExecutiveReviewItem[]): string[] {
  return items.slice(0, 3).map((i) => i.reviewQuestion.trim());
}

export function pickOutcomeSummaryLine(outcomeLine: string | null, trendLine: string | null): string | null {
  if (outcomeLine && outcomeLine.trim().length > 0) return outcomeLine.trim();
  if (trendLine && trendLine.trim().length > 0) return trendLine.trim();
  return null;
}

export function buildOperatingBrief(inputs: OperatingBriefInputs): OperatingBrief {
  const {
    domainNarrativeSummaries,
    executiveDecisionPrompts,
    executiveCommitments,
    executiveReviewItems,
    outcomeSummaryLine,
    trendSummaryLine,
  } = inputs;

  return {
    timestamp: new Date().toISOString(),
    situationSummary: buildSituationSummary(domainNarrativeSummaries),
    keyPressures: buildKeyPressures(domainNarrativeSummaries),
    leadershipFocus: buildLeadershipFocus(executiveDecisionPrompts),
    operatingCheckpoints: buildOperatingCheckpoints(executiveCommitments),
    reviewFocus: buildReviewFocus(executiveReviewItems),
    outcomeSummary: pickOutcomeSummaryLine(outcomeSummaryLine, trendSummaryLine),
  };
}

export function formatOperatingBriefText(brief: OperatingBrief): string {
  const lines: string[] = [];
  lines.push("Situation:");
  lines.push(brief.situationSummary);
  lines.push("");
  lines.push("Key pressures:");
  if (brief.keyPressures.length === 0) {
    lines.push("- (none listed)");
  } else {
    for (const k of brief.keyPressures) {
      lines.push(`- ${k}`);
    }
  }
  lines.push("");
  lines.push("Leadership focus:");
  if (brief.leadershipFocus.length === 0) {
    lines.push("- (none listed)");
  } else {
    for (const k of brief.leadershipFocus) {
      lines.push(`- ${k}`);
    }
  }
  lines.push("");
  lines.push("Checkpoints:");
  if (brief.operatingCheckpoints.length === 0) {
    lines.push("- (none listed)");
  } else {
    for (const k of brief.operatingCheckpoints) {
      lines.push(`- ${k}`);
    }
  }
  lines.push("");
  lines.push("Review focus:");
  if (brief.reviewFocus.length === 0) {
    lines.push("- (none listed)");
  } else {
    for (const k of brief.reviewFocus) {
      lines.push(`- ${k}`);
    }
  }
  if (brief.outcomeSummary) {
    lines.push("");
    lines.push("Outcome:");
    lines.push(brief.outcomeSummary);
  }
  return lines.join("\n");
}
