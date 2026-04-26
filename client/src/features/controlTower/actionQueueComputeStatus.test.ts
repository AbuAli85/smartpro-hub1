import { describe, expect, it } from "vitest";
import { computeQueueScopeEnabled, computeActionQueueStatus } from "./actionQueueComputeStatus";

describe("computeQueueScopeEnabled", () => {
  it("platform operator + active company → scope active", () => {
    // platformOp is no longer part of the gate; any hook-enabled + company pair is active
    expect(computeQueueScopeEnabled(true, 1)).toBe(true);
  });

  it("no active company → scope inactive", () => {
    expect(computeQueueScopeEnabled(true, null)).toBe(false);
  });

  it("no active company (undefined) → scope inactive", () => {
    expect(computeQueueScopeEnabled(true, undefined)).toBe(false);
  });

  it("non-platform user + active company → scope active", () => {
    expect(computeQueueScopeEnabled(true, 42)).toBe(true);
  });

  it("hook disabled + active company → scope inactive", () => {
    expect(computeQueueScopeEnabled(false, 42)).toBe(false);
  });
});

describe("computeActionQueueStatus", () => {
  it("returns error when both sources failed", () => {
    expect(computeActionQueueStatus({ queueError: true, pulseError: true, items: [] })).toBe("error");
  });

  it("returns partial when only one source failed", () => {
    expect(computeActionQueueStatus({ queueError: true, pulseError: false, items: [] })).toBe("partial");
    expect(computeActionQueueStatus({ queueError: false, pulseError: true, items: [] })).toBe("partial");
  });

  it("returns all_clear when sources ok and no items", () => {
    expect(computeActionQueueStatus({ queueError: false, pulseError: false, items: [] })).toBe("all_clear");
  });

  it("returns no_urgent_blockers when only low items present", () => {
    const items = [{ blocking: false, severity: "low" }] as Parameters<typeof computeActionQueueStatus>[0]["items"];
    expect(computeActionQueueStatus({ queueError: false, pulseError: false, items })).toBe("no_urgent_blockers");
  });

  it("returns ready when urgent items are present", () => {
    const items = [{ blocking: false, severity: "high" }] as Parameters<typeof computeActionQueueStatus>[0]["items"];
    expect(computeActionQueueStatus({ queueError: false, pulseError: false, items })).toBe("ready");
  });
});
