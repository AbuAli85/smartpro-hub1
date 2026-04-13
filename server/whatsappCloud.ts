import crypto from "crypto";
import type { Express, Request, Response } from "express";
import express from "express";
import { toWhatsAppPhoneDigits } from "@shared/whatsappPhoneDigits";

function trimEnv(key: string): string {
  return (process.env[key] ?? "").trim();
}

function graphBaseUrl(): string {
  const v = trimEnv("WHATSAPP_CLOUD_GRAPH_VERSION") || "v21.0";
  return `https://graph.facebook.com/${v}`;
}

export function isWhatsAppCloudCoreConfigured(): boolean {
  return Boolean(trimEnv("WHATSAPP_CLOUD_ACCESS_TOKEN") && trimEnv("WHATSAPP_CLOUD_PHONE_NUMBER_ID"));
}

/** Meta template name for SANAD intel centre invite (language from WHATSAPP_TEMPLATE_LANGUAGE_CODE, default ar). */
export function isSanadInviteWhatsAppTemplateConfigured(): boolean {
  return isWhatsAppCloudCoreConfigured() && Boolean(trimEnv("WHATSAPP_TEMPLATE_SANAD_INVITE_AR"));
}

export function isSurveyOfficeWhatsAppTemplateConfigured(): boolean {
  return isWhatsAppCloudCoreConfigured() && Boolean(trimEnv("WHATSAPP_TEMPLATE_SURVEY_OFFICE_AR"));
}

function templateLanguageCode(): string {
  return trimEnv("WHATSAPP_TEMPLATE_LANGUAGE_CODE") || "ar";
}

type SendResult = { ok: true; messageId?: string } | { ok: false; error: string };

async function sendTemplateMessage(params: {
  toDigits: string;
  templateName: string;
  bodyTexts: string[];
}): Promise<SendResult> {
  const token = trimEnv("WHATSAPP_CLOUD_ACCESS_TOKEN");
  const phoneId = trimEnv("WHATSAPP_CLOUD_PHONE_NUMBER_ID");
  if (!token || !phoneId) {
    return { ok: false, error: "WhatsApp Cloud API not configured (token / phone number id)." };
  }

  const url = `${graphBaseUrl()}/${phoneId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: params.toDigits,
    type: "template",
    template: {
      name: params.templateName,
      language: { code: templateLanguageCode() },
      components: [
        {
          type: "body",
          parameters: params.bodyTexts.map((text) => ({
            type: "text",
            text: text.slice(0, 1024),
          })),
        },
      ],
    },
  };

  let res: globalThis.Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `WhatsApp request failed: ${msg}` };
  }

  const raw = await res.text();
  if (!res.ok) {
    return { ok: false, error: `WhatsApp API ${res.status}: ${raw.slice(0, 500)}` };
  }
  try {
    const parsed = JSON.parse(raw) as { messages?: Array<{ id?: string }> };
    const messageId = parsed.messages?.[0]?.id;
    return { ok: true, messageId };
  } catch {
    return { ok: true };
  }
}

/**
 * Arabic (or WHATSAPP_TEMPLATE_LANGUAGE_CODE) utility template:
 * body {{1}} = centre name, {{2}} = full invite URL.
 * Create and approve the same structure in Meta Business Suite.
 */
export async function sendSanadCenterInviteTemplateAr(params: {
  toDigits: string;
  centerName: string;
  inviteUrl: string;
}): Promise<SendResult> {
  const name = trimEnv("WHATSAPP_TEMPLATE_SANAD_INVITE_AR");
  if (!name) return { ok: false, error: "WHATSAPP_TEMPLATE_SANAD_INVITE_AR is not set." };
  return sendTemplateMessage({
    toDigits: params.toDigits,
    templateName: name,
    bodyTexts: [params.centerName, params.inviteUrl],
  });
}

/**
 * body {{1}} = office display name (prefer Arabic), {{2}} = survey URL.
 */
export async function sendSurveyOfficeInviteTemplateAr(params: {
  toDigits: string;
  officeLabelAr: string;
  surveyUrl: string;
}): Promise<SendResult> {
  const name = trimEnv("WHATSAPP_TEMPLATE_SURVEY_OFFICE_AR");
  if (!name) return { ok: false, error: "WHATSAPP_TEMPLATE_SURVEY_OFFICE_AR is not set." };
  return sendTemplateMessage({
    toDigits: params.toDigits,
    templateName: name,
    bodyTexts: [params.officeLabelAr, params.surveyUrl],
  });
}

function verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  const secret = trimEnv("WHATSAPP_CLOUD_APP_SECRET");
  if (!secret) return true;
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    const a = Buffer.from(signatureHeader);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function logInboundWebhookPayload(body: unknown): void {
  type WaValue = {
    messages?: Array<{ from?: string; type?: string; text?: { body?: string }; interactive?: unknown }>;
    statuses?: unknown[];
  };
  type Change = { value?: WaValue };
  type Entry = { changes?: Change[] };

  const entries = (body as { entry?: Entry[] })?.entry;
  if (!Array.isArray(entries)) {
    console.log("[whatsapp-webhook] payload (no entry):", JSON.stringify(body).slice(0, 2000));
    return;
  }
  for (const ent of entries) {
    for (const ch of ent.changes ?? []) {
      const messages = ch.value?.messages;
      if (!messages?.length) continue;
      for (const m of messages) {
        if (m.type === "text" && m.text?.body != null) {
          console.log(
            `[whatsapp-webhook] inbound text from=${m.from ?? "?"} body=${JSON.stringify(m.text.body)}`,
          );
        } else {
          console.log(`[whatsapp-webhook] inbound type=${m.type ?? "?"} from=${m.from ?? "?"}`);
        }
      }
    }
  }
}

/**
 * Register before `express.json()` so POST can use raw body for signature verification.
 */
export function registerWhatsAppWebhookRoutes(app: Express): void {
  const verifyToken = trimEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN");

  app.get("/api/webhooks/whatsapp", (req: Request, res: Response) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (
      mode === "subscribe" &&
      typeof token === "string" &&
      typeof challenge === "string" &&
      verifyToken &&
      token === verifyToken
    ) {
      res.status(200).send(challenge);
      return;
    }
    res.sendStatus(403);
  });

  app.post(
    "/api/webhooks/whatsapp",
    express.raw({ type: "application/json", limit: "5mb" }),
    (req: Request, res: Response) => {
      const raw = req.body;
      if (!Buffer.isBuffer(raw)) {
        res.sendStatus(400);
        return;
      }
      const sig = req.get("x-hub-signature-256");
      if (!verifyWebhookSignature(raw, sig)) {
        res.sendStatus(401);
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString("utf8"));
      } catch {
        res.sendStatus(400);
        return;
      }
      logInboundWebhookPayload(parsed);
      res.sendStatus(200);
    },
  );
}
