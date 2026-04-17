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

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  const hostname = req.hostname;
  const shouldSetDomain =
    hostname &&
    !LOCAL_HOSTS.has(hostname) &&
    !isIpAddress(hostname) &&
    hostname !== "127.0.0.1" &&
    hostname !== "::1";

  const domain = shouldSetDomain ? sessionCookieDomain(hostname) : undefined;

  return {
    httpOnly: true,
    path: "/",
    // Lax is safe for same-origin navigation and blocks cross-site CSRF.
    // Use "none" only if cross-origin auth flows (e.g. embedded iframes) are required.
    sameSite: "lax",
    secure: isSecureRequest(req),
    ...(domain ? { domain } : {}),
  };
}
