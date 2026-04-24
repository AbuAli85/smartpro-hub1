import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SESSION_EXPIRY_MS } from "@shared/const";

vi.mock("./env", () => ({
  ENV: {
    cookieSecret: "test-secret-at-least-16-chars-ok",
    appId: "test-app-id",
    oAuthServerUrl: "",
  },
}));

// Prevent db connection attempts during module load.
vi.mock("../db", () => ({
  getUserByOpenId: vi.fn(),
  upsertUser: vi.fn(),
  getActivePlatformRoleSlugsForUser: vi.fn(),
}));

// Import after mocks are hoisted so the SDKServer singleton is constructed with the test secret.
const { sdk } = await import("./sdk");

const TEST_PAYLOAD = { openId: "user-abc", appId: "test-app", name: "Alice" };

describe("signSession default expiry", () => {
  it("uses SESSION_EXPIRY_MS (8 hours) when no expiresInMs is supplied", async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await sdk.signSession(TEST_PAYLOAD);

    const [, payloadB64] = token.split(".");
    const { exp } = JSON.parse(Buffer.from(payloadB64, "base64url").toString()) as { exp: number };

    const expectedExpMin = before + Math.floor(SESSION_EXPIRY_MS / 1000) - 5;
    const expectedExpMax = before + Math.floor(SESSION_EXPIRY_MS / 1000) + 5;

    expect(exp).toBeGreaterThanOrEqual(expectedExpMin);
    expect(exp).toBeLessThanOrEqual(expectedExpMax);
  });

  it("respects an explicit expiresInMs when provided", async () => {
    const ONE_HOUR_MS = 60 * 60 * 1000;
    const before = Math.floor(Date.now() / 1000);
    const token = await sdk.signSession(TEST_PAYLOAD, { expiresInMs: ONE_HOUR_MS });

    const [, payloadB64] = token.split(".");
    const { exp } = JSON.parse(Buffer.from(payloadB64, "base64url").toString()) as { exp: number };

    const expectedExpMin = before + Math.floor(ONE_HOUR_MS / 1000) - 5;
    const expectedExpMax = before + Math.floor(ONE_HOUR_MS / 1000) + 5;

    expect(exp).toBeGreaterThanOrEqual(expectedExpMin);
    expect(exp).toBeLessThanOrEqual(expectedExpMax);
  });
});

describe("verifySession logging", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("warns on invalid signature and does not include the raw token in the log", async () => {
    const valid = await sdk.signSession(TEST_PAYLOAD);
    const [header, body] = valid.split(".");
    const tampered = `${header}.${body}.invalidsignatureXXXXXX`;

    const result = await sdk.verifySession(tampered);

    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalledOnce();
    const [logMsg] = vi.mocked(console.warn).mock.calls[0] as [string];
    expect(logMsg).toContain("[Auth]");
    // Must not leak the full token
    expect(logMsg).not.toContain(tampered);
    // Must not leak the body (contains user claims)
    expect(logMsg).not.toContain(body);
  });

  it("does NOT warn for an expired token (normal session lifecycle)", async () => {
    // expiresInMs of -1000 puts exp in the past → ERR_JWT_EXPIRED
    const expired = await sdk.signSession(TEST_PAYLOAD, { expiresInMs: -1000 });

    const result = await sdk.verifySession(expired);

    expect(result).toBeNull();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("returns null silently for missing/empty cookie without logging", async () => {
    expect(await sdk.verifySession(null)).toBeNull();
    expect(await sdk.verifySession(undefined)).toBeNull();
    expect(await sdk.verifySession("")).toBeNull();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("warns on a completely malformed (non-JWT) string and does not log full token body", async () => {
    // Use a string long enough that slice(0,16) does not capture the sensitive body portion.
    const malformed = "not-a-jwt.but-this-is-a-long-malformed-token-body-with-claims.fakeSignature";

    const result = await sdk.verifySession(malformed);

    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalledOnce();
    const [logMsg] = vi.mocked(console.warn).mock.calls[0] as [string];
    expect(logMsg).toContain("[Auth]");
    // The body segment (claims) must not appear in the log
    const body = malformed.split(".")[1];
    expect(logMsg).not.toContain(body);
  });
});
