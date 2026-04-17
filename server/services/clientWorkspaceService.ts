/**
 * Aggregates for the end-customer Client Workspace (/client/*).
 * Reuses engagement roll-ups and linked invoice/document tables — no parallel domain.
 */
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import {
  clientServiceInvoices,
  engagementActivityLog,
  engagementDocuments,
  engagementLinks,
  engagementMessages,
  engagementTasks,
  engagements,
  proBillingCycles,
  companyMembers,
  users,
} from "../../drizzle/schema";

type Db = NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>;

export type ClientEngagementFilter =
  | "all"
  | "awaiting_your_action"
  | "in_progress"
  | "completed"
  | "overdue"
  | "at_risk"
  | "awaiting_payment"
  | "awaiting_signature";

export type ClientEngagementSort = "due_date" | "recently_updated" | "priority";

const notArchived = ne(engagements.status, "archived");

function overdueWhere(): SQL {
  const now = new Date();
  return and(
    ne(engagements.status, "completed"),
    notArchived,
    or(
      and(isNotNull(engagements.slaDueAt), lt(engagements.slaDueAt, now)),
      and(isNotNull(engagements.topActionDueAt), lt(engagements.topActionDueAt, now)),
      eq(engagements.health, "delayed"),
      eq(engagements.topActionStatus, "overdue"),
    )!,
  )!;
}

function filterWhere(companyId: number, filter: ClientEngagementFilter): SQL | undefined {
  const base = eq(engagements.companyId, companyId);
  switch (filter) {
    case "all":
      return and(base, notArchived);
    case "awaiting_your_action":
      return and(base, eq(engagements.status, "waiting_client"), notArchived);
    case "in_progress":
      return and(
        base,
        inArray(engagements.status, ["draft", "active", "waiting_platform", "blocked"]),
        notArchived,
      );
    case "completed":
      return and(base, eq(engagements.status, "completed"));
    case "overdue":
      return and(base, overdueWhere());
    case "at_risk":
      return and(base, eq(engagements.health, "at_risk"), notArchived);
    case "awaiting_payment":
      return and(
        base,
        notArchived,
        or(eq(engagements.topActionType, "payment"), eq(engagements.topActionType, "payment_verify"))!,
      );
    case "awaiting_signature":
      return and(base, notArchived, eq(engagements.topActionType, "signing"));
    default:
      return base;
  }
}

function orderByClause(sort: ClientEngagementSort) {
  switch (sort) {
    case "due_date":
      return [asc(engagements.dueDate), desc(engagements.updatedAt)];
    case "priority":
      return [
        desc(sql`FIELD(${engagements.opsPriority}, 'urgent','high','normal')`),
        desc(engagements.updatedAt),
      ];
    case "recently_updated":
    default:
      return [desc(engagements.updatedAt)];
  }
}

async function unreadCountsByEngagement(db: Db, companyId: number, engagementIds: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (engagementIds.length === 0) return map;
  const rows = await db
    .select({
      engagementId: engagementMessages.engagementId,
      c: sql<number>`count(*)`,
    })
    .from(engagementMessages)
    .where(
      and(
        eq(engagementMessages.companyId, companyId),
        inArray(engagementMessages.engagementId, engagementIds),
        inArray(engagementMessages.author, ["platform", "system"]),
        isNull(engagementMessages.readAt),
      ),
    )
    .groupBy(engagementMessages.engagementId);
  for (const r of rows) map.set(r.engagementId, Number(r.c ?? 0));
  return map;
}

async function taskProgressByEngagement(
  db: Db,
  companyId: number,
  engagementIds: number[],
): Promise<Map<number, { done: number; total: number }>> {
  const map = new Map<number, { done: number; total: number }>();
  if (engagementIds.length === 0) return map;
  const rows = await db
    .select({
      engagementId: engagementTasks.engagementId,
      total: sql<number>`count(*)`,
      done: sql<number>`sum(case when ${engagementTasks.status} = 'done' or ${engagementTasks.status} = 'cancelled' then 1 else 0 end)`,
    })
    .from(engagementTasks)
    .where(and(eq(engagementTasks.companyId, companyId), inArray(engagementTasks.engagementId, engagementIds)))
    .groupBy(engagementTasks.engagementId);
  for (const r of rows) {
    map.set(r.engagementId, { total: Number(r.total ?? 0), done: Number(r.done ?? 0) });
  }
  return map;
}

