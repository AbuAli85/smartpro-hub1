/**
 * Server-authoritative prefill for resolution follow-up HR tasks (tenant-scoped).
 */

import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import {
  buildResolutionTaskDescription,
  RESOLUTION_TASK_TAG,
  truncateTitle,
} from "@shared/resolutionWorkflow";
import { contracts, crmDeals, employees, proBillingCycles, serviceQuotations } from "../drizzle/schema";
import { getCrmContactById, getDb as getDbFn } from "./db";
import {
  buildAccountHealthForContact,
  countCommercialFrictionForContact,
  getContactLastActivityAt,
} from "./accountHealth";
import type { AccountHealthTier } from "./accountHealth";
import { resolvePrimaryAccountAction } from "./ownerResolution";
import { buildRevenueRealizationSnapshot } from "./revenueRealization";
import { getPostSaleSignals, getStalledServiceContractIds } from "./postSaleSignals";
import { getWorkflowTrackingForContact } from "./resolutionWorkflow";

export type DbClient = NonNullable<Awaited<ReturnType<typeof getDbFn>>>;

export type ResolutionFollowUpPrefill = {
  title: string;
  description: string;
  dueDate: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  suggestedAssigneeEmployeeId: number | null;
};

function ymdPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function tierToPriority(tier: AccountHealthTier): ResolutionFollowUpPrefill["priority"] {
  if (tier === "urgent") return "urgent";
  if (tier === "at_risk") return "high";
  return "medium";
}

async function employeeIdForUser(db: DbClient, companyId: number, userId: number | null): Promise<number | null> {
  if (userId == null) return null;
  const [row] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.userId, userId)));
  return row?.id ?? null;
}

