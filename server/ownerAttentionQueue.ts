/**
 * Owner-facing “attention” items for the command center.
 * Hrefs are role-aware: platform operators use ops tools; company users use tenant-safe routes.
 */

export type AttentionSeverity = "critical" | "high" | "medium";

export type OwnerAttentionItem = {
  key: string;
  title: string;
  detail: string;
  severity: AttentionSeverity;
  href: string;
};

export type OwnerAttentionInput = {
  isPlatformOperator: boolean;
  slaBreaches: number;
  casesActionRequired: number;
  pendingLeaveRequests: number;
  payrollDraftThisMonth: number;
  pendingPayrollApprovedAwaitingPayment: number;
  expiringPermits7Days: number;
  employeeDocsExpiring7Days: number;
  pendingContracts: number;
  overdueInvoiceCount: number;
  overdueInvoiceTotalOmr: number;
  renewalWorkflowsFailed: number;
  draftQuotations: number;
  /** Accepted quotations not yet converted to a contract */
  acceptedQuotationsUnconverted?: number;
  /** SaaS subscription invoices overdue (SmartPRO plan billing) */
  saasSubscriptionOverdueCount?: number;
  saasSubscriptionOverdueOmr?: number;
  /** CRM deals marked closed won but no quotation is linked via crm_deal_id */
  closedWonDealsWithoutLinkedQuote?: number;
  /** Closed-won deals with an accepted quote still not converted to a contract */
  wonDealsAwaitingSignedAgreement?: number;
  /** Service contracts with end date in the next 30 days (signed/active) */
  contractsExpiringNext30Days?: number;
  /** Internal employee tasks past due date */
  employeeTasksOverdue?: number;
  /** Internal employee tasks in blocked state */
  employeeTasksBlocked?: number;
  /** Service contracts with no PRO/case/booking after effective date (derived) */
  serviceContractsStalledNoDelivery?: number;
  /** First stalled contract id — deep link to /contracts?id=… when set */
  stalledContractSampleId?: number | null;
};

