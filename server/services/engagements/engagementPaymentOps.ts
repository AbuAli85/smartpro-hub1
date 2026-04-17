import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { clientServiceInvoices, engagementLinks, engagementPaymentTransfers } from "../../../drizzle/schema";
import { applyInvoicePayment, type AppDb } from "../../lib/applyClientInvoicePayment";
import { assertEngagementInCompany, logEngagementActivity } from "../engagementsService";
import { syncEngagementDerivedState } from "./deriveEngagementState";

type Db = NonNullable<Awaited<ReturnType<typeof import("../../db").getDb>>>;

function insertId(result: unknown): number {
  const id = Number((result as { insertId?: number }).insertId);
  if (!Number.isFinite(id)) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Insert failed" });
  return id;
}

export async function getOrCreatePaymentTransfer(
  db: Db,
  engagementId: number,
  companyId: number,
): Promise<typeof engagementPaymentTransfers.$inferSelect> {
  const [existing] = await db
    .select()
    .from(engagementPaymentTransfers)
    .where(
      and(eq(engagementPaymentTransfers.engagementId, engagementId), eq(engagementPaymentTransfers.companyId, companyId)),
    )
    .limit(1);
  if (existing) return existing;
  const [ins] = await db.insert(engagementPaymentTransfers).values({
    engagementId,
    companyId,
    phase: "idle",
  });
  const id = insertId(ins);
  const [row] = await db.select().from(engagementPaymentTransfers).where(eq(engagementPaymentTransfers.id, id)).limit(1);
  if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Payment transfer row missing" });
  return row;
}

export async function requestPaymentInstructions(
  db: Db,
  input: {
    engagementId: number;
    companyId: number;
    actorUserId: number;
    instructionsText: string;
    clientServiceInvoiceId?: number | null;
  },
): Promise<void> {
  await assertEngagementInCompany(db, input.engagementId, input.companyId);
  let invoiceId = input.clientServiceInvoiceId ?? null;
  if (invoiceId != null) {
    const [inv] = await db
      .select()
      .from(clientServiceInvoices)
      .where(and(eq(clientServiceInvoices.id, invoiceId), eq(clientServiceInvoices.companyId, input.companyId)))
      .limit(1);
    if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Client service invoice not found" });
  } else {
    const [link] = await db
      .select()
      .from(engagementLinks)
      .where(
        and(
          eq(engagementLinks.engagementId, input.engagementId),
          eq(engagementLinks.companyId, input.companyId),
          eq(engagementLinks.linkType, "client_service_invoice"),
        ),
      )
      .limit(1);
    if (link?.entityId) invoiceId = link.entityId;
  }

  const row = await getOrCreatePaymentTransfer(db, input.engagementId, input.companyId);
  await db
    .update(engagementPaymentTransfers)
    .set({
      phase: "instructions_sent",
      instructionsText: input.instructionsText,
      clientServiceInvoiceId: invoiceId,
    })
    .where(eq(engagementPaymentTransfers.id, row.id));

  await logEngagementActivity(db, {
    engagementId: input.engagementId,
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: "payment.instructions_sent",
    payload: { transferId: row.id, clientServiceInvoiceId: invoiceId },
  });
  await syncEngagementDerivedState(db, input.engagementId, input.companyId);
}

export async function submitTransferProof(
  db: Db,
  input: {
    engagementId: number;
    companyId: number;
    actorUserId: number;
    proofUrl: string;
    proofReference?: string | null;
    amountClaimedOmr?: number | null;
  },
): Promise<void> {
  await assertEngagementInCompany(db, input.engagementId, input.companyId);
  const row = await getOrCreatePaymentTransfer(db, input.engagementId, input.companyId);
  if (row.phase !== "instructions_sent" && row.phase !== "rejected") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Transfer proof can only be submitted after staff shares payment instructions (or after a rejected proof).",
    });
  }
  await db
    .update(engagementPaymentTransfers)
    .set({
      phase: "proof_submitted",
      proofUrl: input.proofUrl,
      proofReference: input.proofReference ?? null,
      amountClaimedOmr:
        input.amountClaimedOmr != null && Number.isFinite(input.amountClaimedOmr)
          ? String(input.amountClaimedOmr)
          : null,
      submittedByUserId: input.actorUserId,
    })
    .where(eq(engagementPaymentTransfers.id, row.id));

  await logEngagementActivity(db, {
    engagementId: input.engagementId,
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: "payment.proof_submitted",
    payload: { transferId: row.id },
  });
  await syncEngagementDerivedState(db, input.engagementId, input.companyId);
}

