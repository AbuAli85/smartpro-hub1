import type { CookieOptions, Request } from "express";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

/**
 * Cookie `Domain` for session: use registrable apex when hostname is `www.*` so the
 * same session is visible on both apex and www (OAuth `redirectUri` often uses www
 * while marketing links use apex, or vice versa).
 */
function sessionCookieDomain(hostname: string): string | undefined {
  if (!hostname || LOCAL_HOSTS.has(hostname) || isIpAddress(hostname)) return undefined;

  const lower = hostname.toLowerCase();
  if (lower.startsWith("www.") && lower.length > 4) {
    const rest = lower.slice(4);
    if (!rest || isIpAddress(rest) || LOCAL_HOSTS.has(rest)) return undefined;
    return `.${rest}`;
  }
  if (!lower.startsWith(".")) {
    return `.${lower}`;
  }
  return lower;
}

/**
 * Resolve the canonical hostname for the session cookie Domain attribute.
 *
 * The Manus platform routes requests through an internal reverse proxy that
 * presents its own hostname (e.g. `smartprohub-q4qjnxjv.manus.space`) to the
 * Express process, even when the public-facing URL is `www.thesmartpro.io`.
 * If we use `req.hostname` for the cookie Domain, the browser at the public URL
 * will never send the cookie back because the Domain attribute won't match.
 *
 * Fix: prefer `PUBLIC_APP_URL` (set in Manus Secrets) as the authoritative
 * hostname. Fall back to `req.hostname` only when `PUBLIC_APP_URL` is absent
 * (local dev, or deployments without a custom domain).
 */
function resolveCanonicalHostname(req: Request): string {
  const publicUrl = (process.env.PUBLIC_APP_URL ?? process.env.APP_PUBLIC_URL ?? "").trim();
  if (publicUrl) {
    try {
      return new URL(publicUrl).hostname;
    } catch {
      // malformed env — fall through to req.hostname
    }
  }
  return req.hostname;
}

export function getSessionCookieOptions(
  req: Request,
  { crossSite = false }: { crossSite?: boolean } = {}
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  // Use the canonical public hostname (from PUBLIC_APP_URL) rather than
  // req.hostname, which may be the internal Manus container hostname and would
  // produce a cookie Domain that the browser at the public URL never sends back.
  const hostname = resolveCanonicalHostname(req);
  const shouldSetDomain =
    hostname &&
    !LOCAL_HOSTS.has(hostname) &&
    !isIpAddress(hostname) &&
    hostname !== "127.0.0.1" &&
    hostname !== "::1";

  const domain = shouldSetDomain ? sessionCookieDomain(hostname) : undefined;

  // When crossSite=true (OAuth callback from manus.im), we MUST use SameSite=None;Secure
  // so the browser keeps the cookie on the cross-site top-level redirect.
  //
  // IMPORTANT: We force secure=true unconditionally when crossSite=true.
  // We cannot rely on isSecureRequest() here because Cloudflare may not forward
  // X-Forwarded-Proto to the origin container, causing req.protocol to return "http"
  // even though the client connection is HTTPS. If secure=false, SameSite=None is
  // invalid per spec and browsers fall back to SameSite=Lax, which drops the cookie
  // on the cross-site redirect — the session never lands.
  //
  // OAuth callbacks are always HTTPS in production, so forcing secure=true is safe.
  // On local dev (plain HTTP), crossSite is still false so this path is not taken.
  const effectiveSameSite: CookieOptions["sameSite"] = crossSite ? "none" : "lax";
  const effectiveSecure = crossSite ? true : isSecureRequest(req);

  return {
    httpOnly: true,
    path: "/",
    sameSite: effectiveSameSite,
    secure: effectiveSecure,
    ...(domain ? { domain } : {}),
  };
}
