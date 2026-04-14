import { describe, expect, it } from "vitest";
import { formatSidebarBadgeCount, resolveSidebarBadgeMap } from "./sidebarBadgeResolver";

describe("formatSidebarBadgeCount", () => {
  it("caps large counts", () => {
    expect(formatSidebarBadgeCount(4)).toBe("4");
    expect(formatSidebarBadgeCount(99)).toBe("99");
    expect(formatSidebarBadgeCount(120)).toBe("99+");
  });
});

describe("resolveSidebarBadgeMap", () => {
  it("hides all badges when counts are empty/missing", () => {
    expect(resolveSidebarBadgeMap({})).toEqual({});
    expect(
      resolveSidebarBadgeMap({
        pendingInvites: 0,
        renewalsExpiringSoon: 0,
        renewalsCritical: 0,
        openGovernmentCases: 0,
        tasksOpen: 0,
        tasksOverdue: 0,
      }),
    ).toEqual({});
  });

  it("returns warning for pending invites and open cases", () => {
    const m = resolveSidebarBadgeMap({
      pendingInvites: 3,
      openGovernmentCases: 11,
    });
    expect(m.teamAccessPendingInvites?.tone).toBe("warning");
    expect(m.teamAccessPendingInvites?.label).toBe("3");
    expect(m.governmentCasesOpen?.tone).toBe("warning");
    expect(m.governmentCasesOpen?.label).toBe("11");
  });

  it("prefers critical renewals over expiring-soon totals", () => {
    const m = resolveSidebarBadgeMap({
      renewalsExpiringSoon: 24,
      renewalsCritical: 4,
    });
    expect(m.renewalsAttention).toEqual({
      count: 4,
      label: "4",
      tone: "critical",
    });
  });

  it("uses warning renewals when critical unavailable", () => {
    const m = resolveSidebarBadgeMap({
      renewalsExpiringSoon: 8,
      renewalsCritical: 0,
    });
    expect(m.renewalsAttention?.tone).toBe("warning");
    expect(m.renewalsAttention?.label).toBe("8");
  });

  it("uses critical for overdue tasks else neutral for open tasks", () => {
    const critical = resolveSidebarBadgeMap({ tasksOpen: 12, tasksOverdue: 5 });
    expect(critical.taskManagerOpen?.tone).toBe("critical");
    expect(critical.taskManagerOpen?.label).toBe("5");

    const neutral = resolveSidebarBadgeMap({ tasksOpen: 120, tasksOverdue: 0 });
    expect(neutral.taskManagerOpen?.tone).toBe("neutral");
    expect(neutral.taskManagerOpen?.label).toBe("99+");
  });
});
