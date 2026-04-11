import { describe, expect, it } from "vitest";
import { PROFILE_REQUEST_AGE_BUCKET_OPTIONS } from "./profileChangeRequestQueueFilters";

describe("PROFILE_REQUEST_AGE_BUCKET_OPTIONS", () => {
  it("includes any + three age windows", () => {
    expect(PROFILE_REQUEST_AGE_BUCKET_OPTIONS.map((o) => o.value)).toEqual([
      "any",
      "lt_24h",
      "d1_7",
      "gt_7d",
    ]);
  });
});
