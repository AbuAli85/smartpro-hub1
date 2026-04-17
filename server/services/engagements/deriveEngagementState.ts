/**
 * Derives persisted engagement roll-ups: SLA, last activity, health, and exactly one primary top action.
 * Signals are limited to engagement-scoped tables (tasks, documents, messages, payment transfers,
 * and linked contracts / invoices via `engagement_links`) so operational work stays traceable.
 */
import { and, desc, eq } from "drizzle-orm";
import {
  clientServiceInvoices,
  contractSignatures,
  contracts,
  engagementActivityLog,
  engagementDocuments,
  engagementLinks,
  engagementMessages,
  engagementPaymentTransfers,
  engagementTasks,
  engagements,
  proBillingCycles,
} from "../../../drizzle/schema";

type Db = NonNullable<Awaited<ReturnType<typeof import("../../db").getDb>>>;

function minDate(a: Date | null | undefined, b: Date | null | undefined): Date | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a.getTime() <= b.getTime() ? a : b;
}

function maxDate(a: Date | null | undefined, b: Date | null | undefined): Date | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

export type TopActionDerived = {
  topActionType: string | null;
  topActionLabel: string | null;
  topActionStatus: string | null;
  topActionDueAt: Date | null;
  topActionPayload: Record<string, unknown>;
  slaDueAt: Date | null;
  lastActivityAt: Date | null;
  health: "on_track" | "at_risk" | "blocked" | "delayed" | "unknown";
  healthReason: string | null;
};

