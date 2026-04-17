import { describe, it, expect } from "vitest";
import type { Request } from "express";
import { getSessionCookieOptions } from "./cookies";

function mockReq(partial: Pick<Request, "hostname"> & Partial<Pick<Request, "protocol" | "headers">>): Request {
  return {
    protocol: "https",
    headers: {},
    ...partial,
  } as Request;
}

/**
 * Temporarily clear PUBLIC_APP_URL so tests that pass explicit hostnames
 * are not overridden by the env var (which may be set in the sandbox).
 */
function withoutPublicAppUrl(fn: () => void) {
  const saved = process.env.PUBLIC_APP_URL;
  delete process.env.PUBLIC_APP_URL;
  try {
    fn();
  } finally {
    if (saved !== undefined) process.env.PUBLIC_APP_URL = saved;
  }
}

describe("getSessionCookieOptions domain", () => {
  it("maps www host to apex registrable Domain so apex and www share session", () => {
    withoutPublicAppUrl(() => {
      const opts = getSessionCookieOptions(mockReq({ hostname: "www.thesmartpro.io" }));
      expect(opts.domain).toBe(".thesmartpro.io");
    });
  });

  it("uses dotted apex for bare registrable host", () => {
    withoutPublicAppUrl(() => {
      const opts = getSessionCookieOptions(mockReq({ hostname: "thesmartpro.io" }));
      expect(opts.domain).toBe(".thesmartpro.io");
    });
  });

  it("does not set Domain on localhost when PUBLIC_APP_URL is absent", () => {
    withoutPublicAppUrl(() => {
      const opts = getSessionCookieOptions(mockReq({ hostname: "localhost", protocol: "http" }));
      expect(opts.domain).toBeUndefined();
    });
  });

  it("uses PUBLIC_APP_URL hostname for cookie Domain (Manus internal proxy sends different req.hostname)", () => {
    const saved = process.env.PUBLIC_APP_URL;
    process.env.PUBLIC_APP_URL = "https://www.thesmartpro.io";
    try {
      // req.hostname is the internal Manus container hostname, not the public URL
      const opts = getSessionCookieOptions(mockReq({ hostname: "smartprohub-q4qjnxjv.manus.space" }));
      // Cookie domain must be derived from PUBLIC_APP_URL so the browser at
      // www.thesmartpro.io sends the cookie back on subsequent requests
      expect(opts.domain).toBe(".thesmartpro.io");
    } finally {
      if (saved !== undefined) process.env.PUBLIC_APP_URL = saved;
      else delete process.env.PUBLIC_APP_URL;
    }
  });
});

describe("getSessionCookieOptions SameSite", () => {
  it("defaults to SameSite=Lax for same-site requests (e.g. logout, MFA)", () => {
    withoutPublicAppUrl(() => {
      const opts = getSessionCookieOptions(mockReq({ hostname: "www.thesmartpro.io" }));
      expect(opts.sameSite).toBe("lax");
    });
  });

  it("uses SameSite=None; Secure for cross-site OAuth callbacks on HTTPS", () => {
    withoutPublicAppUrl(() => {
      const opts = getSessionCookieOptions(
        mockReq({ hostname: "www.thesmartpro.io", protocol: "https" }),
        { crossSite: true }
      );
      expect(opts.sameSite).toBe("none");
      expect(opts.secure).toBe(true);
    });
  });

  it("uses SameSite=None;Secure=true for crossSite=true even on plain HTTP (Cloudflare proxy may not forward X-Forwarded-Proto)", () => {
    withoutPublicAppUrl(() => {
      const opts = getSessionCookieOptions(
        mockReq({ hostname: "localhost", protocol: "http" }),
        { crossSite: true }
      );
      // crossSite=true forces SameSite=None;Secure=true unconditionally.
      // We cannot rely on isSecureRequest() because Cloudflare may not forward
      // X-Forwarded-Proto to the origin, causing req.protocol to return "http"
      // even though the client connection is HTTPS. OAuth callbacks are always
      // HTTPS in production, so forcing Secure=true is safe.
      expect(opts.sameSite).toBe("none");
      expect(opts.secure).toBe(true);
    });
  });

  it("uses SameSite=None when X-Forwarded-Proto is https (Cloudflare proxy)", () => {
    withoutPublicAppUrl(() => {
      const opts = getSessionCookieOptions(
        mockReq({
          hostname: "www.thesmartpro.io",
          protocol: "http", // raw protocol from Cloud Run is http
          headers: { "x-forwarded-proto": "https" } as any,
        }),
        { crossSite: true }
      );
      expect(opts.sameSite).toBe("none");
      expect(opts.secure).toBe(true);
    });
  });
});
