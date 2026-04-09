import type { ActionKind, ActionQueueItem } from "./actionQueueTypes";
import { sortActionQueueItems } from "./actionQueuePipeline";

/** Lower number = earlier in queue for that profile */
const ADMIN: Partial<Record<ActionKind, number>> = {
  payroll_blocker: 0,
  compliance_failure: 1,
  permit_expired: 2,
  government_case_overdue: 3,
  contract_signature_pending: 4,
  permit_expiring: 5,
  leave_approval_pending: 6,
  document_expiry: 7,
  task_overdue: 8,
  attendance_exception: 9,
  generic_attention: 10,
};

const HR: Partial<Record<ActionKind, number>> = {
  leave_approval_pending: 0,
  attendance_exception: 1,
  task_overdue: 2,
  payroll_blocker: 3,
  document_expiry: 4,
  permit_expiring: 5,
  permit_expired: 6,
  government_case_overdue: 7,
  contract_signature_pending: 8,
  compliance_failure: 9,
  generic_attention: 10,
};

const COMPLIANCE: Partial<Record<ActionKind, number>> = {
  permit_expired: 0,
  permit_expiring: 1,
  government_case_overdue: 2,
  compliance_failure: 3,
  document_expiry: 4,
  contract_signature_pending: 5,
  leave_approval_pending: 6,
  payroll_blocker: 7,
  task_overdue: 8,
  attendance_exception: 9,
  generic_attention: 10,
};

const FINANCE: Partial<Record<ActionKind, number>> = {
  payroll_blocker: 0,
  contract_signature_pending: 1,
  compliance_failure: 2,
  permit_expired: 3,
  government_case_overdue: 4,
  permit_expiring: 5,
  leave_approval_pending: 6,
  document_expiry: 7,
  task_overdue: 8,
  attendance_exception: 9,
  generic_attention: 10,
};

function tableFor(memberRole: string | null): Partial<Record<ActionKind, number>> {
  switch (memberRole) {
    case "hr_admin":
      return HR;
    case "finance_admin":
      return FINANCE;
    case "reviewer":
    case "external_auditor":
      return COMPLIANCE;
    case "company_admin":
    case "company_member":
    case "client":
    default:
      return ADMIN;
  }
}

function priority(kind: ActionKind, table: Partial<Record<ActionKind, number>>): number {
  return table[kind] ?? 100;
}

function compareTie(a: ActionQueueItem, b: ActionQueueItem): number {
  const [first] = sortActionQueueItems([a, b]);
  return first === a ? -1 : 1;
}

/**
 * Re-orders items for the active membership role without hiding anything (authorization stays on the server).
 * Tie-breakers preserve blocking / severity / due ordering from `sortActionQueueItems`.
 */
export function prioritizeActionQueueForRole(items: ActionQueueItem[], memberRole: string | null): ActionQueueItem[] {
  const table = tableFor(memberRole);
  return [...items].sort((a, b) => {
    const pa = priority(a.kind, table);
    const pb = priority(b.kind, table);
    if (pa !== pb) return pa - pb;
    return compareTie(a, b);
  });
}
