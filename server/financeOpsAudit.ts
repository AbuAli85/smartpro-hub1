/**
 * Finance operations audit helpers — expense reviews, loan balance updates, salary config changes.
 *
 * All helpers are mandatory (awaited, not fire-and-forget): if the audit insert fails the
 * surrounding mutation fails. This matches the pattern in tenantGovernanceAudit.ts.
 *
 * Sensitive data policy:
 *  - expense_reviewed: logs status transition and actor; no financial amounts
 *  - loan_balance_updated: logs previous/next balance and deduction delta (operational, not PII)
 *  - salary_config_upserted: logs employeeId, effectiveFrom, and which fields were set;
 *    does NOT log actual salary/rate values to avoid denormalising finance PII into the audit trail
 */

import { auditEvents } from "../drizzle/schema";

/** Drizzle-style client with `insert(auditEvents).values(...)`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbInsert = any;

export const FINANCE_OPS_ENTITY = {
  EXPENSE_CLAIM: "expense_claim",
  SALARY_LOAN: "salary_loan",
  EMPLOYEE_SALARY_CONFIG: "employee_salary_config",
} as const;

export const FINANCE_OPS_ACTION = {
  EXPENSE_REVIEWED: "expense_reviewed",
  LOAN_BALANCE_UPDATED: "loan_balance_updated",
  SALARY_CONFIG_UPSERTED: "salary_config_upserted",
} as const;

/**
 * Records an expense claim approval or rejection.
 * Logs the status transition and the reviewing actor; does not log the expense amount.
 */
export async function recordExpenseReviewedAudit(
  db: DbInsert,
  params: {
    companyId: number;
    actorUserId: number;
    expenseClaimId: number;
    previousStatus: string | null;
    nextStatus: string;
    adminNotes: string | null;
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    entityType: FINANCE_OPS_ENTITY.EXPENSE_CLAIM,
    entityId: params.expenseClaimId,
    action: FINANCE_OPS_ACTION.EXPENSE_REVIEWED,
    beforeState: params.previousStatus != null ? { expenseStatus: params.previousStatus } : null,
    afterState: { expenseStatus: params.nextStatus },
    metadata: params.adminNotes != null ? { adminNotes: params.adminNotes } : null,
  });
}

/**
 * Records a loan balance deduction.
 * Logs previous balance, next balance, and deduction delta — these are operational accounting
 * values, not personal data, so they are safe to include in the audit trail.
 */
export async function recordLoanBalanceUpdatedAudit(
  db: DbInsert,
  params: {
    companyId: number;
    actorUserId: number;
    loanId: number;
    previousBalance: string;
    nextBalance: number;
    deductedAmount: number;
    newStatus: string;
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    entityType: FINANCE_OPS_ENTITY.SALARY_LOAN,
    entityId: params.loanId,
    action: FINANCE_OPS_ACTION.LOAN_BALANCE_UPDATED,
    beforeState: { balanceRemaining: params.previousBalance },
    afterState: { balanceRemaining: String(params.nextBalance), status: params.newStatus },
    metadata: { deductedAmount: params.deductedAmount },
  });
}

/**
 * Records a salary configuration create-or-replace.
 * Logs which fields were configured and the effective date but NOT the actual salary/rate values,
 * to avoid denormalising finance PII into the shared audit trail.
 */
export async function recordSalaryConfigUpsertedAudit(
  db: DbInsert,
  params: {
    companyId: number;
    actorUserId: number;
    configId: number;
    employeeId: number;
    effectiveFrom: string;
    changedFields: string[];
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    entityType: FINANCE_OPS_ENTITY.EMPLOYEE_SALARY_CONFIG,
    entityId: params.configId,
    action: FINANCE_OPS_ACTION.SALARY_CONFIG_UPSERTED,
    beforeState: null,
    afterState: {
      employeeId: params.employeeId,
      effectiveFrom: params.effectiveFrom,
      changedFields: params.changedFields,
    },
    metadata: null,
  });
}
