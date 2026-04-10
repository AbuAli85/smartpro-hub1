import { describe, expect, it } from "vitest";
import {
  listSanadIntelOfficeIntegrityWarnings,
  validateAcceptCenterInvite,
  validateEnablePublicListing,
  validateGenerateCenterInvite,
  validateLinkSanadInviteToAccount,
  validateListedOfficeRemainsDiscoverable,
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

describe("validateAcceptCenterInvite", () => {
  it("blocks when office already linked", () => {
    const r = validateAcceptCenterInvite({ linkedSanadOfficeId: 1 }, false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/no longer accepting/i);
  });

  it("blocks duplicate link when user already linked", () => {
    const r = validateAcceptCenterInvite({}, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("CONFLICT");
  });

  it("allows fresh accept", () => {
    expect(validateAcceptCenterInvite({ linkedSanadOfficeId: null }, false).ok).toBe(true);
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

describe("validateListedOfficeRemainsDiscoverable", () => {
  it("allows when listed and marketplace bar met", () => {
    const office = {
      name: "X",
      status: "active" as const,
      phone: "1",
      governorate: "M",
      isPublicListed: 1,
    };
    expect(validateListedOfficeRemainsDiscoverable(office, 1).ok).toBe(true);
  });

  it("blocks when listed but catalogue would be empty", () => {
    const office = {
      name: "X",
      status: "active" as const,
      phone: "1",
      governorate: "M",
      isPublicListed: 1,
    };
    const r = validateListedOfficeRemainsDiscoverable(office, 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("PRECONDITION_FAILED");
  });

  it("ignores when not public-listed", () => {
    const office = {
      name: "",
      status: "inactive" as const,
      isPublicListed: 0,
    };
    expect(validateListedOfficeRemainsDiscoverable(office, 0).ok).toBe(true);
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
