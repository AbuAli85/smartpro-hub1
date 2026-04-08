import { describe, expect, it, vi } from "vitest";
import {
  evaluateActivationServerGate,
  inviteIsExpired,
  isSanadInviteOnboardingChannelOpen,
  SANAD_INVITE_PEEK_NOT_FOUND_MESSAGE,
} from "./activation";
import { insertSanadIntelAuditEvent, SANAD_INTEL_AUDIT_COMPANY_ID } from "./sanadIntelAudit";

describe("SANAD invite lifecycle helpers", () => {
  it("exposes a stable public NOT_FOUND message for peek", () => {
    expect(SANAD_INVITE_PEEK_NOT_FOUND_MESSAGE.length).toBeGreaterThan(5);
  });

  it("treats missing expiry as expired for public safety", () => {
    expect(inviteIsExpired(null)).toBe(true);
    expect(inviteIsExpired(undefined)).toBe(true);
  });

  it("isSanadInviteOnboardingChannelOpen is false when office linked or activated", () => {
    expect(
      isSanadInviteOnboardingChannelOpen({
        inviteExpiresAt: new Date(Date.now() + 86400000),
        linkedSanadOfficeId: 9,
        activatedAt: null,
      }),
    ).toBe(false);
    expect(
      isSanadInviteOnboardingChannelOpen({
        inviteExpiresAt: new Date(Date.now() + 86400000),
        linkedSanadOfficeId: null,
        activatedAt: new Date(),
      }),
    ).toBe(false);
    expect(
      isSanadInviteOnboardingChannelOpen({
        inviteExpiresAt: new Date(Date.now() + 86400000),
        linkedSanadOfficeId: null,
        activatedAt: null,
      }),
    ).toBe(true);
  });
});

describe("evaluateActivationServerGate", () => {
  it("requires compliance rows seeded", () => {
    const r = evaluateActivationServerGate({
      centerName: "Centre",
      complianceItemsTotal: 0,
      linkedSanadOfficeId: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("PRECONDITION_FAILED");
  });

  it("blocks duplicate office link", () => {
    const r = evaluateActivationServerGate({
      centerName: "Centre",
      complianceItemsTotal: 3,
      linkedSanadOfficeId: 42,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("BAD_REQUEST");
  });

  it("requires centre name", () => {
    const r = evaluateActivationServerGate({
      centerName: "  ",
      complianceItemsTotal: 2,
      linkedSanadOfficeId: null,
    });
    expect(r.ok).toBe(false);
  });

  it("passes when conservative preconditions are met", () => {
    expect(
      evaluateActivationServerGate({
        centerName: "Valid",
        complianceItemsTotal: 1,
        linkedSanadOfficeId: null,
      }).ok,
    ).toBe(true);
  });
});

describe("insertSanadIntelAuditEvent", () => {
  it("writes companyId 0 and optional before/after snapshots", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const db = {
      insert: vi.fn(() => ({ values })),
    };
    await insertSanadIntelAuditEvent(db as never, {
      actorUserId: 1,
      entityType: "sanad_intel_center",
      entityId: 7,
      action: "sanad_intel_test",
      beforeState: { a: 1 },
      afterState: { b: 2 },
    });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: SANAD_INTEL_AUDIT_COMPANY_ID,
        beforeState: { a: 1 },
        afterState: { b: 2 },
      }),
    );
  });
});
