import type { Request } from "express";

const trimTrailingSlash = (s: string) => s.replace(/\/+$/, "");

/** Express `req` or lightweight test doubles that only set `headers`. */
type PublicAppUrlRequest = Pick<Request, "get"> | { headers?: Record<string, string | string[] | undefined> };

function readReqHeader(req: PublicAppUrlRequest, name: string): string {
  const key = name.toLowerCase();
  if ("get" in req && typeof req.get === "function") {
    const v = req.get(name);
    if (v != null && String(v).length > 0) return String(v);
  }
  if ("headers" in req && req.headers) {
    const raw = req.headers[key];
    if (raw == null) return "";
    return Array.isArray(raw) ? raw.join(",") : String(raw);
  }
  return "";
}

/**
 * Public browser origin for absolute links in emails (and similar).
 * Prefer `PUBLIC_APP_URL`; otherwise infer from the incoming request (reverse-proxy safe).
 */
export function resolvePublicAppBaseUrl(req?: PublicAppUrlRequest): string {
  const fromEnv = trimTrailingSlash((process.env.PUBLIC_APP_URL ?? "").trim());
  if (fromEnv) return fromEnv;
  if (!req) return "";
  const host = (readReqHeader(req, "x-forwarded-host") || readReqHeader(req, "host"))
    .split(",")[0]
    .trim();
  if (!host) return "";
  const rawProto = (readReqHeader(req, "x-forwarded-proto") || "http").split(",")[0].trim().toLowerCase();
  const proto = rawProto === "https" || rawProto === "http" ? rawProto : "https";
  return `${proto}://${host}`;
}
