import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { mapMemberRoleToPlatformRole } from "@shared/rbac";
import { getDb } from "../db";
import { companyMembers, employees, users } from "../../drizzle/schema";
import { and, eq, isNull } from "drizzle-orm";
import { recordSessionLoginAudits } from "../complianceAudit";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Recover app origin from OAuth state (base64 of "origin" or "origin|returnPath").
 * Must match the Host of this callback request to avoid open redirects.
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
    if (!hostHeader || u.host.toLowerCase() !== hostHeader) return null;
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
      if (returnPath.startsWith("/")) return returnPath;
    }
  } catch {
    /* fall through */
  }
  return "/";
}

function redirectWithSignInError(res: Response, baseUrl: string, path: string, errorCode: string) {
  const url = new URL(path, baseUrl);
  url.searchParams.set("signin_error", errorCode);
  res.redirect(302, url.pathname + url.search + url.hash);
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      const base = appBaseUrlFromState(state, req);
      if (base) {
        const path = state ? redirectPathFromState(state) : "/";
        redirectWithSignInError(res, base, path, "oauth_incomplete");
        return;
      }
      res
        .status(400)
        .type("html")
        .send(
          "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Sign-in</title></head><body style=\"font-family:system-ui,sans-serif;max-width:32rem;margin:2rem auto;padding:0 1rem;\"><p>Sign-in link was incomplete. Close this tab and start again from the SmartPRO app.</p></body></html>",
        );
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        const baseNoOid = appBaseUrlFromState(state, req);
        if (baseNoOid) {
          redirectWithSignInError(res, baseNoOid, redirectPathFromState(state), "oauth_callback");
          return;
        }
        res.status(400).json({ error: "openId missing from user info" });
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

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // Parse optional returnPath from state: state = btoa("origin|/path") or btoa("origin")
      let redirectTo = "/";
      try {
        const decoded = Buffer.from(state, "base64").toString("utf8");
        const pipeIdx = decoded.indexOf("|");
        if (pipeIdx !== -1) {
          const returnPath = decoded.slice(pipeIdx + 1);
          // Only allow relative paths (starting with /) to prevent open redirect
          if (returnPath.startsWith("/")) {
            redirectTo = returnPath;
          }
        }
      } catch {
        // malformed state — fall back to /
      }

      res.redirect(302, redirectTo);
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      const base = appBaseUrlFromState(state, req);
      if (base) {
        redirectWithSignInError(res, base, redirectPathFromState(state), "oauth_callback");
        return;
      }
      res
        .status(500)
        .type("html")
        .send(
          "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Sign-in failed</title></head><body style=\"font-family:system-ui,sans-serif;max-width:32rem;margin:2rem auto;padding:0 1rem;\"><p>We could not finish sign-in. Go back to the SmartPRO app and try again. If it keeps failing, use the same sign-in method (Microsoft, Google, etc.) you used when you first registered.</p></body></html>",
        );
    }
  });
}
