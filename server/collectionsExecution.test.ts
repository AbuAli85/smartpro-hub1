import { describe, expect, it } from "vitest";
import { collectionPriorityScore } from "./collectionsExecution";

describe("collectionPriorityScore", () => {
  it("ranks disputed above needs_follow_up for same amount and age", () => {
    expect(collectionPriorityScore(1000, 10, "disputed")).toBeGreaterThan(
      collectionPriorityScore(1000, 10, "needs_follow_up"),
    );
  });

  it("ranks higher amount and older age higher than small recent items", () => {
    expect(collectionPriorityScore(100, 90, "needs_follow_up")).toBeGreaterThan(
      collectionPriorityScore(50, 10, "needs_follow_up"),
    );
  });

  it("returns -1 for resolved so they sort out of active work", () => {
    expect(collectionPriorityScore(9999, 999, "resolved")).toBe(-1);
  });
});