export async function buildCrmResolutionFollowUpPrefill(
  db: DbClient,
  companyId: number,
  contactId: number,
): Promise<ResolutionFollowUpPrefill | null> {
  const contact = await getCrmContactById(contactId);
  if (!contact || contact.companyId !== companyId) return null;

  const deals = await db
    .select()
    .from(crmDeals)
    .where(and(eq(crmDeals.companyId, companyId), eq(crmDeals.contactId, contactId)))
    .orderBy(desc(crmDeals.updatedAt));

  const dealIds = deals.map((d) => d.id);
  const emailNorm = (contact.email ?? "").trim().toLowerCase();

  const byDeal =
    dealIds.length > 0
      ? await db
          .select()
          .from(serviceQuotations)
          .where(and(eq(serviceQuotations.companyId, companyId), inArray(serviceQuotations.crmDealId, dealIds)))
      : [];

  const byEmail =
    emailNorm.length > 0
      ? await db
          .select()
          .from(serviceQuotations)
          .where(
            and(
              eq(serviceQuotations.companyId, companyId),
              sql`LOWER(TRIM(${serviceQuotations.clientEmail})) = ${emailNorm}`,
            ),
          )
      : [];

  const byContactId = await db
    .select()
    .from(serviceQuotations)
    .where(and(eq(serviceQuotations.companyId, companyId), eq(serviceQuotations.crmContactId, contactId)));

  const quoteMap = new Map<number, (typeof byDeal)[0]>();
  for (const q of [...byDeal, ...byEmail, ...byContactId]) quoteMap.set(q.id, q);
  const quotations = Array.from(quoteMap.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const convIds = quotations.map((q) => q.convertedToContractId).filter((id): id is number => id != null);
  const contractsFromQuotations =
    convIds.length > 0 ? await db.select().from(contracts).where(inArray(contracts.id, convIds)) : [];

  const workspacePostSale = await getPostSaleSignals(db, companyId);
  const stalledContractIds = await getStalledServiceContractIds(db, companyId);
  const frictionCount = await countCommercialFrictionForContact(db, companyId, contactId);
  const lastActivityAt = await getContactLastActivityAt(db, companyId, contactId);
  const accountHealth = buildAccountHealthForContact(
    contractsFromQuotations,
    stalledContractIds,
    frictionCount,
    lastActivityAt,
    new Date(),
    workspacePostSale.proBillingOverdueCount > 0,
  );

  const [proPendingRow] = await db
    .select({ cnt: count() })
    .from(proBillingCycles)
    .where(and(eq(proBillingCycles.companyId, companyId), eq(proBillingCycles.status, "pending")));

  const revenueWorkspace = await buildRevenueRealizationSnapshot(
    db,
    companyId,
    workspacePostSale,
    Number(proPendingRow?.cnt ?? 0),
  );

  const nowRef = new Date();
  const in30 = new Date(nowRef.getTime() + 30 * 86400000);
  const expiringFirst = contractsFromQuotations
    .filter(
      (c) =>
        c.endDate &&
        new Date(c.endDate) >= nowRef &&
        new Date(c.endDate) <= in30 &&
        ["signed", "active"].includes(c.status ?? ""),
    )
    .sort((a, b) => new Date(a.endDate!).getTime() - new Date(b.endDate!).getTime())[0];
  const stalledContracts = contractsFromQuotations.filter((c) => stalledContractIds.has(c.id));
  const stalledFirst = stalledContracts[0];
  const sampleContractHref = stalledFirst
    ? `/contracts?id=${stalledFirst.id}`
    : expiringFirst
      ? `/contracts?id=${expiringFirst.id}`
      : null;

  const resolution = resolvePrimaryAccountAction({
    tier: accountHealth.tier,
    stalledContractsCount: accountHealth.signals.stalledServiceContractsCount,
    expiringContractsNext30dCount: accountHealth.signals.expiringContractsNext30dCount,
    commercialFrictionCount: accountHealth.signals.commercialFrictionCount,
    renewalWeakFollowUp: accountHealth.renewalWeakFollowUp,
    tenantOverdueBilling: workspacePostSale.proBillingOverdueCount > 0,
    billingFollowThroughPressure: revenueWorkspace.billingFollowThroughPressure,
    primaryHref: `/crm?contact=${contactId}`,
    sampleContractHref,
  });

  const nearestExpiryContract = contractsFromQuotations
    .filter(
      (c) =>
        c.endDate && new Date(c.endDate) >= nowRef && ["signed", "active"].includes(c.status ?? ""),
    )
    .sort((a, b) => new Date(a.endDate!).getTime() - new Date(b.endDate!).getTime())[0];
  const nearestExpiryEndDate = nearestExpiryContract?.endDate
    ? new Date(nearestExpiryContract.endDate).toISOString().slice(0, 10)
    : null;

  const workflow = await getWorkflowTrackingForContact(
    db,
    companyId,
    contactId,
    accountHealth.tier,
    nearestExpiryEndDate,
  );

  const displayName = `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || `Contact #${contactId}`;
  const tagLine = RESOLUTION_TASK_TAG.crmContact(contactId);
  const descriptionFixed = buildResolutionTaskDescription({
    tagLine,
    recommendedActionLabel: resolution.primary.label,
    recommendedBasis: resolution.primary.basis,
    contextUrl: `/crm?contact=${contactId}`,
  });

  let dueDate: string | null = workflow.renewalInterventionDueAt;
  if (!dueDate) {
    dueDate = ymdPlusDays(accountHealth.tier === "urgent" ? 1 : accountHealth.tier === "at_risk" ? 2 : 3);
  }

  const title = truncateTitle(`${displayName} — ${resolution.primary.label}`);
  const suggestedAssigneeEmployeeId = await employeeIdForUser(db, companyId, contact.ownerId ?? null);

  return {
    title,
    description: descriptionFixed,
    dueDate,
    priority: tierToPriority(accountHealth.tier),
    suggestedAssigneeEmployeeId,
  };
}

export async function buildBillingResolutionFollowUpPrefill(
  db: DbClient,
  companyId: number,
  billingCycleId: number,
): Promise<ResolutionFollowUpPrefill | null> {
  const [row] = await db
    .select()
    .from(proBillingCycles)
    .where(and(eq(proBillingCycles.companyId, companyId), eq(proBillingCycles.id, billingCycleId)));
  if (!row) return null;

  const tagLine = RESOLUTION_TASK_TAG.billingCycle(billingCycleId);
  const dueDate = row.dueDate
    ? new Date(row.dueDate).toISOString().slice(0, 10)
    : ymdPlusDays(2);

  const description = buildResolutionTaskDescription({
    tagLine,
    recommendedActionLabel: row.status === "overdue" ? "Collect or escalate overdue invoice" : "Confirm payment or plan",
    recommendedBasis: `Workspace PRO/officer billing — invoice ${row.invoiceNumber}, period ${row.billingMonth}/${row.billingYear}.`,
      contextUrl: "/client/invoices",
  });

  return {
    title: truncateTitle(`Billing — ${row.invoiceNumber} (${row.billingMonth}/${row.billingYear})`),
    description,
    dueDate,
    priority: row.status === "overdue" ? "high" : "medium",
    suggestedAssigneeEmployeeId: null,
  };
}
