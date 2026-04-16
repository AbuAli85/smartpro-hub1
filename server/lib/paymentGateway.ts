import crypto from "crypto";
import Stripe from "stripe";
import { ENV } from "../_core/env";

const THAWANI_API = {
  sandbox: "https://uatcheckout.thawani.om/api/v1",
  production: "https://checkout.thawani.om/api/v1",
} as const;

export const THAWANI_CHECKOUT_URL = {
  sandbox: "https://uatcheckout.thawani.om/pay",
  production: "https://checkout.thawani.om/pay",
} as const;

function thawaniBaseUrl(): string {
  return ENV.thawaniSandbox ? THAWANI_API.sandbox : THAWANI_API.production;
}

export function thawaniCheckoutPublicUrl(sessionId: string): string {
  const key = ENV.thawaniPublishableKey;
  if (!key) throw new Error("THAWANI_PUBLISHABLE_KEY is not set");
  const pay = ENV.thawaniSandbox ? THAWANI_CHECKOUT_URL.sandbox : THAWANI_CHECKOUT_URL.production;
  return `${pay}/${sessionId}?key=${encodeURIComponent(key)}`;
}

export type ThawaniCheckoutSession = {
  session_id: string;
  client_reference_id?: string;
  payment_status?: "unpaid" | "paid" | "cancelled";
  /** Amount in baisa (1 OMR = 1000). */
  total_amount?: number;
  invoice?: string;
  /** Present when payment succeeded — required for refunds. */
  payment_id?: string;
};

async function thawaniFetch<T>(method: string, path: string, body?: object): Promise<T> {
  const sk = ENV.thawaniSecretKey;
  if (!sk) throw new Error("THAWANI_SECRET_KEY is not set");
  const res = await fetch(`${thawaniBaseUrl()}${path}`, {
    method,
    headers: {
      "thawani-api-key": sk,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const parsed = (await res.json()) as { code?: number; data?: T; description?: string };
  if (!res.ok) {
    throw new Error(parsed.description ?? `Thawani HTTP ${res.status}`);
  }
  if (parsed.data === undefined) {
    throw new Error(parsed.description ?? "Thawani: empty response data");
  }
  return parsed.data;
}

export async function thawaniRetrieveSession(sessionId: string): Promise<ThawaniCheckoutSession> {
  return thawaniFetch<ThawaniCheckoutSession>("GET", `/checkout/session/${encodeURIComponent(sessionId)}`);
}

export async function thawaniCreateCheckoutSession(params: {
  clientReferenceId: string;
  amountOmr: number;
  productName: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}): Promise<ThawaniCheckoutSession> {
  const unitAmount = Math.max(1, Math.round(params.amountOmr * 1000));
  return thawaniFetch<ThawaniCheckoutSession>("POST", "/checkout/session", {
    client_reference_id: params.clientReferenceId,
    mode: "payment",
    products: [
      {
        name: params.productName.slice(0, 500),
        quantity: 1,
        unit_amount: unitAmount,
      },
    ],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: params.metadata,
  });
}

export async function thawaniCreateRefund(params: {
  paymentId: string;
  reason: string;
  metadata?: Record<string, string>;
  amountOmr?: number;
}): Promise<{ refund_id: string; status?: string }> {
  const body: Record<string, unknown> = {
    payment_id: params.paymentId,
    reason: params.reason,
    metadata: params.metadata ?? {},
  };
  if (params.amountOmr !== undefined) {
    body.amount = Math.round(params.amountOmr * 1000);
  }
  return thawaniFetch<{ refund_id: string; status?: string }>("POST", "/refunds", body);
}

/**
 * Thawani webhook signing: HMAC-SHA256 of `rawBody + '-' + timestamp` (see thawani-nodejs).
 */
export function verifyThawaniWebhook(
  rawBodyUtf8: string,
  signature: string | undefined,
  timestamp: string | undefined
): boolean {
  const secret = ENV.thawaniWebhookSecret;
  if (!secret || !signature || !timestamp) return false;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(rawBodyUtf8 + "-" + timestamp);
  const digest = hmac.digest("hex");
  try {
    const a = Buffer.from(digest, "hex");
    const b = Buffer.from(signature, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return digest === signature;
  }
}

let stripeSingleton: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!ENV.stripeSecretKey) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(ENV.stripeSecretKey);
  }
  return stripeSingleton;
}

export function verifyStripeWebhook(rawBody: Buffer, signature: string | undefined): Stripe.Event {
  const secret = ENV.stripeWebhookSecret;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  if (!signature) throw new Error("Missing Stripe-Signature header");
  return getStripeClient().webhooks.constructEvent(rawBody, signature, secret);
}

export async function stripeCreateCheckoutSession(params: {
  invoiceLabel: string;
  amountOmr: number;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}): Promise<{ id: string; url: string | null }> {
  const stripe = getStripeClient();
  const unitAmount = Math.max(1, Math.round(params.amountOmr * 1000));
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    currency: "omr",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "omr",
          unit_amount: unitAmount,
          product_data: { name: params.invoiceLabel.slice(0, 500) },
        },
      },
    ],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: params.metadata,
  });
  return { id: session.id, url: session.url };
}

export async function stripeCreateRefund(params: { paymentIntentId: string; amountOmr?: number }): Promise<Stripe.Refund> {
  const stripe = getStripeClient();
  const body: Stripe.RefundCreateParams = { payment_intent: params.paymentIntentId };
  if (params.amountOmr !== undefined) {
    body.amount = Math.round(params.amountOmr * 1000);
  }
  return stripe.refunds.create(body);
}

export type UnifiedRefundInput = {
  gateway: "thawani" | "stripe";
  gatewayPaymentId: string;
  reason?: string;
  amountOmr?: number;
};

export async function refundPayment(input: UnifiedRefundInput): Promise<{ refundId: string; raw: unknown }> {
  const reason = input.reason ?? "Refund requested";
  if (input.gateway === "thawani") {
    const r = await thawaniCreateRefund({
      paymentId: input.gatewayPaymentId,
      reason,
      amountOmr: input.amountOmr,
    });
    return { refundId: r.refund_id, raw: r };
  }
  const r = await stripeCreateRefund({
    paymentIntentId: input.gatewayPaymentId,
    amountOmr: input.amountOmr,
  });
  return { refundId: r.id, raw: r };
}
