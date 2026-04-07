/**
 * Revenue realization / billing follow-through — deterministic, tenant-scoped signals.
 * There is no pro_service_id on pro_billing_cycles; invoice lines do not tie to jobs in schema.
 * This module uses honest derived hints only (see basis / caveats on each payload).
 */

import { and, count, desc, eq, gte, isNotNull, sql, sum } from "drizzle-orm";
import type { getDb } from "./db";
import { marketplaceBookings, proBillingCycles, proServices } from "../drizzle/schema";
import type { PostSaleSignals } from "./postSaleSignals";
import type { AccountHealthTier, AccountPortfolioSnapshot, PortfolioAccountRow } from "./accountHealth";

export type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export const REVENUE_REALIZATION_BASIS = `Signals compare operational completion (PRO jobs with fees, marketplace bookings completed with amount) against tenant-level PRO billing cycle states. There is no one-to-one invoice line ↔ job link in the current schema — “billing follow-through” is a workspace-level hint when fee-bearing completions coexist with pending or overdue officer billing cycles.`;

export const REVENUE_REALIZATION_CAVEAT = `PRO billing cycles are officer/assignment/month aggregates — not per completed job. Do not treat counts as exact uninvoiced amounts.`;

export type CompletedProSample = {
  id: number;
  serviceNumber: string;
  feesOmr: number;
  completedAt: string;
  /** Deep link: /pro?q=serviceNumber */
  proListHref: string;
};

export type NextRevenueAction = {
  label: string;
  href: string;
  basis: string;
};

export type RevenueRealizationSnapshot = {
  basis: string;
  caveat: string;
  /** Fee-bearing PRO completions in last 90d (same basis as post-sale pulse). */
  completedProWithFeesLast90dCount: number;
  proBillingPendingCount: number;
  proBillingOverdueCount: number;
  proBillingOverdueOmr: number;
  /** True when completions with fees exist while billing cycles are not fully settled (pending or overdue). */
  billingFollowThroughPressure: boolean;
  tenantHasProBillingOverdue: boolean;
  /** Completed marketplace bookings in 90d with amount > 0 (monetization candidates — no invoice link). */
  marketplaceCompletedWithAmountLast90d: { count: number; totalAmountOmr: number };
  /** Recent completed PRO with fees for owner review (max 5). */
  recentCompletedProForBillingReview: CompletedProSample[];
  nextRecommendedActions: NextRevenueAction[];
};

const SAMPLE_DAYS = 60;
const MARKETPLACE_LOOKBACK_DAYS = 90;

export async function buildRevenueRealizationSnapshot(
  db: DbClient,
  companyId: number,
  postSale: PostSaleSignals,
  proBillingPendingCount: number,
): Promise<RevenueRealizationSnapshot> {
  const now = new Date();
  const sinceSample = new Date(now.getTime() - SAMPLE_DAYS * 86400000);
  const sinceMkt = new Date(now.getTime() - MARKETPLACE_LOOKBACK_DAYS * 86400000);

  const tenantHasProBillingOverdue = postSale.proBillingOverdueCount > 0;
  const billingFollowThroughPressure =
    postSale.completedProWithFeesLast90dCount > 0 &&
    (proBillingPendingCount > 0 || postSale.proBillingOverdueCount > 0);

  const recentRows = await db
    .select({
      id: proServices.id,
      serviceNumber: proServices.serviceNumber,
      fees: proServices.fees,
      completedAt: proServices.completedAt,
    })
    .from(proServices)
    .where(
      and(
        eq(proServices.companyId, companyId),
        eq(proServices.status, "completed"),
        isNotNull(proServices.completedAt),
        isNotNull(proServices.fees),
        sql`CAST(${proServices.fees} AS DECIMAL(18,3)) > 0`,
        gte(proServices.completedAt, sinceSample),
      ),
    )
    .orderBy(desc(proServices.completedAt))
    .limit(5);

  const [mkt] = await db
    .select({ cnt: count(), total: sum(marketplaceBookings.amount) })
    .from(marketplaceBookings)
    .where(
      and(
        eq(marketplaceBookings.companyId, companyId),
        eq(marketplaceBookings.status, "completed"),
        isNotNull(marketplaceBookings.completedAt),
        gte(marketplaceBookings.completedAt, sinceMkt),
        isNotNull(marketplaceBookings.amount),
        sql`CAST(${marketplaceBookings.amount} AS DECIMAL(18,3)) > 0`,
      ),
    );

  const recentCompletedProForBillingReview: CompletedProSample[] = recentRows.map((r) => ({
    id: r.id,
    serviceNumber: r.serviceNumber,
    feesOmr: Number(r.fees ?? 0),
    completedAt: r.completedAt ? new Date(r.completedAt).toISOString() : "",
    proListHref: `/pro?q=${encodeURIComponent(r.serviceNumber)}`,
  }));

  const nextRecommendedActions: NextRevenueAction[] = [];

  if (billingFollowThroughPressure) {
    nextRecommendedActions.push({
      label: "Reconcile PRO billing cycles",
      href: "/client-portal?tab=invoices",
      basis:
        "Fee-bearing PRO completions exist in the lookback while officer billing cycles are pending or overdue (tenant-level).",
    });
  }
  if (tenantHasProBillingOverdue) {
    nextRecommendedActions.push({
      label: "Collect overdue officer billing",
      href: "/client-portal?tab=invoices",
      basis: "At least one PRO billing cycle is overdue for this workspace.",
    });
  }
  if (recentCompletedProForBillingReview.length > 0) {
    nextRecommendedActions.push({
      label: `Review latest job ${recentCompletedProForBillingReview[0].serviceNumber}`,
      href: recentCompletedProForBillingReview[0].proListHref,
      basis: "Recent completed PRO with fees — confirm finance alignment (derived, not invoice-matched).",
    });
  }
  if (Number(mkt?.cnt ?? 0) > 0) {
    nextRecommendedActions.push({
      label: "Marketplace completed value",
      href: "/marketplace",
      basis: `${Number(mkt?.cnt ?? 0)} completed booking(s) with amount in ${MARKETPLACE_LOOKBACK_DAYS}d — no invoice linkage in schema.`,
    });
  }

  return {
    basis: REVENUE_REALIZATION_BASIS,
    caveat: REVENUE_REALIZATION_CAVEAT,
    completedProWithFeesLast90dCount: postSale.completedProWithFeesLast90dCount,
    proBillingPendingCount,
    proBillingOverdueCount: postSale.proBillingOverdueCount,
    proBillingOverdueOmr: postSale.proBillingOverdueOmr,
    billingFollowThroughPressure,
    tenantHasProBillingOverdue,
    marketplaceCompletedWithAmountLast90d: {
      count: Number(mkt?.cnt ?? 0),
      totalAmountOmr: Number(mkt?.total ?? 0),
    },
    recentCompletedProForBillingReview,
    nextRecommendedActions: dedupeActions(nextRecommendedActions),
  };
}

