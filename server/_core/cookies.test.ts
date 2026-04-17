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

describe("getSessionCookieOptions domain", () => {
  it("maps www host to apex registrable Domain so apex and www share session", () => {
    const opts = getSessionCookieOptions(mockReq({ hostname: "www.thesmartpro.io" }));
    expect(opts.domain).toBe(".thesmartpro.io");
  });

  it("uses dotted apex for bare registrable host", () => {
    const opts = getSessionCookieOptions(mockReq({ hostname: "thesmartpro.io" }));
    expect(opts.domain).toBe(".thesmartpro.io");
  });

  it("does not set Domain on localhost", () => {
    const opts = getSessionCookieOptions(mockReq({ hostname: "localhost", protocol: "http" }));
    expect(opts.domain).toBeUndefined();
  });
});

describe("getSessionCookieOptions SameSite", () => {
  it("defaults to SameSite=Lax for same-site requests (e.g. logout, MFA)", () => {
    const opts = getSessionCookieOptions(mockReq({ hostname: "www.thesmartpro.io" }));
    expect(opts.sameSite).toBe("lax");
  });

  it("uses SameSite=None; Secure for cross-site OAuth callbacks on HTTPS", () => {
    const opts = getSessionCookieOptions(
      mockReq({ hostname: "www.thesmartpro.io", protocol: "https" }),
      { crossSite: true }
    );
    expect(opts.sameSite).toBe("none");
    expect(opts.secure).toBe(true);
  });

  it("falls back to SameSite=Lax when crossSite=true but request is HTTP (local dev)", () => {
    const opts = getSessionCookieOptions(
      mockReq({ hostname: "localhost", protocol: "http" }),
      { crossSite: true }
    );
    // SameSite=None requires Secure; on plain HTTP we must fall back to Lax
    expect(opts.sameSite).toBe("lax");
    expect(opts.secure).toBe(false);
  });

  it("uses SameSite=None when X-Forwarded-Proto is https (Cloudflare proxy)", () => {
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
