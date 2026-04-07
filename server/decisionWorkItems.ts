/**
 * Unified decision / approval work items for owner execution surfaces.
 * Each item lists concrete tRPC action keys the client maps to real mutations (adapter pattern).
 */

import type { getDb } from "./db";
import {
  contracts,
  employeeRequests,
  expenseClaims,
  leaveRequests,
  payrollRuns,
  serviceQuotations,
  employees,
} from "../drizzle/schema";
import { and, desc, eq } from "drizzle-orm";

type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type DecisionWorkUrgency = "critical" | "high" | "medium";

/** Stable keys — client maps to trpc.hr.updateLeave, trpc.financeHR.reviewExpense, etc. */
export type DecisionActionKey =
  | "leave_approve"
  | "leave_reject"
  | "expense_approve"
  | "expense_reject"
  | "employee_request_approve"
  | "employee_request_reject"
  | "quotation_send"
  | "payroll_approve_run"
  | "payroll_mark_paid"
  | "contract_open_sign";

export type DecisionWorkItem = {
  workItemKey: string;
  entityType:
    | "leave_request"
    | "expense_claim"
    | "employee_request"
    | "service_quotation"
    | "payroll_run"
    | "contract";
  entityId: number;
  /** Disambiguates two payroll_run rows (draft approve vs approved→paid). */
  payrollAction?: "approve_run" | "mark_paid";
  title: string;
  subtitle: string;
  urgency: DecisionWorkUrgency;
  status: string;
  deepLink: string;
  /** Action affordances — executor must still enforce RBAC via existing mutations */
  actions: Array<{
    actionKey: DecisionActionKey;
    label: string;
    /** Hint for UI: destructive = reject */
    tone: "primary" | "secondary" | "destructive";
  }>;
  actorHint: string | null;
};

const PER_ITEM = 12;

