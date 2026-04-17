/**
 * Engagement orchestration — company-scoped links over existing domain tables.
 */
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import {
  engagements,
  engagementLinks,
  engagementTasks,
  engagementMessages,
  engagementDocuments,
  engagementActivityLog,
  notifications,
  proServices,
  governmentServiceCases,
  marketplaceBookings,
  contracts,
  proBillingCycles,
  workPermits,
  employees,
  contractSignatures,
  sanadServiceRequests,
} from "../../drizzle/schema";
import { createNotification } from "../repositories/notifications.repository";

type Db = NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>;

function insertId(result: unknown): number {
  const id = Number((result as { insertId?: number }).insertId);
  if (!Number.isFinite(id)) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Insert failed" });
  return id;
}

export async function assertEngagementInCompany(
  db: Db,
  engagementId: number,
  companyId: number,
): Promise<typeof engagements.$inferSelect> {
  const [row] = await db
    .select()
    .from(engagements)
    .where(and(eq(engagements.id, engagementId), eq(engagements.companyId, companyId)))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Engagement not found" });
  return row;
}

export async function logEngagementActivity(
  db: Db,
  input: {
    engagementId: number;
    companyId: number;
    actorUserId: number | null;
    action: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(engagementActivityLog).values({
    engagementId: input.engagementId,
    companyId: input.companyId,
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    payload: input.payload ?? {},
  });
}

export async function getOrCreateWorkspaceEngagement(
  db: Db,
  companyId: number,
  userId: number,
): Promise<number> {
  const [existing] = await db
    .select({ id: engagements.id })
    .from(engagements)
    .where(and(eq(engagements.companyId, companyId), eq(engagements.engagementType, "workspace")))
    .orderBy(desc(engagements.id))
    .limit(1);
  if (existing) return existing.id;

  const [ins] = await db.insert(engagements).values({
    companyId,
    title: "Workspace",
    engagementType: "workspace",
    status: "active",
    health: "unknown",
    summary: "Messages and cross-cutting updates for your company on SmartPRO.",
    createdByUserId: userId,
    metadata: {},
  });
  const id = insertId(ins);
  await logEngagementActivity(db, {
    engagementId: id,
    companyId,
    actorUserId: userId,
    action: "workspace.created",
    payload: {},
  });
  return id;
}

export type CreateFromSourceInput =
  | { sourceType: "pro_service"; sourceId: number }
  | { sourceType: "government_case"; sourceId: number }
  | { sourceType: "marketplace_booking"; sourceId: number }
  | { sourceType: "contract"; sourceId: number }
  | { sourceType: "pro_billing_cycle"; sourceId: number }
  | { sourceType: "staffing_month"; sourceKey: string }
  | { sourceType: "service_request"; sourceId: number };

export async function createEngagementFromSource(
  db: Db,
  companyId: number,
  userId: number,
  input: CreateFromSourceInput,
): Promise<{ engagementId: number; created: boolean }> {
  if (input.sourceType === "pro_service") {
    const [row] = await db
      .select()
      .from(proServices)
      .where(and(eq(proServices.id, input.sourceId), eq(proServices.companyId, companyId)))
      .limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "PRO service not found" });
    const existing = await findEngagementByCompanyLink(db, companyId, "pro_service", input.sourceId, null);
    if (existing) return { engagementId: existing, created: false };
    const title = `PRO · ${row.serviceType.replace(/_/g, " ")} · ${row.serviceNumber}`;
    const [ins] = await db.insert(engagements).values({
      companyId,
      title,
      engagementType: "pro_service",
      status: "active",
      health: "unknown",
      dueDate: row.dueDate ?? null,
      currentStage: row.status ?? undefined,
      summary: row.notes ?? null,
      createdByUserId: userId,
      metadata: { serviceNumber: row.serviceNumber },
    });
    const eid = insertId(ins);
    await db.insert(engagementLinks).values({
      engagementId: eid,
      companyId,
      linkType: "pro_service",
      entityId: row.id,
      entityKey: null,
    });
    await logEngagementActivity(db, {
      engagementId: eid,
      companyId,
      actorUserId: userId,
      action: "engagement.created_from_source",
      payload: { sourceType: "pro_service", sourceId: row.id },
    });
    return { engagementId: eid, created: true };
  }

  if (input.sourceType === "government_case") {
    const [row] = await db
      .select()
      .from(governmentServiceCases)
      .where(and(eq(governmentServiceCases.id, input.sourceId), eq(governmentServiceCases.companyId, companyId)))
      .limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Government case not found" });
    const existing = await findEngagementByCompanyLink(db, companyId, "government_case", input.sourceId, null);
    if (existing) return { engagementId: existing, created: false };
    const title = `Government case · ${row.caseType.replace(/_/g, " ")} · #${row.id}`;
    const [ins] = await db.insert(engagements).values({
      companyId,
      title,
      engagementType: "government_case",
      status: "active",
      health: row.caseStatus === "action_required" ? "at_risk" : "on_track",
      dueDate: row.dueDate ?? null,
      currentStage: row.caseStatus,
      createdByUserId: userId,
      metadata: {},
    });
    const eid = insertId(ins);
    await db.insert(engagementLinks).values({
      engagementId: eid,
      companyId,
      linkType: "government_case",
      entityId: row.id,
      entityKey: null,
    });
    await logEngagementActivity(db, {
      engagementId: eid,
      companyId,
      actorUserId: userId,
      action: "engagement.created_from_source",
      payload: { sourceType: "government_case", sourceId: row.id },
    });
    return { engagementId: eid, created: true };
  }

  if (input.sourceType === "marketplace_booking") {
    const [row] = await db
      .select()
      .from(marketplaceBookings)
      .where(and(eq(marketplaceBookings.id, input.sourceId), eq(marketplaceBookings.companyId, companyId)))
      .limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });
    const existing = await findEngagementByCompanyLink(db, companyId, "marketplace_booking", input.sourceId, null);
    if (existing) return { engagementId: existing, created: false };
    const title = `Marketplace · ${row.bookingNumber}`;
    const [ins] = await db.insert(engagements).values({
      companyId,
      title,
      engagementType: "marketplace_booking",
      status: "active",
      health: "unknown",
      currentStage: row.status,
      createdByUserId: userId,
      metadata: { bookingNumber: row.bookingNumber },
    });
    const eid = insertId(ins);
    await db.insert(engagementLinks).values({
      engagementId: eid,
      companyId,
      linkType: "marketplace_booking",
      entityId: row.id,
      entityKey: null,
    });
    await logEngagementActivity(db, {
      engagementId: eid,
      companyId,
      actorUserId: userId,
      action: "engagement.created_from_source",
      payload: { sourceType: "marketplace_booking", sourceId: row.id },
    });
    return { engagementId: eid, created: true };
  }

  if (input.sourceType === "contract") {
    const [row] = await db
      .select()
      .from(contracts)
      .where(and(eq(contracts.id, input.sourceId), eq(contracts.companyId, companyId)))
      .limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Contract not found" });
    const existing = await findEngagementByCompanyLink(db, companyId, "contract", input.sourceId, null);
    if (existing) return { engagementId: existing, created: false };
    const title = `Contract · ${row.title}`;
    const [ins] = await db.insert(engagements).values({
      companyId,
      title,
      engagementType: "contract",
      status: "active",
      health: row.status === "pending_signature" ? "at_risk" : "on_track",
      dueDate: row.endDate ?? null,
      currentStage: row.status,
      createdByUserId: userId,
      metadata: { contractNumber: row.contractNumber },
    });
    const eid = insertId(ins);
    await db.insert(engagementLinks).values({
      engagementId: eid,
      companyId,
      linkType: "contract",
      entityId: row.id,
      entityKey: null,
    });
    await logEngagementActivity(db, {
      engagementId: eid,
      companyId,
      actorUserId: userId,
      action: "engagement.created_from_source",
      payload: { sourceType: "contract", sourceId: row.id },
    });
    return { engagementId: eid, created: true };
  }

  if (input.sourceType === "pro_billing_cycle") {
    const [row] = await db
      .select()
      .from(proBillingCycles)
      .where(and(eq(proBillingCycles.id, input.sourceId), eq(proBillingCycles.companyId, companyId)))
      .limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Billing cycle not found" });
    const existing = await findEngagementByCompanyLink(db, companyId, "pro_billing_cycle", input.sourceId, null);
    if (existing) return { engagementId: existing, created: false };
    const title = `Invoice · ${row.invoiceNumber}`;
    const [ins] = await db.insert(engagements).values({
      companyId,
      title,
      engagementType: "pro_billing_cycle",
      status: "active",
      health: row.status === "overdue" ? "at_risk" : "on_track",
      dueDate: row.dueDate ?? null,
      currentStage: row.status,
      createdByUserId: userId,
      metadata: { invoiceNumber: row.invoiceNumber },
    });
    const eid = insertId(ins);
    await db.insert(engagementLinks).values({
      engagementId: eid,
      companyId,
      linkType: "pro_billing_cycle",
      entityId: row.id,
      entityKey: null,
    });
    await logEngagementActivity(db, {
      engagementId: eid,
      companyId,
      actorUserId: userId,
      action: "engagement.created_from_source",
      payload: { sourceType: "pro_billing_cycle", sourceId: row.id },
    });
    return { engagementId: eid, created: true };
  }

  if (input.sourceType === "staffing_month") {
    if (!/^\d{4}-\d{2}$/.test(input.sourceKey)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid staffing month (expected YYYY-MM)" });
    }
    const existing = await findEngagementByCompanyLink(db, companyId, "staffing_month", null, input.sourceKey);
    if (existing) return { engagementId: existing, created: false };
    const title = `Staffing · ${input.sourceKey}`;
    const [ins] = await db.insert(engagements).values({
      companyId,
      title,
      engagementType: "staffing_month",
      status: "active",
      health: "unknown",
      currentStage: "billing_preview",
      createdByUserId: userId,
      metadata: { month: input.sourceKey },
    });
    const eid = insertId(ins);
    await db.insert(engagementLinks).values({
      engagementId: eid,
      companyId,
      linkType: "staffing_month",
      entityId: null,
      entityKey: input.sourceKey,
    });
    await logEngagementActivity(db, {
      engagementId: eid,
      companyId,
      actorUserId: userId,
      action: "engagement.created_from_source",
      payload: { sourceType: "staffing_month", sourceKey: input.sourceKey },
    });
    return { engagementId: eid, created: true };
  }

  if (input.sourceType === "service_request") {
    const [row] = await db
      .select()
      .from(sanadServiceRequests)
      .where(
        and(
          eq(sanadServiceRequests.id, input.sourceId),
          eq(sanadServiceRequests.requesterCompanyId, companyId),
        ),
      )
      .limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Service request not found" });
    const existing = await findEngagementByCompanyLink(db, companyId, "service_request", input.sourceId, null);
    if (existing) return { engagementId: existing, created: false };
    const title = `Service request · ${row.serviceType}`;
    const [ins] = await db.insert(engagements).values({
      companyId,
      title,
      engagementType: "service_request",
      status: "active",
      health: "unknown",
      currentStage: row.status ?? "new",
      createdByUserId: userId,
      metadata: {},
    });
    const eid = insertId(ins);
    await db.insert(engagementLinks).values({
      engagementId: eid,
      companyId,
      linkType: "service_request",
      entityId: row.id,
      entityKey: null,
    });
    await logEngagementActivity(db, {
      engagementId: eid,
      companyId,
      actorUserId: userId,
      action: "engagement.created_from_source",
      payload: { sourceType: "service_request", sourceId: row.id },
    });
    return { engagementId: eid, created: true };
  }

  throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported source" });
}

