/**
 * Post-sale / delivery / billing signals derived from existing tables.
 * Not all entities link to CRM contacts — metrics are tenant-scoped and clearly labeled in UI.
 */

import { and, count, eq, gte, inArray, isNotNull, lte, sql, sum } from "drizzle-orm";
import type { getDb } from "./db";
import type { Contract } from "../drizzle/schema";
import {
  contracts,
  governmentServiceCases,
  marketplaceBookings,
  proServices,
  subscriptionInvoices,
  proBillingCycles,
} from "../drizzle/schema";

export type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type PostSaleSignals = {
  /** Service contracts effective >14d ago with no PRO / gov case / marketplace booking created on or after contract effective date. */
  serviceContractsStalledNoDeliveryCount: number;
  /** First stalled contract id for deep link (if any). */
  stalledContractSampleId: number | null;
  /** Completed PRO services in last 90d with fees > 0 (billing tie-out is separate). */
  completedProWithFeesLast90dCount: number;
  /** Company-wide PRO billing overdue (OMR) — same as finance pulse; repeated for account views. */
  proBillingOverdueOmr: number;
  proBillingOverdueCount: number;
  /** SaaS subscription invoice overdue for tenant. */
  subscriptionOverdueOmr: number;
  subscriptionOverdueCount: number;
  /** Human-readable basis for derived “stalled” metric. */
  stalledDeliveryBasis: string;
  /** Human-readable basis for completed PRO count. */
  completedProFeesBasis: string;
  /** Explicit caveat: no per-job invoice linkage in schema — do not treat count as “uninvoiced” fact. */
  completedWorkBillingCaveat: string;
};

const STALL_AFTER_DAYS = 14;
const COMPLETED_PRO_LOOKBACK_DAYS = 90;

export const STALLED_DELIVERY_BASIS_SHORT =
  "Service contract signed/active, effective ≥14 days ago, with no PRO request, government case, or marketplace booking on or after the contract effective date (company-scoped; unrelated work can clear a contract).";

async function hasOperationalTouchAfter(
  db: DbClient,
  companyId: number,
  anchor: Date,
): Promise<boolean> {
  const [proAfter] = await db
    .select({ cnt: count() })
    .from(proServices)
    .where(and(eq(proServices.companyId, companyId), gte(proServices.createdAt, anchor)));
  if (Number(proAfter?.cnt ?? 0) > 0) return true;

  const [govAfter] = await db
    .select({ cnt: count() })
    .from(governmentServiceCases)
    .where(
      and(eq(governmentServiceCases.companyId, companyId), gte(governmentServiceCases.createdAt, anchor)),
    );
  if (Number(govAfter?.cnt ?? 0) > 0) return true;

  const [bookAfter] = await db
    .select({ cnt: count() })
    .from(marketplaceBookings)
    .where(and(eq(marketplaceBookings.companyId, companyId), gte(marketplaceBookings.createdAt, anchor)));
  return Number(bookAfter?.cnt ?? 0) > 0;
}

/**
 * True when a service contract is old enough to expect delivery signals but none exist after the effective date.
 */
export async function isServiceContractStalledNoDelivery(
  db: DbClient,
  companyId: number,
  c: Contract,
): Promise<boolean> {
  const now = new Date();
  const stallBefore = new Date(now.getTime() - STALL_AFTER_DAYS * 86400000);
  if (c.type !== "service") return false;
  if (!["signed", "active"].includes(c.status ?? "")) return false;
  const anchor = c.signedAt ?? c.createdAt;
  if (!anchor) return false;
  if (anchor > stallBefore) return false;
  return !(await hasOperationalTouchAfter(db, companyId, anchor));
}

/**
 * Among contracts already linked to a CRM contact (e.g. via quotations), which service agreements look stalled.
 */
