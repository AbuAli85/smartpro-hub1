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

/**
 * Apex vs `www` (same site): OAuth callback may hit the bare domain while state
 * encodes `www` (or the reverse) behind the same load balancer.
 */
function oauthStateHostMatchesRequest(stateHost: string, requestHost: string): boolean {
  const a = stateHost.toLowerCase();
  const b = requestHost.toLowerCase();
  if (a === b) return true;
  const stripWww = (h: string) => (h.startsWith("www.") ? h.slice(4) : h);
  return stripWww(a) === stripWww(b);
}

/**
 * Recover app origin from OAuth state (base64 of "origin" or "origin|returnPath").
 * Must align with the callback request Host (same registrable host; www/apex OK)
 * to avoid open redirects.
 */
function appBaseUrlFromState(state: string | undefined, req: Request): string | null {
  if (!state) return null;
  try {
    const decoded = Buffer.from(state, "base64").toString("utf8");
    const pipeIdx = decoded.indexOf("|");
    const originPart = pipeIdx !== -1 ? decoded.slice(0, pipeIdx) : decoded;
    const u = new URL(originPart);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const hostHeader = (req.get("x-forwarded-host") ?? req.get("host") ?? "")
      .split(",")[0]
      .trim()
      .toLowerCase();
    if (!hostHeader || !oauthStateHostMatchesRequest(u.host, hostHeader)) return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function redirectPathFromState(state: string): string {
  try {
    const decoded = Buffer.from(state, "base64").toString("utf8");
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
      res.status(400).type("html").send(OAUTH_INCOMPLETE_HTML);
      return;
    }

    if (!code) {
      redirectWithSignInError(res, trustedBase, safeReturnPath, "oauth_incomplete");
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
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