/** Stable ordering: critical first, then high, then medium. */
export function buildOwnerAttentionQueue(input: OwnerAttentionInput): OwnerAttentionItem[] {
  const q: OwnerAttentionItem[] = [];
  const {
    isPlatformOperator,
    slaBreaches,
    casesActionRequired,
    pendingLeaveRequests,
    payrollDraftThisMonth,
    pendingPayrollApprovedAwaitingPayment,
    expiringPermits7Days,
    employeeDocsExpiring7Days,
    pendingContracts,
    overdueInvoiceCount,
    overdueInvoiceTotalOmr,
    renewalWorkflowsFailed,
    draftQuotations,
    acceptedQuotationsUnconverted = 0,
    saasSubscriptionOverdueCount = 0,
    saasSubscriptionOverdueOmr = 0,
    closedWonDealsWithoutLinkedQuote = 0,
    wonDealsAwaitingSignedAgreement = 0,
    contractsExpiringNext30Days = 0,
    employeeTasksOverdue = 0,
    employeeTasksBlocked = 0,
    serviceContractsStalledNoDelivery = 0,
    stalledContractSampleId = null,
  } = input;

  const slaHref = isPlatformOperator ? "/sla-management" : "/operations";
  const overdueHref = isPlatformOperator ? "/billing" : "/client/invoices";

  if (slaBreaches > 0) {
    q.push({
      key: "sla",
      title: `${slaBreaches} SLA breach${slaBreaches > 1 ? "es" : ""}`,
      detail: "Government cases have exceeded their SLA window — review and resolve or escalate.",
      severity: "critical",
      href: slaHref,
    });
  }
  if (casesActionRequired > 0) {
    q.push({
      key: "cases_action",
      title: `${casesActionRequired} case${casesActionRequired > 1 ? "s" : ""} need client action`,
      detail: "Documents or information are required before submission can continue.",
      severity: "high",
      href: "/workforce/cases",
    });
  }
  if (overdueInvoiceCount > 0) {
    q.push({
      key: "overdue_ar",
      title: `OMR ${overdueInvoiceTotalOmr.toFixed(3)} overdue (${overdueInvoiceCount} invoice${overdueInvoiceCount > 1 ? "s" : ""})`,
      detail: "Follow up on officer-service or PRO invoices to protect cash flow.",
      severity: "high",
      href: overdueHref,
    });
  }
  if (renewalWorkflowsFailed > 0) {
    q.push({
      key: "renewal_failed",
      title: `${renewalWorkflowsFailed} renewal workflow${renewalWorkflowsFailed > 1 ? "s" : ""} failed`,
      detail: "Automated renewals did not complete — open the run and fix or retry.",
      severity: "high",
      href: "/renewal-workflows",
    });
  }
  if (pendingLeaveRequests > 0) {
    q.push({
      key: "leave",
      title: `${pendingLeaveRequests} leave request${pendingLeaveRequests > 1 ? "s" : ""} to approve`,
      detail: "Employees are waiting for a decision on time off.",
      severity: "medium",
      href: "/hr/leave",
    });
  }
  if (payrollDraftThisMonth > 0) {
    q.push({
      key: "payroll_draft",
      title: `${payrollDraftThisMonth} payroll draft${payrollDraftThisMonth > 1 ? "s" : ""} this month`,
      detail: "Complete review and approval so salaries can be paid on time.",
      severity: "medium",
      href: "/payroll",
    });
  }
  if (pendingPayrollApprovedAwaitingPayment > 0) {
    q.push({
      key: "payroll_payment",
      title: `${pendingPayrollApprovedAwaitingPayment} payroll run${pendingPayrollApprovedAwaitingPayment > 1 ? "s" : ""} awaiting payment`,
      detail: "Payroll is approved — execute bank / WPS transfer and mark paid.",
      severity: "high",
      href: "/payroll/process",
    });
  }
  if (expiringPermits7Days > 0) {
    q.push({
      key: "permits_7d",
      title: `${expiringPermits7Days} work permit${expiringPermits7Days > 1 ? "s" : ""} expiring within 7 days`,
      detail: "Start renewal now to avoid fines and work stoppage.",
      severity: "high",
      href: "/workforce/permits",
    });
  }
  if (employeeDocsExpiring7Days > 0) {
    q.push({
      key: "emp_docs_7d",
      title: `${employeeDocsExpiring7Days} employee document${employeeDocsExpiring7Days > 1 ? "s" : ""} expiring within 7 days`,
      detail: "Upload renewals in the HR document vault before expiry.",
      severity: "medium",
      href: "/hr/documents-dashboard",
    });
  }
  if (pendingContracts > 0) {
    q.push({
      key: "contracts_sign",
      title: `${pendingContracts} contract${pendingContracts > 1 ? "s" : ""} awaiting signature`,
      detail: "Unsigned agreements delay revenue and service start.",
      severity: "medium",
      href: "/contracts",
    });
  }
  if (draftQuotations > 0) {
    q.push({
      key: "quotations_draft",
      title: `${draftQuotations} quotation${draftQuotations > 1 ? "s" : ""} still in draft`,
      detail: "Send or convert proposals to keep the sales pipeline moving.",
      severity: "medium",
      href: "/quotations",
    });
  }
  if (acceptedQuotationsUnconverted > 0) {
    q.push({
      key: "quotes_no_contract",
      title: `${acceptedQuotationsUnconverted} accepted quotation${acceptedQuotationsUnconverted > 1 ? "s" : ""} not linked to a contract`,
      detail: "Create the agreement or convert the quote so delivery and billing stay aligned.",
      severity: "high",
      href: "/quotations",
    });
  }
  if (closedWonDealsWithoutLinkedQuote > 0) {
    q.push({
      key: "won_no_quote",
      title: `${closedWonDealsWithoutLinkedQuote} closed-won deal${closedWonDealsWithoutLinkedQuote > 1 ? "s" : ""} with no linked quotation`,
      detail: "Link a quotation to the CRM deal or create one so the commercial record matches delivery and billing.",
      severity: "medium",
      href: "/crm",
    });
  }
  if (wonDealsAwaitingSignedAgreement > 0) {
    q.push({
      key: "won_pending_contract",
      title: `${wonDealsAwaitingSignedAgreement} won deal${wonDealsAwaitingSignedAgreement > 1 ? "s" : ""} — accepted quote still needs a contract`,
      detail: "Operational and billing handoff starts after a signed agreement or quote conversion.",
      severity: "high",
      href: "/quotations?filter=accepted",
    });
  }
  if (serviceContractsStalledNoDelivery > 0) {
    const stalledHref =
      stalledContractSampleId != null ? `/contracts?id=${stalledContractSampleId}` : "/contracts";
    q.push({
      key: "post_sale_stalled",
      title: `${serviceContractsStalledNoDelivery} service contract${serviceContractsStalledNoDelivery > 1 ? "s" : ""} — no delivery touch after signing (derived)`,
      detail:
        "No PRO request, government case, or marketplace booking recorded after the contract effective date — confirm operations have started.",
      severity: "high",
      href: stalledHref,
    });
  }
  if (contractsExpiringNext30Days > 0) {
    q.push({
      key: "contracts_expiring_30d",
      title: `${contractsExpiringNext30Days} contract${contractsExpiringNext30Days > 1 ? "s" : ""} expiring within 30 days`,
      detail: "Plan renewals or replacements before end dates to avoid service or revenue gaps.",
      severity: "medium",
      href: "/contracts",
    });
  }
  if (employeeTasksOverdue > 0) {
    q.push({
      key: "tasks_overdue",
      title: `${employeeTasksOverdue} internal task${employeeTasksOverdue > 1 ? "s" : ""} overdue`,
      detail: "Work assigned to staff is past due — clear blockers or re-prioritise.",
      severity: "medium",
      href: "/hr/tasks",
    });
  }
  if (employeeTasksBlocked > 0) {
    q.push({
      key: "tasks_blocked",
      title: `${employeeTasksBlocked} blocked internal task${employeeTasksBlocked > 1 ? "s" : ""}`,
      detail: "Resolve blocked reasons so delivery work can continue.",
      severity: "medium",
      href: "/hr/tasks",
    });
  }
  if (saasSubscriptionOverdueCount > 0) {
    q.push({
      key: "saas_overdue",
      title: `SmartPRO subscription: OMR ${saasSubscriptionOverdueOmr.toFixed(3)} overdue (${saasSubscriptionOverdueCount} invoice${saasSubscriptionOverdueCount > 1 ? "s" : ""})`,
      detail: "Your platform subscription is past due — settle to avoid service interruption.",
      severity: "high",
      href: "/subscriptions",
    });
  }

  const rank: Record<AttentionSeverity, number> = { critical: 0, high: 1, medium: 2 };
  return q.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