async function findEngagementByCompanyLink(
  db: Db,
  companyId: number,
  linkType: (typeof engagementLinks.$inferInsert)["linkType"],
  entityId: number | null,
  entityKey: string | null,
): Promise<number | null> {
  const [hit] = await db
    .select({ id: engagements.id })
    .from(engagementLinks)
    .innerJoin(engagements, eq(engagements.id, engagementLinks.engagementId))
    .where(
      and(
        eq(engagementLinks.companyId, companyId),
        eq(engagementLinks.linkType, linkType),
        entityId != null ? eq(engagementLinks.entityId, entityId) : isNull(engagementLinks.entityId),
        entityKey != null ? eq(engagementLinks.entityKey, entityKey) : isNull(engagementLinks.entityKey),
      ),
    )
    .limit(1);
  return hit?.id ?? null;
}

export async function addEngagementLink(
  db: Db,
  companyId: number,
  userId: number,
  engagementId: number,
  linkType: (typeof engagementLinks.$inferInsert)["linkType"],
  entityId: number | null,
  entityKey: string | null,
): Promise<void> {
  await assertEngagementInCompany(db, engagementId, companyId);
  await db.insert(engagementLinks).values({
    engagementId,
    companyId,
    linkType,
    entityId,
    entityKey,
  });
  await logEngagementActivity(db, {
    engagementId,
    companyId,
    actorUserId: userId,
    action: "link.added",
    payload: { linkType, entityId, entityKey },
  });
}

