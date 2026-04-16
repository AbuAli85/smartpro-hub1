import type { Express, Request, Response } from "express";
import express from "express";
import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import {
  paymentGatewaySessions,
  paymentWebhookEvents,
} from "../drizzle/schema";
import { applyInvoicePayment, type AppDb } from "./lib/applyClientInvoicePayment";
import {
  type ThawaniCheckoutSession,
  thawaniRetrieveSession,
  verifyThawaniWebhook,
  verifyStripeWebhook,
} from "./lib/paymentGateway";
import type Stripe from "stripe";

function isDuplicateKeyError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "ER_DUP_ENTRY"
  );
}

function extractThawaniSessionId(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (typeof o.id === "string") return o.id;
  if (typeof o.session_id === "string") return o.session_id;
  if (o.data && typeof o.data === "object") {
    const d = o.data as Record<string, unknown>;
    if (typeof d.session_id === "string") return d.session_id;
    if (typeof d.id === "string") return d.id;
  }
  return null;
}

async function reconcileThawaniPaid(params: {
  db: AppDb;
  sessionId: string;
  remote: ThawaniCheckoutSession;
}): Promise<void> {
  const { db, sessionId, remote } = params;
  if (remote.payment_status !== "paid") return;

  const clientRef = remote.client_reference_id?.trim();
  let [pgs] = await db
    .select()
    .from(paymentGatewaySessions)
    .where(
      and(eq(paymentGatewaySessions.gateway, "thawani"), eq(paymentGatewaySessions.gatewaySessionId, sessionId))
    )
    .limit(1);
  if (!pgs && clientRef) {
    [pgs] = await db
      .select()
      .from(paymentGatewaySessions)
      .where(and(eq(paymentGatewaySessions.gateway, "thawani"), eq(paymentGatewaySessions.clientReference, clientRef)))
      .limit(1);
  }
  if (!pgs) return;
  if (pgs.status === "completed") return;

  if (!pgs.gatewaySessionId) {
    await db
      .update(paymentGatewaySessions)
      .set({ gatewaySessionId: sessionId })
      .where(eq(paymentGatewaySessions.id, pgs.id));
  }

  const totalBaisa = Number(remote.total_amount ?? 0);
  const paidOmr = totalBaisa > 0 ? totalBaisa / 1000 : Number(pgs.amountOmr);
  const amount = Math.min(paidOmr, Number(pgs.amountOmr));
  if (amount <= 0) return;

  const externalEventId = `thawani:${sessionId}:${remote.invoice ?? "paid"}`;
  try {
    await db.insert(paymentWebhookEvents).values({
      gateway: "thawani",
      externalEventId,
    });
  } catch (e) {
    if (isDuplicateKeyError(e)) return;
    throw e;
  }

  const gatewayPaymentId = remote.payment_id ?? remote.invoice ?? sessionId;
  await applyInvoicePayment(db, {
    invoiceId: pgs.invoiceId,
    companyId: pgs.companyId,
    amountOmr: amount,
    paymentMethod: "card",
    reference: remote.invoice ? `Thawani ${remote.invoice}` : `Thawani ${sessionId}`,
    gateway: "thawani",
    gatewaySessionId: sessionId,
    gatewayPaymentId,
    gatewayStatus: remote.payment_status ?? "paid",
  });

  await db
    .update(paymentGatewaySessions)
    .set({
      status: "completed",
      gatewayPaymentId,
    })
    .where(eq(paymentGatewaySessions.id, pgs.id));
}

async function reconcileStripeCheckoutCompleted(params: {
  db: AppDb;
  session: Stripe.Checkout.Session;
}): Promise<void> {
  const { db, session } = params;
  const pgsId = session.metadata?.paymentGatewaySessionId;
  if (!pgsId) return;
  const idNum = Number(pgsId);
  if (!Number.isFinite(idNum)) return;

  const [pgs] = await db.select().from(paymentGatewaySessions).where(eq(paymentGatewaySessions.id, idNum)).limit(1);
  if (!pgs || pgs.gateway !== "stripe") return;
  if (pgs.status === "completed") return;

  const pi =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
  if (!pi) return;

  const expectedBaisa = Math.round(Number(pgs.amountOmr) * 1000);
  if (session.amount_total != null && session.amount_total !== expectedBaisa) {
    console.warn(
      `[payments] Stripe amount_total mismatch for session ${session.id}: expected ${expectedBaisa}, got ${session.amount_total}`
    );
  }

  const externalEventId = `stripe:checkout:${session.id}`;
  try {
    await db.insert(paymentWebhookEvents).values({
      gateway: "stripe",
      externalEventId,
    });
  } catch (e) {
    if (isDuplicateKeyError(e)) return;
    throw e;
  }

  await applyInvoicePayment(db, {
    invoiceId: pgs.invoiceId,
    companyId: pgs.companyId,
    amountOmr: Number(pgs.amountOmr),
    paymentMethod: "card",
    reference: `Stripe ${session.id}`,
    gateway: "stripe",
    gatewaySessionId: session.id,
    gatewayPaymentId: pi,
    gatewayStatus: "complete",
  });

  await db
    .update(paymentGatewaySessions)
    .set({ status: "completed", gatewaySessionId: session.id, gatewayPaymentId: pi })
    .where(eq(paymentGatewaySessions.id, pgs.id));
}

export function registerPaymentWebhookRoutes(app: Express): void {
  app.post(
    "/api/webhooks/thawani",
    express.raw({ type: "application/json", limit: "4mb" }),
    async (req: Request, res: Response) => {
      const raw = req.body;
      if (!Buffer.isBuffer(raw)) {
        res.sendStatus(400);
        return;
      }
      const rawUtf8 = raw.toString("utf8");
      const sig = req.get("thawani-signature") ?? req.get("Thawani-Signature");
      const ts = req.get("thawani-timestamp") ?? req.get("Thawani-Timestamp");
      if (!verifyThawaniWebhook(rawUtf8, sig, ts)) {
        res.sendStatus(401);
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawUtf8);
      } catch {
        res.sendStatus(400);
        return;
      }
      const sessionId = extractThawaniSessionId(parsed);
      if (!sessionId) {
        res.sendStatus(400);
        return;
      }
      const db = await getDb();
      if (!db) {
        res.sendStatus(503);
        return;
      }
      try {
        const remote = await thawaniRetrieveSession(sessionId);
        await reconcileThawaniPaid({ db, sessionId, remote });
        res.json({ ok: true });
      } catch (e) {
        console.error("[payments] Thawani webhook error:", e);
        res.sendStatus(500);
      }
    }
  );

  app.post(
    "/api/webhooks/stripe",
    express.raw({ type: "application/json", limit: "4mb" }),
    async (req: Request, res: Response) => {
      const raw = req.body;
      if (!Buffer.isBuffer(raw)) {
        res.sendStatus(400);
        return;
      }
      const sig = req.get("stripe-signature");
      let event: Stripe.Event;
      try {
        event = verifyStripeWebhook(raw, sig);
      } catch (e) {
        console.warn("[payments] Stripe webhook verify failed:", e);
        res.sendStatus(400);
        return;
      }
      const db = await getDb();
      if (!db) {
        res.sendStatus(503);
        return;
      }
      try {
        if (event.type === "checkout.session.completed") {
          const session = event.data.object as Stripe.Checkout.Session;
          await reconcileStripeCheckoutCompleted({ db, session });
        }
        res.json({ received: true });
      } catch (e) {
        console.error("[payments] Stripe webhook error:", e);
        res.sendStatus(500);
      }
    }
  );
}
