import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type CookieCall = {
  name: string;
  options: Record<string, unknown>;
};

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(
  proto: "https" | "http" = "https"
): { ctx: TrpcContext; clearedCookies: CookieCall[] } {
  const clearedCookies: CookieCall[] = [];

  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: proto,
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });

    // All cleared cookies must target COOKIE_NAME.
    for (const c of clearedCookies) {
      expect(c.name).toBe(COOKIE_NAME);
    }

    // maxAge must NOT be present (Express 4 deprecation fix).
    for (const c of clearedCookies) {
      expect(c.options).not.toHaveProperty("maxAge");
    }

    // There should be at least two clears: SameSite=Lax and SameSite=None.
    const sameSiteValues = clearedCookies.map((c) => c.options.sameSite);
    expect(sameSiteValues).toContain("lax");
    expect(sameSiteValues).toContain("none");

    // Every clear must be HttpOnly and have a Path.
    for (const c of clearedCookies) {
      expect(c.options).toMatchObject({ httpOnly: true, path: "/" });
    }
  });

  it("returns success even when the user is not authenticated", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    // Simulate unauthenticated context.
    (ctx as { user: null }).user = null;
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    // Cookie clearing should still happen regardless of auth state.
    expect(clearedCookies.length).toBeGreaterThanOrEqual(2);
  });
});
