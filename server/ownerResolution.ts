/**
 * Owner-facing risk → resolution: deterministic next actions, renewal posture, collections queue.
 * Composes account portfolio + revenue realization without duplicating detection logic.
 * Responses include exportMeta for future CSV/PDF pipelines.
 */

import { and, count, desc, eq } from "drizzle-orm";
import type { getDb } from "./db";
import { proBillingCycles } from "../drizzle/schema";
import {
  getCompanyAccountPortfolioSnapshot,
  type AccountHealthTier,
  type AccountPortfolioSnapshot,
  type PortfolioAccountRow,
} from "./accountHealth";
import {
  buildRevenueRealizationSnapshot,
  selectRenewalMonetizationRiskRows,
  type RevenueRealizationSnapshot,
} from "./revenueRealization";
import type { PostSaleSignals } from "./postSaleSignals";
import { getPostSaleSignals } from "./postSaleSignals";
import {
  enrichOwnerResolutionWithWorkflow,
  type ResolutionWorkflowTracking,
} from "./resolutionWorkflow";

export type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export const OWNER_RESOLUTION_SCHEMA_VERSION = 4 as const;

export const OWNER_RESOLUTION_BASIS = `Resolution rows rank CRM-linked accounts using existing health tiers, renewal dates, delivery stall counts, and workspace billing stress. Collections rows are factual billing-cycle rows for this tenant — they are not allocated to customers until invoice linkage exists. Next actions are rule-ordered (contract/renewal → delivery → cash → commercial).`;

export type ResolutionNextAction = {
  label: string;
  href: string;
  basis: string;
};

export type RenewalPostureFlag =
  | "weak_crm_activity"
  | "weak_delivery"
  | "workspace_collections_stress"
  | "billing_follow_through_pressure";

const POSTURE_LABELS: Record<RenewalPostureFlag, string> = {
  weak_crm_activity: "Weak CRM follow-up",
  weak_delivery: "Weak delivery signals",
  workspace_collections_stress: "Workspace overdue billing",
  billing_follow_through_pressure: "Billing follow-through pressure",
};

export type RenewalReadinessRow = {
  contactId: number;
  displayName: string;
  companyLabel: string | null;
  tier: AccountHealthTier;
  nearestExpiryEndDate: string | null;
  daysUntilEnd: number | null;
  postureFlags: RenewalPostureFlag[];
  /** Human-readable posture for UI / export. */
  postureSummary: string;
  nextAction: ResolutionNextAction;
  primaryHref: string;
  contractHref: string | null;
  workflow: ResolutionWorkflowTracking;
};

export type CollectionsCycleRow = {
  id: number;
  invoiceNumber: string;
  amountOmr: number;
  status: string;
  dueDate: string | null;
  billingMonth: number;
  billingYear: number;
  nextAction: ResolutionNextAction;
  /** When renewal accounts exist, remind that cash work supports renewals. */
  overlapNote: string | null;
  workflow: ResolutionWorkflowTracking;
};

export type RankedAccountRow = {
  contactId: number;
  displayName: string;
  companyLabel: string | null;
  priorityScore: number;
  rankReason: string;
  tier: string;
  primaryHref: string;
  contractHref: string | null;
  nextAction: ResolutionNextAction;
  workflow: ResolutionWorkflowTracking;
};

/** Flat rows for CSV / PDF / leadership packs — stable column names. */
export type OwnerResolutionExportRow = {
  rowKind: "ranked" | "renewal" | "collections";
  contactId: number | null;
  billingCycleId: number | null;
  displayName: string;
  secondaryLabel: string | null;
  tier: string | null;
  rankReason: string | null;
  nextActionLabel: string;
  nextActionHref: string;
  accountableOwnerLabel: string | null;
  hasOpenEmployeeTask: boolean;
  matchingTaskIds: string;
  accountabilityGap: string;
  renewalInterventionDueAt: string | null;
  /** Renewal intervention date, invoice due, or task staleness signal for export filters. */
  dueOrInterventionDate: string | null;
  taskDueOverdue: boolean;
  /** CRM vs workspace billing — export / review hygiene. */
  workflowScope: "crm_contact" | "workspace_billing";
  /** Derived review bucket — honest, not a claim of business closure. */
  reviewBucket: string;
  reviewBasis: string;
};

