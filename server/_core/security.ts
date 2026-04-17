/**
 * Security Middleware
 * - Helmet: sets secure HTTP headers (XSS protection, HSTS, CSP, etc.)
 * - Rate limiting: protects public endpoints from abuse
 * - Input sanitisation: strips null bytes and oversized strings
 * - Request ID: traces requests through logs
 * - CSRF: Origin header validation on all state-changing tRPC calls
 */
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction, Application } from "express";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/** CSP in dev: still enforced (CodeQL js/insecure-helmet-configuration) but loose enough for Vite + HMR + tunnel previews. */
const helmetCspDevelopment = {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "blob:", "https:"],
    fontSrc: ["'self'", "data:"],
    connectSrc: [
      "'self'",
      "ws:",
      "wss:",
      "http://127.0.0.1:*",
      "http://localhost:*",
      "https://127.0.0.1:*",
      "https://localhost:*",
      "https://*.sentry.io",
      "https://*.ingest.sentry.io",
      // Vite `server.allowedHosts` tunnel / preview domains
      "https://*.manuspre.computer",
      "https://*.manus.computer",
      "https://*.manus-asia.computer",
      "https://*.manuscomputer.ai",
      "https://*.manusvm.computer",
    ],
    frameSrc: ["'none'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
  },
};

const helmetCspProduction = {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"], // Tailwind CSS requires inline styles
    imgSrc: ["'self'", "data:", "blob:", "https:"],
    fontSrc: ["'self'", "data:"],
    connectSrc: [
      "'self'",
      // Sentry error reporting
      "https://*.sentry.io",
      "https://*.ingest.sentry.io",
    ],
    frameSrc: ["'none'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    upgradeInsecureRequests: [],
  },
};

// ─── Helmet (HTTP security headers) ──────────────────────────────────────────
// CSP is always enabled; development uses a relaxed policy for Vite/HMR/tunnels.
export const helmetMiddleware = helmet({
  contentSecurityPolicy: IS_PRODUCTION ? helmetCspProduction : helmetCspDevelopment,
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

// ─── Rate limiters ────────────────────────────────────────────────────────────
/** General API rate limiter — 300 requests per 15 minutes per IP */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === "/health" || req.path === "/api/health";
  },
});

/** Auth endpoint rate limiter — 20 requests per 15 minutes per IP */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts, please try again later." },
});

/** Public marketplace rate limiter — 60 requests per minute per IP */
export const publicRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Rate limit exceeded. Please slow down." },
});

/**
 * Dev-only: Vite SPA fallback re-reads `client/index.html` from disk per request.
 * Rate-limit that path to limit disk abuse (CodeQL js/missing-rate-limiting) while
 * staying well above normal local dev traffic (nav + refresh + HMR).
 */
export const viteDevSpaHtmlRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many page loads. Please slow down." },
});

/** Production: SPA fallback `sendFile(index.html)` (see vite-static.ts). */
export const staticSpaFallbackRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again shortly." },
});

/**
 * Stripe / Thawani webhook POSTs: signature verification + DB work (CodeQL
 * js/missing-rate-limiting). Cap per IP before body parsing; limit is high so
 * legitimate provider retries and bursts stay under the ceiling.
 */
export const paymentProviderWebhookRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many webhook requests." },
});

/**
 * Meta WhatsApp Cloud webhooks (GET verify + POST HMAC) — CodeQL js/missing-rate-limiting.
 */
export const metaWhatsAppWebhookRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many webhook requests." },
});

/**
 * Public HR letter view (GET + signed token + DB) — CodeQL js/missing-rate-limiting.
 */
export const hrLetterPublicViewRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait and try again." },
});

// ─── Input sanitisation ───────────────────────────────────────────────────────
const PROTOTYPE_POLLUTION_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Only copy plain keys — blocks prototype pollution and CodeQL js/remote-property-injection. */
function isSafeObjectKey(k: string): boolean {
  if (k.length === 0 || k.length > 256) return false;
  if (PROTOTYPE_POLLUTION_KEYS.has(k)) return false;
  if (k.startsWith("__")) return false;
  return /^[a-zA-Z0-9_.$-]+$/.test(k);
}

/**
 * Recursively sanitises an object:
 * - Strips null bytes (\x00) from strings
 * - Truncates strings exceeding 50,000 characters
 * - Drops keys that are not allow-listed (prototype / remote-property injection guard)
 */
function sanitiseValue(val: unknown, depth = 0): unknown {
  if (depth > 10) return val; // Prevent infinite recursion on circular refs
  if (typeof val === "string") {
    return val.replace(/\x00/g, "").slice(0, 50000);
  }
  if (Array.isArray(val)) {
    return val.map((v) => sanitiseValue(v, depth + 1));
  }
  if (val !== null && typeof val === "object") {
    const out: Record<string, unknown> = Object.create(null);
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (!isSafeObjectKey(k)) continue;
      Object.defineProperty(out, k, {
        value: sanitiseValue(v, depth + 1),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return out;
  }
  return val;
}

export function inputSanitiser(req: Request, _res: Response, next: NextFunction) {
  if (Buffer.isBuffer(req.body)) {
    next();
    return;
  }
  if (req.body && typeof req.body === "object") {
    req.body = sanitiseValue(req.body);
  }
  if (req.query && typeof req.query === "object") {
    req.query = sanitiseValue(req.query) as typeof req.query;
  }
  next();
}

// ─── Request ID middleware ────────────────────────────────────────────────────
export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  (req as any).requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}

// ─── Security headers for tRPC responses ─────────────────────────────────────
export function trpcSecurityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
}

