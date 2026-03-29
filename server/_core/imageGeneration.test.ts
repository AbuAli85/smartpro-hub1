import { describe, it, expect, vi, beforeEach } from "vitest";
import * as storageMod from "server/storage";

vi.mock("./env", () => ({
  ENV: {
    forgeApiUrl: "https://example.com/",
    forgeApiKey: "test-key",
  },
}));

vi.mock("server/storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ url: "https://cdn/u", key: "k" }),
}));

import { generateImage } from "./imageGeneration";

describe("generateImage", () => {
  beforeEach(() => {
    vi.mocked(storageMod.storagePut).mockClear();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          image: {
            b64Json: Buffer.from([0, 1, 2, 3]).toString("base64"),
            mimeType: "image/png",
          },
        }),
    }) as typeof fetch;
  });

  it("stores objects under generated/{uuid}.png", async () => {
    await generateImage({ prompt: "test landscape" });
    expect(storageMod.storagePut).toHaveBeenCalledWith(
      expect.stringMatching(
        /^generated\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/i,
      ),
      expect.any(Buffer),
      "image/png",
    );
  });
});