export type ClientEngagementRow = (typeof engagements.$inferSelect) & {
  unreadCount: number;
  progressPercent: number | null;
};

export async function listClientEngagements(
  db: Db,
  input: {
    companyId: number;
    filter: ClientEngagementFilter;
    sort: ClientEngagementSort;
    page: number;
    pageSize: number;
  },
): Promise<{ items: ClientEngagementRow[]; total: number }> {
  const whereExpr = filterWhere(input.companyId, input.filter);
  const offset = (input.page - 1) * input.pageSize;
  const order = orderByClause(input.sort);

  const rows = await db
    .select()
    .from(engagements)
    .where(whereExpr)
    .orderBy(...order)
    .limit(input.pageSize)
    .offset(offset);

  const [cnt] = await db.select({ c: count() }).from(engagements).where(whereExpr);
  const total = Number(cnt?.c ?? 0);
  const ids = rows.map((r) => r.id);
  const [unreadMap, progMap] = await Promise.all([
    unreadCountsByEngagement(db, input.companyId, ids),
    taskProgressByEngagement(db, input.companyId, ids),
  ]);

  const items: ClientEngagementRow[] = rows.map((e) => {
    const p = progMap.get(e.id);
    let progressPercent: number | null = null;
    if (p && p.total > 0) progressPercent = Math.round((p.done / p.total) * 100);
    return {
      ...e,
      unreadCount: unreadMap.get(e.id) ?? 0,
      progressPercent,
    };
  });

  return { items, total };
}

async function countWhere(db: Db, companyId: number, expr: SQL | undefined): Promise<number> {
  const [r] = await db
    .select({ c: count() })
    .from(engagements)
    .where(expr ? and(eq(engagements.companyId, companyId), expr) : eq(engagements.companyId, companyId));
  return Number(r?.c ?? 0);
}

export async function getClientHomeSummary(db: Db, companyId: number) {
  const now = new Date();
  const overdue = await countWhere(db, companyId, overdueWhere());
  const atRisk = await countWhere(db, companyId, and(eq(engagements.health, "at_risk"), notArchived));
  const awaitingYourAction = await countWhere(
    db,
    companyId,
    and(eq(engagements.status, "waiting_client"), notArchived),
  );
  const awaitingPayment = await countWhere(
    db,
    companyId,
    and(
      notArchived,
      or(eq(engagements.topActionType, "payment"), eq(engagements.topActionType, "payment_verify"))!,
    ),
  );
  const contractsToSign = await countWhere(
    db,
    companyId,
    and(notArchived, eq(engagements.topActionType, "signing")),
  );

  const pendingInvoicesRows = await db
    .select({ id: proBillingCycles.id })
    .from(proBillingCycles)
    .where(and(eq(proBillingCycles.companyId, companyId), eq(proBillingCycles.status, "pending")));
  const pendingCsi = await db
    .select({ id: clientServiceInvoices.id })
    .from(clientServiceInvoices)
    .where(
      and(
        eq(clientServiceInvoices.companyId, companyId),
        inArray(clientServiceInvoices.status, ["sent", "partial", "overdue"]),
      ),
    );
  const pendingInvoices = pendingInvoicesRows.length + pendingCsi.length;

  const { items: yourWork } = await listClientEngagements(db, {
    companyId,
    filter: "in_progress",
    sort: "priority",
    page: 1,
    pageSize: 5,
  });

  const activity = await db
    .select({
      id: engagementActivityLog.id,
      engagementId: engagementActivityLog.engagementId,
      action: engagementActivityLog.action,
      createdAt: engagementActivityLog.createdAt,
      title: engagements.title,
    })
    .from(engagementActivityLog)
    .innerJoin(engagements, eq(engagements.id, engagementActivityLog.engagementId))
    .where(and(eq(engagementActivityLog.companyId, companyId), eq(engagements.companyId, companyId)))
    .orderBy(desc(engagementActivityLog.createdAt))
    .limit(12);

  return {
    kpis: {
      overdue,
      at_risk: atRisk,
      awaiting_your_action: awaitingYourAction,
      pending_invoices: pendingInvoices,
      contracts_to_sign: contractsToSign,
    },
    yourWork,
    recentUpdates: activity,
  };
}

