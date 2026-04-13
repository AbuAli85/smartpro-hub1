import { describe, it, expect } from "vitest";
import { PLATFORM_NAV_GROUP_DEFS } from "./platformNav";
import { assertPlatformNavIntegrity, validatePlatformNavMetadata } from "./platformNavIntegrity";

describe("platform nav integrity (CI guard)", () => {
  it("has valid metadata: intents, hrefs, hubPrimary rules, no duplicate hrefs", () => {
    const issues = validatePlatformNavMetadata(PLATFORM_NAV_GROUP_DEFS);
    expect(issues, issues.join("\n")).toEqual([]);
    expect(() => assertPlatformNavIntegrity(PLATFORM_NAV_GROUP_DEFS)).not.toThrow();
  });
});
