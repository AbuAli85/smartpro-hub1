import { describe, expect, it } from "vitest";
import { isPortalPreCompanyMinimalPath } from "./clientWorkspaceChrome";

describe("isPortalPreCompanyMinimalPath", () => {
  it("matches /client and nested client routes", () => {
    expect(isPortalPreCompanyMinimalPath("/client")).toBe(true);
    expect(isPortalPreCompanyMinimalPath("/client/engagements")).toBe(true);
    expect(isPortalPreCompanyMinimalPath("/client/engagements/12")).toBe(true);
    expect(isPortalPreCompanyMinimalPath("/client?x=1")).toBe(true);
  });

  it("matches company create flow", () => {
    expect(isPortalPreCompanyMinimalPath("/company/create")).toBe(true);
    expect(isPortalPreCompanyMinimalPath("/company/create?return=%2Fclient")).toBe(true);
  });

  it("does not match unrelated paths", () => {
    expect(isPortalPreCompanyMinimalPath("/dashboard")).toBe(false);
    expect(isPortalPreCompanyMinimalPath("/preferences")).toBe(false);
    expect(isPortalPreCompanyMinimalPath("/company/team-access")).toBe(false);
    expect(isPortalPreCompanyMinimalPath("/client-portal")).toBe(false);
  });
});
