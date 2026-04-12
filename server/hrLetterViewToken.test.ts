import { describe, expect, it, vi, afterEach } from "vitest";

describe("hrLetterViewToken", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("round-trips letter id", async () => {
    vi.stubEnv("JWT_SECRET", "unit-test-secret-at-least-16-chars");
    vi.resetModules();
    const { signHRLetterViewToken, verifyHRLetterViewToken } = await import("./hrLetterViewToken");
    const token = await signHRLetterViewToken(42);
    expect(token).toBeTruthy();
    const id = await verifyHRLetterViewToken(token!);
    expect(id).toBe(42);
  });

  it("rejects tampered token", async () => {
    vi.stubEnv("JWT_SECRET", "unit-test-secret-at-least-16-chars");
    vi.resetModules();
    const { signHRLetterViewToken, verifyHRLetterViewToken } = await import("./hrLetterViewToken");
    const token = await signHRLetterViewToken(1);
    const id = await verifyHRLetterViewToken(`${token}x`);
    expect(id).toBeNull();
  });
});
