import { describe, it, expect } from "vitest";
import { CLIENT_PORTAL_SHELL_GROUP_DEFS, PLATFORM_NAV_GROUP_DEFS } from "./platformNav";
import { assertPlatformNavIntegrity, validatePlatformNavMetadata } from "./platformNavIntegrity";

describe("platform nav integrity (CI guard)", () => {
  it("has valid metadata: intents, hrefs, hubPrimary rules, no duplicate hrefs", () => {
    const issues = validatePlatformNavMetadata(PLATFORM_NAV_GROUP_DEFS);
    expect(issues, issues.join("\n")).toEqual([]);
    expect(() => assertPlatformNavIntegrity(PLATFORM_NAV_GROUP_DEFS)).not.toThrow();
  });

  it("client portal shell nav metadata is valid", () => {
    const issues = validatePlatformNavMetadata(CLIENT_PORTAL_SHELL_GROUP_DEFS);
    expect(issues, issues.join("\n")).toEqual([]);
    expect(() => assertPlatformNavIntegrity(CLIENT_PORTAL_SHELL_GROUP_DEFS)).not.toThrow();
  });
});
