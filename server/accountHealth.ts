/**
 * Rule-based account / customer health for owner control (not ML).
 * Deterministic tiers with explicit basis strings for UI.
 */

import { and, eq, inArray, isNull, max, sql } from "drizzle-orm";
import type { getDb } from "./db";
import type { Contract } from "../drizzle/schema";
import {
  contracts,
  crmCommunications,
  crmContacts,
  crmDeals,
  serviceQuotations,
} from "../drizzle/schema";
import { getStalledServiceContractIds } from "./postSaleSignals";

export type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type AccountHealthTier = "healthy" | "watch" | "at_risk" | "urgent";

/** Inputs are contact-scoped where data allows; collections are tenant-wide flags. */
export type ContactAccountSignals = {
  stalledServiceContractsCount: number;
  expiringContractsNext30dCount: number;
  /** Closed-won without linked quote, or won + accepted quote not converted (per contact). */
  commercialFrictionCount: number;
  daysSinceLastActivity: number | null;
  /** Company has overdue PRO billing — not attributable to this contact. */
  tenantHasProBillingOverdue: boolean;
};

export type AccountHealthDerivation = {
  tier: AccountHealthTier;
  reasons: string[];
  nextActions: Array<{ label: string; href: string }>;
};

export const ACCOUNT_HEALTH_RULES_BASIS = `Tiers are rule-based: (1) urgent — combined renewal pressure (expiring contract) with delivery stall or workspace overdue AR, or delivery stall with overdue AR; (2) at_risk — any stalled contract, expiring contract in 30d, commercial friction, or no activity 45+ days; (3) watch — no stall/expiry/friction but 21+ days without activity; (4) healthy — none of the above. Collections use tenant-wide PRO billing flags only.`;

export function deriveAccountHealthTier(s: ContactAccountSignals): AccountHealthDerivation {
  const {
    stalledServiceContractsCount: st,
    expiringContractsNext30dCount: ex,
    commercialFrictionCount: fr,
    daysSinceLastActivity: days,
    tenantHasProBillingOverdue: ar,
  } = s;

  const reasons: string[] = [];
  const nextActions: Array<{ label: string; href: string }> = [];

  if (st > 0) {
    reasons.push(
      `Signed service agreement(s) with weak delivery signals (${st}) — derived; confirm operations started.`,
    );
    nextActions.push({ label: "Open PRO", href: "/pro" });
  }
  if (ex > 0) {
    reasons.push(`${ex} linked contract(s) ending within 30 days — renewal readiness.`);
    nextActions.push({ label: "Contracts", href: "/contracts" });
  }
  if (fr > 0) {
    reasons.push(
      `Commercial friction (${fr}): closed-won without linked quote and/or accepted quote not converted to contract.`,
    );
    nextActions.push({ label: "Quotations", href: "/quotations?filter=accepted" });
  }
  if (ar) {
    reasons.push(
      "Workspace has overdue PRO/officer billing — collections not mapped to this contact in data.",
    );
    nextActions.push({ label: "Collections", href: "/client-portal?tab=invoices" });
  }
  if (days != null && days >= 45) {
    reasons.push(`No recorded CRM touch for ${days} days (deals, quotes, comms, contact).`);
  } else if (days != null && days >= 21) {
    reasons.push(`Limited recent activity (${days} days since last touch).`);
  }

  const urgentCombined =
    (st > 0 && ex > 0) ||
    (st > 0 && ar) ||
    (ex > 0 && ar);

  if (urgentCombined) {
    return {
      tier: "urgent",
      reasons,
      nextActions: dedupeActions(nextActions),
    };
  }

  if (st > 0 || ex > 0 || fr > 0 || (days != null && days >= 45)) {
    return {
      tier: "at_risk",
      reasons,
      nextActions: dedupeActions(nextActions),
    };
  }

  if (days != null && days >= 21) {
    return {
      tier: "watch",
      reasons,
      nextActions: dedupeActions([{ label: "Open account", href: "/crm" }, ...nextActions]),
    };
  }

  return { tier: "healthy", reasons: [], nextActions: [] };
}

