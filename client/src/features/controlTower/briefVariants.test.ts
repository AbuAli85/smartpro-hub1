import { describe, expect, it } from "vitest";
import { BRIEF_VARIANT_CONFIG } from "./briefVariantConfig";
import { buildOperatingBriefWithVariant, buildSituationSummary, formatOperatingBriefText } from "./operatingBrief";
import { DOMAIN_ORDER } from "./domainMapper";
import type { DomainNarrativeSummary } from "./domainNarrativeTypes";
import type { ExecutiveCommitment } from "./commitmentTypes";
import type { ExecutiveDecisionPrompt } from "./decisionPromptTypes";
import type { ExecutiveReviewItem } from "./reviewTypes";

function baseSummary(domain: DomainNarrativeSummary["domain"], o: Partial<DomainNarrativeSummary> = {}): DomainNarrativeSummary {
  return {
    domain,
    currentCount: 0,
    previousCount: null,
    escalatedCount: 0,
    breachedCount: 0,
    stuckCount: 0,
    unassignedHighCount: 0,
    escalationsAdded: 0,
    escalationsCleared: 0,
    breachesAdded: 0,
    breachesRecovered: 0,
    ownershipGapsClosed: 0,
    ownershipGapsAdded: 0,
    netChange: null,
    ...o,
  };
}

function allSummaries(overrides: Partial<Record<DomainNarrativeSummary["domain"], Partial<DomainNarrativeSummary>>>): DomainNarrativeSummary[] {
  return DOMAIN_ORDER.map((d) => baseSummary(d, overrides[d]));
}

const minimalInputs = (overrides: Partial<Parameters<typeof buildOperatingBriefWithVariant>[0]> = {}) => ({
  priorityItems: [],
  domainNarrativeSummaries: allSummaries({
    workforce: { currentCount: 4, breachedCount: 1, escalationsAdded: 1 },
  }),
  executiveDecisionPrompts: [
    {
      id: "a",
      type: "intervene_now" as const,
      title: "Intervene in workforce risk",
      rationale: "",
      recommendedMove: "",
      priority: "high" as const,
    },
    {
      id: "b",
      type: "review_ownership" as const,
      title: "Review compliance ownership",
      rationale: "",
      recommendedMove: "",
      priority: "high" as const,
    },
    {
      id: "c",
      type: "push_clearance" as const,
      title: "Push queue clearance",
      rationale: "",
      recommendedMove: "",
      priority: "medium" as const,
    },
  ] satisfies ExecutiveDecisionPrompt[],
  executiveCommitments: [
    {
      id: "c1",
      decisionPromptId: "a",
      decisionType: "intervene_now",
      title: "t",
      checkpoint: "cp",
      horizon: "today",
      successCriteria: "s",
      priority: "high",
      domain: "workforce",
    },
    {
      id: "c2",
      decisionPromptId: "b",
      decisionType: "review_ownership",
      title: "t",
      checkpoint: "cp",
      horizon: "next_24h",
      successCriteria: "s",
      priority: "high",
      domain: "compliance",
    },
  ] satisfies ExecutiveCommitment[],
  executiveReviewItems: [
    {
      id: "r1",
      commitmentId: "c1",
      title: "t",
      reviewQuestion: "Q1?",
      accountabilityCheck: "a",
      reviewSignal: "s",
      priority: "high",
    },
    {
      id: "r2",
      commitmentId: "c2",
      title: "t",
      reviewQuestion: "Q2?",
      accountabilityCheck: "a",
      reviewSignal: "s",
      priority: "high",
    },
    {
      id: "r3",
      commitmentId: "c2",
      title: "t",
      reviewQuestion: "Q3?",
      accountabilityCheck: "a",
      reviewSignal: "s",
      priority: "high",
    },
  ] satisfies ExecutiveReviewItem[],
  outcomeSummaryLine: "2 escalations cleared",
  trendSummaryLine: "Backlog unchanged",
  ...overrides,
});

describe("buildOperatingBriefWithVariant", () => {
  it("daily variant limits sections to config caps", () => {
    const brief = buildOperatingBriefWithVariant(minimalInputs(), "daily");
    expect(brief.keyPressures.length).toBeLessThanOrEqual(BRIEF_VARIANT_CONFIG.daily.maxKeyPressures);
    expect(brief.leadershipFocus.length).toBeLessThanOrEqual(BRIEF_VARIANT_CONFIG.daily.maxLeadershipFocus);
    expect(brief.operatingCheckpoints.length).toBeLessThanOrEqual(BRIEF_VARIANT_CONFIG.daily.maxCheckpoints);
    expect(brief.reviewFocus.length).toBeLessThanOrEqual(BRIEF_VARIANT_CONFIG.daily.maxReviewFocus);
  });

  it("weekly exposes outcome and trend separately when both lines exist", () => {
    const brief = buildOperatingBriefWithVariant(minimalInputs(), "weekly");
    expect(brief.outcomeSummary).toBeTruthy();
    expect(brief.trendSummary).toBeTruthy();
  });

  it("board reduces lists to minimal caps", () => {
    const brief = buildOperatingBriefWithVariant(minimalInputs(), "board");
    expect(brief.keyPressures.length).toBeLessThanOrEqual(BRIEF_VARIANT_CONFIG.board.maxKeyPressures);
    expect(brief.reviewFocus.length).toBeLessThanOrEqual(BRIEF_VARIANT_CONFIG.board.maxReviewFocus);
  });

  it("produces different situation copy for operational vs summary style", () => {
    const s = allSummaries({
      workforce: { currentCount: 5, breachedCount: 1, escalationsAdded: 1 },
    });
    const op = buildSituationSummary(s, "operational");
    const su = buildSituationSummary(s, "summary");
    expect(op).not.toBe(su);
    expect(su.toLowerCase()).toContain("this period");
  });

  it("switching variant changes trimmed outputs", () => {
    const inputs = minimalInputs();
    const daily = buildOperatingBriefWithVariant(inputs, "daily");
    const board = buildOperatingBriefWithVariant(inputs, "board");
    expect(daily.reviewFocus.length).toBeGreaterThan(board.reviewFocus.length);
  });
});

describe("formatOperatingBriefText variant label", () => {
  it("includes variant title in export", () => {
    const brief = buildOperatingBriefWithVariant(minimalInputs(), "weekly");
    const text = formatOperatingBriefText(brief, "weekly");
    expect(text.startsWith("Weekly Leadership Brief")).toBe(true);
  });
});
