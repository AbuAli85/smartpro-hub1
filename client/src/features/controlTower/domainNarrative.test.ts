import { describe, expect, it } from "vitest";
import type { ActionQueueItemExecutionView } from "./escalationTypes";
import { getControlTowerDomain } from "./domainMapper";
import {
  buildDomainNarrativeSummaries,
  buildExecutiveNarrativeLines,
  getTopPressureDomains,
  hasDomainAttributionBaseline,
} from "./domainNarrative";
import type { ControlTowerOutcomeSummary } from "./outcomeTypes";
import type { ControlTowerSnapshot } from "./trendTypes";
import type { TrendComparison } from "./trendTypes";

function item(
  id: string,
  kind: ActionQueueItemExecutionView["kind"],
  source: ActionQueueItemExecutionView["source"],
  esc: Partial<ActionQueueItemExecutionView["escalation"]>,
  ex: Partial<ActionQueueItemExecutionView["execution"]>,
): ActionQueueItemExecutionView {
  return {
    id,
    kind,
    title: "t",
    severity: "medium",
    blocking: false,
    source,
    href: "/x",
    ctaLabel: "Open",
    execution: {
      ownerLabel: null,
      assigned: false,
      assignedToSelf: false,
      ageDays: null,
      agingLevel: null,
      overdue: false,
      lastUpdatedAt: null,
      needsOwner: false,
      stuck: false,
      ...ex,
    },
    escalation: {
      slaState: "within_sla",
      escalationLevel: "normal",
      followThroughRequired: false,
      escalationReason: null,
      ...esc,
    },
  };
}

const snap = (overrides: Partial<ControlTowerSnapshot>): ControlTowerSnapshot => ({
  timestamp: new Date().toISOString(),
  totalItems: 0,
  escalatedCount: 0,
  attentionCount: 0,
  breachedCount: 0,
  unassignedHighCount: 0,
  stuckCount: 0,
  prioritiesCount: 0,
  ...overrides,
});

const zeroOutcome = (): ControlTowerOutcomeSummary => ({
  newItemsCount: 0,
  resolvedItemsCount: 0,
  escalationsClearedCount: 0,
  escalationsAddedCount: 0,
  breachesRecoveredCount: 0,
  breachesAddedCount: 0,
  ownershipGapsClosedCount: 0,
  ownershipGapsAddedCount: 0,
});

describe("getControlTowerDomain", () => {
  it("maps payroll blocker to payroll", () => {
    expect(getControlTowerDomain(item("1", "payroll_blocker", "payroll", {}, {}))).toBe("payroll");
  });

  it("maps permits to workforce", () => {
    expect(getControlTowerDomain(item("1", "permit_expired", "workforce", {}, {}))).toBe("workforce");
  });

  it("maps contract pending to contracts", () => {
    expect(getControlTowerDomain(item("1", "contract_signature_pending", "contracts", {}, {}))).toBe("contracts");
  });
});

describe("hasDomainAttributionBaseline", () => {
  it("is false when itemRefs omit domain", () => {
    expect(
      hasDomainAttributionBaseline(
        snap({
          itemRefs: [{ id: "a", escalationLevel: "normal", slaState: "within_sla", assigned: true, needsOwner: false }],
        }),
      ),
    ).toBe(false);
  });

  it("is true when every ref has domain", () => {
    expect(
      hasDomainAttributionBaseline(
        snap({
          itemRefs: [
            {
              id: "a",
              escalationLevel: "escalated",
              slaState: "breached",
              assigned: false,
              needsOwner: false,
              domain: "workforce",
            },
          ],
        }),
      ),
    ).toBe(true);
  });
});

describe("buildDomainNarrativeSummaries / getTopPressureDomains", () => {
  it("identifies workforce as top pressure when breaches dominate", () => {
    const items: ActionQueueItemExecutionView[] = [
      item("a", "permit_expired", "workforce", { slaState: "breached", escalationLevel: "escalated" }, { stuck: true }),
      item("b", "generic_attention", "hr", { escalationLevel: "normal", slaState: "within_sla" }, {}),
    ];
    const cur = snap({ itemRefs: [] });
    const prev = snap({ itemRefs: [] });
    const summaries = buildDomainNarrativeSummaries(items, cur, prev);
    const top = getTopPressureDomains(summaries, 2);
    expect(top[0]?.domain).toBe("workforce");
  });
});

describe("buildExecutiveNarrativeLines", () => {
  const trend: TrendComparison = { current: snap({}), previous: null };

  it("builds concentration line without domain baseline", () => {
    const items: ActionQueueItemExecutionView[] = [
      item("a", "compliance_failure", "compliance", { slaState: "breached", escalationLevel: "escalated" }, {}),
      item("b", "compliance_failure", "compliance", { escalationLevel: "attention", slaState: "nearing_sla" }, {}),
    ];
    const summaries = buildDomainNarrativeSummaries(items, snap({}), snap({ itemRefs: [] }));
    const lines = buildExecutiveNarrativeLines(summaries, zeroOutcome(), trend, {
      outcomeComparable: false,
      domainBaseline: false,
    });
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines[0]).toMatch(/compliance/i);
  });

  it("caps at 2 lines", () => {
    const items: ActionQueueItemExecutionView[] = [
      item("a", "payroll_blocker", "payroll", { slaState: "breached", escalationLevel: "escalated" }, {}),
    ];
    const prev = snap({
      itemRefs: [
        {
          id: "a",
          escalationLevel: "normal",
          slaState: "within_sla",
          assigned: true,
          needsOwner: false,
          domain: "payroll",
        },
      ],
    });
    const summaries = buildDomainNarrativeSummaries(items, snap({}), prev);
    const lines = buildExecutiveNarrativeLines(summaries, zeroOutcome(), trend, {
      outcomeComparable: true,
      domainBaseline: true,
    });
    expect(lines.length).toBeLessThanOrEqual(2);
  });

  it("uses concentration when no strong movement", () => {
    const items: ActionQueueItemExecutionView[] = [
      item("x", "permit_expired", "workforce", { escalationLevel: "escalated", slaState: "breached" }, {}),
      item("y", "compliance_failure", "compliance", { escalationLevel: "escalated", slaState: "breached" }, {}),
    ];
    const prev = snap({
      itemRefs: [
        {
          id: "x",
          escalationLevel: "escalated",
          slaState: "breached",
          assigned: true,
          needsOwner: false,
          domain: "workforce",
        },
        {
          id: "y",
          escalationLevel: "escalated",
          slaState: "breached",
          assigned: true,
          needsOwner: false,
          domain: "compliance",
        },
      ],
    });
    const summaries = buildDomainNarrativeSummaries(items, snap({}), prev);
    const lines = buildExecutiveNarrativeLines(summaries, zeroOutcome(), trend, {
      outcomeComparable: true,
      domainBaseline: true,
    });
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines.some((l) => /concentrated|remains/i.test(l))).toBe(true);
  });
});
