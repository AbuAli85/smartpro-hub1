import { COOKIE_NAME, SESSION_EXPIRY_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { mapMemberRoleToPlatformRole } from "@shared/rbac";
import { getDb } from "../db";
import { companyMembers, employees, users } from "../../drizzle/schema";
import { and, eq, isNull } from "drizzle-orm";
import { recordSessionLoginAudits } from "../complianceAudit";
import { createMfaChallengeForUser } from "../lib/twoFactorService";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

/** Same-origin return path only (blocks `//host`, `https:`, backslash tricks). */
function sanitizeOAuthReturnPath(path: string): string {
  const p = path.trim();
  if (!p.startsWith("/") || p.startsWith("//") || p.includes("\\") || p.includes("://")) {
    return "/";
  }
  return p;
}

/**
 * Build an absolute redirect URL under `baseUrl` only — rejects cross-origin
 * resolution so state-derived paths cannot become phishing redirects
 * (CodeQL js/server-side-unvalidated-url-redirection).
 */
function validatedSameOriginRedirectHref(baseUrl: string, returnPath: string): string | null {
  const path = sanitizeOAuthReturnPath(returnPath);
  let baseParsed: URL;
  try {
    baseParsed = new URL(baseUrl);
  } catch {
    return null;
  }
  if (baseParsed.protocol !== "http:" && baseParsed.protocol !== "https:") {
    return null;
  }
  let resolved: URL;
  try {
    resolved = new URL(path, baseParsed);
  } catch {
    resolved = new URL("/", baseParsed);
  }
  if (resolved.origin !== baseParsed.origin) {
    return new URL("/", baseParsed).href;
  }
  return resolved.href;
}

/** Host / Host:port → hostname only (lowercase), for comparisons behind proxies. */
function oauthComparableHostname(host: string): string {
  const h = host.trim().toLowerCase();
  if (!h) return "";
  try {
    return new URL(`http://${h}`).hostname;
  } catch {
    return h.startsWith("[") ? h : h.split(":")[0] ?? h;
  }
}

/**
 * Apex vs `www` (same site): callback may hit bare domain while state encodes
 * `www` (or reverse). Compares hostnames only (ports ignored).
 */
function oauthStateHostMatchesRequest(stateHost: string, requestHost: string): boolean {
  const a = oauthComparableHostname(stateHost);
  const b = oauthComparableHostname(requestHost);
  if (a === b) return true;
  const stripWww = (hostname: string) => (hostname.startsWith("www.") ? hostname.slice(4) : hostname);
  return stripWww(a) === stripWww(b);
}

/** Distinct Host / X-Forwarded-Host values from the request (first segment each). */
function oauthRequestHostCandidates(req: Request): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [req.get("x-forwarded-host"), req.get("host")]) {
    const first = raw?.split(",")[0]?.trim();
    if (!first || seen.has(first)) continue;
    seen.add(first);
    out.push(first);
  }
  return out;
}

/**
 * Decode `state` query param (browser `btoa` of UTF-8 ASCII origin, optional `|path`).
 * Harden for IdP/proxy/query parsing: spaces instead of `+`, URL-safe base64, padding.
 */
function decodeOAuthStatePayload(state: string): string | null {
  try {
    let s = state.trim();
    if (!s) return null;
    s = s.replace(/\s/g, "+");
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    const rem = s.length % 4;
    if (rem) s += "=".repeat(4 - rem);
    const decoded = Buffer.from(s, "base64").toString("utf8");
    if (!decoded || decoded.includes("\0")) return null;
    return decoded;
  } catch {
    return null;
  }
}

let cachedOAuthEnvTrustedOrigins: URL[] | null = null;

/** Origins explicitly configured for this deployment (CORS / public URL). */
function oauthEnvTrustedOriginUrls(): URL[] {
  if (cachedOAuthEnvTrustedOrigins) return cachedOAuthEnvTrustedOrigins;
  const raw: string[] = [];
  const allowedOrigins = process.env.ALLOWED_ORIGINS;
  if (allowedOrigins) {
    raw.push(...allowedOrigins.split(",").map((x) => x.trim()).filter(Boolean));
  }
  for (const v of [process.env.APP_PUBLIC_URL, process.env.PUBLIC_APP_URL]) {
    const t = v?.trim();
    if (t) raw.push(t);
  }
  const seen = new Set<string>();
  const urls: URL[] = [];
  for (const entry of raw) {
    try {
      const u = new URL(entry);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      const key = u.origin;
      if (seen.has(key)) continue;
      seen.add(key);
      urls.push(u);
    } catch {
      /* skip invalid */
    }
  }
  cachedOAuthEnvTrustedOrigins = urls;
  return urls;
}