export async function buildEngagementDetail(db: Db, engagementId: number, companyId: number) {
  const eng = await assertEngagementInCompany(db, engagementId, companyId);
  const links = await db.select().from(engagementLinks).where(eq(engagementLinks.engagementId, engagementId));
  const tasks = await db
    .select()
    .from(engagementTasks)
    .where(eq(engagementTasks.engagementId, engagementId))
    .orderBy(asc(engagementTasks.sortOrder), desc(engagementTasks.id));
  const messages = await db
    .select()
    .from(engagementMessages)
    .where(eq(engagementMessages.engagementId, engagementId))
    .orderBy(desc(engagementMessages.createdAt))
    .limit(200);
  const documents = await db
    .select()
    .from(engagementDocuments)
    .where(eq(engagementDocuments.engagementId, engagementId))
    .orderBy(desc(engagementDocuments.createdAt));
  const activity = await db
    .select()
    .from(engagementActivityLog)
    .where(eq(engagementActivityLog.engagementId, engagementId))
    .orderBy(desc(engagementActivityLog.createdAt))
    .limit(100);

  const signatureSummary: { contractId: number; pending: number; signed: number }[] = [];
  const invoiceLines: {
    kind: "pro_billing_cycle";
    id: number;
    invoiceNumber: string;
    amountOmr: string;
    status: string;
    dueDate: Date | null;
  }[] = [];

  for (const l of links) {
    if (l.linkType === "contract" && l.entityId) {
      const sigs = await db
        .select({ status: contractSignatures.status })
        .from(contractSignatures)
        .where(eq(contractSignatures.contractId, l.entityId));
      let pending = 0;
      let signed = 0;
      for (const s of sigs) {
        if (s.status === "signed") signed++;
        else pending++;
      }
      signatureSummary.push({ contractId: l.entityId, pending, signed });
    }
    if (l.linkType === "pro_billing_cycle" && l.entityId) {
      const [inv] = await db
        .select()
        .from(proBillingCycles)
        .where(and(eq(proBillingCycles.id, l.entityId), eq(proBillingCycles.companyId, companyId)))
        .limit(1);
      if (inv) {
        invoiceLines.push({
          kind: "pro_billing_cycle",
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          amountOmr: String(inv.amountOmr),
          status: inv.status,
          dueDate: inv.dueDate,
        });
      }
    }
  }

  return {
    engagement: eng,
    links,
    tasks,
    messages,
    documents,
    activity,
    signatureSummary,
    invoiceSummary: invoiceLines,
  };
}

