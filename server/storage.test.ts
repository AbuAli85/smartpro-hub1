import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./_core/env", () => ({
  ENV: {
    forgeApiUrl: "https://forge.test/",
    forgeApiKey: "test-key",
  },
}));

import { fileUrlMatchesConfiguredStorage, storageGet } from "./storage";

describe("fileUrlMatchesConfiguredStorage", () => {
  it("allows any URL when forge base is unset or blank", () => {
    expect(fileUrlMatchesConfiguredStorage("https://evil.com/x", undefined)).toBe(true);
    expect(fileUrlMatchesConfiguredStorage("https://evil.com/x", "")).toBe(true);
    expect(fileUrlMatchesConfiguredStorage("https://evil.com/x", "   ")).toBe(true);
  });

  it("requires file URL origin to match forge API origin", () => {
    expect(
      fileUrlMatchesConfiguredStorage("https://storage.example.com/v1/a", "https://storage.example.com/"),
    ).toBe(true);
    expect(
      fileUrlMatchesConfiguredStorage("https://storage.example.com/v1/a", "https://storage.example.com"),
    ).toBe(true);
    expect(
      fileUrlMatchesConfiguredStorage("https://evil.com/v1/a", "https://storage.example.com/"),
    ).toBe(false);
  });

  it("returns false for malformed URLs when forge is set", () => {
    expect(fileUrlMatchesConfiguredStorage("not-a-url", "https://storage.example.com/")).toBe(false);
  });
});

describe("storageGet", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ url: "https://signed.example/file" }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests a signed download URL for the normalized object key", async () => {
    const result = await storageGet("/tenant/doc.pdf");
    const fetchMock = vi.mocked(globalThis.fetch);
    const firstUrl = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(firstUrl).toContain("v1/storage/downloadUrl");
    expect(firstUrl).toContain("path=");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      headers: { Authorization: "Bearer test-key" },
    });
    expect(result.key).toBe("tenant/doc.pdf");
    expect(result.url).toBe("https://signed.example/file");
  });
});
