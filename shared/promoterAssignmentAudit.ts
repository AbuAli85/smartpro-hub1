/**
 * Standardized audit payload for `audit_logs.newValues` (JSON) on promoter_assignment events.
 * Single shape for queryability: eventType, ids, optional change + meta.
 */

export type PromoterAssignmentAuditEventType =
  | "assignment_created"
  | "assignment_updated"
  | "assignment_status_changed"
  | "assignment_rate_changed"
  | "assignment_supervisor_changed"
  | "assignment_cms_sync";

export type PromoterAssignmentAuditPayload = {
  assignmentId: string;
  companyId: number;
  employeeId: number;
  clientCompanyId: number;
  siteId: number | null;
  employerCompanyId: number;
  eventType: PromoterAssignmentAuditEventType;
  change?: {
    field: string;
    from: unknown;
    to: unknown;
  };
  meta?: Record<string, unknown>;
};

export function buildPromoterAssignmentAuditPayload(input: PromoterAssignmentAuditPayload): Record<string, unknown> {
  return {
    assignmentId: input.assignmentId,
    companyId: input.companyId,
    employeeId: input.employeeId,
    clientCompanyId: input.clientCompanyId,
    siteId: input.siteId,
    employerCompanyId: input.employerCompanyId,
    eventType: input.eventType,
    ...(input.change ? { change: input.change } : {}),
    ...(input.meta ? { meta: input.meta } : {}),
  };
}