export async function backfillEngagementsForCompany(
  db: Db,
  companyId: number,
  userId: number,
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;
  const proRows = await db.select({ id: proServices.id }).from(proServices).where(eq(proServices.companyId, companyId)).limit(200);
  for (const r of proRows) {
    const res = await createEngagementFromSource(db, companyId, userId, { sourceType: "pro_service", sourceId: r.id });
    if (res.created) created++;
    else skipped++;
  }
  const govRows = await db
    .select({ id: governmentServiceCases.id })
    .from(governmentServiceCases)
    .where(eq(governmentServiceCases.companyId, companyId))
    .limit(200);
  for (const r of govRows) {
    const res = await createEngagementFromSource(db, companyId, userId, {
      sourceType: "government_case",
      sourceId: r.id,
    });
    if (res.created) created++;
    else skipped++;
  }
  const bookRows = await db
    .select({ id: marketplaceBookings.id })
    .from(marketplaceBookings)
    .where(eq(marketplaceBookings.companyId, companyId))
    .limit(200);
  for (const r of bookRows) {
    const res = await createEngagementFromSource(db, companyId, userId, {
      sourceType: "marketplace_booking",
      sourceId: r.id,
    });
    if (res.created) created++;
    else skipped++;
  }
  const ctr = await db.select({ id: contracts.id }).from(contracts).where(eq(contracts.companyId, companyId)).limit(200);
  for (const r of ctr) {
    const res = await createEngagementFromSource(db, companyId, userId, { sourceType: "contract", sourceId: r.id });
    if (res.created) created++;
    else skipped++;
  }
  const invs = await db
    .select({ id: proBillingCycles.id })
    .from(proBillingCycles)
    .where(eq(proBillingCycles.companyId, companyId))
    .limit(200);
  for (const r of invs) {
    const res = await createEngagementFromSource(db, companyId, userId, {
      sourceType: "pro_billing_cycle",
      sourceId: r.id,
    });
    if (res.created) created++;
    else skipped++;
  }
  return { created, skipped };
}