/** Weekly leadership review — deterministic counts from workflow rows. */
export type OwnerResolutionReviewSummary = {
  rankedCount: number;
  renewalCount: number;
  collectionsCount: number;
  /** Rows with no open tagged HR task (CRM + ranked + renewal + collections). */
  noTaggedTaskCount: number;
  /** Any accountability gap (missing owner and/or task where rules apply). */
  withAccountabilityGapCount: number;
  missingOwnerCount: number;
  missingTaskCount: number;
  /** Tagged open task past due date. */
  taskDueOverdueCount: number;
  /** CRM-linked rows with renewal intervention date in the next 7 days (inclusive). */
  interventionDueWithin7DaysCount: number;
  stalledFollowUpCount: number;
  inFollowUpCount: number;
  needsAssignmentCount: number;
  needsTaggedTaskCount: number;
  monitorNoTagCount: number;
};

export type OwnerResolutionSnapshot = {
  exportMeta: {
    generatedAt: string;
    schemaVersion: typeof OWNER_RESOLUTION_SCHEMA_VERSION;
    companyId: number;
  };
  basis: string;
  renewalReadiness: RenewalReadinessRow[];
  collectionsFollowUp: CollectionsCycleRow[];
  /** Unified leadership queue — deduped, highest priority first. */
  rankedAccountsForReview: RankedAccountRow[];
  collectionsWorkspaceNote: string;
  /** Pre-flattened for CSV / scheduled exports — same tenant scope as exportMeta. */
  exportRows: OwnerResolutionExportRow[];
  /** Portfolio review roll-up for dashboards and exports. */
  reviewSummary: OwnerResolutionReviewSummary;
};

const MAX_RENEWAL = 8;
const MAX_COLLECTIONS = 8;
const MAX_RANKED = 12;

function buildOwnerResolutionExportRows(input: {
  renewalReadiness: RenewalReadinessRow[];
  rankedAccountsForReview: RankedAccountRow[];
  collectionsFollowUp: CollectionsCycleRow[];
}): OwnerResolutionExportRow[] {
  const { renewalReadiness, rankedAccountsForReview, collectionsFollowUp } = input;
  const rows: OwnerResolutionExportRow[] = [];

  for (const r of rankedAccountsForReview) {
    const w = r.workflow;
    rows.push({
      rowKind: "ranked",
      contactId: r.contactId,
      billingCycleId: null,
      displayName: r.displayName,
      secondaryLabel: r.companyLabel,
      tier: r.tier,
      rankReason: r.rankReason,
      nextActionLabel: r.nextAction.label,
      nextActionHref: r.nextAction.href,
      accountableOwnerLabel: w.accountableOwnerLabel,
      hasOpenEmployeeTask: w.hasOpenEmployeeTask,
      matchingTaskIds: w.matchingTaskIds.join(";"),
      accountabilityGap: w.accountabilityGap,
      renewalInterventionDueAt: w.renewalInterventionDueAt,
      dueOrInterventionDate: w.renewalInterventionDueAt,
      taskDueOverdue: w.isTaskDueOverdue,
      workflowScope: w.review.workflowScope,
      reviewBucket: w.review.reviewBucket,
      reviewBasis: w.review.reviewBasis,
    });
  }

  for (const r of renewalReadiness) {
    const w = r.workflow;
    rows.push({
      rowKind: "renewal",
      contactId: r.contactId,
      billingCycleId: null,
      displayName: r.displayName,
      secondaryLabel: r.companyLabel,
      tier: r.tier,
      rankReason: r.postureSummary,
      nextActionLabel: r.nextAction.label,
      nextActionHref: r.nextAction.href,
      accountableOwnerLabel: w.accountableOwnerLabel,
      hasOpenEmployeeTask: w.hasOpenEmployeeTask,
      matchingTaskIds: w.matchingTaskIds.join(";"),
      accountabilityGap: w.accountabilityGap,
      renewalInterventionDueAt: w.renewalInterventionDueAt,
      dueOrInterventionDate: w.renewalInterventionDueAt ?? r.nearestExpiryEndDate,
      taskDueOverdue: w.isTaskDueOverdue,
      workflowScope: w.review.workflowScope,
      reviewBucket: w.review.reviewBucket,
      reviewBasis: w.review.reviewBasis,
    });
  }

  for (const c of collectionsFollowUp) {
    const w = c.workflow;
    rows.push({
      rowKind: "collections",
      contactId: null,
      billingCycleId: c.id,
      displayName: c.invoiceNumber,
      secondaryLabel: `${c.billingMonth}/${c.billingYear}`,
      tier: null,
      rankReason: c.overlapNote,
      nextActionLabel: c.nextAction.label,
      nextActionHref: c.nextAction.href,
      accountableOwnerLabel: null,
      hasOpenEmployeeTask: w.hasOpenEmployeeTask,
      matchingTaskIds: w.matchingTaskIds.join(";"),
      accountabilityGap: w.accountabilityGap,
      renewalInterventionDueAt: null,
      dueOrInterventionDate: c.dueDate,
      taskDueOverdue: w.isTaskDueOverdue,
      workflowScope: w.review.workflowScope,
      reviewBucket: w.review.reviewBucket,
      reviewBasis: w.review.reviewBasis,
    });
  }

  return rows;
}

