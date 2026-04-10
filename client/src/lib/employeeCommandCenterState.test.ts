import { describe, expect, it } from "vitest";
import {
  buildCommandCenterStateContext,
  getCommandCenterSectionOrder,
  moveSectionToEnd,
  moveSectionToIndex,
  type CommandCenterStateContext,
} from "./employeeCommandCenterState";
import type { CommandCenterSectionKey } from "./employeePortalPriorityProfile";
import { getBaseCommandCenterSectionOrder } from "./employeePortalPriorityProfile";

const neutral = (over: Partial<CommandCenterStateContext> = {}): CommandCenterStateContext => ({
  hasBlockers: false,
  hasUrgentTopActions: false,
  hasAnyTasks: true,
  hasPendingRequests: true,
  isIdleDay: false,
  isActiveShift: false,
  ...over,
});

describe("buildCommandCenterStateContext", () => {
  it("marks active shift from phase", () => {
    const s = buildCommandCenterStateContext({
      blockerCount: 0,
      focusItems: [],
      taskOpenCount: 1,
      pendingRequestCount: 0,
      shiftPhase: "active",
      isHoliday: false,
      isWorkingDay: true,
      hasShift: true,
    });
    expect(s.isActiveShift).toBe(true);
  });

  it("marks idle calendar day on holiday", () => {
    const s = buildCommandCenterStateContext({
      blockerCount: 0,
      focusItems: [],
      taskOpenCount: 0,
      pendingRequestCount: 0,
      shiftPhase: null,
      isHoliday: true,
      isWorkingDay: true,
      hasShift: false,
    });
    expect(s.isIdleDay).toBe(true);
  });
});

describe("adaptCommandCenterSectionOrder / getCommandCenterSectionOrder", () => {
  it("demotes recent_activity and secondary_tools when blockers exist", () => {
    const base = getBaseCommandCenterSectionOrder("default");
    const adapted = getCommandCenterSectionOrder("default", neutral({ hasBlockers: true, hasAnyTasks: true, hasPendingRequests: true }), 0);
    expect(adapted.indexOf("recent_activity")).toBeGreaterThan(adapted.indexOf("pay_and_files"));
    expect(adapted.indexOf("secondary_tools")).toBe(adapted.length - 1);
    expect(adapted.indexOf("recent_activity")).toBe(adapted.length - 2);
    expect(adapted.indexOf("recent_activity")).toBeGreaterThan(base.indexOf("recent_activity"));
  });

  it("lifts at_a_glance after top_actions when no tasks and no requests", () => {
    const base = getBaseCommandCenterSectionOrder("default");
    const adapted = getCommandCenterSectionOrder(
      "default",
      neutral({ hasAnyTasks: false, hasPendingRequests: false, hasBlockers: false }),
      0,
    );
    expect(adapted.indexOf("at_a_glance")).toBeLessThan(base.indexOf("at_a_glance"));
    expect(adapted.indexOf("at_a_glance")).toBeLessThan(adapted.indexOf("requests_summary"));
  });

  it("moves work_summary immediately after top_actions on active shift", () => {
    const adapted = getCommandCenterSectionOrder("default", neutral({ isActiveShift: true, hasAnyTasks: true, hasPendingRequests: true }), 0);
    const ti = adapted.indexOf("top_actions");
    const wi = adapted.indexOf("work_summary");
    expect(wi).toBe(ti + 1);
  });

  it("forces requests_summary to index 2 for approver with many pending", () => {
    const adapted = getCommandCenterSectionOrder("approver", neutral({ hasAnyTasks: true, hasPendingRequests: true }), 5);
    expect(adapted[2]).toBe("requests_summary");
  });
});

describe("moveSectionToIndex", () => {
  it("reorders a concrete triple", () => {
    const row: CommandCenterSectionKey[] = ["command_header", "today_status", "work_summary"];
    expect(moveSectionToIndex(row, "work_summary", 0)).toEqual(["work_summary", "command_header", "today_status"]);
  });
});

describe("moveSectionToEnd", () => {
  it("appends the key", () => {
    const row: CommandCenterSectionKey[] = ["command_header", "today_status", "recent_activity"];
    expect(moveSectionToEnd(row, "recent_activity").at(-1)).toBe("recent_activity");
  });
});
