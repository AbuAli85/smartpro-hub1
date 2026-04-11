import { describe, expect, it } from "vitest";
import {
  EMPLOYEE_PORTAL_TAB_IDS,
  parseEmployeePortalTabFromSearch,
} from "./employeePortalDeepLink";

describe("parseEmployeePortalTabFromSearch", () => {
  it("returns null when tab missing or unknown", () => {
    expect(parseEmployeePortalTabFromSearch("")).toBeNull();
    expect(parseEmployeePortalTabFromSearch("?tab=unknown")).toBeNull();
  });

  it("parses tab with or without leading ?", () => {
    expect(parseEmployeePortalTabFromSearch("?tab=profile")).toBe("profile");
    expect(parseEmployeePortalTabFromSearch("tab=profile&x=1")).toBe("profile");
  });

  it("normalizes case", () => {
    expect(parseEmployeePortalTabFromSearch("?tab=PROFILE")).toBe("profile");
  });

  it("EMPLOYEE_PORTAL_TAB_IDS includes profile", () => {
    expect(EMPLOYEE_PORTAL_TAB_IDS).toContain("profile");
  });
});