function buildOwnerResolutionReviewSummary(
  renewalReadiness: RenewalReadinessRow[],
  rankedAccountsForReview: RankedAccountRow[],
  collectionsFollowUp: CollectionsCycleRow[],
  exportRows: OwnerResolutionExportRow[],
): OwnerResolutionReviewSummary {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7 = new Date(today.getTime() + 7 * 86400000);

  const contactWorkflows = [
    ...renewalReadiness.map((r) => r.workflow),
    ...rankedAccountsForReview.map((r) => r.workflow),
  ];
  const billingWorkflows = collectionsFollowUp.map((c) => c.workflow);
  const all = [...contactWorkflows, ...billingWorkflows];

  let interventionDueWithin7DaysCount = 0;
  for (const w of contactWorkflows) {
    if (!w.renewalInterventionDueAt) continue;
    const d = new Date(w.renewalInterventionDueAt + "T12:00:00");
    if (d >= today && d <= in7) interventionDueWithin7DaysCount++;
  }

  const stalledFollowUpCount = exportRows.filter((r) => r.reviewBucket === "stalled_follow_up").length;
  const inFollowUpCount = exportRows.filter((r) => r.reviewBucket === "in_follow_up").length;
  const needsAssignmentCount = exportRows.filter((r) => r.reviewBucket === "needs_assignment").length;
  const needsTaggedTaskCount = exportRows.filter((r) => r.reviewBucket === "needs_tagged_task").length;
  const monitorNoTagCount = exportRows.filter((r) => r.reviewBucket === "monitor_no_tag").length;

  return {
    rankedCount: rankedAccountsForReview.length,
    renewalCount: renewalReadiness.length,
    collectionsCount: collectionsFollowUp.length,
    noTaggedTaskCount: all.filter((w) => !w.hasOpenEmployeeTask).length,
    withAccountabilityGapCount: all.filter((w) => w.accountabilityGap !== "none").length,
    missingOwnerCount: all.filter(
      (w) => w.accountabilityGap === "missing_owner" || w.accountabilityGap === "both",
    ).length,
    missingTaskCount: all.filter(
      (w) => w.accountabilityGap === "missing_task" || w.accountabilityGap === "both",
    ).length,
    taskDueOverdueCount: all.filter((w) => w.isTaskDueOverdue).length,
    interventionDueWithin7DaysCount,
    stalledFollowUpCount,
    inFollowUpCount,
    needsAssignmentCount,
    needsTaggedTaskCount,
    monitorNoTagCount,
  };
}

function daysUntil(dateIso: string | null, now: Date): number | null {
  if (!dateIso) return null;
  const d = new Date(dateIso + "T12:00:00");
  return Math.ceil((d.getTime() - now.getTime()) / 86400000);
}

