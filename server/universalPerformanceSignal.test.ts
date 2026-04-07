import { describe, expect, it } from "vitest";
import {
  buildUniversalPerformanceSignal,
  deriveReviewState,
  toTrendLabel,
} from "./universalPerformanceSignal";
import type { UnderperformanceAssessment } from "./underperformanceDetection";

describe("universalPerformanceSignal", () => {
  it("caps reasons and priorities", () => {
    const assessment: UnderperformanceAssessment = {
      status: "watch",
      severity: 2,
      reasons: ["a", "b", "c", "d", "e", "f"],
      recommendedManagerActions: ["p1", "p2", "p3", "p4", "p5"],
    };
    const u = buildUniversalPerformanceSignal(assessment, 72, "flat", null);
    expect(u.keyReasons.length).toBeLessThanOrEqual(4);
    expect(u.topPriorities.length).toBeLessThanOrEqual(4);
    expect(u.trend).toBe("stable");
  });

  it("deriveReviewState for critical", () => {
    const a: UnderperformanceAssessment = {
      status: "critical",
      severity: 4,
      reasons: [],
      recommendedManagerActions: [],
    };
    expect(deriveReviewState(a, null)).toBe("escalated");
  });

  it("toTrendLabel maps flat to stable", () => {
    expect(toTrendLabel("flat")).toBe("stable");
  });
});