export async function listDecisionWorkItems(
  db: DbClient,
  companyId: number,
  now: Date = new Date(),
): Promise<DecisionWorkItem[]> {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const out: DecisionWorkItem[] = [];

  const leaveRows = await db
    .select({
      lr: leaveRequests,
      emp: { firstName: employees.firstName, lastName: employees.lastName },
    })
    .from(leaveRequests)
    .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
    .where(and(eq(leaveRequests.companyId, companyId), eq(leaveRequests.status, "pending")))
    .orderBy(desc(leaveRequests.createdAt))
    .limit(PER_ITEM);

  for (const { lr, emp } of leaveRows) {
    const name = `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim() || "Employee";
    out.push({
      workItemKey: `leave:${lr.id}`,
      entityType: "leave_request",
      entityId: lr.id,
      title: `Leave: ${String(lr.leaveType ?? "request").replace(/_/g, " ")}`,
      subtitle: `${name} · ${lr.startDate ? new Date(lr.startDate).toLocaleDateString() : "?"} → ${lr.endDate ? new Date(lr.endDate).toLocaleDateString() : "?"}`,
      urgency: "medium",
      status: lr.status,
      deepLink: `/hr/leave`,
      actions: [
        { actionKey: "leave_approve", label: "Approve", tone: "primary" },
        { actionKey: "leave_reject", label: "Reject", tone: "destructive" },
      ],
      actorHint: name,
    });
  }

  const expRows = await db
    .select({
      claim: expenseClaims,
      empName: employees.firstName,
      empLast: employees.lastName,
    })
    .from(expenseClaims)
    .leftJoin(employees, eq(employees.id, expenseClaims.employeeUserId))
    .where(and(eq(expenseClaims.companyId, companyId), eq(expenseClaims.expenseStatus, "pending")))
    .orderBy(desc(expenseClaims.createdAt))
    .limit(PER_ITEM);

  for (const r of expRows) {
    const name =
      r.empName && r.empLast ? `${r.empName} ${r.empLast}` : r.empName ?? "Employee";
    out.push({
      workItemKey: `expense:${r.claim.id}`,
      entityType: "expense_claim",
      entityId: r.claim.id,
      title: `Expense: ${r.claim.expenseCategory}`,
      subtitle: `${name} · OMR ${r.claim.amount} · ${r.claim.claimDate}`,
      urgency: "medium",
      status: r.claim.expenseStatus,
      deepLink: `/finance/overview`,
      actions: [
        { actionKey: "expense_approve", label: "Approve", tone: "primary" },
        { actionKey: "expense_reject", label: "Reject", tone: "destructive" },
      ],
      actorHint: name,
    });
  }

  const erRows = await db
    .select({
      er: employeeRequests,
      fn: employees.firstName,
      ln: employees.lastName,
    })
    .from(employeeRequests)
    .innerJoin(employees, eq(employeeRequests.employeeId, employees.id))
    .where(and(eq(employeeRequests.companyId, companyId), eq(employeeRequests.status, "pending")))
    .orderBy(desc(employeeRequests.createdAt))
    .limit(PER_ITEM);

  for (const { er, fn, ln } of erRows) {
    const name = `${fn ?? ""} ${ln ?? ""}`.trim();
    out.push({
      workItemKey: `empreq:${er.id}`,
      entityType: "employee_request",
      entityId: er.id,
      title: `Request (${er.type}): ${er.subject}`,
      subtitle: name,
      urgency: "medium",
      status: er.status,
      deepLink: `/hr/employee-requests`,
      actions: [
        { actionKey: "employee_request_approve", label: "Approve", tone: "primary" },
        { actionKey: "employee_request_reject", label: "Reject", tone: "destructive" },
      ],
      actorHint: name,
    });
  }

  const qRows = await db
    .select()
    .from(serviceQuotations)
    .where(and(eq(serviceQuotations.companyId, companyId), eq(serviceQuotations.status, "draft")))
    .orderBy(desc(serviceQuotations.updatedAt))
    .limit(8);

  for (const q of qRows) {
    out.push({
      workItemKey: `quote:${q.id}`,
      entityType: "service_quotation",
      entityId: q.id,
      title: `Quotation ${q.referenceNumber}`,
      subtitle: `${q.clientName} · draft`,
      urgency: "high",
      status: q.status,
      deepLink: `/quotations?quote=${q.id}`,
      actions: [{ actionKey: "quotation_send", label: "Send quotation", tone: "primary" }],
      actorHint: null,
    });
  }

  const prRows = await db
    .select()
    .from(payrollRuns)
    .where(
      and(
        eq(payrollRuns.companyId, companyId),
        eq(payrollRuns.periodMonth, month),
        eq(payrollRuns.periodYear, year),
        eq(payrollRuns.status, "draft"),
      ),
    )
    .orderBy(desc(payrollRuns.updatedAt))
    .limit(5);

  for (const pr of prRows) {
    out.push({
      workItemKey: `payroll:${pr.id}`,
      entityType: "payroll_run",
      entityId: pr.id,
      payrollAction: "approve_run",
      title: `Payroll run ${pr.periodMonth}/${pr.periodYear}`,
      subtitle: "Draft — review and approve",
      urgency: "high",
      status: pr.status,
      deepLink: `/payroll`,
      actions: [{ actionKey: "payroll_approve_run", label: "Approve run", tone: "primary" }],
      actorHint: null,
    });
  }

  const apprRows = await db
    .select()
    .from(payrollRuns)
    .where(and(eq(payrollRuns.companyId, companyId), eq(payrollRuns.status, "approved")))
    .orderBy(desc(payrollRuns.updatedAt))
    .limit(5);

  for (const pr of apprRows) {
    out.push({
      workItemKey: `payrollpay:${pr.id}`,
      entityType: "payroll_run",
      entityId: pr.id,
      payrollAction: "mark_paid",
      title: `Payroll ${pr.periodMonth}/${pr.periodYear} — awaiting payment`,
      subtitle: "Approved; execute transfer / WPS",
      urgency: "high",
      status: pr.status,
      deepLink: `/payroll/process`,
      actions: [{ actionKey: "payroll_mark_paid", label: "Mark paid", tone: "primary" }],
      actorHint: null,
    });
  }

  const pendingContracts = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.companyId, companyId), eq(contracts.status, "pending_signature")))
    .orderBy(desc(contracts.updatedAt))
    .limit(8);

  for (const c of pendingContracts) {
    out.push({
      workItemKey: `contract:${c.id}`,
      entityType: "contract",
      entityId: c.id,
      title: c.title,
      subtitle: "Pending signature",
      urgency: "medium",
      status: c.status ?? "pending_signature",
      deepLink: `/contracts?id=${c.id}`,
      actions: [{ actionKey: "contract_open_sign", label: "Open contract", tone: "secondary" }],
      actorHint: null,
    });
  }

  const rank: Record<DecisionWorkUrgency, number> = { critical: 0, high: 1, medium: 2 };
  return out.sort((a, b) => rank[a.urgency] - rank[b.urgency] || b.entityId - a.entityId).slice(0, 40);
}