export async function createRenewalEngagement(
  db: Db,
  companyId: number,
  userId: number,
  workPermitId: number,
  notes: string,
): Promise<number> {
  const [wp] = await db
    .select()
    .from(workPermits)
    .where(and(eq(workPermits.id, workPermitId), eq(workPermits.companyId, companyId)))
    .limit(1);
  if (!wp) throw new TRPCError({ code: "NOT_FOUND", message: "Work permit not found" });
  const [emp] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, wp.employeeId), eq(employees.companyId, companyId)))
    .limit(1);
  const empLabel = emp ? `${emp.firstName} ${emp.lastName}`.trim() : `Employee #${wp.employeeId}`;
  const title = `Renewal · Work permit ${wp.workPermitNumber} · ${empLabel}`;
  const [ins] = await db.insert(engagements).values({
    companyId,
    title,
    engagementType: "work_permit_renewal",
    status: "waiting_platform",
    health: "at_risk",
    dueDate: wp.expiryDate ?? null,
    currentStage: "requested",
    summary: notes,
    createdByUserId: userId,
    metadata: { workPermitNumber: wp.workPermitNumber },
  });
  const eid = insertId(ins);
  await db.insert(engagementLinks).values({
    engagementId: eid,
    companyId,
    linkType: "work_permit",
    entityId: wp.id,
    entityKey: null,
  });
  await db.insert(engagementTasks).values({
    engagementId: eid,
    companyId,
    title: "SmartPRO: confirm renewal scope and timeline with client",
    status: "pending",
    sortOrder: 0,
  });
  await logEngagementActivity(db, {
    engagementId: eid,
    companyId,
    actorUserId: userId,
    action: "renewal.requested",
    payload: { workPermitId },
  });
  try {
    const { notifyOwner } = await import("../_core/notification");
    await notifyOwner({
      title: "Work permit renewal requested",
      content: `${title}\n\n${notes}`,
    });
  } catch {
    /* non-fatal */
  }
  await createNotification(
    {
      userId,
      companyId,
      title: "Renewal request submitted",
      message: `We received your renewal request for permit ${wp.workPermitNumber}. Our team will follow up.`,
      type: "engagement_renewal",
      isRead: true,
    },
    { actorUserId: userId },
  );
  return eid;
}

