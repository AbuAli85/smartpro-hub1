import { describe, expect, it } from "vitest";
import { isPortalClientWorkspaceShellPath, isPortalPreCompanyMinimalPath } from "./clientWorkspaceChrome";

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

describe("isPortalClientWorkspaceShellPath", () => {
  it("matches /client and nested routes only", () => {
    expect(isPortalClientWorkspaceShellPath("/client")).toBe(true);
    expect(isPortalClientWorkspaceShellPath("/client/engagements")).toBe(true);
    expect(isPortalClientWorkspaceShellPath("/client?welcome=1")).toBe(true);
  });

  it("does not match create flow or unrelated paths", () => {
    expect(isPortalClientWorkspaceShellPath("/company/create")).toBe(false);
    expect(isPortalClientWorkspaceShellPath("/dashboard")).toBe(false);
    expect(isPortalClientWorkspaceShellPath("/client-portal")).toBe(false);
  });
});
