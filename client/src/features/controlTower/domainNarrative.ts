import type { ActionQueueItemExecutionView } from "./escalationTypes";
import { DOMAIN_ORDER, getControlTowerDomain } from "./domainMapper";
import type { ControlTowerOutcomeSummary, SnapshotItemRef } from "./outcomeTypes";
import type { ControlTowerDomain, DomainNarrativeSummary } from "./domainNarrativeTypes";
import type { ControlTowerSnapshot, TrendComparison } from "./trendTypes";

type PerDomainDeltas = {
  escalationsAdded: number;
  escalationsCleared: number;
  breachesAdded: number;
  breachesRecovered: number;
  ownershipGapsAdded: number;
  ownershipGapsClosed: number;
};

function emptyDeltas(): PerDomainDeltas {
  return {
    escalationsAdded: 0,
    escalationsCleared: 0,
    breachesAdded: 0,
    breachesRecovered: 0,
    ownershipGapsAdded: 0,
    ownershipGapsClosed: 0,
  };
}

function refEscalated(r: SnapshotItemRef): boolean {
  return r.escalationLevel === "escalated";
}

function refBreached(r: SnapshotItemRef): boolean {
  return r.slaState === "breached";
}

function refGap(r: SnapshotItemRef): boolean {
  return r.needsOwner === true;
}

function itemEscalated(i: ActionQueueItemExecutionView): boolean {
  return i.escalation.escalationLevel === "escalated";
}

function itemBreached(i: ActionQueueItemExecutionView): boolean {
  return i.escalation.slaState === "breached";
}

function itemGap(i: ActionQueueItemExecutionView): boolean {
  return i.execution.needsOwner === true;
}

function domainOfRef(r: SnapshotItemRef): ControlTowerDomain {
  return r.domain ?? "general";
}

/** True when every stored ref includes a domain (P7+) and snapshot is non-empty. */
export function hasDomainAttributionBaseline(previous: ControlTowerSnapshot | null): boolean {
  const refs = previous?.itemRefs;
  if (!refs || refs.length === 0) return false;
  return refs.every((r) => typeof r.domain === "string" && r.domain.length > 0);
}

function computeDomainDeltas(
  previous: ControlTowerSnapshot,
  items: ActionQueueItemExecutionView[],
): Record<ControlTowerDomain, PerDomainDeltas> {
  const by = Object.fromEntries(DOMAIN_ORDER.map((d) => [d, emptyDeltas()])) as Record<ControlTowerDomain, PerDomainDeltas>;
  const prevMap = new Map(previous.itemRefs!.map((r) => [r.id, r]));
  const currMap = new Map(items.map((i) => [i.id, i]));
  const prevIds = new Set(prevMap.keys());
  const currIds = new Set(currMap.keys());

  for (const id of Array.from(prevIds)) {
    const p = prevMap.get(id)!;
    const dP = domainOfRef(p);
    const c = currMap.get(id);
    if (c) {
      if (refEscalated(p) && !itemEscalated(c)) by[dP].escalationsCleared += 1;
      if (!refEscalated(p) && itemEscalated(c)) {
        const dC = getControlTowerDomain(c);
        by[dC].escalationsAdded += 1;
      }
      if (refBreached(p) && !itemBreached(c)) by[dP].breachesRecovered += 1;
      if (!refBreached(p) && itemBreached(c)) {
        const dC = getControlTowerDomain(c);
        by[dC].breachesAdded += 1;
      }
      if (refGap(p) && !itemGap(c)) by[dP].ownershipGapsClosed += 1;
      if (!refGap(p) && itemGap(c)) {
        const dC = getControlTowerDomain(c);
        by[dC].ownershipGapsAdded += 1;
      }
    } else {
      if (refEscalated(p)) by[dP].escalationsCleared += 1;
      if (refBreached(p)) by[dP].breachesRecovered += 1;
      if (refGap(p)) by[dP].ownershipGapsClosed += 1;
    }
  }

  for (const id of Array.from(currIds)) {
    if (prevIds.has(id)) continue;
    const c = currMap.get(id)!;
    const dC = getControlTowerDomain(c);
    if (itemEscalated(c)) by[dC].escalationsAdded += 1;
    if (itemBreached(c)) by[dC].breachesAdded += 1;
    if (itemGap(c)) by[dC].ownershipGapsAdded += 1;
  }

  return by;
}