export async function verifyTransferProof(
  db: Db,
  input: {
    engagementId: number;
    companyId: number;
    actorUserId: number;
    accept: boolean;
    note?: string | null;
  },
): Promise<void> {
  await assertEngagementInCompany(db, input.engagementId, input.companyId);
  const row = await getOrCreatePaymentTransfer(db, input.engagementId, input.companyId);
  if (row.phase !== "proof_submitted") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "No transfer proof is awaiting verification." });
  }
  await db
    .update(engagementPaymentTransfers)
    .set({
      phase: input.accept ? "verified" : "rejected",
      verifiedByUserId: input.actorUserId,
      verifiedAt: new Date(),
    })
    .where(eq(engagementPaymentTransfers.id, row.id));

  await logEngagementActivity(db, {
    engagementId: input.engagementId,
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: input.accept ? "payment.proof_verified" : "payment.proof_rejected",
    payload: { transferId: row.id, note: input.note ?? undefined },
  });
  await syncEngagementDerivedState(db, input.engagementId, input.companyId);
}

/**
 * Records reconciliation on the engagement transfer workflow. Optionally applies a manual
 * payment against a linked `client_service_invoices` row (real ledger); never simulates a gateway.
 */
export async function markPaidExternallyForEngagement(
  db: Db,
  input: {
    engagementId: number;
    companyId: number;
    actorUserId: number;
    clientServiceInvoiceId?: number | null;
    amountOmr?: number | null;
    reference?: string | null;
  },
): Promise<{ appliedInvoice: boolean; balanceOmr?: number; status?: string }> {
  await assertEngagementInCompany(db, input.engagementId, input.companyId);
  const row = await getOrCreatePaymentTransfer(db, input.engagementId, input.companyId);

  let invoiceId = input.clientServiceInvoiceId ?? row.clientServiceInvoiceId ?? null;
  if (invoiceId == null) {
    const [link] = await db
      .select()
      .from(engagementLinks)
      .where(
        and(
          eq(engagementLinks.engagementId, input.engagementId),
          eq(engagementLinks.companyId, input.companyId),
          eq(engagementLinks.linkType, "client_service_invoice"),
        ),
      )
      .limit(1);
    if (link?.entityId) invoiceId = link.entityId;
  }

  let applied = false;
  let balanceOmr: number | undefined;
  let status: string | undefined;
  if (invoiceId != null && input.amountOmr != null && input.amountOmr > 0) {
    const next = await applyInvoicePayment(db as AppDb, {
      invoiceId,
      companyId: input.companyId,
      amountOmr: input.amountOmr,
      paymentMethod: "bank",
      reference: input.reference ?? "engagement-transfer-reconciled",
      gateway: null,
      gatewaySessionId: null,
      gatewayPaymentId: null,
      gatewayStatus: null,
    });
    applied = true;
    balanceOmr = next.balanceOmr;
    status = next.status;
  }

  await db
    .update(engagementPaymentTransfers)
    .set({
      phase: "reconciled",
      clientServiceInvoiceId: invoiceId ?? row.clientServiceInvoiceId,
    })
    .where(eq(engagementPaymentTransfers.id, row.id));

  await logEngagementActivity(db, {
    engagementId: input.engagementId,
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: "payment.marked_reconciled",
    payload: {
      transferId: row.id,
      clientServiceInvoiceId: invoiceId,
      appliedInvoice: applied,
      amountOmr: input.amountOmr ?? undefined,
    },
  });
  await syncEngagementDerivedState(db, input.engagementId, input.companyId);
  return { appliedInvoice: applied, balanceOmr, status };
}
