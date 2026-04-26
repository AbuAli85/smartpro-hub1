/**
 * client/src/features/controlTower/ctRelatedRoutes.ts
 *
 * Maps relatedEntityType to the app route the operator should visit to fix the
 * underlying source issue.  Keeps Open Related navigation out of components.
 */

const RELATED_ROUTES: Record<string, string> = {
  payroll: "/payroll",
  payroll_run: "/payroll",
  leave_request: "/hr/leave",
  leave: "/hr/leave",
  employee_request: "/hr",
  employee: "/hr",
  compliance_case: "/compliance",
  work_permit: "/compliance/work-permits",
  omanization: "/compliance/omanization",
  renewal_workflow: "/compliance/renewals",
  invoice: "/finance/invoices",
  receivable: "/finance/receivables",
  sla: "/operations/sla",
  engagement: "/operations/engagements",
  task: "/operations/tasks",
  contract: "/contracts",
  document: "/documents",
  company_document: "/documents",
  employee_document: "/documents",
};

/**
 * Returns the app route for the given relatedEntityType, or null if unknown.
 * Callers should fall back to a sensible default (e.g. the Control Tower itself)
 * when null is returned.
 */
export function relatedEntityTypeToRoute(relatedEntityType: string | null | undefined): string | null {
  if (!relatedEntityType) return null;
  return RELATED_ROUTES[relatedEntityType.toLowerCase()] ?? null;
}