/** True when decoded state origin matches an env-configured app URL (same scheme; www/apex host). */
function oauthStateOriginMatchesEnvAllowlist(stateUrl: URL): boolean {
  for (const allowed of oauthEnvTrustedOriginUrls()) {
    if (stateUrl.protocol !== allowed.protocol) continue;
    if (oauthStateHostMatchesRequest(stateUrl.host, allowed.host)) return true;
  }
  return false;
}

/**
 * Recover app origin from OAuth state (base64 of "origin" or "origin|returnPath").
 * Must align with the callback request Host (same registrable host; www/apex OK), or
 * with `ALLOWED_ORIGINS` / `PUBLIC_APP_URL` / `APP_PUBLIC_URL` when proxies hide the
 * public hostname on the incoming request.
 */
function appBaseUrlFromState(state: string | undefined, req: Request): string | null {
  if (!state) return null;
  const decoded = decodeOAuthStatePayload(state);
  if (!decoded) return null;
  try {
    const pipeIdx = decoded.indexOf("|");
    const originPart = pipeIdx !== -1 ? decoded.slice(0, pipeIdx) : decoded;
    const u = new URL(originPart);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const candidates = oauthRequestHostCandidates(req);
    const hostMatchesRequest =
      candidates.length > 0 &&
      candidates.some((h) => oauthStateHostMatchesRequest(u.host, h));
    if (hostMatchesRequest) {
      return `${u.protocol}//${u.host}`;
    }
    if (oauthStateOriginMatchesEnvAllowlist(u)) {
      return `${u.protocol}//${u.host}`;
    }
    return null;
  } catch {
    return null;
  }
}

function redirectPathFromState(state: string): string {
  const decoded = decodeOAuthStatePayload(state);
  if (!decoded) return "/";
  try {
    const pipeIdx = decoded.indexOf("|");
    if (pipeIdx !== -1) {
      const returnPath = decoded.slice(pipeIdx + 1);
      return sanitizeOAuthReturnPath(returnPath);
    }
  } catch {
    /* fall through */
  }
  return "/";
}

function redirectWithSignInError(res: Response, baseUrl: string, path: string, errorCode: string) {
  const href = validatedSameOriginRedirectHref(baseUrl, path);
  if (!href) {
    res.status(500).type("html").send("<p>Sign-in redirect configuration error.</p>");
    return;
  }
  const url = new URL(href);
  url.searchParams.set("signin_error", errorCode);
  res.redirect(302, url.href);
}

