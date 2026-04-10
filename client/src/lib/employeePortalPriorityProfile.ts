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

/**
 * Ordered slots for the employee Command Center (Phase 2.5).
 * `pay_and_files` — payslip / docs strip. `secondary_tools` — leave, insights, news, expiring docs (utility bundle).
 */
export type CommandCenterSectionKey =
  | "command_header"
  | "today_status"
  | "blockers"
  | "top_actions"
  | "heads_up"
  | "work_summary"
  | "requests_summary"
  | "hr_month"
  | "recent_activity"
  | "pay_and_files"
  | "at_a_glance"
  | "secondary_tools";

/** Default: today → blockers → actions → work → requests → history → utilities. */
const DEFAULT_ORDER: CommandCenterSectionKey[] = [
  "command_header",
  "today_status",
  "blockers",
  "top_actions",
  "heads_up",
  "work_summary",
  "requests_summary",
  "recent_activity",
  "hr_month",
  "pay_and_files",
  "at_a_glance",
  "secondary_tools",
];

/** Field: execution + glance before requests pipeline. */
const FIELD_ORDER: CommandCenterSectionKey[] = [
  "command_header",
  "today_status",
  "blockers",
  "top_actions",
  "heads_up",
  "work_summary",
  "at_a_glance",
  "requests_summary",
  "recent_activity",
  "pay_and_files",
  "hr_month",
  "secondary_tools",
];

/** Approver: requests pipeline before personal work queue. */
const APPROVER_ORDER: CommandCenterSectionKey[] = [
  "command_header",
  "today_status",
  "blockers",
  "requests_summary",
  "top_actions",
  "heads_up",
  "work_summary",
  "recent_activity",
  "pay_and_files",
  "at_a_glance",
  "hr_month",
  "secondary_tools",
];

/** HR operational: records / activity before work summary. */
const HR_OPS_ORDER: CommandCenterSectionKey[] = [
  "command_header",
  "today_status",
  "blockers",
  "requests_summary",
  "top_actions",
  "heads_up",
  "recent_activity",
  "work_summary",
  "pay_and_files",
  "at_a_glance",
  "hr_month",
  "secondary_tools",
];

/** Store / sales: short-cycle work and glance before requests. */
const STORE_ORDER: CommandCenterSectionKey[] = [
  "command_header",
  "today_status",
  "blockers",
  "top_actions",
  "heads_up",
  "work_summary",
  "at_a_glance",
  "requests_summary",
  "recent_activity",
  "pay_and_files",
  "hr_month",
  "secondary_tools",
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
