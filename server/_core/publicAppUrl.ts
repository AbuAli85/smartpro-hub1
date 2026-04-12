import type { Request } from "express";

const trimTrailingSlash = (s: string) => s.replace(/\/+$/, "");

/**
 * Public browser origin for absolute links in emails (and similar).
 * Prefer `PUBLIC_APP_URL`; otherwise infer from the incoming request (reverse-proxy safe).
 */
export function resolvePublicAppBaseUrl(req?: Pick<Request, "get">): string {
  const fromEnv = trimTrailingSlash((process.env.PUBLIC_APP_URL ?? "").trim());
  if (fromEnv) return fromEnv;
  if (!req) return "";
  const host = (req.get("x-forwarded-host") ?? req.get("host") ?? "")
    .split(",")[0]
    .trim();
  if (!host) return "";
  const rawProto = (req.get("x-forwarded-proto") ?? "http").split(",")[0].trim().toLowerCase();
  const proto = rawProto === "https" || rawProto === "http" ? rawProto : "https";
  return `${proto}://${host}`;
}