function aggregateCurrentDomain(items: ActionQueueItemExecutionView[], domain: ControlTowerDomain) {
  const list = items.filter((i) => getControlTowerDomain(i) === domain);
  let escalatedCount = 0;
  let breachedCount = 0;
  let stuckCount = 0;
  let unassignedHighCount = 0;
  for (const i of list) {
    if (itemEscalated(i)) escalatedCount += 1;
    if (itemBreached(i)) breachedCount += 1;
    if (i.execution.stuck) stuckCount += 1;
    if (i.execution.needsOwner) unassignedHighCount += 1;
  }
  return { currentCount: list.length, escalatedCount, breachedCount, stuckCount, unassignedHighCount };
}

function previousCountForDomain(previous: ControlTowerSnapshot, domain: ControlTowerDomain): number {
  return previous.itemRefs!.filter((r) => domainOfRef(r) === domain).length;
}

/**
 * Per-domain narrative row. When `previous` lacks domain on refs, deltas and `previousCount` / `netChange` are null-safe.
 */
export function buildDomainNarrativeSummaries(
  currentItems: ActionQueueItemExecutionView[],
  _currentSnapshot: ControlTowerSnapshot,
  previousSnapshot: ControlTowerSnapshot | null,
): DomainNarrativeSummary[] {
  const baseline = previousSnapshot && hasDomainAttributionBaseline(previousSnapshot);
  const deltas = baseline && previousSnapshot ? computeDomainDeltas(previousSnapshot, currentItems) : null;

  return DOMAIN_ORDER.map((domain): DomainNarrativeSummary => {
    const cur = aggregateCurrentDomain(currentItems, domain);
    const d = deltas?.[domain] ?? emptyDeltas();

    let previousCount: number | null = null;
    let netChange: number | null = null;
    if (baseline && previousSnapshot) {
      previousCount = previousCountForDomain(previousSnapshot, domain);
      netChange = cur.currentCount - previousCount;
    }

    return {
      domain,
      currentCount: cur.currentCount,
      previousCount,
      escalatedCount: cur.escalatedCount,
      breachedCount: cur.breachedCount,
      stuckCount: cur.stuckCount,
      unassignedHighCount: cur.unassignedHighCount,
      escalationsAdded: baseline ? d.escalationsAdded : 0,
      escalationsCleared: baseline ? d.escalationsCleared : 0,
      breachesAdded: baseline ? d.breachesAdded : 0,
      breachesRecovered: baseline ? d.breachesRecovered : 0,
      ownershipGapsClosed: baseline ? d.ownershipGapsClosed : 0,
      ownershipGapsAdded: baseline ? d.ownershipGapsAdded : 0,
      netChange,
    };
  });
}

export function pressureScore(s: DomainNarrativeSummary): number {
  return (
    s.escalatedCount * 5 +
    s.breachedCount * 4 +
    s.unassignedHighCount * 3 +
    s.stuckCount * 2 +
    s.currentCount
  );
}

/** Domains with the highest composite pressure (risk concentration). */
export function getTopPressureDomains(summaries: DomainNarrativeSummary[], limit = 2): DomainNarrativeSummary[] {
  return [...summaries]
    .filter((s) => pressureScore(s) > 0)
    .sort((a, b) => {
      const pd = pressureScore(b) - pressureScore(a);
      if (pd !== 0) return pd;
      return b.currentCount - a.currentCount;
    })
    .slice(0, limit);
}

const LABEL: Record<ControlTowerDomain, string> = {
  payroll: "Payroll",
  workforce: "Workforce",
  contracts: "Contracts",
  hr: "HR",
  compliance: "Compliance",
  operations: "Operations",
  general: "General",
};

function worseningScore(s: DomainNarrativeSummary): number {
  return (
    (s.netChange ?? 0) +
    s.breachesAdded * 4 +
    s.escalationsAdded * 3 +
    s.ownershipGapsAdded * 2
  );
}

