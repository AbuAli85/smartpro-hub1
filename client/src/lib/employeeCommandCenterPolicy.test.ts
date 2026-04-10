import { describe, expect, it } from "vitest";
import {
  buildCommandCenterSectionExplainHints,
  collectOrchestrationReasons,
  commandCenterSectionEmphasisClasses,
  computeSectionEmphasis,
} from "./employeeCommandCenterPolicy";
import type { CommandCenterOrchestrationMeta, CommandCenterStateContext } from "./employeeCommandCenterState";

const state = (over: Partial<CommandCenterStateContext> = {}): CommandCenterStateContext => ({
  hasBlockers: false,
  hasUrgentTopActions: false,
  hasAnyTasks: true,
  hasPendingRequests: true,
  isIdleDay: false,
  isActiveShift: false,
  ...over,
});

const meta = (over: Partial<CommandCenterOrchestrationMeta> = {}): CommandCenterOrchestrationMeta => ({
  isBlocked: false,
  manyPendingRequests: false,
  ...over,
});

describe("collectOrchestrationReasons", () => {
  it("includes urgent_actions only when urgent top actions and no blockers", () => {
    const r1 = collectOrchestrationReasons(state({ hasUrgentTopActions: true, hasBlockers: false }), meta(), false, 0);
    expect(r1).toContain("urgent_actions");
    const r2 = collectOrchestrationReasons(state({ hasUrgentTopActions: true, hasBlockers: true }), meta({ isBlocked: true }), false, 0);
    expect(r2).not.toContain("urgent_actions");
  });

  it("includes blocked_mode when meta.isBlocked", () => {
    const r = collectOrchestrationReasons(state(), meta({ isBlocked: true }), false, 0);
    expect(r).toContain("blocked_mode");
  });

  it("includes many_pending_requests for approver profile path (caller passes true)", () => {
    const r = collectOrchestrationReasons(state(), meta(), true, 5);
    expect(r).toContain("many_pending_requests");
  });
});

describe("computeSectionEmphasis", () => {
  const input = (s: CommandCenterStateContext, m: CommandCenterOrchestrationMeta, headsUp = true) => ({
    state: s,
    meta: m,
    hasBlockersVisible: s.hasBlockers,
    hasHeadsUpVisible: headsUp,
  });

  it("mutes utility strips when urgent and no blockers", () => {
    const s = state({ hasUrgentTopActions: true, hasBlockers: false });
    const m = meta();
    expect(computeSectionEmphasis("recent_activity", input(s, m))).toBe("muted");
    expect(computeSectionEmphasis("secondary_tools", input(s, m))).toBe("muted");
    expect(computeSectionEmphasis("top_actions", input(s, m))).toBe("primary");
    expect(computeSectionEmphasis("heads_up", input(s, m))).toBe("primary");
  });

  it("mutes recent_activity and secondary_tools when blocked", () => {
    const s = state({ hasBlockers: true });
    const m = meta({ isBlocked: true });
    expect(computeSectionEmphasis("recent_activity", input(s, m))).toBe("muted");
    expect(computeSectionEmphasis("secondary_tools", input(s, m))).toBe("muted");
    expect(computeSectionEmphasis("blockers", input(s, m))).toBe("primary");
  });

  it("maps primary emphasis to full opacity", () => {
    expect(commandCenterSectionEmphasisClasses("primary")).toContain("opacity-100");
  });
});

describe("buildCommandCenterSectionExplainHints", () => {
  it("includes blocker copy when blockers exist", () => {
    const h = buildCommandCenterSectionExplainHints({
      reasons: ["baseline_profile", "blocked_mode"],
      blockerCount: 2,
      pendingRequestCount: 0,
      hasTopActions: true,
    });
    expect(h.blockers).toMatch(/2 items/);
    expect(h.command_header).toBeDefined();
  });

  it("marks urgent top actions explanation when urgent_actions reason present", () => {
    const h = buildCommandCenterSectionExplainHints({
      reasons: ["baseline_profile", "urgent_actions"],
      blockerCount: 0,
      pendingRequestCount: 0,
      hasTopActions: true,
    });
    expect(h.top_actions).toMatch(/Urgent/);
  });
});
