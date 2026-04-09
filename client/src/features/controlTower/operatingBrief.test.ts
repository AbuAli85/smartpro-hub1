import { describe, expect, it } from "vitest";
import type { ExecutiveCommitment } from "./commitmentTypes";
import type { ExecutiveDecisionPrompt } from "./decisionPromptTypes";
import { DOMAIN_ORDER } from "./domainMapper";
import type { DomainNarrativeSummary } from "./domainNarrativeTypes";
import type { ExecutiveReviewItem } from "./reviewTypes";
import {
  buildKeyPressures,
  buildLeadershipFocus,
  buildOperatingBrief,
  buildOperatingCheckpoints,
  buildReviewFocus,
  buildSituationSummary,
  formatOperatingBriefText,
  pickOutcomeSummaryLine,
} from "./operatingBrief";

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

describe("buildSituationSummary", () => {
  it("references top domain and escalation/breach context when worsening", () => {
    const s = allSummaries({
      workforce: {
        currentCount: 5,
        breachedCount: 2,
        escalatedCount: 2,
        breachesAdded: 1,
        escalationsAdded: 1,
      },
    });
    const line = buildSituationSummary(s);
    expect(line.toLowerCase()).toContain("workforce");
    expect(line.toLowerCase()).toMatch(/breach|escalat/);
  });
});

describe("buildKeyPressures", () => {
  it("returns at most 3 lines", () => {
    const s = allSummaries({
      workforce: { currentCount: 3, breachedCount: 1, escalatedCount: 1 },
      compliance: { currentCount: 2, unassignedHighCount: 3 },
      contracts: { currentCount: 4, stuckCount: 2 },
      payroll: { currentCount: 1, breachedCount: 1 },
      hr: { currentCount: 2, escalatedCount: 1 },
    });
    expect(buildKeyPressures(s).length).toBeLessThanOrEqual(3);
  });
});

describe("buildLeadershipFocus", () => {
  it("uses decision prompt titles in order without duplicates", () => {
    const prompts: ExecutiveDecisionPrompt[] = [
      {
        id: "a",
        type: "intervene_now",
        title: "Intervene in workforce risk",
        rationale: "",
        recommendedMove: "",
        priority: "high",
      },
      {
        id: "b",
        type: "review_ownership",
        title: "Review compliance ownership",
        rationale: "",
        recommendedMove: "",
        priority: "high",
      },
    ];
    expect(buildLeadershipFocus(prompts)).toEqual(["Intervene in workforce risk", "Review compliance ownership"]);
  });
});

describe("buildOperatingCheckpoints", () => {
  it("derives short checkpoints from commitments", () => {
    const commits: ExecutiveCommitment[] = [
      {
        id: "c1",
        decisionPromptId: "p1",
        decisionType: "push_clearance",
        title: "t",
        checkpoint: "long checkpoint text",
        horizon: "next_48h",
        successCriteria: "s",
        priority: "medium",
      },
    ];
    const lines = buildOperatingCheckpoints(commits);
    expect(lines[0].toLowerCase()).toContain("aging");
  });
});

describe("buildReviewFocus", () => {
  it("maps review questions from items", () => {
    const items: ExecutiveReviewItem[] = [
      {
        id: "r1",
        commitmentId: "c1",
        title: "t",
        reviewQuestion: "Are workforce escalations declining?",
        accountabilityCheck: "a",
        reviewSignal: "s",
        priority: "high",
      },
    ];
    expect(buildReviewFocus(items)).toEqual(["Are workforce escalations declining?"]);
  });
});

describe("pickOutcomeSummaryLine", () => {
  it("prefers outcome over trend when both exist", () => {
    expect(pickOutcomeSummaryLine("Outcome A", "Trend B")).toBe("Outcome A");
  });

  it("falls back to trend when outcome missing", () => {
    expect(pickOutcomeSummaryLine(null, "Trend only")).toBe("Trend only");
  });
});

describe("buildOperatingBrief", () => {
  it("composes a full brief with timestamp", () => {
    const brief = buildOperatingBrief({
      priorityItems: [],
      domainNarrativeSummaries: allSummaries({
        workforce: { currentCount: 2, breachedCount: 1, escalationsAdded: 1 },
      }),
      executiveDecisionPrompts: [
        {
          id: "x",
          type: "intervene_now",
          title: "Intervene now",
          rationale: "",
          recommendedMove: "",
          priority: "high",
        },
      ],
      executiveCommitments: [
        {
          id: "c",
          decisionPromptId: "x",
          decisionType: "intervene_now",
          title: "t",
          checkpoint: "cp",
          horizon: "today",
          successCriteria: "s",
          priority: "high",
          domain: "workforce",
        },
      ],
      executiveReviewItems: [
        {
          id: "r",
          commitmentId: "c",
          title: "rt",
          reviewQuestion: "Question?",
          accountabilityCheck: "a",
          reviewSignal: "sig",
          priority: "high",
        },
      ],
      outcomeSummaryLine: "2 escalations cleared",
      trendSummaryLine: "Backlog flat",
    });
    expect(brief.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(brief.leadershipFocus).toContain("Intervene now");
    expect(brief.outcomeSummary).toBe("2 escalations cleared");
  });
});

describe("formatOperatingBriefText", () => {
  it("outputs structured plain text sections", () => {
    const text = formatOperatingBriefText({
      timestamp: "2026-01-01T00:00:00.000Z",
      situationSummary: "Situation one line.",
      keyPressures: ["A: x"],
      leadershipFocus: ["Focus 1"],
      operatingCheckpoints: ["Checkpoint 1"],
      reviewFocus: ["Q1?"],
      outcomeSummary: "Outcome line",
    });
    expect(text).toContain("Situation:");
    expect(text).toContain("Situation one line.");
    expect(text).toContain("Key pressures:");
    expect(text).toContain("- A: x");
    expect(text).toContain("Leadership focus:");
    expect(text).toContain("Checkpoints:");
    expect(text).toContain("Review focus:");
    expect(text).toContain("Outcome:");
    expect(text).toContain("Outcome line");
  });
});
