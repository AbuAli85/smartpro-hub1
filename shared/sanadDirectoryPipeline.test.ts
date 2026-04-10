import { describe, expect, it } from "vitest";
import { parseSanadDirectoryPipeline, SANAD_DIRECTORY_PIPELINE_FILTERS } from "./sanadDirectoryPipeline";

describe("parseSanadDirectoryPipeline", () => {
  it("accepts known presets", () => {
    for (const p of SANAD_DIRECTORY_PIPELINE_FILTERS) {
      expect(parseSanadDirectoryPipeline(p)).toBe(p);
    }
  });

  it("rejects unknown values", () => {
    expect(parseSanadDirectoryPipeline("not_a_preset")).toBeUndefined();
    expect(parseSanadDirectoryPipeline(null)).toBeUndefined();
  });
});