// ─── CORS ────────────────────────────────────────────────────────────────────
function headerFirstString(v: string | string[] | undefined): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") return v[0];
  return undefined;
}

/** Normalised origin for allowlist comparison (scheme + host, host lowercased). */
function normalizeHttpOrigin(origin: string): string | null {
  try {
    const u = new URL(origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.protocol}//${u.host}`.toLowerCase();
  } catch {
    return null;
  }
}

/** Origins that may receive credentialed CORS responses — never reflect arbitrary Origin. */
function corsAllowedOriginSet(req: Request): Set<string> {
  if (process.env.ALLOWED_ORIGINS) {
    const set = new Set<string>();
    for (const part of process.env.ALLOWED_ORIGINS.split(",")) {
      const o = part.trim();
      if (!o) continue;
      const n = normalizeHttpOrigin(o);
      if (n) set.add(n);
    }
    return set;
  }
  const host = (req.get("host") ?? "").split(",")[0].trim();
  if (!host) return new Set();
  const fallback = `${req.protocol}//${host}`;
  const n = normalizeHttpOrigin(fallback);
  return new Set(n ? [n] : []);
}

/**
 * Value for `Access-Control-Allow-Origin` — derived only from env or canonical
 * normalisation after allowlist check (breaks taint to arbitrary `Origin` for CodeQL).
 */
function resolveAccessControlAllowOrigin(req: Request, requestOriginHeader: string): string | null {
  const allowed = corsAllowedOriginSet(req);
  const reqNorm = normalizeHttpOrigin(requestOriginHeader);
  if (!reqNorm || !allowed.has(reqNorm)) return null;

  if (process.env.ALLOWED_ORIGINS) {
    for (const part of process.env.ALLOWED_ORIGINS.split(",")) {
      const entry = part.trim();
      if (!entry) continue;
      if (normalizeHttpOrigin(entry) === reqNorm) return entry;
    }
    return null;
  }

  return reqNorm;
}

/**
 * Explicit CORS middleware.
 *
 * When the app is served from the same origin as the API (typical deployment),
 * browsers never send a cross-origin header, so this is a no-op in practice.
 * It becomes important if the frontend is ever served from a CDN or a different
 * sub-domain, or if third-party clients need to call the API directly.
 *
 * Allowed origins are read from the ALLOWED_ORIGINS env var (comma-separated).
 * If unset, only this server's own origin (from Host + protocol) is allowed —
 * never echo a client Origin unless it is on that allowlist (CodeQL
 * js/cors-misconfiguration-for-credentials).
 */
export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  const origin = headerFirstString(req.headers.origin);
  if (origin) {
    const acao = resolveAccessControlAllowOrigin(req, origin);
    if (acao) {
      res.setHeader("Access-Control-Allow-Origin", acao);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-Id");
      res.setHeader("Access-Control-Max-Age", "86400");
    }
  }

  // Respond to preflight without a body
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
}

// ─── CSRF protection ──────────────────────────────────────────────────────────
/**
 * Validates the Origin (or Referer) header on POST requests to prevent CSRF.
 *
 * tRPC mutations arrive as HTTP POST; queries arrive as GET (or POST with batching).
 * Rejecting POSTs whose Origin doesn't match the server's own origin blocks any
 * third-party site from issuing authenticated state-changing requests using the
 * user's session cookie.
 *
 * Configure ALLOWED_ORIGINS as a comma-separated list in the environment, e.g.:
 *   ALLOWED_ORIGINS=https://app.smartpro.om,https://www.smartpro.om
 * If unset, defaults to the request's own Host header (same-origin only).
 */
export function csrfOriginCheck(req: Request, res: Response, next: NextFunction) {
  // Only enforce on state-changing methods.
  if (req.method !== "POST" && req.method !== "PUT" && req.method !== "PATCH" && req.method !== "DELETE") {
    return next();
  }

  const origin = req.headers["origin"];
  const referer = req.headers["referer"];
  const sourceHeader = origin || (referer ? new URL(referer).origin : undefined);

  // Build the set of allowed origins from env (comma-separated) or fall back to
  // deriving the origin from the request itself (same-origin deployments).
  let allowedOrigins: Set<string>;
  if (process.env.ALLOWED_ORIGINS) {
    allowedOrigins = new Set(
      process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
    );
  } else {
    const proto = req.protocol;
    const host = req.headers["host"] ?? "";
    allowedOrigins = new Set([`${proto}://${host}`]);
  }

  // Allow requests without an Origin/Referer header only from server-to-server
  // calls (no browser cookie is sent without an Origin in cross-origin requests).
  if (!sourceHeader) {
    return next();
  }

  if (!allowedOrigins.has(sourceHeader)) {
    res.status(403).json({ error: "CSRF check failed: Origin not allowed." });
    return;
  }

  next();
}

// ─── Apply all security middleware to the Express app ────────────────────────
export function applySecurityMiddleware(app: Application) {
  app.use(helmetMiddleware);
  app.use(corsMiddleware);
  app.use(requestId);
  app.use(inputSanitiser);
  // Rate limit all /api routes
  app.use("/api/trpc", apiRateLimiter);
  app.use("/api/trpc", trpcSecurityHeaders);
  // CSRF origin check on tRPC mutations (POST requests)
  app.use("/api/trpc", csrfOriginCheck);
  // Stricter rate limit on OAuth endpoints
  app.use("/api/oauth", authRateLimiter);
}
