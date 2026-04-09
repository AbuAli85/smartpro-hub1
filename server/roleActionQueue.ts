export type QueueRoleView = "ceo" | "admin" | "hr" | "finance" | "compliance";

export type RoleActionQueueItem = {
  id: string;
  type:
    | "payroll_blocker"
    | "permit_expiry"
    | "government_case_overdue"
    | "hr_approval"
    | "task"
    | "document_issue";
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  ownerUserId: string | null;
  dueAt: string | null;
  status: "open" | "pending" | "blocked" | "overdue" | "resolved";
  href: string;
  reason: string;
};

const severityRank: Record<RoleActionQueueItem["severity"], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function statusUrgencyRank(status: RoleActionQueueItem["status"]): number {
  if (status === "overdue") return 3;
  if (status === "blocked") return 2;
  if (status === "pending") return 1;
  return 0;
}

function dueAtTs(dueAt: string | null): number {
  if (!dueAt) return Number.MAX_SAFE_INTEGER;
  const ts = Date.parse(dueAt);
  return Number.isFinite(ts) ? ts : Number.MAX_SAFE_INTEGER;
}

export function sortRoleActionQueue(items: RoleActionQueueItem[]): RoleActionQueueItem[] {
  return [...items].sort((a, b) => {
    const sev = severityRank[b.severity] - severityRank[a.severity];
    if (sev !== 0) return sev;
    const urg = statusUrgencyRank(b.status) - statusUrgencyRank(a.status);
    if (urg !== 0) return urg;
    const due = dueAtTs(a.dueAt) - dueAtTs(b.dueAt);
    if (due !== 0) return due;
    return a.id.localeCompare(b.id);
  });
}

export function rankForRole(
  item: RoleActionQueueItem,
  roleView: QueueRoleView,
): number {
  switch (roleView) {
    case "finance":
      if (item.type === "payroll_blocker") return 5;
      if (item.type === "document_issue") return 3;
      if (item.type === "hr_approval") return 2;
      return 1;
    case "hr":
      if (item.type === "hr_approval" || item.type === "task") return 5;
      if (item.type === "permit_expiry" || item.type === "document_issue") return 4;
      if (item.type === "payroll_blocker") return 3;
      return 1;
    case "compliance":
      if (item.type === "permit_expiry" || item.type === "government_case_overdue") return 5;
      if (item.type === "document_issue" || item.type === "payroll_blocker") return 4;
      return 1;
    case "ceo":
      if (item.severity === "critical") return 5;
      if (item.severity === "high") return 4;
      return 2;
    case "admin":
    default:
      return 3;
  }
}

export function prioritizeForRole(
  items: RoleActionQueueItem[],
  roleView: QueueRoleView,
): RoleActionQueueItem[] {
  return [...items].sort((a, b) => {
    const pr = rankForRole(b, roleView) - rankForRole(a, roleView);
    if (pr !== 0) return pr;
    return sortRoleActionQueue([a, b])[0].id === a.id ? -1 : 1;
  });
}