function renewalRowFromPortfolio(
  row: PortfolioAccountRow,
  now: Date,
  revenue: RevenueRealizationSnapshot,
  tenantOverdue: boolean,
): Omit<RenewalReadinessRow, "workflow"> {
  const days = daysUntil(row.nearestExpiryEndDate, now);
  const postureFlags: RenewalPostureFlag[] = [];
  if (row.renewalWeakFollowUp) postureFlags.push("weak_crm_activity");
  if (row.signals.stalledServiceContractsCount > 0) postureFlags.push("weak_delivery");
  if (tenantOverdue) postureFlags.push("workspace_collections_stress");
  if (revenue.billingFollowThroughPressure) postureFlags.push("billing_follow_through_pressure");

  let nextAction: ResolutionNextAction;
  if (row.signals.stalledServiceContractsCount > 0 && (days != null && days <= 14)) {
    nextAction = {
      label: "Start delivery + plan renewal",
      href: row.sampleContractHref ?? "/pro",
      basis: "Contract ends within two weeks while delivery signals are weak — operationalize before renewal discussion.",
    };
  } else if (row.renewalWeakFollowUp && tenantOverdue) {
    nextAction = {
      label: "Relationship + collections",
      href: row.primaryHref,
      basis: "Renewal window with weak CRM touch while workspace billing is overdue — align relationship and cash.",
    };
  } else if (row.renewalWeakFollowUp) {
    nextAction = {
      label: "Schedule renewal touch",
      href: row.primaryHref,
      basis: "Contract ending soon with limited recent CRM activity.",
    };
  } else if (row.signals.stalledServiceContractsCount > 0) {
    nextAction = {
      label: "Unblock delivery",
      href: "/pro",
      basis: "Signed agreement without operational follow-through — confirm PRO / cases / bookings.",
    };
  } else {
    nextAction = {
      label: "Review contract end date",
      href: row.sampleContractHref ?? "/contracts",
      basis: "Renewal date approaching — confirm terms and next quotation.",
    };
  }

  return {
    contactId: row.contactId,
    displayName: row.displayName,
    companyLabel: row.companyLabel,
    tier: row.tier,
    nearestExpiryEndDate: row.nearestExpiryEndDate,
    daysUntilEnd: days,
    postureFlags,
    postureSummary: postureFlags.map((f) => POSTURE_LABELS[f]).join(" · ") || "Renewal window",
    nextAction,
    primaryHref: row.primaryHref,
    contractHref: row.sampleContractHref,
  };
}

export async function loadCollectionsFollowUpRows(
  db: DbClient,
  companyId: number,
  hasRenewalAccounts: boolean,
): Promise<Omit<CollectionsCycleRow, "workflow">[]> {
  const rows = await db
    .select()
    .from(proBillingCycles)
    .where(and(eq(proBillingCycles.companyId, companyId), eq(proBillingCycles.status, "overdue")))
    .orderBy(desc(proBillingCycles.amountOmr))
    .limit(MAX_COLLECTIONS);

  const overlapNote =
    hasRenewalAccounts && rows.some((r) => r.status === "overdue")
      ? "Renewal-dated accounts exist in CRM — settling officer billing reduces churn risk."
      : null;

  return rows.map((r) => ({
    id: r.id,
    invoiceNumber: r.invoiceNumber,
    amountOmr: Number(r.amountOmr ?? 0),
    status: r.status,
    dueDate: r.dueDate ? new Date(r.dueDate).toISOString().slice(0, 10) : null,
    billingMonth: r.billingMonth,
    billingYear: r.billingYear,
    nextAction: {
      label: r.status === "overdue" ? "Collect or escalate" : "Confirm payment plan",
      href: "/client/invoices",
      basis:
        r.status === "overdue"
          ? "Officer billing cycle is overdue — workspace-level invoice."
          : "Cycle still pending — confirm settlement before period close.",
    },
    overlapNote,
  }));
}

function tierScore(tier: string): number {
  if (tier === "urgent") return 100;
  if (tier === "at_risk") return 75;
  if (tier === "watch") return 45;
  return 20;
}

