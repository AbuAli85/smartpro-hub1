/**
 * Collections execution queue — overdue receivables with workflow status + recommended next step.
 */

import type { getDb } from "./db";
import {
  collectionWorkItems,
  companies,
  proBillingCycles,
  subscriptionInvoices,
} from "../drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { daysPastDue, bucketKeyForDaysPastDue, type ArBucketKey } from "./controlTower";

type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type CollectionSourceType = "pro_billing_cycle" | "subscription_invoice";

export type CollectionWorkflowStatus =
  | "needs_follow_up"
  | "promised_to_pay"
  | "escalated"
  | "disputed"
  | "resolved";

export type CollectionQueueRow = {
  sourceType: CollectionSourceType;
  sourceId: number;
  invoiceLabel: string;
  amountOmr: number;
  /** Days past due — 0 if unknown */
  daysPastDue: number;
  agingBucket: ArBucketKey;
  /** From persisted workflow or derived */
  workflowStatus: CollectionWorkflowStatus;
  note: string | null;
  recommendedAction: string;
  deepLink: string;
  priorityScore: number;
};

const STATUS_RANK: Record<CollectionWorkflowStatus, number> = {
  disputed: 0,
  escalated: 1,
  needs_follow_up: 2,
  promised_to_pay: 3,
  resolved: 4,
};

function recommendNext(status: CollectionWorkflowStatus, days: number): string {
  switch (status) {
    case "promised_to_pay":
      return "Confirm payment on promised date; update status if missed.";
    case "escalated":
      return "Owner follow-up or formal escalation per policy.";
    case "disputed":
      return "Resolve dispute record; adjust invoice or document agreement.";
    case "resolved":
      return "No further action unless re-opened.";
    default:
      if (days >= 61) return "Priority call — balance aged 61+ days.";
      if (days >= 31) return "Escalate if no response after documented attempts.";
      return "Send reminder and log promised payment date if given.";
  }
}

/** Exported for tests and optional client-side sorting; same formula as queue ordering. */
export function collectionPriorityScore(
  amount: number,
  days: number,
  status: CollectionWorkflowStatus,
): number {
  if (status === "resolved") return -1;
  const st = 5 - Math.min(4, STATUS_RANK[status] ?? 2);
  return amount * (1 + days / 30) * (1 + st * 0.1);
}

export async function listCollectionsExecutionQueue(
  db: DbClient,
  companyId: number,
  limit = 25,
  now: Date = new Date(),
): Promise<CollectionQueueRow[]> {
  const proRows = await db
    .select()
    .from(proBillingCycles)
    .where(eq(proBillingCycles.companyId, companyId));

  const subRows = await db
    .select()
    .from(subscriptionInvoices)
    .where(eq(subscriptionInvoices.companyId, companyId));

  const atRiskPro = proRows.filter((r) => {
    const due = r.dueDate ? new Date(r.dueDate) : null;
    const past = r.status === "pending" && due != null && due.getTime() < now.getTime();
    return r.status === "overdue" || past;
  });

  const atRiskSub = subRows.filter((r) => {
    const due = r.dueDate ? new Date(r.dueDate) : null;
    const issuedPast = r.status === "issued" && due != null && due.getTime() < now.getTime();
    return r.status === "overdue" || issuedPast;
  });

  const wRows = await db
    .select()
    .from(collectionWorkItems)
    .where(eq(collectionWorkItems.companyId, companyId));
  const workMap = new Map(
    wRows.map((w) => [
      `${w.sourceType}:${w.sourceId}`,
      { workflowStatus: w.workflowStatus as CollectionWorkflowStatus, note: w.note },
    ]),
  );

  const out: CollectionQueueRow[] = [];

  for (const r of atRiskPro) {
    const due = r.dueDate ? new Date(r.dueDate) : null;
    const days = daysPastDue(due, now);
    const bucket = bucketKeyForDaysPastDue(days);
    const key = `pro_billing_cycle:${r.id}`;
    const persisted = workMap.get(key);
    const workflowStatus: CollectionWorkflowStatus = persisted?.workflowStatus ?? "needs_follow_up";
    const amount = Number(r.amountOmr ?? 0);
    const ps = collectionPriorityScore(amount, days, workflowStatus);
    out.push({
      sourceType: "pro_billing_cycle",
      sourceId: r.id,
      invoiceLabel: r.invoiceNumber,
      amountOmr: amount,
      daysPastDue: days,
      agingBucket: bucket,
      workflowStatus,
      note: persisted?.note ?? null,
      recommendedAction: recommendNext(workflowStatus, days),
      deepLink: `/client-portal?tab=invoices`,
      priorityScore: ps,
    });
  }

  for (const r of atRiskSub) {
    const due = r.dueDate ? new Date(r.dueDate) : null;
    const days = daysPastDue(due, now);
    const bucket = bucketKeyForDaysPastDue(days);
    const key = `subscription_invoice:${r.id}`;
    const persisted = workMap.get(key);
    const workflowStatus: CollectionWorkflowStatus = persisted?.workflowStatus ?? "needs_follow_up";
    const amount = Number(r.amount ?? 0);
    const psSub = collectionPriorityScore(amount, days, workflowStatus);
    out.push({
      sourceType: "subscription_invoice",
      sourceId: r.id,
      invoiceLabel: r.invoiceNumber,
      amountOmr: amount,
      daysPastDue: days,
      agingBucket: bucket,
      workflowStatus,
      note: persisted?.note ?? null,
      recommendedAction: recommendNext(workflowStatus, days),
      deepLink: `/subscriptions`,
      priorityScore: psSub,
    });
  }

  return out
    .filter((r) => r.workflowStatus !== "resolved")
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, limit);
}