export async function computeEngagementDerivedState(
  db: Db,
  engagementId: number,
  companyId: number,
): Promise<TopActionDerived> {
  const [eng] = await db
    .select()
    .from(engagements)
    .where(and(eq(engagements.id, engagementId), eq(engagements.companyId, companyId)))
    .limit(1);
  if (!eng) {
    return {
      topActionType: null,
      topActionLabel: null,
      topActionStatus: null,
      topActionDueAt: null,
      topActionPayload: {},
      slaDueAt: null,
      lastActivityAt: null,
      health: "unknown",
      healthReason: null,
    };
  }

  const links = await db.select().from(engagementLinks).where(eq(engagementLinks.engagementId, engagementId));
  const tasks = await db
    .select()
    .from(engagementTasks)
    .where(and(eq(engagementTasks.engagementId, engagementId), eq(engagementTasks.companyId, companyId)));
  const pendingDocs = await db
    .select()
    .from(engagementDocuments)
    .where(
      and(
        eq(engagementDocuments.engagementId, engagementId),
        eq(engagementDocuments.companyId, companyId),
        eq(engagementDocuments.status, "pending"),
      ),
    );
  const [lastAct] = await db
    .select({ createdAt: engagementActivityLog.createdAt })
    .from(engagementActivityLog)
    .where(eq(engagementActivityLog.engagementId, engagementId))
    .orderBy(desc(engagementActivityLog.createdAt))
    .limit(1);
  const [lastMsg] = await db
    .select({ createdAt: engagementMessages.createdAt })
    .from(engagementMessages)
    .where(and(eq(engagementMessages.engagementId, engagementId), eq(engagementMessages.companyId, companyId)))
    .orderBy(desc(engagementMessages.createdAt))
    .limit(1);
  const [xfer] = await db
    .select()
    .from(engagementPaymentTransfers)
    .where(
      and(eq(engagementPaymentTransfers.engagementId, engagementId), eq(engagementPaymentTransfers.companyId, companyId)),
    )
    .limit(1);

  let lastActivityAt = maxDate(eng.updatedAt, eng.createdAt);
  lastActivityAt = maxDate(lastActivityAt, lastAct?.createdAt ?? null);
  lastActivityAt = maxDate(lastActivityAt, lastMsg?.createdAt ?? null);

  const openTasks = tasks.filter((t) => t.status === "pending" || t.status === "in_progress");
  const overdueTask = openTasks.find((t) => t.dueDate && new Date(t.dueDate) < new Date());

  let slaDueAt: Date | null = eng.dueDate ?? null;
  for (const t of openTasks) {
    if (t.dueDate) slaDueAt = minDate(slaDueAt, new Date(t.dueDate));
  }

  const now = new Date();
  const overdueSla = slaDueAt != null && slaDueAt < now && !["completed", "archived"].includes(eng.status);

  let proBillingOverdue = false;
  let csiOpen = false;
  let csiOverdue = false;
  let pendingSignatures = 0;
  for (const l of links) {
    if (l.linkType === "pro_billing_cycle" && l.entityId) {
      const [row] = await db
        .select({ status: proBillingCycles.status, dueDate: proBillingCycles.dueDate })
        .from(proBillingCycles)
        .where(and(eq(proBillingCycles.id, l.entityId), eq(proBillingCycles.companyId, companyId)))
        .limit(1);
      if (row && row.status !== "paid" && row.status !== "cancelled" && row.status !== "waived") {
        if (row.dueDate && new Date(row.dueDate) < now) proBillingOverdue = true;
      }
    }
    if (l.linkType === "client_service_invoice" && l.entityId) {
      const [inv] = await db
        .select({ status: clientServiceInvoices.status, balanceOmr: clientServiceInvoices.balanceOmr, dueDate: clientServiceInvoices.dueDate })
        .from(clientServiceInvoices)
        .where(and(eq(clientServiceInvoices.id, l.entityId), eq(clientServiceInvoices.companyId, companyId)))
        .limit(1);
      if (inv && inv.status !== "paid" && inv.status !== "void") {
        const bal = Number(inv.balanceOmr);
        if (bal > 0.0005) csiOpen = true;
        if (inv.dueDate) {
          const d = new Date(`${inv.dueDate}T23:59:59`);
          if (d < now && bal > 0) csiOverdue = true;
        }
      }
    }
    if (l.linkType === "contract" && l.entityId) {
      const [c] = await db
        .select({ status: contracts.status })
        .from(contracts)
        .where(and(eq(contracts.id, l.entityId), eq(contracts.companyId, companyId)))
        .limit(1);
      if (c?.status === "pending_signature") {
        const sigs = await db
          .select({ status: contractSignatures.status })
          .from(contractSignatures)
          .where(eq(contractSignatures.contractId, l.entityId));
        for (const s of sigs) {
          if (s.status !== "signed") pendingSignatures++;
        }
      }
    }
  }

  const recentMsgs = await db
    .select()
    .from(engagementMessages)
    .where(and(eq(engagementMessages.engagementId, engagementId), eq(engagementMessages.companyId, companyId)))
    .orderBy(desc(engagementMessages.createdAt))
    .limit(12);
  const last = recentMsgs[0];
  let awaitingTeamReply = false;
  if (last && last.author === "client") {
    const teamAfter = recentMsgs.find((m) => m.createdAt > last.createdAt && (m.author === "platform" || m.author === "system"));
    awaitingTeamReply = !teamAfter;
  }
  let awaitingClientReply = false;
  if (last && (last.author === "platform" || last.author === "system")) {
    const clientAfter = recentMsgs.find((m) => m.createdAt > last.createdAt && m.author === "client");
    awaitingClientReply = !clientAfter;
  }

  /**
   * Single primary action — precedence: financial verification → tasks → documents → signing → payment → messages → SLA → steady.
   * All signals are scoped to engagement-linked rows (tasks/docs/messages/payment transfer + linked invoices/contracts).
   */
  let topActionType: string;
  let topActionLabel: string;
  let topActionStatus: string;
  let topActionDueAt: Date | null;
  let topActionPayload: Record<string, unknown>;

  if (eng.status === "blocked") {
    topActionType = "workflow";
    topActionLabel = "Engagement is blocked — unblock or complete follow-ups.";
    topActionStatus = "blocked";
    topActionDueAt = slaDueAt;
    topActionPayload = { status: eng.status };
  } else if (eng.status === "waiting_client") {
    topActionType = "messages_client";
    topActionLabel = "Waiting on client input, documents, or approval.";
    topActionStatus = "pending";
    topActionDueAt = slaDueAt;
    topActionPayload = { engagementStatus: eng.status };
  } else if (xfer?.phase === "proof_submitted") {
    topActionType = "payment_verify";
    topActionLabel = "Verify bank transfer proof for this engagement.";
    topActionStatus = "pending";
    topActionDueAt = slaDueAt;
    topActionPayload = { transferId: xfer.id };
  } else if (xfer?.phase === "instructions_sent") {
    topActionType = "payment_proof";
    topActionLabel = "Submit transfer proof (reference + receipt link).";
    topActionStatus = "pending";
    topActionDueAt = slaDueAt;
    topActionPayload = { transferId: xfer.id };
  } else if (overdueTask) {
    topActionType = "tasks";
    topActionLabel = `Task overdue: ${overdueTask.title}`;
    topActionStatus = "overdue";
    topActionDueAt = overdueTask.dueDate ? new Date(overdueTask.dueDate) : slaDueAt;
    topActionPayload = { taskId: overdueTask.id };
  } else if (openTasks.length > 0) {
    topActionType = "tasks";
    topActionLabel = `${openTasks.length} open task(s) — complete the next step.`;
    topActionStatus = "pending";
    topActionDueAt = slaDueAt;
    topActionPayload = { taskIds: openTasks.map((t) => t.id) };
  } else if (pendingDocs.length > 0) {
    topActionType = "documents";
    topActionLabel = `${pendingDocs.length} document(s) pending review.`;
    topActionStatus = "pending";
    topActionDueAt = slaDueAt;
    topActionPayload = { documentIds: pendingDocs.map((d) => d.id) };
  } else if (pendingSignatures > 0) {
    topActionType = "signing";
    topActionLabel = `Complete ${pendingSignatures} pending signature(s).`;
    topActionStatus = "pending";
    topActionDueAt = slaDueAt;
    topActionPayload = { pendingSignatures };
  } else if (proBillingOverdue || csiOverdue || csiOpen) {
    topActionType = "payment";
    topActionLabel = proBillingOverdue || csiOverdue
      ? "Payment or invoice is overdue — reconcile or record payment."
      : "Invoice balance outstanding — reconcile or record payment.";
    topActionStatus = proBillingOverdue || csiOverdue ? "overdue" : "pending";
    topActionDueAt = slaDueAt;
    topActionPayload = { proBillingOverdue, csiOverdue, csiOpen };
  } else if (awaitingTeamReply && ["active", "waiting_platform"].includes(eng.status)) {
    topActionType = "messages_team";
    topActionLabel = "Client is waiting for a reply on the engagement thread.";
    topActionStatus = "pending";
    topActionDueAt = last?.createdAt ?? null;
    topActionPayload = { lastMessageId: last?.id };
  } else if (awaitingClientReply && ["active", "waiting_client"].includes(eng.status)) {
    topActionType = "messages_client";
    topActionLabel = "Follow up with the client — last message was from your team.";
    topActionStatus = "pending";
    topActionDueAt = last?.createdAt ?? null;
    topActionPayload = { lastMessageId: last?.id };
  } else if (overdueSla) {
    topActionType = "sla";
    topActionLabel = "SLA / due date is in the past — update timeline or status.";
    topActionStatus = "overdue";
    topActionDueAt = slaDueAt;
    topActionPayload = {};
  } else {
    topActionType = "steady";
    topActionLabel = "No urgent action — monitor engagement health.";
    topActionStatus = "ok";
    topActionDueAt = slaDueAt;
    topActionPayload = {};
  }

  let health: TopActionDerived["health"] = "on_track";
  let healthReason: string | null = null;
  if (eng.status === "blocked") {
    health = "blocked";
    healthReason = "Engagement status is blocked.";
  } else if (overdueSla || overdueTask || proBillingOverdue || csiOverdue) {
    health = "delayed";
    healthReason = overdueSla
      ? "Primary due date or SLA has passed."
      : overdueTask
        ? "At least one open task is overdue."
        : "Linked receivable or CSI invoice is overdue.";
  } else if (eng.escalatedAt || xfer?.phase === "proof_submitted" || awaitingTeamReply || awaitingClientReply) {
    health = "at_risk";
    healthReason = eng.escalatedAt
      ? "Engagement has been escalated."
      : xfer?.phase === "proof_submitted"
        ? "Transfer proof is awaiting verification."
        : awaitingTeamReply
          ? "Client message is awaiting a team reply."
          : "Team message may be awaiting client follow-up.";
  } else if (slaDueAt) {
    const ms = slaDueAt.getTime() - now.getTime();
    if (ms > 0 && ms < 3 * 24 * 60 * 60 * 1000) {
      health = "at_risk";
      healthReason = "SLA or due date is within 72 hours.";
    }
  }

  return {
    topActionType,
    topActionLabel,
    topActionStatus,
    topActionDueAt,
    topActionPayload,
    slaDueAt,
    lastActivityAt,
    health,
    healthReason,
  };
}

export async function syncEngagementDerivedState(db: Db, engagementId: number, companyId: number): Promise<void> {
  const derived = await computeEngagementDerivedState(db, engagementId, companyId);
  await db
    .update(engagements)
    .set({
      slaDueAt: derived.slaDueAt,
      lastActivityAt: derived.lastActivityAt,
      topActionType: derived.topActionType,
      topActionLabel: derived.topActionLabel,
      topActionStatus: derived.topActionStatus,
      topActionDueAt: derived.topActionDueAt,
      topActionPayload: derived.topActionPayload,
      health: derived.health,
      healthReason: derived.healthReason,
      derivedStateSyncedAt: new Date(),
    })
    .where(and(eq(engagements.id, engagementId), eq(engagements.companyId, companyId)));
}

/** Recompute roll-ups for many engagements (ops queue refresh). */
export async function syncEngagementDerivedStateBatch(
  db: Db,
  rows: Array<{ id: number; companyId: number }>,
): Promise<void> {
  for (const r of rows) {
    await syncEngagementDerivedState(db, r.id, r.companyId);
  }
}
