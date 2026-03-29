/**
 * Security Middleware
 * - Helmet: sets secure HTTP headers (XSS protection, HSTS, CSP, etc.)
 * - Rate limiting: protects public endpoints from abuse
 * - Input sanitisation: strips null bytes and oversized strings
 * - Request ID: traces requests through logs
 */
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction, Application } from "express";

// ─── Helmet (HTTP security headers) ──────────────────────────────────────────
export const helmetMiddleware = helmet({
  contentSecurityPolicy: false, // Disabled: Vite dev server injects inline scripts
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

// ─── Input sanitisation ───────────────────────────────────────────────────────
/**
 * Recursively sanitises an object:
 * - Strips null bytes (\x00) from strings
 * - Truncates strings exceeding 50,000 characters
 * - Removes __proto__, constructor, prototype keys (prototype pollution guard)
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
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      // Block prototype pollution keys
      if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
      out[k] = sanitiseValue(v, depth + 1);
    }
    return out;
  }
  return val;
}

export function inputSanitiser(req: Request, _res: Response, next: NextFunction) {
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

// ─── Apply all security middleware to the Express app ────────────────────────
export function applySecurityMiddleware(app: Application) {
  app.use(helmetMiddleware);
  app.use(requestId);
  app.use(inputSanitiser);
  // Rate limit all /api routes
  app.use("/api/trpc", apiRateLimiter);
  app.use("/api/trpc", trpcSecurityHeaders);
  // Stricter rate limit on OAuth endpoints
  app.use("/api/oauth", authRateLimiter);
}
