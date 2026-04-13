import { describe, it, expect } from "vitest";
import { assertHubBreadcrumbCoverage, validateHubBreadcrumbCoverage } from "./hubBreadcrumbCoverage";

describe("hub breadcrumb coverage (CI guard)", () => {
  it("key hub child pages import hubCrumbs and use the expected trail helper", () => {
    const issues = validateHubBreadcrumbCoverage();
    expect(issues, issues.join("\n")).toEqual([]);
    expect(() => assertHubBreadcrumbCoverage()).not.toThrow();
  });
});
