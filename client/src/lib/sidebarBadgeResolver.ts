import type { NavBadgeKey, NavBadgeTone } from "@/config/platformNav";

export type SidebarBadgeValue = {
  count: number;
  label: string;
  tone: NavBadgeTone;
};

export type SidebarBadgeMap = Partial<Record<NavBadgeKey, SidebarBadgeValue>>;

export type SidebarBadgeMetrics = {
  pendingInvites?: number | null;
  renewalsExpiringSoon?: number | null;
  renewalsCritical?: number | null;
  openGovernmentCases?: number | null;
  tasksOpen?: number | null;
  tasksOverdue?: number | null;
};

export function formatSidebarBadgeCount(count: number): string {
  if (count > 99) return "99+";
  return String(Math.max(0, count));
}

function safeCount(value: number | null | undefined): number {
  if (!value || value < 0) return 0;
  return value;
}

export function resolveSidebarBadgeMap(metrics: SidebarBadgeMetrics): SidebarBadgeMap {
  const out: SidebarBadgeMap = {};

  const pendingInvites = safeCount(metrics.pendingInvites);
  if (pendingInvites > 0) {
    out.teamAccessPendingInvites = {
      count: pendingInvites,
      label: formatSidebarBadgeCount(pendingInvites),
      tone: "warning",
    };
  }

  const renewalsCritical = safeCount(metrics.renewalsCritical);
  const renewalsExpiringSoon = safeCount(metrics.renewalsExpiringSoon);
  if (renewalsCritical > 0) {
    out.renewalsAttention = {
      count: renewalsCritical,
      label: formatSidebarBadgeCount(renewalsCritical),
      tone: "critical",
    };
  } else if (renewalsExpiringSoon > 0) {
    out.renewalsAttention = {
      count: renewalsExpiringSoon,
      label: formatSidebarBadgeCount(renewalsExpiringSoon),
      tone: "warning",
    };
  }

  const openGovernmentCases = safeCount(metrics.openGovernmentCases);
  if (openGovernmentCases > 0) {
    out.governmentCasesOpen = {
      count: openGovernmentCases,
      label: formatSidebarBadgeCount(openGovernmentCases),
      tone: "warning",
    };
  }

  const tasksOverdue = safeCount(metrics.tasksOverdue);
  const tasksOpen = safeCount(metrics.tasksOpen);
  if (tasksOverdue > 0) {
    out.taskManagerOpen = {
      count: tasksOverdue,
      label: formatSidebarBadgeCount(tasksOverdue),
      tone: "critical",
    };
  } else if (tasksOpen > 0) {
    out.taskManagerOpen = {
      count: tasksOpen,
      label: formatSidebarBadgeCount(tasksOpen),
      tone: "neutral",
    };
  }

  return out;
}
