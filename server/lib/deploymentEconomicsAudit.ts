import { insertHrPerformanceAuditEvent } from "../hrPerformanceAudit";

/** `audit_events.entityType` for deployment economics Phase 1. */
export const DEPLOYMENT_ECONOMICS_ENTITY = {
  billingCustomer: "billing_customer",
  customerDeployment: "customer_deployment",
  customerDeploymentAssignment: "customer_deployment_assignment",
  billingRateRule: "billing_rate_rule",
} as const;

type DbLike = Parameters<typeof insertHrPerformanceAuditEvent>[0];

export async function auditDeploymentEconomics(
  db: DbLike,
  params: {
    companyId: number;
    actorUserId: number;
    entityType: (typeof DEPLOYMENT_ECONOMICS_ENTITY)[keyof typeof DEPLOYMENT_ECONOMICS_ENTITY];
    entityId: number;
    action: string;
    beforeState: Record<string, unknown> | null;
    afterState: Record<string, unknown> | null;
  }
): Promise<void> {
  await insertHrPerformanceAuditEvent(db, params);
}
