import { describe, it, expect } from "vitest";
import { hasReportPermission } from "./reportPermissions";

describe("hasReportPermission", () => {
  it("returns true when key is in array", () => {
    expect(hasReportPermission(["view_reports"], "view_reports")).toBe(true);
  });

  it("returns false for empty array", () => {
    expect(hasReportPermission([], "view_reports")).toBe(false);
  });

  it("returns false for null", () => {
    expect(hasReportPermission(null, "view_reports")).toBe(false);
  });
});
