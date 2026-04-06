// IMPORTANT: instrument Sentry before other imports (loads dotenv + Sentry.init).
import "./instrument.ts";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { applySecurityMiddleware } from "./security";
import { validateProductionEnvironment } from "./env";
import { runEmployeeTaskOverdueNotifications } from "../jobs/employeeTaskOverdue";
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
  const app = express();
  app.set("trust proxy", 1); // Trust first proxy — required for rate-limiter behind reverse proxy
  const server = createServer(app);
  // Security: helmet, rate limiting, input sanitisation, request IDs
  applySecurityMiddleware(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
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
}

startServer().catch(console.error);
