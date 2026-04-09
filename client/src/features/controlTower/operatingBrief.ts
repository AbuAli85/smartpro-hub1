import { domainLabel } from "./decisionPromptCopy";
import { getBriefExportTitle, getBriefVariantConfig, type BriefVariantConfig } from "./briefVariantConfig";
import type { OperatingBriefVariant } from "./briefVariants";
import { getTopPressureDomains, pressureScore } from "./domainNarrative";
import type { ExecutiveCommitment } from "./commitmentTypes";
import type { ExecutiveDecisionPrompt } from "./decisionPromptTypes";
import type { ControlTowerDomain, DomainNarrativeSummary } from "./domainNarrativeTypes";
import type { ExecutiveReviewItem } from "./reviewTypes";
import type { OperatingBrief, OperatingBriefInputs } from "./operatingBriefTypes";

function domainTitle(d: ControlTowerDomain): string {
  return domainLabel(d);
}

function buildSituationOperational(summaries: DomainNarrativeSummary[]): string {
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

function buildSituationSummaryStyle(summaries: DomainNarrativeSummary[]): string {
  const tops = getTopPressureDomains(summaries, 1);
  const top = tops[0];
  if (!top || pressureScore(top) === 0) {
    return "This period shows limited queue pressure in this scope based on current signals.";
  }

  const name = domainTitle(top.domain);
  if (top.domain === "general") {
    return "This period shows mixed attention signals in general queue items, with aging and follow-through still relevant.";
  }

  const worsening = top.breachesAdded > 0 || top.escalationsAdded > 0;
  const recovering =
    (top.breachesRecovered > 0 || top.escalationsCleared > 0) && !worsening;

  if (recovering && (top.breachedCount > 0 || top.escalatedCount > 0)) {
    return `This period shows stabilizing risk with reduced escalations or breaches, while ${name.toLowerCase()} remains an active focus.`;
  }
  if (recovering) {
    return `This period shows improving resolution signals in ${name.toLowerCase()}, with fewer breaches and escalations than the prior snapshot.`;
  }
  if (worsening) {
    return `This period shows continued pressure in ${name.toLowerCase()}, with breach and escalation signals rising versus the prior snapshot.`;
  }
  if (top.breachedCount > 0 && top.escalatedCount > 0) {
    return `This period shows sustained concentration in ${name.toLowerCase()}, with both breach and escalation workloads in play.`;
  }
  if (top.netChange != null && top.netChange < 0) {
    return `This period shows backlog contraction in ${name.toLowerCase()}, with residual attention items still open.`;
  }
  return `This period shows continued operational load in ${name.toLowerCase()}, with follow-through still required.`;
}

/**
 * One sentence: top pressure domain + escalation/breach context + improvement/worsening hint.
 */
export function buildSituationSummary(
  summaries: DomainNarrativeSummary[],
  situationStyle: "operational" | "summary" = "operational",
): string {
  return situationStyle === "summary" ? buildSituationSummaryStyle(summaries) : buildSituationOperational(summaries);
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
 * Up to `max` domain-first pressure lines from narrative + escalation signals.
 */
export function buildKeyPressures(summaries: DomainNarrativeSummary[], max = 3): string[] {
  const ranked = getTopPressureDomains(summaries, 6);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of ranked) {
    if (out.length >= max) break;
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
 * Leadership intervention titles from decision prompts (deduped).
 */
export function buildLeadershipFocus(prompts: ExecutiveDecisionPrompt[], max = 3): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of prompts) {
    if (out.length >= max) break;
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
 * Short checkpoint lines from commitments.
 */
export function buildOperatingCheckpoints(commitments: ExecutiveCommitment[], max = 3): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of commitments) {
    if (out.length >= max) break;
    const line = shortCheckpoint(c);
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}

/**
 * Review lens lines from review items.
 */
export function buildReviewFocus(items: ExecutiveReviewItem[], max = 3): string[] {
  return items.slice(0, max).map((i) => i.reviewQuestion.trim());
}

export function pickOutcomeSummaryLine(
  outcomeLine: string | null,
  trendLine: string | null,
  variant: OperatingBriefVariant = "daily",
): string | null {
  const o = outcomeLine?.trim() || null;
  const t = trendLine?.trim() || null;

  if (variant === "board") {
    if (t) return t;
    return o;
  }
  if (variant === "daily") {
    if (o) return o;
    return t ?? null;
  }
  if (variant === "weekly" || variant === "leadership") {
    if (o && t) return `${o} · ${t}`;
    return o ?? t ?? null;
  }
  return o ?? t ?? null;
}

function resolveOutcomeTrendFields(
  outcomeLine: string | null,
  trendLine: string | null,
  variant: OperatingBriefVariant,
  config: BriefVariantConfig,
): { outcomeSummary: string | null; trendSummary: string | null } {
  const o = outcomeLine?.trim() || null;
  const t = trendLine?.trim() || null;

  if (variant === "daily") {
    const line = config.includeOutcome ? pickOutcomeSummaryLine(outcomeLine, trendLine, "daily") : null;
    return {
      outcomeSummary: line,
      trendSummary: null,
    };
  }

  if (variant === "board") {
    if (config.includeTrend && t) {
      return {
        outcomeSummary: t,
        trendSummary: config.includeOutcome && o ? o : null,
      };
    }
    return {
      outcomeSummary: config.includeOutcome ? o : null,
      trendSummary: null,
    };
  }

  if (config.includeOutcome && config.includeTrend) {
    return { outcomeSummary: o, trendSummary: t };
  }
  if (config.includeOutcome && !config.includeTrend) {
    return { outcomeSummary: o, trendSummary: null };
  }
  if (!config.includeOutcome && config.includeTrend) {
    return { outcomeSummary: null, trendSummary: t };
  }
  return { outcomeSummary: null, trendSummary: null };
}

export function buildOperatingBriefWithVariant(
  inputs: OperatingBriefInputs,
  variant: OperatingBriefVariant,
): OperatingBrief {
  const config = getBriefVariantConfig(variant);
  const {
    domainNarrativeSummaries,
    executiveDecisionPrompts,
    executiveCommitments,
    executiveReviewItems,
    outcomeSummaryLine,
    trendSummaryLine,
  } = inputs;

  const { outcomeSummary, trendSummary } = resolveOutcomeTrendFields(
    outcomeSummaryLine,
    trendSummaryLine,
    variant,
    config,
  );

  return {
    timestamp: new Date().toISOString(),
    situationSummary: buildSituationSummary(domainNarrativeSummaries, config.situationStyle),
    keyPressures: buildKeyPressures(domainNarrativeSummaries, config.maxKeyPressures),
    leadershipFocus: buildLeadershipFocus(executiveDecisionPrompts, config.maxLeadershipFocus),
    operatingCheckpoints: buildOperatingCheckpoints(executiveCommitments, config.maxCheckpoints),
    reviewFocus: buildReviewFocus(executiveReviewItems, config.maxReviewFocus),
    outcomeSummary,
    trendSummary: trendSummary ?? null,
  };
}

export function buildOperatingBrief(inputs: OperatingBriefInputs): OperatingBrief {
  return buildOperatingBriefWithVariant(inputs, "daily");
}

export function formatOperatingBriefText(brief: OperatingBrief, variant: OperatingBriefVariant = "daily"): string {
  const lines: string[] = [];
  lines.push(getBriefExportTitle(variant));
  lines.push("");
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
  if (variant === "board" && brief.outcomeSummary && brief.trendSummary) {
    lines.push("");
    lines.push("Trend:");
    lines.push(brief.outcomeSummary);
    lines.push("");
    lines.push("Outcome:");
    lines.push(brief.trendSummary);
  } else {
    if (brief.outcomeSummary) {
      lines.push("");
      lines.push("Outcome:");
      lines.push(brief.outcomeSummary);
    }
    if (brief.trendSummary) {
      lines.push("");
      lines.push("Trend:");
      lines.push(brief.trendSummary);
    }
  }
  return lines.join("\n");
}
