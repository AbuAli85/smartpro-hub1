import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { mapMemberRoleToPlatformRole } from "@shared/rbac";
import { getDb } from "../db";
import { companyMembers, users } from "../../drizzle/schema";
import { and, eq } from "drizzle-orm";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
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
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
