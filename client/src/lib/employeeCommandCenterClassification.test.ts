import { describe, expect, it } from "vitest";
import {
  buildCommandCenterClassification,
  COMMAND_CENTER_HEADS_UP_MAX,
  shouldShowComplianceHeadsUpStrip,
  shouldShowDocumentsShortcutInHeadsUp,
} from "./employeeCommandCenterClassification";
import type { EmployeeBlocker } from "./employeeBlockersModel";

const blocker = (id: string): EmployeeBlocker => ({
  id,
  type: "attendance",
  title: "t",
  actionLabel: "a",
  actionTab: "attendance",
  severity: "critical",
  rank: 1,
});

describe("buildCommandCenterClassification", () => {
  it("drops top actions whose keys are suppressed by blockers", () => {
    const blockers = [blocker("blocker-att-inconsistent")];
    const topActionCandidates = [
      { key: "att-inconsistent", score: 100 },
      { key: "tasks-overdue", score: 50 },
    ];
    const headsUpCandidates = [
      { key: "h1", signalKey: "tasks-overdue", label: "Overdue" },
    ];
    const r = buildCommandCenterClassification({ blockers, topActionCandidates, headsUpCandidates });
    expect(r.topActions.map((t) => t.key)).toEqual(["tasks-overdue"]);
    expect(r.suppressedByBlockers).toContain("att-inconsistent");
  });

  it("removes heads-up chips that duplicate a top action signal", () => {
    const blockers: EmployeeBlocker[] = [];
    const topActionCandidates = [{ key: "tasks-overdue", score: 90 }];
    const headsUpCandidates = [
      { key: "h1", signalKey: "tasks-overdue", label: "Overdue" },
      { key: "h2", signalKey: "training", label: "Training" },
    ];
    const r = buildCommandCenterClassification({ blockers, topActionCandidates, headsUpCandidates });
    expect(r.headsUp.map((h) => h.signalKey)).toEqual(["training"]);
    expect(r.headsUpDroppedSignals).toContain("tasks-overdue");
  });

  it("removes heads-up when signal is owned by a blocker", () => {
    const blockers = [blocker("blocker-docs-expired")];
    const topActionCandidates = [{ key: "all-clear", score: 0 }];
    const headsUpCandidates = [{ key: "h1", signalKey: "docs-expired", label: "Expired docs" }];
    const r = buildCommandCenterClassification({ blockers, topActionCandidates, headsUpCandidates });
    expect(r.headsUp).toHaveLength(0);
    expect(r.headsUpDroppedSignals).toContain("docs-expired");
  });

  it("caps heads-up at COMMAND_CENTER_HEADS_UP_MAX", () => {
    const blockers: EmployeeBlocker[] = [];
    const topActionCandidates = [{ key: "all-clear", score: 0 }];
    const headsUpCandidates = Array.from({ length: 8 }, (_, i) => ({
      key: `h${i}`,
      signalKey: `sig-${i}`,
      label: `L${i}`,
    }));
    const r = buildCommandCenterClassification({ blockers, topActionCandidates, headsUpCandidates });
    expect(r.headsUp.length).toBe(COMMAND_CENTER_HEADS_UP_MAX);
  });
});

describe("heads-up satellite visibility", () => {
  it("hides documents shortcut when document blockers exist", () => {
    expect(shouldShowDocumentsShortcutInHeadsUp(3, [blocker("blocker-docs-expired")])).toBe(false);
    expect(shouldShowDocumentsShortcutInHeadsUp(3, [])).toBe(true);
    expect(shouldShowDocumentsShortcutInHeadsUp(0, [])).toBe(false);
  });

  it("hides compliance strip when urgent compliance is already a blocker", () => {
    const urgentCompliance: EmployeeBlocker = {
      id: "blocker-work-urgent",
      type: "compliance",
      title: "x",
      actionLabel: "y",
      actionTab: "documents",
      severity: "critical",
      rank: 1,
    };
    expect(shouldShowComplianceHeadsUpStrip("urgent", [urgentCompliance])).toBe(false);
    expect(shouldShowComplianceHeadsUpStrip("urgent", [])).toBe(true);
    expect(shouldShowComplianceHeadsUpStrip("needs_attention", [urgentCompliance])).toBe(true);
  });
});
