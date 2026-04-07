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
  } = input;

  const slaHref = isPlatformOperator ? "/sla-management" : "/operations";
  const overdueHref = isPlatformOperator ? "/billing" : "/client-portal?tab=invoices";

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
