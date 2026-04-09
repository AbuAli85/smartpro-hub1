import { getControlTowerDomain } from "./domainMapper";
import { getTopPressureDomains, pressureScore } from "./domainNarrative";
import { getDecisionPromptHref } from "./decisionLinks";
import { domainLabel } from "./decisionPromptCopy";
import type { ControlTowerDomain, DomainNarrativeSummary } from "./domainNarrativeTypes";
import type { ExecutiveDecisionInputs, ExecutiveDecisionPrompt, ExecutiveDecisionType } from "./decisionPromptTypes";
import { getPriorityLevelForItem } from "./priorityEngine";
import { getDelta } from "./trend";
import type { ControlTowerOutcomeSummary } from "./outcomeTypes";

const TYPE_RANK: Record<ExecutiveDecisionType, number> = {
  intervene_now: 0,
  review_ownership: 1,
  push_clearance: 2,
  stabilize_domain: 3,
  monitor_closely: 4,
};

const PRI_RANK: Record<ExecutiveDecisionPrompt["priority"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function zeroOutcome(): ControlTowerOutcomeSummary {
  return {
    newItemsCount: 0,
    resolvedItemsCount: 0,
    escalationsClearedCount: 0,
    escalationsAddedCount: 0,
    breachesRecoveredCount: 0,
    breachesAddedCount: 0,
    ownershipGapsClosedCount: 0,
    ownershipGapsAddedCount: 0,
  };
}

function nonGeneralTop(summaries: DomainNarrativeSummary[]): DomainNarrativeSummary | null {
  const tops = getTopPressureDomains(summaries, 3);
  return tops.find((s) => s.domain !== "general") ?? tops[0] ?? null;
}

function domainBreachedAndEscalated(summaries: DomainNarrativeSummary[]): ControlTowerDomain | null {
  for (const s of summaries) {
    if (s.domain === "general") continue;
    if (s.breachedCount >= 1 && s.escalatedCount >= 1) return s.domain;
  }
  return null;
}

function criticalBlockingStuck(
  queueItems: ExecutiveDecisionInputs["queueItems"],
): { hit: boolean; domain: ControlTowerDomain | null } {
  for (const i of queueItems) {
    const critical = getPriorityLevelForItem(i) === "critical";
    const stale = i.execution.agingLevel === "stale" || i.execution.stuck;
    if (critical && i.blocking && stale) {
      return { hit: true, domain: getControlTowerDomain(i) };
    }
  }
  return { hit: false, domain: null };
}

function criticalUnassigned(
  queueItems: ExecutiveDecisionInputs["queueItems"],
  priorityItems: ExecutiveDecisionInputs["priorityItems"],
): { hit: boolean; domain: ControlTowerDomain | null } {
  for (const p of priorityItems) {
    if (p.priorityLevel === "critical" && p.execution.needsOwner) {
      return { hit: true, domain: getControlTowerDomain(p) };
    }
  }
  for (const i of queueItems) {
    if (getPriorityLevelForItem(i) === "critical" && i.execution.needsOwner) {
      return { hit: true, domain: getControlTowerDomain(i) };
    }
  }
  return { hit: false, domain: null };
}

function risingPressureInTopDomain(
  summaries: DomainNarrativeSummary[],
  domainBaseline: boolean,
): ControlTowerDomain | null {
  if (!domainBaseline) return null;
  const top = nonGeneralTop(summaries);
  if (!top) return null;
  if (top.breachesAdded >= 1 || top.escalationsAdded >= 1) return top.domain;
  return null;
}

/**
 * Rule-based executive decision prompts (max 3), sorted by leadership relevance.
 */
export function buildExecutiveDecisionPrompts(inputs: ExecutiveDecisionInputs): ExecutiveDecisionPrompt[] {
  const {
    queueItems,
    priorityItems,
    domainSummaries: summaries,
    outcomeSummary: rawOutcome,
    trendComparison,
    outcomeComparable,
    domainBaseline,
  } = inputs;

  const outcome = rawOutcome ?? zeroOutcome();
  const current = trendComparison?.current ?? null;
  const previous = trendComparison?.previous ?? null;

  const totalDelta =
    current && previous ? getDelta(current, previous, "totalItems") : null;
  const backlogNotWorsening = totalDelta === null || totalDelta <= 0;

  const stuckInQueue = queueItems.filter((i) => i.execution.stuck).length;
  const staleInQueue = queueItems.filter((i) => i.execution.agingLevel === "stale").length;
  const stuckSignal = stuckInQueue + staleInQueue > 0 || summaries.reduce((a, s) => a + s.stuckCount, 0) > 0;

  const meaningfulSurface =
    queueItems.length > 0 ||
    summaries.some((s) => s.currentCount > 0 || pressureScore(s) > 0);

  if (!meaningfulSurface) return [];

  const candidates: ExecutiveDecisionPrompt[] = [];

  // —— INTERVENE NOW ——
  const dBreachedEsc = domainBreachedAndEscalated(summaries);
  const dRising = risingPressureInTopDomain(summaries, domainBaseline);
  const stuckCrit = criticalBlockingStuck(queueItems);
  const unassignedCrit = criticalUnassigned(queueItems, priorityItems);

  const interveneDomain: ControlTowerDomain | null =
    dBreachedEsc ??
    dRising ??
    stuckCrit.domain ??
    unassignedCrit.domain ??
    null;

  const intervene =
    dBreachedEsc != null ||
    dRising != null ||
    stuckCrit.hit ||
    unassignedCrit.hit;

  if (intervene && interveneDomain) {
    let rationale: string;
    if (dBreachedEsc != null && dBreachedEsc === interveneDomain) {
      rationale = `Breached and escalated items are concentrated in ${domainLabel(interveneDomain).toLowerCase()}.`;
    } else if (dRising != null && dRising === interveneDomain) {
      rationale = `Breached and escalated items are rising in ${domainLabel(interveneDomain).toLowerCase()}.`;
    } else if (stuckCrit.hit) {
      rationale = `High-severity blocking items are stale or stuck in ${domainLabel(interveneDomain).toLowerCase()}.`;
    } else if (unassignedCrit.hit) {
      rationale = `Critical items in ${domainLabel(interveneDomain).toLowerCase()} are unassigned or lack follow-through.`;
    } else {
      rationale = `Risk signals in ${domainLabel(interveneDomain).toLowerCase()} require immediate leadership attention.`;
    }
    const title =
      interveneDomain === "general"
        ? "Intervene on critical queue risk"
        : `Intervene in ${domainLabel(interveneDomain).toLowerCase()} risk`;
    candidates.push(
      finalize(
        "intervene_now",
        interveneDomain,
        title,
        rationale,
        `Review the highest-risk ${domainLabel(interveneDomain).toLowerCase()} items and assign immediate follow-through.`,
        "high",
      ),
    );
  }

  // —— REVIEW OWNERSHIP ——
  const top = nonGeneralTop(summaries);
  const ownershipFromOutcome = outcomeComparable && outcome.ownershipGapsAddedCount >= 1;
  const topUnassignedHeavy = top != null && top.unassignedHighCount >= 2;
  const domainOwnershipRise = domainBaseline && summaries.some((s) => s.domain !== "general" && s.ownershipGapsAdded >= 1);
  const ownershipDomain: ControlTowerDomain | null = ownershipFromOutcome || topUnassignedHeavy || domainOwnershipRise
    ? (() => {
        if (topUnassignedHeavy && top) return top.domain;
        const byAdded = summaries
          .filter((s) => s.domain !== "general" && s.ownershipGapsAdded >= 1)
          .sort((a, b) => b.ownershipGapsAdded - a.ownershipGapsAdded);
        if (byAdded.length) return byAdded[0].domain;
        if (top) return top.domain;
        if (ownershipFromOutcome || domainOwnershipRise) return nonGeneralTop(summaries)?.domain ?? "general";
        return null;
      })()
    : null;

  const reviewOwnership = ownershipFromOutcome || topUnassignedHeavy || domainOwnershipRise;

  if (reviewOwnership && ownershipDomain) {
    candidates.push(
      finalize(
        "review_ownership",
        ownershipDomain,
        ownershipDomain === "general"
          ? "Review ownership across the queue"
          : `Review ${domainLabel(ownershipDomain).toLowerCase()} ownership`,
        topUnassignedHeavy
          ? `High-risk ${domainLabel(ownershipDomain).toLowerCase()} items are unassigned or lack follow-through.`
          : ownershipFromOutcome || domainOwnershipRise
            ? `Ownership gaps were added in ${domainLabel(ownershipDomain).toLowerCase()} or remain unresolved.`
            : `High-risk ${domainLabel(ownershipDomain).toLowerCase()} items need clear owners.`,
        `Assign clear owners and review unresolved items nearing breach.`,
        "high",
      ),
    );
  }

  // —— PUSH CLEARANCE ——
  const limitedClearance =
    outcomeComparable &&
    outcome.newItemsCount > outcome.resolvedItemsCount &&
    queueItems.length > 0 &&
    stuckSignal;
  const pushClearance =
    (backlogNotWorsening && stuckSignal && !intervene) ||
    (limitedClearance && !intervene) ||
    (backlogNotWorsening &&
      priorityItems.length > 0 &&
      queueItems.length > 0 &&
      totalDelta === 0 &&
      stuckSignal &&
      !intervene);

  if (pushClearance) {
    const focus = top?.domain ?? "general";
    candidates.push(
      finalize(
        "push_clearance",
        focus,
        "Push queue clearance",
        backlogNotWorsening
          ? "Backlog is stable, but stale items remain unresolved."
          : "Resolution throughput is lagging new intake while aging items persist.",
        "Clear aging queue items to prevent new escalation.",
        "medium",
      ),
    );
  }

  // —— STABILIZE DOMAIN ——
  const stabilizeDomainCandidate = nonGeneralTop(summaries);
  const stabilize =
    stabilizeDomainCandidate != null &&
    stabilizeDomainCandidate.domain !== "general" &&
    (stabilizeDomainCandidate.breachesRecovered >= 1 || stabilizeDomainCandidate.escalationsCleared >= 1) &&
    (stabilizeDomainCandidate.breachedCount + stabilizeDomainCandidate.escalatedCount >= 1);

  if (stabilize && stabilizeDomainCandidate) {
    const d = stabilizeDomainCandidate.domain;
    candidates.push(
      finalize(
        "stabilize_domain",
        d,
        `Stabilize ${domainLabel(d).toLowerCase()} operations`,
        `${domainLabel(d)} blockers improved, but operational pressure remains elevated.`,
        "Maintain follow-through until the remaining high-risk items are cleared.",
        "medium",
      ),
    );
  }

  // —— MONITOR CLOSELY ——
  const topPressure = nonGeneralTop(summaries);
  const monitor =
    topPressure != null &&
    topPressure.domain !== "general" &&
    pressureScore(topPressure) > 0 &&
    (!domainBaseline || topPressure.netChange === null) &&
    !intervene;

  if (monitor && topPressure) {
    const d = topPressure.domain;
    candidates.push(
      finalize(
        "monitor_closely",
        d,
        `Monitor ${domainLabel(d).toLowerCase()} closely`,
        `Risk remains concentrated in ${domainLabel(d).toLowerCase()} items.`,
        "Track the remaining high-risk items and verify owners are progressing them.",
        "low",
      ),
    );
  }

  const stabDomains = new Set(
    candidates
      .filter((c) => c.type === "stabilize_domain")
      .map((c) => c.domain)
      .filter((x): x is ControlTowerDomain => x != null && x !== "general"),
  );
  const withoutRedundantMonitor = candidates.filter(
    (c) => !(c.type === "monitor_closely" && c.domain != null && stabDomains.has(c.domain)),
  );

  return dedupeSortCap(withoutRedundantMonitor);
}

function finalize(
  type: ExecutiveDecisionType,
  domain: ControlTowerDomain,
  title: string,
  rationale: string,
  recommendedMove: string,
  priority: ExecutiveDecisionPrompt["priority"],
): ExecutiveDecisionPrompt {
  const prompt: ExecutiveDecisionPrompt = {
    id: `${type}-${domain}`,
    type,
    title,
    rationale,
    recommendedMove,
    priority,
    domain: domain === "general" ? undefined : domain,
  };
  prompt.href = getDecisionPromptHref(prompt, domain);
  return prompt;
}

function dedupeSortCap(prompts: ExecutiveDecisionPrompt[]): ExecutiveDecisionPrompt[] {
  const seen = new Set<string>();
  const unique: ExecutiveDecisionPrompt[] = [];
  const sorted = [...prompts].sort((a, b) => {
    const tr = TYPE_RANK[a.type] - TYPE_RANK[b.type];
    if (tr !== 0) return tr;
    return PRI_RANK[a.priority] - PRI_RANK[b.priority];
  });
  for (const p of sorted) {
    const key = `${p.type}:${p.domain ?? "none"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(p);
  }
  return unique.slice(0, 3);
}
