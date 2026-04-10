import { describe, expect, it } from "vitest";
import {
  listSanadIntelOfficeIntegrityWarnings,
  validateEnablePublicListing,
  validateGenerateCenterInvite,
  validateLinkSanadInviteToAccount,
} from "./sanadLifecycleTransitions";

describe("validateGenerateCenterInvite", () => {
  it("blocks when office already linked", () => {
    const r = validateGenerateCenterInvite({ linkedSanadOfficeId: 9 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("FORBIDDEN");
  });

  it("allows when no linked office", () => {
    expect(validateGenerateCenterInvite({ linkedSanadOfficeId: null }).ok).toBe(true);
  });
});

describe("validateLinkSanadInviteToAccount", () => {
  it("requires lead capture first", () => {
    const r = validateLinkSanadInviteToAccount({}, false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("BAD_REQUEST");
  });

  it("allows when inviteAcceptAt present", () => {
    expect(validateLinkSanadInviteToAccount({ inviteAcceptAt: new Date() }, false).ok).toBe(true);
  });
});

describe("validateEnablePublicListing", () => {
  it("blocks when catalogue empty", () => {
    const office = {
      name: "X",
      status: "active" as const,
      phone: "1",
      governorate: "M",
      isPublicListed: 0,
    };
    const r = validateEnablePublicListing(office, 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("PRECONDITION_FAILED");
  });

  it("allows when go-live bar met", () => {
    const office = {
      name: "X",
      status: "active" as const,
      phone: "1",
      governorate: "M",
      isPublicListed: 0,
    };
    expect(validateEnablePublicListing(office, 1).ok).toBe(true);
  });
});

describe("listSanadIntelOfficeIntegrityWarnings", () => {
  it("flags office linked without registered user on intel", () => {
    const w = listSanadIntelOfficeIntegrityWarnings({ linkedSanadOfficeId: 1, registeredUserId: null }, {
      name: "O",
      status: "active",
    });
    expect(w.some((x) => x.includes("registeredUserId"))).toBe(true);
  });

  it("flags registered user without invite accept timestamp", () => {
    const w = listSanadIntelOfficeIntegrityWarnings({ registeredUserId: 99, inviteAcceptAt: null }, null);
    expect(w.some((x) => x.includes("inviteAcceptAt"))).toBe(true);
  });
});