export type ClientDocumentRow = {
  id: number;
  engagementId: number;
  engagementTitle: string;
  title: string;
  status: string;
  createdAt: Date;
  fileUrl: string | null;
};

export async function listClientWorkspaceDocuments(
  db: Db,
  input: { companyId: number; filter: "all" | "pending" | "rejected" | "expiring_soon"; page: number; pageSize: number },
): Promise<{ items: ClientDocumentRow[]; total: number }> {
  const parts: SQL[] = [eq(engagementDocuments.companyId, input.companyId)];
  if (input.filter === "pending") parts.push(eq(engagementDocuments.status, "pending"));
  if (input.filter === "rejected") parts.push(eq(engagementDocuments.status, "rejected"));
  if (input.filter === "expiring_soon") {
    /* No expiry on engagement_documents — treat as pending for now */
    parts.push(eq(engagementDocuments.status, "pending"));
  }
  const whereExpr = and(...parts);
  const offset = (input.page - 1) * input.pageSize;

  const rows = await db
    .select({
      doc: engagementDocuments,
      engagementTitle: engagements.title,
    })
    .from(engagementDocuments)
    .innerJoin(engagements, eq(engagements.id, engagementDocuments.engagementId))
    .where(whereExpr)
    .orderBy(desc(engagementDocuments.createdAt))
    .limit(input.pageSize)
    .offset(offset);

  const [cnt] = await db.select({ c: count() }).from(engagementDocuments).where(whereExpr);

  const items: ClientDocumentRow[] = rows.map((r) => ({
    id: r.doc.id,
    engagementId: r.doc.engagementId,
    engagementTitle: r.engagementTitle,
    title: r.doc.title,
    status: r.doc.status,
    createdAt: r.doc.createdAt,
    fileUrl: r.doc.fileUrl,
  }));
  return { items, total: Number(cnt?.c ?? 0) };
}

export type ClientInvoiceRow = {
  kind: "pro_billing_cycle" | "client_service_invoice";
  id: number;
  engagementId: number | null;
  engagementTitle: string | null;
  invoiceNumber: string;
  amountOmr: string;
  status: string;
  dueDate: Date | null;
  balanceOmr?: string;
};

