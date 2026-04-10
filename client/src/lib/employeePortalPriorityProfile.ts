/**
 * Lightweight role-based Command Center ordering (Phase 2).
 * Same sections; only order and which optional strip is emphasized changes.
 */

export type EmployeePortalPriorityProfile =
  | "default"
  | "field"
  | "approver"
  | "hr_operational"
  | "store_sales";

export type CommandCenterSectionKey =
  | "command_header"
  | "today_status"
  | "blockers"
  | "top_actions"
  | "heads_up"
  | "work_summary"
  | "requests_summary"
  | "leave_quick"
  | "pay_files"
  | "hr_month"
  | "recent_activity"
  | "more_insights"
  | "announcements"
  | "expiring_docs"
  | "at_a_glance";

const DEFAULT_ORDER: CommandCenterSectionKey[] = [
  "command_header",
  "today_status",
  "blockers",
  "top_actions",
  "heads_up",
  "work_summary",
  "requests_summary",
  "leave_quick",
  "pay_files",
  "hr_month",
  "recent_activity",
  "more_insights",
  "announcements",
  "expiring_docs",
  "at_a_glance",
];

const FIELD_ORDER: CommandCenterSectionKey[] = [
  "command_header",
  "today_status",
  "blockers",
  "top_actions",
  "work_summary",
  "hr_month",
  "requests_summary",
  "leave_quick",
  "heads_up",
  "pay_files",
  "recent_activity",
  "more_insights",
  "announcements",
  "expiring_docs",
  "at_a_glance",
];

const APPROVER_ORDER: CommandCenterSectionKey[] = [
  "command_header",
  "today_status",
  "blockers",
  "requests_summary",
  "top_actions",
  "work_summary",
  "heads_up",
  "leave_quick",
  "pay_files",
  "hr_month",
  "recent_activity",
  "more_insights",
  "announcements",
  "expiring_docs",
  "at_a_glance",
];

const HR_OPS_ORDER: CommandCenterSectionKey[] = [
  "command_header",
  "today_status",
  "blockers",
  "requests_summary",
  "top_actions",
  "heads_up",
  "work_summary",
  "hr_month",
  "leave_quick",
  "pay_files",
  "recent_activity",
  "more_insights",
  "announcements",
  "expiring_docs",
  "at_a_glance",
];

const STORE_ORDER: CommandCenterSectionKey[] = [
  "command_header",
  "today_status",
  "blockers",
  "top_actions",
  "work_summary",
  "hr_month",
  "requests_summary",
  "leave_quick",
  "heads_up",
  "pay_files",
  "recent_activity",
  "more_insights",
  "announcements",
  "expiring_docs",
  "at_a_glance",
];

export function resolveEmployeePortalPriorityProfile(input: {
  membershipRole: string | null | undefined;
  position?: string | null;
  department?: string | null;
}): EmployeePortalPriorityProfile {
  const role = (input.membershipRole ?? "").toLowerCase();
  const pos = (input.position ?? "").toLowerCase();
  const dep = (input.department ?? "").toLowerCase();

  if (role === "hr_admin" || role === "company_admin") {
    return "hr_operational";
  }
  if (role === "reviewer") {
    return "approver";
  }
  if (
    pos.includes("supervisor") ||
    pos.includes("manager") ||
    pos.includes("team lead") ||
    dep.includes("operations")
  ) {
    return "approver";
  }
  if (
    pos.includes("driver") ||
    pos.includes("field") ||
    pos.includes("technician") ||
    pos.includes("installer") ||
    dep.includes("field")
  ) {
    return "field";
  }
  if (pos.includes("sales") || dep.includes("retail") || dep.includes("store")) {
    return "store_sales";
  }
  return "default";
}

export function getCommandCenterSectionOrder(profile: EmployeePortalPriorityProfile): CommandCenterSectionKey[] {
  switch (profile) {
    case "field":
      return [...FIELD_ORDER];
    case "approver":
      return [...APPROVER_ORDER];
    case "hr_operational":
      return [...HR_OPS_ORDER];
    case "store_sales":
      return [...STORE_ORDER];
    default:
      return [...DEFAULT_ORDER];
  }
}