function dedupeActions(a: NextRevenueAction[]): NextRevenueAction[] {
  const seen = new Set<string>();
  const out: NextRevenueAction[] = [];
  for (const x of a) {
    if (seen.has(x.href)) continue;
    seen.add(x.href);
    out.push(x);
  }
  return out.slice(0, 6);
}

/** Renewal pressure + weak monetization posture (tenant billing stress or follow-through hint). */
export function selectRenewalMonetizationRiskRows(
  portfolio: AccountPortfolioSnapshot,
  rr: RevenueRealizationSnapshot,
): PortfolioAccountRow[] {
  const stress = rr.billingFollowThroughPressure || rr.tenantHasProBillingOverdue;
  if (!stress) return [];
  return portfolio.renewalRisk
    .filter((r) => r.signals.expiringContractsNext30dCount > 0 && (r.renewalWeakFollowUp || r.tier === "at_risk" || r.tier === "urgent"))
    .slice(0, 5);
}

export type ContactRevenueRealizationHints = {
  basis: string;
  caveat: string;
  /** Same numbers as workspace — PRO billing is not per-contact in schema. */
  workspaceSnapshot: Pick<
    RevenueRealizationSnapshot,
    | "completedProWithFeesLast90dCount"
    | "proBillingPendingCount"
    | "proBillingOverdueCount"
    | "proBillingOverdueOmr"
    | "billingFollowThroughPressure"
    | "tenantHasProBillingOverdue"
    | "marketplaceCompletedWithAmountLast90d"
  >;
  /** Contact-specific monetization posture from commercial + delivery already on the account. */
  accountMonetizationHint: string | null;
  nextRecommendedActions: NextRevenueAction[];
};

export function buildContactRevenueRealizationHints(
  rr: RevenueRealizationSnapshot,
  opts: {
    accountTier: AccountHealthTier;
    stalledContractsCount: number;
    expiringContractsNext30dCount: number;
    commercialFrictionCount: number;
  },
): ContactRevenueRealizationHints {
  const { accountTier, stalledContractsCount, expiringContractsNext30dCount, commercialFrictionCount } = opts;

  let accountMonetizationHint: string | null = null;
  if (
    (accountTier === "at_risk" || accountTier === "urgent") &&
    (stalledContractsCount > 0 || expiringContractsNext30dCount > 0 || commercialFrictionCount > 0) &&
    (rr.billingFollowThroughPressure || rr.tenantHasProBillingOverdue)
  ) {
    accountMonetizationHint =
      "This account shows commercial or delivery friction while workspace billing cycles are stressed — align delivery, contracts, and collections (billing amounts are tenant-wide).";
  } else if (expiringContractsNext30dCount > 0 && rr.billingFollowThroughPressure) {
    accountMonetizationHint =
      "Contracts ending soon while billing follow-through pressure exists at workspace level — prioritize renewal and cash alignment.";
  }

  const nextRecommendedActions: NextRevenueAction[] = [...rr.nextRecommendedActions];
  if (stalledContractsCount > 0) {
    nextRecommendedActions.unshift({
      label: "Clear stalled delivery",
      href: "/pro",
      basis: "Service contract(s) linked to this account lack operational touches — delivery before monetization.",
    });
  }
  if (expiringContractsNext30dCount > 0) {
    nextRecommendedActions.unshift({
      label: "Renewal / contract end dates",
      href: "/contracts",
      basis: "Linked contract(s) in renewal window.",
    });
  }

  return {
    basis: REVENUE_REALIZATION_BASIS,
    caveat: REVENUE_REALIZATION_CAVEAT,
    workspaceSnapshot: {
      completedProWithFeesLast90dCount: rr.completedProWithFeesLast90dCount,
      proBillingPendingCount: rr.proBillingPendingCount,
      proBillingOverdueCount: rr.proBillingOverdueCount,
      proBillingOverdueOmr: rr.proBillingOverdueOmr,
      billingFollowThroughPressure: rr.billingFollowThroughPressure,
      tenantHasProBillingOverdue: rr.tenantHasProBillingOverdue,
      marketplaceCompletedWithAmountLast90d: rr.marketplaceCompletedWithAmountLast90d,
    },
    accountMonetizationHint,
    nextRecommendedActions: dedupeActions(nextRecommendedActions).slice(0, 6),
  };
}
