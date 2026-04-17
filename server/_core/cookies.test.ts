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
