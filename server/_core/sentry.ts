import type { Express } from "express";
import * as Sentry from "@sentry/node";

/** Call once from instrument.ts (after dotenv). No-op if SENTRY_DSN is unset. */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;

  const rawRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0");
  const tracesSampleRate =
    Number.isFinite(rawRate) ? Math.min(1, Math.max(0, rawRate)) : 0;

  Sentry.init({
    dsn,
    sendDefaultPii: process.env.SENTRY_SEND_DEFAULT_PII === "true",
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    integrations: [Sentry.expressIntegration()],
    tracesSampleRate,
  });
}

/** Register after all routes (including Vite / static). */
export function registerSentryExpressErrorHandler(app: Express): void {
  if (!Sentry.isInitialized()) return;
  Sentry.setupExpressErrorHandler(app);
}
