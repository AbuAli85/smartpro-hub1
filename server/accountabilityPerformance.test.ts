import { describe, expect, it } from "vitest";
import { detectUnderperformance, computeCompositeScore, type ScorecardSignals } from "./underperformanceDetection";
import { buildEffectiveAccountability } from "./accountabilityEngine";
import type { Employee, EmployeeAccountability } from "../drizzle/schema";

function baseSignals(over: Partial<ScorecardSignals> = {}): ScorecardSignals {
  return {
    overdueTaskCount: 0,
    openTaskCount: 0,
    blockedTaskCount: 0,
    tasksCompletedLast7d: 0,
    tasksCompletedPrev7d: 0,
    kpiAvgPct: null,
    kpiWeakMetricCount: 0,
    attendanceLateCount: 0,
    attendanceAbsentCount: 0,
    pendingEmployeeRequests: 0,
    lastSelfReviewStatus: null,
    ...over,
  };
}

describe("underperformanceDetection", () => {
  it("returns on_track when no negative signals", () => {
    const a = detectUnderperformance(baseSignals());
    expect(a.status).toBe("on_track");
    expect(a.reasons.length).toBe(0);
  });

  it("escalates to critical for many overdue tasks", () => {
    const a = detectUnderperformance(baseSignals({ overdueTaskCount: 6 }));
    expect(a.status).toBe("critical");
    expect(a.reasons.some((r) => /overdue|past due/i.test(r))).toBe(true);
    expect(a.recommendedManagerActions.length).toBeGreaterThan(0);
  });

  it("flags weak KPI average", () => {
    const a = detectUnderperformance(baseSignals({ kpiAvgPct: 30, kpiWeakMetricCount: 1 }));
    expect(["at_risk", "watch", "critical"]).toContain(a.status);
  });

  it("combines attendance signals", () => {
    const a = detectUnderperformance(
      baseSignals({ attendanceLateCount: 3, attendanceAbsentCount: 2 })
    );
    expect(a.status).not.toBe("on_track");
  });

  it("composite score decreases with negative signals", () => {
    const hi = computeCompositeScore(baseSignals());
    const lo = computeCompositeScore(baseSignals({ overdueTaskCount: 4, kpiAvgPct: 20 }));
    expect(lo).toBeLessThan(hi);
  });
});

describe("accountabilityEngine", () => {
  it("merges overlay with employee position as fallback responsibility", () => {
    const emp = {
      id: 1,
      companyId: 10,
      position: "Marketing Manager",
      department: "Digital Marketing",
      managerId: 2,
    } as unknown as Employee;

    const overlay = {
      responsibilities: ["Own campaigns"],
      kpiCategoryKeys: ["leads"],
      reviewCadence: "weekly",
    } as unknown as EmployeeAccountability;

    const eff = buildEffectiveAccountability(emp, overlay);
    expect(eff.responsibilities).toContain("Own campaigns");
    expect(eff.escalationEmployeeId).toBe(2);
  });

  it("uses position-only responsibilities when no overlay", () => {
    const emp = {
      id: 1,
      companyId: 10,
      position: "Ops Lead",
      department: "Operations",
      managerId: null,
    } as unknown as Employee;

    const eff = buildEffectiveAccountability(emp, null);
    expect(eff.responsibilities.some((r) => r.includes("Ops Lead"))).toBe(true);
  });
});
