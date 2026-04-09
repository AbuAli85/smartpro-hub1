import type { ActionKind, ActionQueueItem } from "./actionQueueTypes";

const WHY: Record<ActionKind, string> = {
  payroll_blocker:
    "Payroll cannot proceed until the issue is resolved.",
  permit_expired:
    "Expired permits increase compliance risk and may block workforce operations.",
  permit_expiring:
    "Permits nearing expiry can become operational blockers if not handled early.",
  government_case_overdue:
    "Overdue government cases may create service delays, penalties, or compliance exposure.",
  contract_signature_pending:
    "Pending signatures can delay approvals, onboarding, or revenue recognition.",
  leave_approval_pending:
    "Pending leave decisions affect workforce planning and employee communication.",
  attendance_exception:
    "Unresolved attendance exceptions can affect payroll accuracy and workforce records.",
  document_expiry:
    "Expiring documents can become compliance blockers if they lapse.",
  compliance_failure:
    "Unresolved compliance failures may block operations or increase regulatory exposure.",
  task_overdue:
    "Overdue tasks can cascade into missed commitments and reporting gaps.",
  generic_attention:
    "This item may need review to keep operations and records accurate.",
};

const RECOMMENDED: Record<ActionKind, string> = {
  payroll_blocker: "Review payroll exceptions and unblock the current run.",
  permit_expired: "Review and renew affected permits immediately.",
  permit_expiring: "Review permits approaching expiry and schedule renewals.",
  government_case_overdue: "Review overdue cases and assign follow-up immediately.",
  contract_signature_pending: "Review pending contracts and follow up for signature.",
  leave_approval_pending: "Review pending leave requests and approve or reject as needed.",
  attendance_exception: "Review attendance exceptions and resolve discrepancies.",
  document_expiry: "Review expiring documents and renew them before the deadline.",
  compliance_failure: "Review failed checks and address root causes.",
  task_overdue: "Open the task list and close or reschedule overdue work.",
  generic_attention: "Review the detail and take the next operational step.",
};

/**
 * Canonical copy for notifications and Control Tower — keyed by `ActionKind` only.
 */
export function getWhyThisMatters(item: ActionQueueItem): string {
  return WHY[item.kind] ?? WHY.generic_attention;
}

export function getRecommendedAction(item: ActionQueueItem): string {
  return RECOMMENDED[item.kind] ?? RECOMMENDED.generic_attention;
}