export type OverdueReceivableDetailRow = {
  companyId: number;
  companyName: string;
  sourceType: CollectionSourceType;
  sourceId: number;
  invoiceLabel: string;
  amountOmr: number;
  dueDate: Date | null;
  daysPastDue: number;
  agingBucket: ArBucketKey;
  workflowStatus: CollectionWorkflowStatus;
  note: string | null;
  dbStatus: string;
};

/**
 * All at-risk receivable lines (including resolved workflow) for aging tables and manual outreach.
 */
export async function listOverdueReceivableDetailRows(
  db: DbClient,
  params: { companyId?: number },
  now: Date = new Date(),
): Promise<OverdueReceivableDetailRow[]> {
  const companyCond =
    params.companyId != null ? eq(proBillingCycles.companyId, params.companyId) : sql`1=1`;
  const proJoined = await db
    .select({
      row: proBillingCycles,
      companyName: companies.name,
    })
    .from(proBillingCycles)
    .innerJoin(companies, eq(companies.id, proBillingCycles.companyId))
    .where(companyCond);

  const subCompanyCond =
    params.companyId != null ? eq(subscriptionInvoices.companyId, params.companyId) : sql`1=1`;
  const subJoined = await db
    .select({
      row: subscriptionInvoices,
      companyName: companies.name,
    })
    .from(subscriptionInvoices)
    .innerJoin(companies, eq(companies.id, subscriptionInvoices.companyId))
    .where(subCompanyCond);

  const workCond =
    params.companyId != null ? eq(collectionWorkItems.companyId, params.companyId) : sql`1=1`;
  const wRows = await db.select().from(collectionWorkItems).where(workCond);
  const workMap = new Map(
    wRows.map((w) => [
      `${w.sourceType}:${w.sourceId}`,
      { workflowStatus: w.workflowStatus as CollectionWorkflowStatus, note: w.note },
    ]),
  );

  const out: OverdueReceivableDetailRow[] = [];

  for (const { row: r, companyName } of proJoined) {
    const due = r.dueDate ? new Date(r.dueDate) : null;
    const past = r.status === "pending" && due != null && due.getTime() < now.getTime();
    const atRisk = r.status === "overdue" || past;
    if (!atRisk) continue;
    const days = daysPastDue(due, now);
    const bucket = bucketKeyForDaysPastDue(days);
    const key = `pro_billing_cycle:${r.id}`;
    const persisted = workMap.get(key);
    const workflowStatus: CollectionWorkflowStatus = persisted?.workflowStatus ?? "needs_follow_up";
    out.push({
      companyId: r.companyId,
      companyName,
      sourceType: "pro_billing_cycle",
      sourceId: r.id,
      invoiceLabel: r.invoiceNumber,
      amountOmr: Number(r.amountOmr ?? 0),
      dueDate: due,
      daysPastDue: days,
      agingBucket: bucket,
      workflowStatus,
      note: persisted?.note ?? null,
      dbStatus: r.status,
    });
  }

  for (const { row: r, companyName } of subJoined) {
    const due = r.dueDate ? new Date(r.dueDate) : null;
    const issuedPast = r.status === "issued" && due != null && due.getTime() < now.getTime();
    const atRisk = r.status === "overdue" || issuedPast;
    if (!atRisk) continue;
    const days = daysPastDue(due, now);
    const bucket = bucketKeyForDaysPastDue(days);
    const key = `subscription_invoice:${r.id}`;
    const persisted = workMap.get(key);
    const workflowStatus: CollectionWorkflowStatus = persisted?.workflowStatus ?? "needs_follow_up";
    out.push({
      companyId: r.companyId,
      companyName,
      sourceType: "subscription_invoice",
      sourceId: r.id,
      invoiceLabel: r.invoiceNumber,
      amountOmr: Number(r.amount ?? 0),
      dueDate: due,
      daysPastDue: days,
      agingBucket: bucket,
      workflowStatus,
      note: persisted?.note ?? null,
      dbStatus: r.status,
    });
  }

  return out.sort((a, b) => b.daysPastDue - a.daysPastDue || b.amountOmr - a.amountOmr);
}

export async function upsertCollectionWorkItem(
  db: DbClient,
  input: {
    companyId: number;
    userId: number;
    sourceType: CollectionSourceType;
    sourceId: number;
    workflowStatus: CollectionWorkflowStatus;
    note?: string | null;
  },
): Promise<void> {
  await db
    .insert(collectionWorkItems)
    .values({
      companyId: input.companyId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      workflowStatus: input.workflowStatus,
      note: input.note ?? null,
      updatedByUserId: input.userId,
    })
    .onDuplicateKeyUpdate({
      set: {
        workflowStatus: input.workflowStatus,
        note: input.note ?? null,
        updatedByUserId: input.userId,
      },
    });
}