function dedupeActions(actions: Array<{ label: string; href: string }>): Array<{ label: string; href: string }> {
  const seen = new Set<string>();
  const out: Array<{ label: string; href: string }> = [];
  for (const a of actions) {
    if (seen.has(a.href)) continue;
    seen.add(a.href);
    out.push(a);
  }
  return out.slice(0, 5);
}

export async function getContactLastActivityAt(
  db: DbClient,
  companyId: number,
  contactId: number,
): Promise<Date | null> {
  const dates: Date[] = [];

  const [c] = await db.select().from(crmContacts).where(eq(crmContacts.id, contactId));
  if (c?.updatedAt) dates.push(new Date(c.updatedAt));

  const deals = await db
    .select()
    .from(crmDeals)
    .where(and(eq(crmDeals.companyId, companyId), eq(crmDeals.contactId, contactId)));
  for (const d of deals) {
    if (d.updatedAt) dates.push(new Date(d.updatedAt));
  }

  const quotes = await db
    .select()
    .from(serviceQuotations)
    .where(and(eq(serviceQuotations.companyId, companyId), eq(serviceQuotations.crmContactId, contactId)));
  for (const q of quotes) {
    if (q.updatedAt) dates.push(new Date(q.updatedAt));
  }

  const [commRow] = await db
    .select({ last: max(crmCommunications.createdAt) })
    .from(crmCommunications)
    .where(and(eq(crmCommunications.companyId, companyId), eq(crmCommunications.contactId, contactId)));

  if (commRow?.last) dates.push(new Date(commRow.last));

  if (dates.length === 0) return null;
  return new Date(Math.max(...dates.map((d) => d.getTime())));
}

export async function countCommercialFrictionForContact(
  db: DbClient,
  companyId: number,
  contactId: number,
): Promise<number> {
  const deals = await db
    .select()
    .from(crmDeals)
    .where(and(eq(crmDeals.companyId, companyId), eq(crmDeals.contactId, contactId)));
  if (deals.length === 0) return 0;

  const dealIds = deals.map((d) => d.id);
  const quotesForDeals = await db
    .select({ crmDealId: serviceQuotations.crmDealId })
    .from(serviceQuotations)
    .where(and(eq(serviceQuotations.companyId, companyId), inArray(serviceQuotations.crmDealId, dealIds)));
  const quotedDealIds = new Set(quotesForDeals.map((q) => q.crmDealId).filter((x): x is number => x != null));

  let friction = 0;
  for (const d of deals) {
    if (d.stage === "closed_won" && !quotedDealIds.has(d.id)) friction++;
  }

  const wonAwaiting = await db
    .select({ dealId: crmDeals.id })
    .from(crmDeals)
    .innerJoin(serviceQuotations, eq(serviceQuotations.crmDealId, crmDeals.id))
    .where(
      and(
        eq(crmDeals.companyId, companyId),
        eq(crmDeals.contactId, contactId),
        eq(crmDeals.stage, "closed_won"),
        eq(serviceQuotations.status, "accepted"),
        isNull(serviceQuotations.convertedToContractId),
      ),
    );
  friction += new Set(wonAwaiting.map((r) => r.dealId)).size;
  return friction;
}

function countExpiringWithin30d(contractsList: Contract[], now: Date): number {
  const end = new Date(now.getTime() + 30 * 86400000);
  if (contractsList.length === 0) return 0;
  return contractsList.filter((c) => {
    if (!c.endDate) return false;
    const ed = new Date(c.endDate);
    return ed >= now && ed <= end && ["signed", "active"].includes(c.status ?? "");
  }).length;
}

export function buildAccountHealthForContact(
  contactContracts: Contract[],
  stalledIds: Set<number>,
  friction: number,
  lastActivityAt: Date | null,
  now: Date,
  tenantHasProBillingOverdue: boolean,
): AccountHealthDerivation & {
  signals: ContactAccountSignals;
  renewalWeakFollowUp: boolean;
} {
  const stalledCount = contactContracts.filter((c) => stalledIds.has(c.id)).length;
  const expiringCount = countExpiringWithin30d(contactContracts, now);
  const daysSince =
    lastActivityAt == null ? null : Math.floor((now.getTime() - lastActivityAt.getTime()) / 86400000);

  const renewalWeakFollowUp = expiringCount > 0 && daysSince != null && daysSince > 21;

  const signals: ContactAccountSignals = {
    stalledServiceContractsCount: stalledCount,
    expiringContractsNext30dCount: expiringCount,
    commercialFrictionCount: friction,
    daysSinceLastActivity: daysSince,
    tenantHasProBillingOverdue,
  };

  const derived = deriveAccountHealthTier(signals);
  return { ...derived, signals, renewalWeakFollowUp };
}