const OAUTH_INCOMPLETE_HTML =
  "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Sign-in</title></head><body style=\"font-family:system-ui,sans-serif;max-width:32rem;margin:2rem auto;padding:0 1rem;\"><p>Sign-in link was incomplete. Close this tab and start again from the SmartPRO app.</p></body></html>";

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    // Validate `state` and derive redirect targets once (avoids user-controlled-bypass:
    // do not branch a sensitive redirect on raw query shape like `!code || !state`).
    if (!state) {
      res.status(400).type("html").send(OAUTH_INCOMPLETE_HTML);
      return;
    }

    const trustedBase = appBaseUrlFromState(state, req);
    const safeReturnPath = redirectPathFromState(state);

    if (!trustedBase) {
      // Last-resort fallback: if the proxy stripped Host/X-Forwarded-Host so the state
      // origin could not be matched against the request, fall back to PUBLIC_APP_URL.
      // This covers apex vs www mismatches on Manus-hosted deployments.
      const envPublicUrl = (process.env.PUBLIC_APP_URL ?? process.env.APP_PUBLIC_URL ?? "").trim();
      if (!envPublicUrl) {
        res.status(400).type("html").send(OAUTH_INCOMPLETE_HTML);
        return;
      }
      // Re-check: does the state origin match the env public URL (www/apex-tolerant)?
      const stateDecoded = decodeOAuthStatePayload(state);
      if (!stateDecoded) {
        res.status(400).type("html").send(OAUTH_INCOMPLETE_HTML);
        return;
      }
      try {
        const pipeIdx = stateDecoded.indexOf("|");
        const originPart = pipeIdx !== -1 ? stateDecoded.slice(0, pipeIdx) : stateDecoded;
        const stateUrl = new URL(originPart);
        const envUrl = new URL(envPublicUrl);
        if (!oauthStateHostMatchesRequest(stateUrl.host, envUrl.host)) {
          res.status(400).type("html").send(OAUTH_INCOMPLETE_HTML);
          return;
        }
        // Use the state origin (what the browser actually used) as trustedBase so
        // the redirect URI matches what was sent during authorize.
        const resolvedTrustedBase = `${stateUrl.protocol}//${stateUrl.host}`;
        // Re-run the callback with the resolved base
        if (!code) {
          redirectWithSignInError(res, resolvedTrustedBase, safeReturnPath, "oauth_incomplete");
          return;
        }
        const fallbackRedirectUri = new URL("/api/oauth/callback", resolvedTrustedBase).href;
        const fallbackToken = await sdk.exchangeCodeForToken(code, fallbackRedirectUri);
        const fallbackUserInfo = await sdk.getUserInfo(fallbackToken.accessToken);
        if (!fallbackUserInfo.openId) {
          redirectWithSignInError(res, resolvedTrustedBase, safeReturnPath, "oauth_callback");
          return;
        }
        await db.upsertUser({
          openId: fallbackUserInfo.openId,
          name: fallbackUserInfo.name || null,
          email: fallbackUserInfo.email ?? null,
          loginMethod: fallbackUserInfo.loginMethod ?? fallbackUserInfo.platform ?? null,
          lastSignedIn: new Date(),
        });
        const fallbackSessionToken = await sdk.createSessionToken(fallbackUserInfo.openId, {
          name: fallbackUserInfo.name || "",
          expiresInMs: SESSION_EXPIRY_MS,
        });
        const fallbackCookieOptions = getSessionCookieOptions(req);
        res.cookie(COOKIE_NAME, fallbackSessionToken, { ...fallbackCookieOptions, maxAge: SESSION_EXPIRY_MS });
        const fallbackHref = validatedSameOriginRedirectHref(resolvedTrustedBase, safeReturnPath);
        if (!fallbackHref) {
          res.status(500).send("Invalid post-login redirect");
          return;
        }
        res.redirect(302, fallbackHref);
        return;
      } catch (fallbackErr) {
        console.error("[OAuth] Fallback callback failed", fallbackErr);
        res.status(400).type("html").send(OAUTH_INCOMPLETE_HTML);
        return;
      }
    }

    if (!code) {
      redirectWithSignInError(res, trustedBase, safeReturnPath, "oauth_incomplete");
      return;
    }

    try {
      // Build redirect URI without trailing-slash duplication: trustedBase has no trailing slash
      // (e.g. "https://www.thesmartpro.io"), so new URL("/api/oauth/callback", trustedBase) is correct.
      const oauthRedirectUri = new URL("/api/oauth/callback", trustedBase).href;
      const tokenResponse = await sdk.exchangeCodeForToken(code, oauthRedirectUri);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        redirectWithSignInError(res, trustedBase, safeReturnPath, "oauth_callback");
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      try {
        const signedInUser = await db.getUserByOpenId(userInfo.openId);
        if (signedInUser) {
          const auditDb = await getDb();
          if (auditDb) {
            await recordSessionLoginAudits(auditDb, {
              userId: signedInUser.id,
              loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
              ipAddress: typeof req.ip === "string" ? req.ip : null,
              userAgent: req.get("user-agent") ?? null,
            });
          }
        }
      } catch (auditErr) {
        console.error("[OAuth] Session audit failed (non-fatal):", auditErr);
      }

      // Self-healing: if the user has active company memberships but their platformRole
      // is still the default "client", auto-promote it based on their highest membership role.
      // This fixes cases where platformRole was never set (e.g., admin added them before this fix).
      try {
        const dbConn = await getDb();
        if (dbConn) {
          const freshUser = await db.getUserByOpenId(userInfo.openId);
          if (freshUser && (freshUser.platformRole === "client" || !freshUser.platformRole)) {
            const memberships = await dbConn
              .select({ role: companyMembers.role })
              .from(companyMembers)
              .where(and(eq(companyMembers.userId, freshUser.id), eq(companyMembers.isActive, true)));
            if (memberships.length > 0) {
              // Pick the highest-privilege role
              const roleOrder = ["company_admin", "hr_admin", "finance_admin", "reviewer", "company_member", "external_auditor"];
              const best = memberships
                .map((m) => m.role ?? "company_member")
                .sort((a, b) => roleOrder.indexOf(a) - roleOrder.indexOf(b))[0];
              const newPlatformRole = mapMemberRoleToPlatformRole(best);
              if (newPlatformRole !== freshUser.platformRole) {
                await dbConn.update(users).set({ platformRole: newPlatformRole }).where(eq(users.id, freshUser.id));
                console.log(`[OAuth] Auto-promoted ${freshUser.email} platformRole: ${freshUser.platformRole} → ${newPlatformRole}`);
              }
            }
          }
        }
      } catch (syncErr) {
        // Non-fatal: log and continue — user still gets their session
        console.error("[OAuth] platformRole sync failed (non-fatal):", syncErr);
      }

      // Auto-link: when a user signs in, automatically link any unlinked employee records
      // in their active company memberships whose email matches the sign-in email.
      // This removes the need for manual "Link Account" in the common case.
      try {
        const autoLinkDb = await getDb();
        if (autoLinkDb && userInfo.email) {
          const freshUserForLink = await db.getUserByOpenId(userInfo.openId);
          if (freshUserForLink) {
            // Get all active company memberships for this user
            const activeMemberships = await autoLinkDb
              .select({ companyId: companyMembers.companyId })
              .from(companyMembers)
              .where(and(eq(companyMembers.userId, freshUserForLink.id), eq(companyMembers.isActive, true)));
            if (activeMemberships.length > 0) {
              const memberCompanyIds = activeMemberships.map((m) => m.companyId);
              // Find unlinked employee rows with a matching email
              const unlinkedEmployees = await autoLinkDb
                .select({ id: employees.id, companyId: employees.companyId, firstName: employees.firstName, lastName: employees.lastName })
                .from(employees)
                .where(and(eq(employees.email, userInfo.email.toLowerCase()), isNull(employees.userId)));
              const toAutoLink = unlinkedEmployees.filter((e) => memberCompanyIds.includes(e.companyId));
              for (const emp of toAutoLink) {
                await autoLinkDb
                  .update(employees)
                  .set({ userId: freshUserForLink.id })
                  .where(eq(employees.id, emp.id));
                console.log(`[OAuth] Auto-linked employee #${emp.id} (${emp.firstName} ${emp.lastName}) → user #${freshUserForLink.id} (${userInfo.email})`);
              }
            }
          }
        }
      } catch (autoLinkErr) {
        // Non-fatal: log and continue — user still gets their session
        console.error("[OAuth] Auto-link employee failed (non-fatal):", autoLinkErr);
      }

      const userForMfa = await db.getUserByOpenId(userInfo.openId);
      if (userForMfa?.twoFactorEnabled && userForMfa.twoFactorSecretEncrypted) {
        const mfaDb = await getDb();
        if (!mfaDb) {
          res.status(503).type("html").send("<p>Database unavailable. Try again shortly.</p>");
          return;
        }
        try {
          const challengeId = await createMfaChallengeForUser(mfaDb, {
            userId: userForMfa.id,
            returnPath: safeReturnPath,
          });
          const mfaUrl = new URL("/auth/mfa", trustedBase);
          mfaUrl.searchParams.set("challenge", challengeId);
          const mfaHref = validatedSameOriginRedirectHref(
            trustedBase,
            `${mfaUrl.pathname}${mfaUrl.search}`,
          );
          if (!mfaHref) {
            res.status(500).send("MFA redirect error");
            return;
          }
          res.redirect(302, mfaHref);
          return;
        } catch (mfaErr) {
          console.error("[OAuth] MFA challenge creation failed:", mfaErr);
          redirectWithSignInError(res, trustedBase, safeReturnPath, "mfa_unavailable");
          return;
        }
      }

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: SESSION_EXPIRY_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_EXPIRY_MS });

      const successHref = validatedSameOriginRedirectHref(trustedBase, safeReturnPath);
      if (!successHref) {
        res.status(500).send("Invalid post-login redirect");
        return;
      }
      res.redirect(302, successHref);
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      redirectWithSignInError(res, trustedBase, safeReturnPath, "oauth_callback");
    }
  });
}
