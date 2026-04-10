import { describe, expect, it } from "vitest";
import {
  blockersBeforeTopActionsWhenBothVisible,
  getOrderedVisibleCommandCenterSections,
  shouldRenderCommandCenterSection,
} from "./employeeCommandCenterOrchestration";
import type { CommandCenterStateContext } from "./employeeCommandCenterState";
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

const allVisible = {
  hasBlockers: true,
  hasTopActions: true,
  hasHeadsUp: true,
  hasRecentActivity: true,
  collapseRecentForBlockers: false,
};

describe("shouldRenderCommandCenterSection", () => {
  it("hides blockers when none", () => {
    expect(shouldRenderCommandCenterSection("blockers", { ...allVisible, hasBlockers: false })).toBe(false);
  });
  it("hides top_actions when queue empty", () => {
    expect(shouldRenderCommandCenterSection("top_actions", { ...allVisible, hasTopActions: false })).toBe(false);
  });
  it("always shows today_status", () => {
    expect(shouldRenderCommandCenterSection("today_status", { ...allVisible, hasBlockers: false })).toBe(true);
  });
  it("hides recent_activity when collapsed for blockers", () => {
    expect(
      shouldRenderCommandCenterSection("recent_activity", {
        ...allVisible,
        hasRecentActivity: true,
        collapseRecentForBlockers: true,
      }),
    ).toBe(false);
  });
});

describe("getOrderedVisibleCommandCenterSections", () => {
  it("preserves relative order when middle sections are skipped", () => {
    const v = { ...allVisible, hasBlockers: false, hasHeadsUp: false, hasRecentActivity: false, collapseRecentForBlockers: false };
    const keys = getOrderedVisibleCommandCenterSections("default", v, neutral(), 0);
    const idx = (k: CommandCenterSectionKey) => keys.indexOf(k);
    expect(idx("work_summary")).toBeGreaterThan(idx("top_actions"));
    expect(idx("requests_summary")).toBeGreaterThan(idx("work_summary"));
    expect(keys).not.toContain("blockers");
    expect(keys).not.toContain("heads_up");
  });

  it("keeps blockers before top_actions when both visible (all profiles)", () => {
    const profiles = ["default", "field", "approver", "hr_operational", "store_sales"] as const;
    for (const p of profiles) {
      const keys = getOrderedVisibleCommandCenterSections(p, allVisible, neutral({ hasBlockers: true }), 0);
      expect(blockersBeforeTopActionsWhenBothVisible(keys)).toBe(true);
    }
  });

  it("places requests_summary before work_summary for approver and hr_operational", () => {
    for (const p of ["approver", "hr_operational"] as const) {
      const keys = getOrderedVisibleCommandCenterSections(p, allVisible, neutral(), 0);
      expect(keys.indexOf("requests_summary")).toBeLessThan(keys.indexOf("work_summary"));
    }
  });

  it("places work_summary before requests_summary for default", () => {
    const keys = getOrderedVisibleCommandCenterSections("default", allVisible, neutral(), 0);
    expect(keys.indexOf("work_summary")).toBeLessThan(keys.indexOf("requests_summary"));
  });

  it("places at_a_glance before requests_summary for field and store_sales", () => {
    for (const p of ["field", "store_sales"] as const) {
      const keys = getOrderedVisibleCommandCenterSections(p, allVisible, neutral(), 0);
      expect(keys.indexOf("at_a_glance")).toBeLessThan(keys.indexOf("requests_summary"));
    }
  });

  it("places recent_activity before work_summary for hr_operational", () => {
    const keys = getOrderedVisibleCommandCenterSections("hr_operational", allVisible, neutral(), 0);
    expect(keys.indexOf("recent_activity")).toBeLessThan(keys.indexOf("work_summary"));
  });
});

describe("getBaseCommandCenterSectionOrder contract", () => {
  it("includes each section key exactly once per profile", () => {
    const profiles = ["default", "field", "approver", "hr_operational", "store_sales"] as const;
    for (const p of profiles) {
      const order = getBaseCommandCenterSectionOrder(p);
      const set = new Set(order);
      expect(set.size).toBe(order.length);
    }
  });
});
