// IMPORTANT: instrument Sentry before other imports (loads dotenv + Sentry.init).
import "./instrument.ts";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { registerHRLetterPublicRoutes } from "../hrLetterPublicRoutes";
import { registerSurveyNurturePublicRoutes } from "../surveyNurturePublicRoutes";
import { registerWhatsAppWebhookRoutes } from "../whatsappCloud";
import { registerPaymentWebhookRoutes } from "../paymentWebhooks";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic } from "./vite-static";
import { applySecurityMiddleware } from "./security";
import { validateProductionEnvironment } from "./env";
import { runPendingMigrations } from "../runPendingMigrations";
import { runSchemaDriftGuard } from "../schemaDriftGuard";
import { runEmployeeTaskOverdueNotifications } from "../jobs/employeeTaskOverdue";
import { runSyncExpiredContracts } from "../jobs/syncExpiredContracts";
import { runSurveyNurtureEmails } from "../jobs/surveyNurture";
import { runMarkMissedShiftsAbsent } from "../jobs/markMissedShiftsAbsent";
import { runEnsureOverdueCheckoutIssuesJob } from "../jobs/ensureOverdueCheckoutIssuesJob";
import { resyncHotEngagementDerivedState } from "../jobs/engagementDerivedRollupRefresh";
import { registerSentryExpressErrorHandler } from "./sentry";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  validateProductionEnvironment();
  await runPendingMigrations();
  void runSchemaDriftGuard(); // non-blocking: logs drift warnings without delaying startup
  const app = express();
  app.set("trust proxy", 1); // Trust first proxy — required for rate-limiter behind reverse proxy
  const server = createServer(app);
  // Security: helmet, rate limiting, input sanitisation, request IDs
  applySecurityMiddleware(app);
  // WhatsApp Cloud webhooks need raw JSON body for HMAC verification (must be before express.json).
  registerWhatsAppWebhookRoutes(app);
  // Thawani / Stripe payment webhooks need raw body for signature verification (must be before express.json).
  registerPaymentWebhookRoutes(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // ── Health check (plain HTTP — suitable for load balancers and k8s probes) ──
  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true, ts: Date.now() });
  });
  app.get("/api/health", (_req, res) => {
    res.status(200).json({ ok: true, ts: Date.now() });
  });

  // Storage proxy for CDN-hosted assets
  registerStorageProxy(app);
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  registerHRLetterPublicRoutes(app);
  registerSurveyNurturePublicRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    const { setupVite } = await import("./vite-dev");
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  registerSentryExpressErrorHandler(app);

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  const HOUR_MS = 60 * 60 * 1000;
  const DAY_MS  = 24 * HOUR_MS;

  // ── Employee task overdue notifications (hourly) ───────────────────────────
  if (process.env.DISABLE_TASK_OVERDUE_CRON !== "1") {
    void runEmployeeTaskOverdueNotifications()
      .then((r) => {
        if (r.notified > 0) console.log(`[tasks] overdue assigner notifications sent: ${r.notified}`);
      })
      .catch((e) => console.error("[tasks] overdue cron (initial)", e));
    setInterval(() => {
      void runEmployeeTaskOverdueNotifications().catch((e) => console.error("[tasks] overdue cron", e));
    }, HOUR_MS);
  }

  // ── Contract expiry sync (daily) ───────────────────────────────────────────
  // Transitions every active contract whose expiry_date < today to "expired"
  // and writes one audit event per contract.  Runs once at startup so that
  // contracts which expired while the server was offline are caught immediately,
  // then repeats every 24 h.
  //
  // Disable with: DISABLE_CONTRACT_EXPIRE_JOB=1
  // (useful when using an external scheduler such as a Kubernetes CronJob)
  if (process.env.DISABLE_CONTRACT_EXPIRE_JOB !== "1") {
    void runSyncExpiredContracts()
      .then((r) => {
        if (r.expired > 0 || r.errors > 0) {
          console.log(
            `[expire-job] startup run — found: ${r.found}, expired: ${r.expired}, ` +
            `skipped: ${r.skipped}, errors: ${r.errors}`
          );
        }
      })
      .catch((e) => console.error("[expire-job] startup run error:", e));

    setInterval(() => {
      void runSyncExpiredContracts()
        .then((r) => {
          console.log(
            `[expire-job] daily run — found: ${r.found}, expired: ${r.expired}, ` +
            `skipped: ${r.skipped}, errors: ${r.errors}`
          );
        })
        .catch((e) => console.error("[expire-job] daily run error:", e));
    }, DAY_MS);
  }

  // ── Survey nurture (daily): reminders until respondent registers or opts out ─
  // Disable with: DISABLE_SURVEY_NURTURE_CRON=1
  if (process.env.DISABLE_SURVEY_NURTURE_CRON !== "1") {
    void runSurveyNurtureEmails()
      .then((r) => {
        if (r.sent > 0 || r.stoppedConverted > 0 || r.errors > 0) {
          console.log(
            `[survey-nurture] startup — scanned: ${r.scanned}, sent: ${r.sent}, ` +
              `stopped(converted): ${r.stoppedConverted}, errors: ${r.errors}`,
          );
        }
      })
      .catch((e) => console.error("[survey-nurture] startup error:", e));

    setInterval(() => {
      void runSurveyNurtureEmails()
        .then((r) => {
          if (r.sent > 0 || r.stoppedConverted > 0 || r.errors > 0) {
            console.log(
              `[survey-nurture] daily — scanned: ${r.scanned}, sent: ${r.sent}, ` +
                `stopped(converted): ${r.stoppedConverted}, errors: ${r.errors}`,
            );
          }
        })
        .catch((e) => console.error("[survey-nurture] daily error:", e));
    }, DAY_MS);
  }

  // ── Auto-absent marking (every 30 min) ───────────────────────────────────────
  // Persists 'absent' rows to the legacy `attendance` table for shifts that
  // ended with no check-in.  Complements syncCheckoutToLegacyAttendanceTx
  // which handles the 'present' side.
  //
  // Disable with: DISABLE_ABSENT_MARK_JOB=1
  if (process.env.DISABLE_ABSENT_MARK_JOB !== "1") {
    void runMarkMissedShiftsAbsent()
      .then((r) => {
        if (r.marked > 0 || r.errors > 0) {
          console.log(
            `[absent-job] startup — scanned: ${r.scanned}, marked: ${r.marked}, ` +
              `skipped: ${r.skipped}, errors: ${r.errors}`,
          );
        }
      })
      .catch((e) => console.error("[absent-job] startup error:", e));

    setInterval(() => {
      void runMarkMissedShiftsAbsent()
        .then((r) => {
          if (r.marked > 0 || r.errors > 0) {
            console.log(
              `[absent-job] run — scanned: ${r.scanned}, marked: ${r.marked}, ` +
                `skipped: ${r.skipped}, errors: ${r.errors}`,
            );
          }
        })
        .catch((e) => console.error("[absent-job] run error:", e));
    }, 30 * 60 * 1000); // every 30 minutes
  }

  // ── Overdue checkout operational issues (every 15 min) ─────────────────────────
  // Ensures `overdue_checkout` rows exist without requiring HR to open the UI.
  // Disable with: DISABLE_OVERDUE_CHECKOUT_ISSUES_JOB=1
  if (process.env.DISABLE_OVERDUE_CHECKOUT_ISSUES_JOB !== "1") {
    const FIFTEEN_MIN_MS = 15 * 60 * 1000;
    void runEnsureOverdueCheckoutIssuesJob()
      .then((r) => {
        if (r.errors > 0) {
          console.log(`[overdue-checkout-job] startup — companies: ${r.companiesScanned}, errors: ${r.errors}`);
        }
      })
      .catch((e) => console.error("[overdue-checkout-job] startup error:", e));
    setInterval(() => {
      void runEnsureOverdueCheckoutIssuesJob()
        .then((r) => {
          if (r.errors > 0) {
            console.log(`[overdue-checkout-job] run — companies: ${r.companiesScanned}, errors: ${r.errors}`);
          }
        })
        .catch((e) => console.error("[overdue-checkout-job] run error:", e));
    }, FIFTEEN_MIN_MS);
  }

  // ── Engagement roll-up freshness (every 15 min) ───────────────────────────────
  // Recomputes persisted health / top action for hot engagements (open, overdue-ish,
  // at-risk health, recently updated). Disable with DISABLE_ENGAGEMENT_ROLLUP_CRON=1.
  if (process.env.DISABLE_ENGAGEMENT_ROLLUP_CRON !== "1") {
    const FIFTEEN_MIN_MS = 15 * 60 * 1000;
    void resyncHotEngagementDerivedState({ companyId: null, limit: 800 })
      .then((r) => {
        if (r.synced > 0 || r.errors > 0) {
          console.log(`[engagement-rollups] startup — scanned: ${r.scanned}, synced: ${r.synced}, errors: ${r.errors}`);
        }
      })
      .catch((e) => console.error("[engagement-rollups] startup error:", e));
    setInterval(() => {
      void resyncHotEngagementDerivedState({ companyId: null, limit: 800 })
        .then((r) => {
          if (r.synced > 0 || r.errors > 0) {
            console.log(`[engagement-rollups] — scanned: ${r.scanned}, synced: ${r.synced}, errors: ${r.errors}`);
          }
        })
        .catch((e) => console.error("[engagement-rollups] interval error:", e));
    }, FIFTEEN_MIN_MS);
  }
}

startServer().catch(console.error);
