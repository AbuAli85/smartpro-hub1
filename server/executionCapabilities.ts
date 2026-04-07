/**
 * Maps company membership roles to which decision execution actions may run in the UI.
 * Must stay aligned with server mutation guards (payroll: company_admin only; employee requests: company_admin | hr_admin; etc.).
 */

import type { DecisionActionKey, DecisionWorkItem } from "./decisionWorkItems";

export function canExecuteDecisionAction(
  memberRole: string | null | undefined,
  actionKey: DecisionActionKey,
): boolean {
  /** Deep-link navigation — not a protected mutation */
  if (actionKey === "contract_open_sign") return true;
  if (memberRole === "external_auditor") return false;

  switch (actionKey) {
    case "payroll_approve_run":
    case "payroll_mark_paid":
      return memberRole === "company_admin";
    case "employee_request_approve":
    case "employee_request_reject":
      return memberRole === "company_admin" || memberRole === "hr_admin";
    case "leave_approve":
    case "leave_reject":
      return (
        memberRole === "company_admin" ||
        memberRole === "hr_admin" ||
        memberRole === "finance_admin" ||
        memberRole === "reviewer"
      );
    case "expense_approve":
    case "expense_reject":
      return memberRole === "company_admin" || memberRole === "finance_admin" || memberRole === "hr_admin";
    case "quotation_send":
      return (
        memberRole === "company_admin" ||
        memberRole === "finance_admin" ||
        memberRole === "hr_admin" ||
        memberRole === "reviewer"
      );
    default:
      return memberRole === "company_admin" || memberRole === "hr_admin" || memberRole === "finance_admin";
  }
}

export function filterDecisionWorkItemsForRole(
  items: DecisionWorkItem[],
  memberRole: string | null | undefined,
): DecisionWorkItem[] {
  return items.map((item) => ({
    ...item,
    actions: item.actions.filter((a) => canExecuteDecisionAction(memberRole, a.actionKey)),
  }));
}

/** Finance or company admin — matches collections upsert and collection UI. */
export function canActOnCollectionsQueue(memberRole: string | null | undefined): boolean {
  return memberRole === "company_admin" || memberRole === "finance_admin";
}
