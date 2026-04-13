import { describe, it, expect } from "vitest";
import { sanitizeRoleNavExtensions, pathMatchesNavExtensionHref } from "./roleNavConfig";

describe("sanitizeRoleNavExtensions", () => {
  it("strips platform-only paths", () => {
    const out = sanitizeRoleNavExtensions({
      company_member: ["/my-portal", "/user-roles", "/platform-ops"],
      hr_admin: ["/hr/employees"],
    });
    expect(out.company_member).toEqual(["/my-portal"]);
    expect(out.hr_admin).toEqual(["/hr/employees"]);
  });

  it("normalizes leading slashes", () => {
    const out = sanitizeRoleNavExtensions({ company_member: ["hr/tasks"] });
    expect(out.company_member).toEqual(["/hr/tasks"]);
  });
});

describe("pathMatchesNavExtensionHref", () => {
  it("matches prefixes", () => {
    expect(pathMatchesNavExtensionHref("/hr/employees/12", ["/hr/employees"])).toBe(true);
    expect(pathMatchesNavExtensionHref("/crm", ["/hr"])).toBe(false);
  });
});