export type PortfolioAccountRow = {
  contactId: number;
  displayName: string;
  companyLabel: string | null;
  tier: AccountHealthTier;
  reasons: string[];
  primaryHref: string;
  /** Contract to open first when delivery or renewal is the issue. */
  sampleContractHref: string | null;
  /** Nearest expiring linked contract end date (if any). */
  nearestExpiryEndDate: string | null;
  /** True when expiring + weak follow-up (no touch 21d+). */
  renewalWeakFollowUp: boolean;
  signals: {
    stalledServiceContractsCount: number;
    expiringContractsNext30dCount: number;
    commercialFrictionCount: number;
    daysSinceLastActivity: number | null;
  };
};

export type AccountPortfolioSnapshot = {
  basis: string;
  tenantCollectionsScopeNote: string;
  /** Contacts with renewal pressure (expiring contract) — sorted nearest expiry first. */
  renewalRisk: PortfolioAccountRow[];
  /** Delivery stall attributed to contact via linked quotation. */
  stalledDelivery: PortfolioAccountRow[];
  /** Combined risk: renewal + stall, renewal + overdue AR, or stall + overdue AR. */
  combinedRisk: PortfolioAccountRow[];
  /** Urgent tier or at_risk with stale 45d+ activity. */
  executiveFollowUp: PortfolioAccountRow[];
};

const MAX_ROWS = 5;