export async function getContactPostSaleSummary(
  db: DbClient,
  companyId: number,
  contactContracts: Contract[],
): Promise<{
  stalledServiceContracts: Array<{ id: number; title: string }>;
  stalledBasis: string;
}> {
  const stalled: Array<{ id: number; title: string }> = [];
  for (const c of contactContracts) {
    if (await isServiceContractStalledNoDelivery(db, companyId, c)) {
      stalled.push({ id: c.id, title: c.title });
    }
  }
  return {
    stalledServiceContracts: stalled,
    stalledBasis: STALLED_DELIVERY_BASIS_SHORT,
  };
}

/**
 * Service contracts that match the stalled-delivery candidate set and fail the operational-touch check.
 * (Signed/active service contract, effective ≥14d ago, no PRO / gov case / marketplace booking after anchor.)
 */
export async function getStalledServiceContractIds(db: DbClient, companyId: number): Promise<Set<number>> {
  const now = new Date();
  const candidates = await db
    .select()
    .from(contracts)
    .where(
      and(
        eq(contracts.companyId, companyId),
        eq(contracts.type, "service"),
        inArray(contracts.status, ["signed", "active"]),
        lte(sql`COALESCE(${contracts.signedAt}, ${contracts.createdAt})`, new Date(now.getTime() - STALL_AFTER_DAYS * 86400000)),
      ),
    );

  const stalled = new Set<number>();
  for (const c of candidates) {
    if (await isServiceContractStalledNoDelivery(db, companyId, c)) stalled.add(c.id);
  }
  return stalled;
}

export async function getPostSaleSignals(db: DbClient, companyId: number): Promise<PostSaleSignals> {
  const now = new Date();
  const completedSince = new Date(now.getTime() - COMPLETED_PRO_LOOKBACK_DAYS * 86400000);

  const stalledIds = await getStalledServiceContractIds(db, companyId);
  let stalledContractSampleId: number | null = null;
  for (const id of stalledIds) {
    stalledContractSampleId = id;
    break;
  }

  const [completedProRow] = await db
    .select({ cnt: count() })
    .from(proServices)
    .where(
      and(
        eq(proServices.companyId, companyId),
        eq(proServices.status, "completed"),
        isNotNull(proServices.completedAt),
        isNotNull(proServices.fees),
        sql`CAST(${proServices.fees} AS DECIMAL(18,3)) > 0`,
        gte(proServices.completedAt, completedSince),
      ),
    );

  const [proOverdue] = await db
    .select({ cnt: count(), total: sum(proBillingCycles.amountOmr) })
    .from(proBillingCycles)
    .where(and(eq(proBillingCycles.companyId, companyId), eq(proBillingCycles.status, "overdue")));

  const [subOverdue] = await db
    .select({ cnt: count(), total: sum(subscriptionInvoices.amount) })
    .from(subscriptionInvoices)
    .where(and(eq(subscriptionInvoices.companyId, companyId), eq(subscriptionInvoices.status, "overdue")));

  return {
    serviceContractsStalledNoDeliveryCount: stalledIds.size,
    stalledContractSampleId,
    completedProWithFeesLast90dCount: Number(completedProRow?.cnt ?? 0),
    proBillingOverdueOmr: Number(proOverdue?.total ?? 0),
    proBillingOverdueCount: Number(proOverdue?.cnt ?? 0),
    subscriptionOverdueOmr: Number(subOverdue?.total ?? 0),
    subscriptionOverdueCount: Number(subOverdue?.cnt ?? 0),
    stalledDeliveryBasis:
      "Counts service contracts signed/active, effective ≥14 days ago, with no PRO request, government case, or marketplace booking created on or after the contract effective date (company-scoped; unrelated work can clear a contract).",
    completedProFeesBasis: `Counts completed PRO services in the last ${COMPLETED_PRO_LOOKBACK_DAYS} days with fees > 0. Does not prove invoicing — use PRO billing and client portal for cash collection.`,
    completedWorkBillingCaveat:
      "PRO jobs are not linked to invoice lines in this schema. The count above is a billing follow-up hint only — confirm collection in PRO billing cycles and finance; it is not a precise ‘uninvoiced’ total.",
  };
}