function buildRankedAccounts(
  portfolio: AccountPortfolioSnapshot,
  renewalMonetization: PortfolioAccountRow[],
  now: Date,
): Omit<RankedAccountRow, "workflow">[] {
  const byId = new Map<number, Omit<RankedAccountRow, "workflow">>();

  const bump = (row: PortfolioAccountRow, reason: string, extra: number) => {
    const base = tierScore(row.tier) + extra;
    const existing = byId.get(row.contactId);
    const nextAction = accountRowToNextAction(row, now);
    if (!existing || base > existing.priorityScore) {
      byId.set(row.contactId, {
        contactId: row.contactId,
        displayName: row.displayName,
        companyLabel: row.companyLabel,
        priorityScore: base,
        rankReason: reason,
        tier: row.tier,
        primaryHref: row.primaryHref,
        contractHref: row.sampleContractHref,
        nextAction,
      });
    }
  };

  for (const r of portfolio.executiveFollowUp) {
    bump(r, "Executive follow-up queue", 15);
  }
  for (const r of portfolio.combinedRisk) {
    bump(r, "Combined delivery / renewal / cash pressure", 12);
  }
  for (const r of renewalMonetization) {
    bump(r, "Renewal + monetization stress", 10);
  }
  for (const r of portfolio.renewalRisk) {
    const days = daysUntil(r.nearestExpiryEndDate, now);
    const extra = days != null && days <= 7 ? 8 : days != null && days <= 14 ? 5 : 0;
    bump(r, "Renewal window", extra);
  }
  for (const r of portfolio.stalledDelivery) {
    bump(r, "Delivery stall (linked account)", 6);
  }

  return Array.from(byId.values())
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, MAX_RANKED);
}

function accountRowToNextAction(row: PortfolioAccountRow, now: Date): ResolutionNextAction {
  const days = daysUntil(row.nearestExpiryEndDate, now);
  if (row.tier === "urgent") {
    return {
      label: "Resolve urgent account",
      href: row.primaryHref,
      basis: "Account health is urgent — CRM + contract + delivery alignment.",
    };
  }
  if (row.signals.stalledServiceContractsCount > 0 && days != null && days <= 14) {
    return {
      label: "Delivery before renewal",
      href: row.sampleContractHref ?? "/pro",
      basis: "Stalled delivery with contract end inside two weeks.",
    };
  }
  if (row.signals.stalledServiceContractsCount > 0) {
    return { label: "Unblock delivery", href: "/pro", basis: "Operational signals missing after signed agreement." };
  }
  if (row.signals.expiringContractsNext30dCount > 0) {
    return {
      label: "Renewal / contract",
      href: row.sampleContractHref ?? "/contracts",
      basis: "Contract in renewal window.",
    };
  }
  if (row.signals.commercialFrictionCount > 0) {
    return {
      label: "Fix commercial record",
      href: "/quotations?filter=accepted",
      basis: "Won or accepted quote still not tied to agreement.",
    };
  }
  return { label: "Open account", href: row.primaryHref, basis: "Review pipeline and next touch." };
}

export type AccountResolutionInput = {
  tier: AccountHealthTier;
  stalledContractsCount: number;
  expiringContractsNext30dCount: number;
  commercialFrictionCount: number;
  renewalWeakFollowUp: boolean;
  tenantOverdueBilling: boolean;
  billingFollowThroughPressure: boolean;
  primaryHref: string;
  sampleContractHref: string | null;
};

/** Single best next step for CRM contact panel — deterministic priority stack. */
export function resolvePrimaryAccountAction(input: AccountResolutionInput): {
  primary: ResolutionNextAction;
  alternatives: ResolutionNextAction[];
} {
  const {
    tier,
    stalledContractsCount: st,
    expiringContractsNext30dCount: ex,
    commercialFrictionCount: fr,
    renewalWeakFollowUp: rw,
    tenantOverdueBilling: ar,
    billingFollowThroughPressure: bf,
    primaryHref,
    sampleContractHref,
  } = input;

  const alternatives: ResolutionNextAction[] = [];

  let primary: ResolutionNextAction;

  if (tier === "urgent" && ex > 0 && st > 0) {
    primary = {
      label: "Renewal + delivery intervention",
      href: sampleContractHref ?? "/pro",
      basis: "Urgent tier with expiring contract and stalled delivery — align operations before renewal.",
    };
  } else if (st > 0) {
    primary = {
      label: "Operationalize delivery",
      href: "/pro",
      basis: "Signed agreement(s) lack delivery touch — start PRO / cases / bookings.",
    };
  } else if (ex > 0 && rw) {
    primary = {
      label: "Renewal relationship touch",
      href: primaryHref,
      basis: "Contract ending soon with weak CRM activity — schedule owner or account lead follow-up.",
    };
  } else if (ex > 0) {
    primary = {
      label: "Renewal preparation",
      href: sampleContractHref ?? "/contracts",
      basis: "Contract in 30-day renewal window — confirm scope and quotation.",
    };
  } else if (fr > 0) {
    primary = {
      label: "Close commercial loop",
      href: "/quotations?filter=accepted",
      basis: "Won deal or accepted quote still not converted — create or link contract.",
    };
  } else if (ar || bf) {
    primary = {
      label: "Workspace collections",
      href: "/client/invoices",
      basis: "Billing cycles stressed at workspace level — not mapped to this contact in data.",
    };
  } else {
    primary = {
      label: "Account review",
      href: primaryHref,
      basis: "No single dominant blocker — review deals and timeline.",
    };
  }

  if (primary.href !== primaryHref) {
    alternatives.push({ label: "Open CRM contact", href: primaryHref, basis: "Full account context." });
  }
  if (sampleContractHref && primary.href !== sampleContractHref) {
    alternatives.push({ label: "Open linked contract", href: sampleContractHref, basis: "Agreement detail." });
  }
  if (st === 0 && ex > 0) {
    alternatives.push({ label: "PRO queue", href: "/pro", basis: "If delivery is part of renewal scope." });
  }
  if (!ar && !bf) {
    alternatives.push({
      label: "Collections (workspace)",
      href: "/client/invoices",
      basis: "Check officer billing if monetization is unclear.",
    });
  }

  return { primary, alternatives: alternatives.slice(0, 4) };
}

