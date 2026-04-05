import { describe, expect, it } from "vitest";
import {
  buildContractAuditActorLabel,
  projectContractSignatureAuditToUnified,
} from "./unifiedAuditProjectors";
import type { ContractSignatureAudit } from "../drizzle/schema";

const ctx = { companyId: 1, contractTitle: "NDA", contractNumber: "CON-1" };

function row(partial: Partial<ContractSignatureAudit> & Pick<ContractSignatureAudit, "event" | "contractId" | "id">): ContractSignatureAudit {
  return {
    signatureId: null,
    actorName: null,
    actorEmail: null,
    actorUserId: null,
    actorType: "external",
    ipAddress: null,
    userAgent: null,
    notes: null,
    createdAt: new Date("2026-04-01T12:00:00.000Z"),
    ...partial,
  } as ContractSignatureAudit;
}

describe("buildContractAuditActorLabel", () => {
  it("prefers resolved platform user name when actor is user", () => {
    expect(
      buildContractAuditActorLabel(
        { actorType: "user", actorName: "Stale", actorEmail: "a@b.com" },
        "Resolved User",
      ),
    ).toBe("Resolved User");
  });

  it("falls back to name then email for external", () => {
    expect(
      buildContractAuditActorLabel({ actorType: "external", actorName: "Ext", actorEmail: "e@x.com" }, null),
    ).toBe("Ext");
    expect(
      buildContractAuditActorLabel({ actorType: "external", actorName: null, actorEmail: "e@x.com" }, null),
    ).toBe("e@x.com");
  });

  it("uses System label for system actor type", () => {
    expect(buildContractAuditActorLabel({ actorType: "system", actorName: null, actorEmail: null }, null)).toBe(
      "System",
    );
    expect(
      buildContractAuditActorLabel({ actorType: "system", actorName: "Batch job", actorEmail: null }, null),
    ).toBe("Batch job");
  });
});

describe("projectContractSignatureAuditToUnified", () => {
  it("internal user: actorUserId, actorType user, userId aligned, label from resolved name", () => {
    const u = row({
      id: 1,
      contractId: 9,
      event: "signed",
      signatureId: 3,
      actorUserId: 42,
      actorType: "user",
      actorName: "Signer on file",
      actorEmail: "signer@co.com",
    });
    const out = projectContractSignatureAuditToUnified(u, ctx, { resolvedActorDisplayName: "Platform User" });
    expect(out.actorType).toBe("user");
    expect(out.actorUserId).toBe(42);
    expect(out.userId).toBe(42);
    expect(out.actorLabel).toBe("Platform User");
    expect((out.newValues as Record<string, unknown>).actorUserId).toBe(42);
    expect((out.newValues as Record<string, unknown>).actorType).toBe("user");
  });

  it("external signer: no user id, label from stored fields", () => {
    const u = row({
      id: 2,
      contractId: 9,
      event: "signed",
      actorUserId: null,
      actorType: "external",
      actorName: "External Co",
      actorEmail: "legal@vendor.com",
    });
    const out = projectContractSignatureAuditToUnified(u, ctx);
    expect(out.actorType).toBe("external");
    expect(out.actorUserId).toBeNull();
    expect(out.userId).toBeNull();
    expect(out.actorLabel).toBe("External Co");
  });

  it("system completion event", () => {
    const u = row({
      id: 3,
      contractId: 9,
      event: "completed",
      signatureId: null,
      actorUserId: null,
      actorType: "system",
      actorName: null,
      notes: "All parties have signed.",
    });
    const out = projectContractSignatureAuditToUnified(u, ctx);
    expect(out.actorType).toBe("system");
    expect(out.userId).toBeNull();
    expect(out.actorLabel).toBe("System");
  });

  it("legacy-shaped row: external default, label only", () => {
    const u = row({
      id: 4,
      contractId: 9,
      event: "requested",
      actorUserId: null,
      actorType: "external",
      actorName: "Legacy HR",
      actorEmail: null,
    });
    const out = projectContractSignatureAuditToUnified(u, ctx);
    expect(out.actorLabel).toBe("Legacy HR");
    expect(out.userId).toBeNull();
  });
});