export async function getCompanyAccountPortfolioSnapshot(
  db: DbClient,
  companyId: number,
  tenantHasProBillingOverdue: boolean,
): Promise<AccountPortfolioSnapshot> {
  const now = new Date();
  const stallIds = await getStalledServiceContractIds(db, companyId);

  const rows = await db
    .select({
      contract: contracts,
      contactId: sql<number | null>`COALESCE(${serviceQuotations.crmContactId}, ${crmDeals.contactId})`,
    })
    .from(contracts)
    .innerJoin(serviceQuotations, eq(serviceQuotations.convertedToContractId, contracts.id))
    .leftJoin(crmDeals, eq(serviceQuotations.crmDealId, crmDeals.id))
    .where(
      and(eq(contracts.companyId, companyId), eq(serviceQuotations.companyId, companyId)),
    );

  const byContact = new Map<number, Contract[]>();
  for (const r of rows) {
    const cid = r.contactId;
    if (cid == null || Number.isNaN(Number(cid))) continue;
    const list = byContact.get(cid) ?? [];
    if (!list.some((c) => c.id === r.contract.id)) list.push(r.contract);
    byContact.set(cid, list);
  }

  const contactIds = Array.from(byContact.keys());
  if (contactIds.length === 0) {
    return {
      basis: ACCOUNT_HEALTH_RULES_BASIS,
      tenantCollectionsScopeNote:
        "PRO billing overdue is tenant-wide; not allocated per customer until invoice linkage exists.",
      renewalRisk: [],
      stalledDelivery: [],
      combinedRisk: [],
      executiveFollowUp: [],
    };
  }

  const contacts = await db
    .select()
    .from(crmContacts)
    .where(and(eq(crmContacts.companyId, companyId), inArray(crmContacts.id, contactIds)));

  const contactRows = new Map(contacts.map((c) => [c.id, c]));

  const frictionEntries = await Promise.all(
    contactIds.map(async (cid) => [cid, await countCommercialFrictionForContact(db, companyId, cid)] as const),
  );
  const frictionMap = new Map(frictionEntries);

  const portfolioRows: PortfolioAccountRow[] = [];

  for (const cid of contactIds) {
    const cr = contactRows.get(cid);
    if (!cr) continue;
    const list = byContact.get(cid) ?? [];
    const lastAt = await getContactLastActivityAt(db, companyId, cid);
    const daysSince = lastAt == null ? null : Math.floor((now.getTime() - lastAt.getTime()) / 86400000);

    const stalledCount = list.filter((c) => stallIds.has(c.id)).length;
    const expiringCount = countExpiringWithin30d(list, now);
    const friction = frictionMap.get(cid) ?? 0;

    const signals: ContactAccountSignals = {
      stalledServiceContractsCount: stalledCount,
      expiringContractsNext30dCount: expiringCount,
      commercialFrictionCount: friction,
      daysSinceLastActivity: daysSince,
      tenantHasProBillingOverdue,
    };

    const { tier, reasons } = deriveAccountHealthTier(signals);

    const expiringContracts = list.filter((c) => {
      if (!c.endDate) return false;
      const ed = new Date(c.endDate);
      return ed >= now && ed <= new Date(now.getTime() + 30 * 86400000) && ["signed", "active"].includes(c.status ?? "");
    });
    const expiringSorted = [...expiringContracts].sort(
      (a, b) => new Date(a.endDate!).getTime() - new Date(b.endDate!).getTime(),
    );
    const nearest = expiringSorted.length
      ? new Date(expiringSorted[0].endDate!).getTime()
      : Infinity;
    const nearestExpiryEndDate =
      nearest !== Infinity ? new Date(nearest).toISOString().slice(0, 10) : null;

    const renewalWeakFollowUp = expiringCount > 0 && daysSince != null && daysSince > 21;

    const displayName = `${cr.firstName} ${cr.lastName}`.trim();
    const primaryHref = `/crm?contact=${cid}`;

    const stalledContract = list.find((c) => stallIds.has(c.id));
    const firstExpiring = expiringSorted[0];
    const sampleContractHref = stalledContract
      ? `/contracts?id=${stalledContract.id}`
      : firstExpiring
        ? `/contracts?id=${firstExpiring.id}`
        : null;

    portfolioRows.push({
      contactId: cid,
      displayName,
      companyLabel: cr.company ?? null,
      tier,
      reasons,
      primaryHref,
      sampleContractHref,
      nearestExpiryEndDate,
      renewalWeakFollowUp,
      signals: {
        stalledServiceContractsCount: stalledCount,
        expiringContractsNext30dCount: expiringCount,
        commercialFrictionCount: friction,
        daysSinceLastActivity: daysSince,
      },
    });
  }

  const renewalRisk = [...portfolioRows]
    .filter((r) => r.signals.expiringContractsNext30dCount > 0)
    .sort((a, b) => {
      const da = a.nearestExpiryEndDate ?? "9999";
      const db = b.nearestExpiryEndDate ?? "9999";
      return da.localeCompare(db);
    })
    .slice(0, MAX_ROWS);

  const stalledDelivery = [...portfolioRows]
    .filter((r) => r.signals.stalledServiceContractsCount > 0)
    .sort((a, b) => b.signals.stalledServiceContractsCount - a.signals.stalledServiceContractsCount)
    .slice(0, MAX_ROWS);

  const combinedRisk = [...portfolioRows]
    .filter((r) => {
      const st = r.signals.stalledServiceContractsCount > 0;
      const ex = r.signals.expiringContractsNext30dCount > 0;
      const ar = tenantHasProBillingOverdue;
      return (st && ex) || (st && ar) || (ex && ar);
    })
    .sort((a, b) => {
      const rank = (x: PortfolioAccountRow) =>
        x.tier === "urgent" ? 0 : x.tier === "at_risk" ? 1 : 2;
      return rank(a) - rank(b);
    })
    .slice(0, MAX_ROWS);

  const executiveFollowUp = [...portfolioRows]
    .filter((r) => r.tier === "urgent" || (r.tier === "at_risk" && (r.signals.daysSinceLastActivity ?? 0) >= 45))
    .sort((a, b) => {
      const rank = (x: PortfolioAccountRow) =>
        x.tier === "urgent" ? 0 : x.tier === "at_risk" ? 1 : 2;
      return rank(a) - rank(b);
    })
    .slice(0, MAX_ROWS);

  return {
    basis: ACCOUNT_HEALTH_RULES_BASIS,
    tenantCollectionsScopeNote:
      "PRO billing overdue is tenant-wide; not allocated per customer until invoice linkage exists.",
    renewalRisk,
    stalledDelivery,
    combinedRisk,
    executiveFollowUp,
  };
}
