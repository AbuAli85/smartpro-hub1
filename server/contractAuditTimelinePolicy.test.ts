import { describe, expect, it } from "vitest";
import { canIncludeContractSignatureAuditInTimeline } from "./contractAuditTimelinePolicy";

describe("canIncludeContractSignatureAuditInTimeline", () => {
  const platformUser = { role: "admin" as const, platformRole: "super_admin" as const };

  it("allows platform admins regardless of membership role", () => {
    expect(canIncludeContractSignatureAuditInTimeline(platformUser, null)).toBe(true);
    expect(canIncludeContractSignatureAuditInTimeline(platformUser, "company_member")).toBe(true);
  });

  it("allows leadership and auditor roles", () => {
    const u = { role: "user" as const, platformRole: "company_admin" as const };
    expect(canIncludeContractSignatureAuditInTimeline(u, "company_admin")).toBe(true);
    expect(canIncludeContractSignatureAuditInTimeline(u, "hr_admin")).toBe(true);
    expect(canIncludeContractSignatureAuditInTimeline(u, "finance_admin")).toBe(true);
    expect(canIncludeContractSignatureAuditInTimeline(u, "reviewer")).toBe(true);
    expect(canIncludeContractSignatureAuditInTimeline(u, "external_auditor")).toBe(true);
  });

  it("denies company_member", () => {
    const u = { role: "user" as const, platformRole: "company_member" as const };
    expect(canIncludeContractSignatureAuditInTimeline(u, "company_member")).toBe(false);
  });
});