export async function listClientWorkspaceInvoices(
  db: Db,
  input: { companyId: number; page: number; pageSize: number },
): Promise<{ items: ClientInvoiceRow[]; total: number }> {
  const proRows = await db
    .select({
      id: proBillingCycles.id,
      invoiceNumber: proBillingCycles.invoiceNumber,
      amountOmr: proBillingCycles.amountOmr,
      status: proBillingCycles.status,
      dueDate: proBillingCycles.dueDate,
      engagementId: engagementLinks.engagementId,
      engagementTitle: engagements.title,
    })
    .from(proBillingCycles)
    .leftJoin(
      engagementLinks,
      and(
        eq(engagementLinks.companyId, input.companyId),
        eq(engagementLinks.linkType, "pro_billing_cycle"),
        eq(engagementLinks.entityId, proBillingCycles.id),
      ),
    )
    .leftJoin(engagements, eq(engagements.id, engagementLinks.engagementId))
    .where(eq(proBillingCycles.companyId, input.companyId))
    .orderBy(desc(proBillingCycles.dueDate));

  const csiRows = await db
    .select({
      id: clientServiceInvoices.id,
      invoiceNumber: clientServiceInvoices.invoiceNumber,
      totalOmr: clientServiceInvoices.totalOmr,
      status: clientServiceInvoices.status,
      dueDate: clientServiceInvoices.dueDate,
      balanceOmr: clientServiceInvoices.balanceOmr,
      engagementId: engagementLinks.engagementId,
      engagementTitle: engagements.title,
    })
    .from(clientServiceInvoices)
    .leftJoin(
      engagementLinks,
      and(
        eq(engagementLinks.companyId, input.companyId),
        eq(engagementLinks.linkType, "client_service_invoice"),
        eq(engagementLinks.entityId, clientServiceInvoices.id),
      ),
    )
    .leftJoin(engagements, eq(engagements.id, engagementLinks.engagementId))
    .where(eq(clientServiceInvoices.companyId, input.companyId))
    .orderBy(desc(clientServiceInvoices.dueDate));

  const merged: ClientInvoiceRow[] = [
    ...proRows.map((r) => ({
      kind: "pro_billing_cycle" as const,
      id: r.id,
      engagementId: r.engagementId ?? null,
      engagementTitle: r.engagementTitle ?? null,
      invoiceNumber: r.invoiceNumber,
      amountOmr: String(r.amountOmr),
      status: r.status,
      dueDate: r.dueDate,
    })),
    ...csiRows.map((r) => ({
      kind: "client_service_invoice" as const,
      id: r.id,
      engagementId: r.engagementId ?? null,
      engagementTitle: r.engagementTitle ?? null,
      invoiceNumber: r.invoiceNumber,
      amountOmr: String(r.totalOmr),
      status: r.status,
      dueDate: r.dueDate ? new Date(`${r.dueDate}T12:00:00.000Z`) : null,
      balanceOmr: String(r.balanceOmr),
    })),
  ];
  merged.sort((a, b) => (b.dueDate?.getTime() ?? 0) - (a.dueDate?.getTime() ?? 0));
  const total = merged.length;
  const offset = (input.page - 1) * input.pageSize;
  const items = merged.slice(offset, offset + input.pageSize);
  return { items, total };
}

export type ClientThreadRow = {
  engagementId: number;
  title: string;
  lastMessageAt: Date | null;
  lastPreview: string | null;
  unreadCount: number;
};

export async function listClientWorkspaceThreads(db: Db, input: { companyId: number }): Promise<ClientThreadRow[]> {
  const engRows = await db
    .select({ id: engagements.id, title: engagements.title })
    .from(engagements)
    .where(and(eq(engagements.companyId, input.companyId), notArchived))
    .orderBy(desc(engagements.updatedAt))
    .limit(80);

  const out: ClientThreadRow[] = [];
  for (const e of engRows) {
    const [last] = await db
      .select({ body: engagementMessages.body, createdAt: engagementMessages.createdAt })
      .from(engagementMessages)
      .where(and(eq(engagementMessages.engagementId, e.id), eq(engagementMessages.companyId, input.companyId)))
      .orderBy(desc(engagementMessages.createdAt))
      .limit(1);
    const [unread] = await db
      .select({ c: count() })
      .from(engagementMessages)
      .where(
        and(
          eq(engagementMessages.engagementId, e.id),
          eq(engagementMessages.companyId, input.companyId),
          inArray(engagementMessages.author, ["platform", "system"]),
          isNull(engagementMessages.readAt),
        ),
      );
    out.push({
      engagementId: e.id,
      title: e.title,
      lastMessageAt: last?.createdAt ?? null,
      lastPreview: last?.body ? last.body.slice(0, 120) : null,
      unreadCount: Number(unread?.c ?? 0),
    });
  }
  out.sort((a, b) => (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0));
  return out;
}

export type ClientTeamMemberRow = {
  userId: number;
  name: string | null;
  email: string | null;
  role: string;
};

export async function listClientWorkspaceTeam(db: Db, companyId: number): Promise<ClientTeamMemberRow[]> {
  const rows = await db
    .select({
      userId: companyMembers.userId,
      role: companyMembers.role,
      name: users.name,
      email: users.email,
    })
    .from(companyMembers)
    .innerJoin(users, eq(users.id, companyMembers.userId))
    .where(and(eq(companyMembers.companyId, companyId), eq(companyMembers.isActive, true)))
    .orderBy(asc(users.name));
  return rows.map((r) => ({
    userId: r.userId,
    name: r.name,
    email: r.email,
    role: r.role,
  }));
}
