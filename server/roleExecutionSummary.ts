/**
 * Role-scoped execution narrative — "what needs action now" by workspace role.
 * Uses the same counts as the owner pulse; does not duplicate DB queries.
 */

export type RoleExecutionPersona = "owner_admin" | "finance" | "hr" | "operations" | "read_only";

export type RoleExecutionView = {
  persona: RoleExecutionPersona;
  label: string;
  headline: string;
  focusBullets: string[];
  quickMetrics: Array<{
    label: string;
    value: string | number;
    href?: string;
    emphasis?: "default" | "warning" | "critical";
  }>;
};

export type RoleExecutionInput = {
  memberRole: string;
  decisionsOpen: number;
  collectionQueueCount: number;
  agedReceivablesOmr: number;
  contractsPendingSignature: number;
  renewalWorkflowsFailed: number;
  slaBreaches: number;
  openProServices: number;
  proOverdueCount: number;
  subscriptionOverdueCount: number;
  employeeTasksOverdue: number;
  employeeTasksBlocked: number;
  pendingLeaveCount: number;
  pendingExpenseCount: number;
};

export function mapMemberRoleToExecutionPersona(role: string): RoleExecutionPersona {
  switch (role) {
    case "company_admin":
      return "owner_admin";
    case "finance_admin":
      return "finance";
    case "hr_admin":
      return "hr";
    case "reviewer":
      return "operations";
    case "external_auditor":
      return "read_only";
    default:
      return "owner_admin";
  }
}

export function buildRoleExecutionView(input: RoleExecutionInput): RoleExecutionView {
  const persona = mapMemberRoleToExecutionPersona(input.memberRole);
  const label =
    persona === "owner_admin"
      ? "Owner / admin"
      : persona === "finance"
        ? "Finance"
        : persona === "hr"
          ? "HR"
          : persona === "operations"
            ? "Operations"
            : "Read-only";

  const quickBase = [
    { label: "Decisions queue (open)", value: input.decisionsOpen, href: "/dashboard", emphasis: input.decisionsOpen > 0 ? ("warning" as const) : ("default" as const) },
    { label: "Receivables at risk (OMR)", value: input.agedReceivablesOmr.toFixed(3), href: "/client-portal?tab=invoices", emphasis: input.agedReceivablesOmr > 0 ? ("warning" as const) : ("default" as const) },
    { label: "Collections queue rows", value: input.collectionQueueCount, href: "/dashboard" },
  ];

  if (persona === "read_only") {
    return {
      persona,
      label,
      headline: "Audit / read-only — review signals without execution",
      focusBullets: [
        "Actions are hidden; use links to open records in context.",
        "Figures reflect current workspace data for reporting.",
      ],
      quickMetrics: [
        { label: "Decisions (open)", value: input.decisionsOpen },
        { label: "AR at risk (OMR)", value: input.agedReceivablesOmr.toFixed(3) },
        { label: "SLA breaches", value: input.slaBreaches, emphasis: input.slaBreaches > 0 ? "critical" : "default" },
      ],
    };
  }

  if (persona === "finance") {
    return {
      persona,
      label,
      headline: "Finance — cash, receivables, and billing pressure",
      focusBullets: [
        "Prioritise overdue PRO and subscription invoices and the collections execution queue.",
        "Payroll approve / mark paid is limited to company admin on the server.",
        "Expense approvals sit in Finance / HR workflows.",
      ],
      quickMetrics: [
        { label: "PRO overdue rows", value: input.proOverdueCount, href: "/client-portal?tab=invoices", emphasis: input.proOverdueCount > 0 ? "warning" : "default" },
        { label: "Subscription overdue rows", value: input.subscriptionOverdueCount, href: "/subscriptions", emphasis: input.subscriptionOverdueCount > 0 ? "warning" : "default" },
        ...quickBase.slice(0, 3),
        { label: "Contracts pending signature", value: input.contractsPendingSignature, href: "/contracts", emphasis: input.contractsPendingSignature > 0 ? "warning" : "default" },
      ],
    };
  }

  if (persona === "hr") {
    return {
      persona,
      label,
      headline: "HR — people requests, leave, and policy workflow",
      focusBullets: [
        "Clear pending leave and employee requests from the execution queue.",
        "Watch task overdue / blocked counts for resolution follow-through.",
      ],
      quickMetrics: [
        { label: "Pending leave (in queue)", value: input.pendingLeaveCount, href: "/hr/leave", emphasis: input.pendingLeaveCount > 0 ? "warning" : "default" },
        { label: "Pending expenses (in queue)", value: input.pendingExpenseCount, href: "/finance/overview", emphasis: input.pendingExpenseCount > 0 ? "warning" : "default" },
        { label: "Employee tasks overdue", value: input.employeeTasksOverdue, href: "/hr/tasks", emphasis: input.employeeTasksOverdue > 0 ? "warning" : "default" },
        { label: "Employee tasks blocked", value: input.employeeTasksBlocked, href: "/hr/tasks", emphasis: input.employeeTasksBlocked > 0 ? "warning" : "default" },
        { label: "Decisions queue (open)", value: input.decisionsOpen, href: "/dashboard" },
      ],
    };
  }

  if (persona === "operations") {
    return {
      persona,
      label,
      headline: "Operations — delivery load and SLA",
      focusBullets: [
        "Track open PRO jobs, government cases, and SLA breaches.",
        "Use the decisions queue for items that unblock delivery.",
      ],
      quickMetrics: [
        { label: "Open PRO services", value: input.openProServices, href: "/pro", emphasis: input.openProServices > 0 ? "default" : "default" },
        { label: "SLA breaches (open)", value: input.slaBreaches, href: "/sla-management", emphasis: input.slaBreaches > 0 ? "critical" : "default" },
        { label: "Employee tasks overdue", value: input.employeeTasksOverdue, href: "/hr/tasks", emphasis: input.employeeTasksOverdue > 0 ? "warning" : "default" },
        { label: "Employee tasks blocked", value: input.employeeTasksBlocked, href: "/hr/tasks", emphasis: input.employeeTasksBlocked > 0 ? "warning" : "default" },
        { label: "Decisions queue (open)", value: input.decisionsOpen, href: "/dashboard" },
      ],
    };
  }

  return {
    persona: "owner_admin",
    label: "Owner / admin",
    headline: "Full workspace — approvals, risk, and collections",
    focusBullets: [
      "Use Approvals & decisions and Collections queue on the dashboard to close the loop.",
      "Review client health and renewal risk in the control tower.",
    ],
    quickMetrics: [
      ...quickBase,
      { label: "Contracts pending signature", value: input.contractsPendingSignature, href: "/contracts", emphasis: input.contractsPendingSignature > 0 ? "warning" : "default" },
      { label: "Renewal workflows failed", value: input.renewalWorkflowsFailed, href: "/renewal-workflows", emphasis: input.renewalWorkflowsFailed > 0 ? "critical" : "default" },
      { label: "SLA breaches", value: input.slaBreaches, href: "/sla-management", emphasis: input.slaBreaches > 0 ? "critical" : "default" },
    ],
  };
}