export type UnifiedMessageRow =
  | {
      source: "engagement";
      id: number;
      author: "client" | "platform" | "system";
      authorUserId: number | null;
      subject: string | null;
      body: string;
      createdAt: Date;
      readAt: Date | null;
    }
  | {
      source: "legacy_notification";
      id: number;
      author: "client";
      authorUserId: number | null;
      subject: string;
      body: string;
      createdAt: Date;
      /** Legacy inbox read flag (notifications.isRead). */
      isRead: boolean;
    };

export async function listUnifiedThread(
  db: Db,
  companyId: number,
  userId: number,
): Promise<UnifiedMessageRow[]> {
  const workspaceId = await getOrCreateWorkspaceEngagement(db, companyId, userId);
  const em = await db
    .select()
    .from(engagementMessages)
    .where(and(eq(engagementMessages.engagementId, workspaceId), eq(engagementMessages.companyId, companyId)))
    .orderBy(asc(engagementMessages.createdAt))
    .limit(200);
  const legacy = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, "client_message"),
        or(eq(notifications.companyId, companyId), isNull(notifications.companyId)),
      ),
    )
    .orderBy(asc(notifications.createdAt))
    .limit(200);

  const merged: UnifiedMessageRow[] = [
    ...legacy.map(
      (n): UnifiedMessageRow => ({
        source: "legacy_notification",
        id: n.id,
        author: "client",
        authorUserId: n.userId,
        subject: n.title,
        body: n.message,
        createdAt: n.createdAt,
        isRead: n.isRead,
      }),
    ),
    ...em.map(
      (m): UnifiedMessageRow => ({
        source: "engagement",
        id: m.id,
        author: m.author,
        authorUserId: m.authorUserId,
        subject: m.subject,
        body: m.body,
        createdAt: m.createdAt,
        readAt: m.readAt,
      }),
    ),
  ];
  merged.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return merged;
}

export async function sendClientEngagementMessage(
  db: Db,
  companyId: number,
  userId: number,
  subject: string,
  body: string,
): Promise<void> {
  const workspaceId = await getOrCreateWorkspaceEngagement(db, companyId, userId);
  await db.insert(engagementMessages).values({
    engagementId: workspaceId,
    companyId,
    author: "client",
    authorUserId: userId,
    subject,
    body,
  });
  await logEngagementActivity(db, {
    engagementId: workspaceId,
    companyId,
    actorUserId: userId,
    action: "message.client_sent",
    payload: { subject },
  });
  try {
    const { notifyOwner } = await import("../_core/notification");
    await notifyOwner({
      title: `Client message: ${subject}`,
      content: `From user ${userId} (company ${companyId})\n\n${body}`,
    });
  } catch {
    /* non-fatal */
  }
}

export async function sendPlatformEngagementMessage(
  db: Db,
  companyId: number,
  actorUserId: number,
  engagementId: number,
  subject: string,
  body: string,
): Promise<void> {
  await assertEngagementInCompany(db, engagementId, companyId);
  await db.insert(engagementMessages).values({
    engagementId,
    companyId,
    author: "platform",
    authorUserId: actorUserId,
    subject,
    body,
  });
  await logEngagementActivity(db, {
    engagementId,
    companyId,
    actorUserId,
    action: "message.platform_sent",
    payload: { subject },
  });
}

export async function markEngagementMessageRead(
  db: Db,
  companyId: number,
  userId: number,
  messageId: number,
): Promise<void> {
  const [row] = await db
    .select()
    .from(engagementMessages)
    .where(
      and(
        eq(engagementMessages.id, messageId),
        eq(engagementMessages.companyId, companyId),
      ),
    )
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
  if (row.author === "platform" || row.author === "system") {
    await db
      .update(engagementMessages)
      .set({ readAt: new Date() })
      .where(eq(engagementMessages.id, messageId));
    return;
  }
  if (row.author === "client" && row.authorUserId === userId) {
    return;
  }
  throw new TRPCError({ code: "FORBIDDEN", message: "Cannot mark this message read" });
}