export async function getOwnerResolutionSnapshot(
  db: DbClient,
  companyId: number,
  portfolio: AccountPortfolioSnapshot,
  revenue: RevenueRealizationSnapshot,
  renewalMonetizationRisk: PortfolioAccountRow[],
  postSale: PostSaleSignals,
): Promise<OwnerResolutionSnapshot> {
  const now = new Date();
  const tenantOverdue = postSale.proBillingOverdueCount > 0;

  const renewalDraft = portfolio.renewalRisk
    .map((r) => renewalRowFromPortfolio(r, now, revenue, tenantOverdue))
    .slice(0, MAX_RENEWAL);

  const hasRenewal = portfolio.renewalRisk.length > 0;
  const collectionsDraft = await loadCollectionsFollowUpRows(db, companyId, hasRenewal);

  const rankedDraft = buildRankedAccounts(portfolio, renewalMonetizationRisk, now);

  const { renewalReadiness, rankedAccountsForReview, collectionsFollowUp } =
    await enrichOwnerResolutionWithWorkflow(db, companyId, renewalDraft, rankedDraft, collectionsDraft);

  const exportRows = buildOwnerResolutionExportRows({
    renewalReadiness,
    rankedAccountsForReview,
    collectionsFollowUp,
  });

  const reviewSummary = buildOwnerResolutionReviewSummary(
    renewalReadiness,
    rankedAccountsForReview,
    collectionsFollowUp,
    exportRows,
  );

  return {
    exportMeta: {
      generatedAt: now.toISOString(),
      schemaVersion: OWNER_RESOLUTION_SCHEMA_VERSION,
      companyId,
    },
    basis: OWNER_RESOLUTION_BASIS,
    renewalReadiness,
    collectionsFollowUp,
    rankedAccountsForReview,
    collectionsWorkspaceNote:
      "Billing cycle rows are tenant-scoped; customer allocation requires future invoice↔account linkage.",
    exportRows,
    reviewSummary,
  };
}

/** Full owner-resolution snapshot for export / download — same inputs as business pulse resolution block. */
export async function loadOwnerResolutionSnapshotForCompany(
  db: DbClient,
  companyId: number,
): Promise<OwnerResolutionSnapshot> {
  const postSale = await getPostSaleSignals(db, companyId);
  const accountPortfolio = await getCompanyAccountPortfolioSnapshot(
    db,
    companyId,
    postSale.proBillingOverdueCount > 0,
  );
  const [proPendingRow] = await db
    .select({ cnt: count() })
    .from(proBillingCycles)
    .where(and(eq(proBillingCycles.companyId, companyId), eq(proBillingCycles.status, "pending")));
  const revenueRealization = await buildRevenueRealizationSnapshot(
    db,
    companyId,
    postSale,
    Number(proPendingRow?.cnt ?? 0),
  );
  const renewalMonetizationRisk = selectRenewalMonetizationRiskRows(accountPortfolio, revenueRealization);
  return getOwnerResolutionSnapshot(
    db,
    companyId,
    accountPortfolio,
    revenueRealization,
    renewalMonetizationRisk,
    postSale,
  );
}