function improvingScore(s: DomainNarrativeSummary): number {
  return (
    -(s.netChange ?? 0) +
    s.breachesRecovered * 4 +
    s.escalationsCleared * 3 +
    s.ownershipGapsClosed * 2
  );
}

export type ExecutiveNarrativeOptions = {
  outcomeComparable: boolean;
  domainBaseline: boolean;
};

/**
 * Max two short, rule-based lines. Omits filler when nothing meaningful.
 */
export function buildExecutiveNarrativeLines(
  summaries: DomainNarrativeSummary[],
  _outcome: ControlTowerOutcomeSummary,
  _trend: TrendComparison,
  options: ExecutiveNarrativeOptions,
): string[] {
  const lines: string[] = [];
  if (summaries.length === 0) return [];

  const top = getTopPressureDomains(summaries, 2);

  if (!options.domainBaseline) {
    if (top.length > 0) {
      const a = LABEL[top[0].domain];
      const b = top[1] ? LABEL[top[1].domain] : null;
      lines.push(
        b
          ? `Operational pressure is concentrated in ${a} and ${b}.`
          : `Operational pressure is concentrated in ${a}.`,
      );
    }
    return lines.slice(0, 2);
  }

  const worsening = [...summaries].sort((a, b) => worseningScore(b) - worseningScore(a));
  const improving = [...summaries].sort((a, b) => improvingScore(b) - improvingScore(a));

  const w = worsening.find((s) => worseningScore(s) > 0);
  if (w) {
    const parts: string[] = [];
    if (w.breachesAdded > 0) parts.push(`${w.breachesAdded} new breach${w.breachesAdded === 1 ? "" : "es"}`);
    if (w.escalationsAdded > 0) parts.push(`${w.escalationsAdded} new escalation${w.escalationsAdded === 1 ? "" : "s"}`);
    if (parts.length === 0 && (w.netChange ?? 0) > 0) parts.push("backlog grew");
    if (parts.length === 0) parts.push("heightened risk");
    lines.push(`${LABEL[w.domain]}: ${parts.join(", ")} vs last check.`);
  }

  const g = improving.find((s) => improvingScore(s) > 0 && (!w || s.domain !== w.domain));
  if (lines.length < 2 && g && options.outcomeComparable) {
    const gp: string[] = [];
    if (g.breachesRecovered > 0) gp.push(`${g.breachesRecovered} breach${g.breachesRecovered === 1 ? "" : "es"} recovered`);
    if (g.escalationsCleared > 0) gp.push(`${g.escalationsCleared} escalation${g.escalationsCleared === 1 ? "" : "s"} cleared`);
    if (gp.length > 0) {
      lines.push(`${LABEL[g.domain]} improved — ${gp.join(", ")}.`);
    }
  }

  if (lines.length === 0 && top.length > 0) {
    const a = LABEL[top[0].domain];
    const b = top[1] ? LABEL[top[1].domain] : null;
    lines.push(
      b ? `Risk remains concentrated in ${a} and ${b}.` : `Operational pressure remains concentrated in ${a}.`,
    );
  }

  return lines.slice(0, 2);
}

export function buildPrioritiesDomainHint(summaries: DomainNarrativeSummary[]): string | null {
  const top = getTopPressureDomains(summaries, 1)[0];
  if (!top) return null;
  return `Most urgent pressure is in ${LABEL[top.domain].toLowerCase()}.`;
}

export function buildQueueDomainHint(summaries: DomainNarrativeSummary[]): string | null {
  const tops = getTopPressureDomains(summaries, 3).filter((s) => s.currentCount > 0);
  if (tops.length === 0) return null;
  const names = tops.map((s) => LABEL[s.domain]);
  if (names.length === 1) return `Queue backlog is concentrated in ${names[0]}.`;
  if (names.length === 2) return `Backlog spans ${names[0]} and ${names[1]}.`;
  return `Backlog spans ${names.slice(0, 2).join(", ")}, and ${names[2]}.`;
}

export function buildRiskStripDomainHint(summaries: DomainNarrativeSummary[]): string | null {
  const top = getTopPressureDomains(summaries, 1)[0];
  if (!top || top.breachedCount + top.escalatedCount === 0) return null;
  return `Strongest domain load: ${LABEL[top.domain]} (breaches and escalations).`;
}
