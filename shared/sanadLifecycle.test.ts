import { describe, expect, it } from "vitest";
import {
  compareSanadLifecycleStage,
  recommendedSanadPartnerNextActions,
  resolveSanadLifecycleStage,
  type SanadLifecycleOpsInput,
  type SanadLifecycleOfficeInput,
} from "./sanadLifecycle";

const baseOps = (): SanadLifecycleOpsInput => ({
  partnerStatus: "unknown",
  onboardingStatus: "not_started",
  complianceOverall: "not_assessed",
});

const baseOffice = (): NonNullable<SanadLifecycleOfficeInput> => ({
  name: "Test Office",
  status: "active",
  isPublicListed: 0,
  avgRating: "0",
  totalReviews: 0,
  isVerified: 0,
});

describe("resolveSanadLifecycleStage", () => {
  it("returns registry for bare imported row", () => {
    expect(resolveSanadLifecycleStage(baseOps(), null)).toBe("registry");
  });

  it("returns contacted when lastContactedAt set", () => {
    expect(
      resolveSanadLifecycleStage(
        { ...baseOps(), lastContactedAt: new Date() },
        null,
      ),
    ).toBe("contacted");
  });

  it("returns prospect when classified", () => {
    expect(resolveSanadLifecycleStage({ ...baseOps(), partnerStatus: "prospect" }, null)).toBe(
      "prospect",
    );
  });

  it("returns invited when invite sent", () => {
    expect(
      resolveSanadLifecycleStage(
        {
          ...baseOps(),
          inviteSentAt: new Date(),
          inviteExpiresAt: new Date(Date.now() + 86400000),
          inviteToken: "abc",
        },
        null,
      ),
    ).toBe("invited");
  });

  it("returns compliance_in_progress when user linked and onboarding underway", () => {
    expect(
      resolveSanadLifecycleStage(
        {
          ...baseOps(),
          partnerStatus: "prospect",
          onboardingStatus: "intake",
          registeredUserId: 42,
        },
        null,
      ),
    ).toBe("compliance_in_progress");
  });

  it("returns account_linked when user linked before intake stages fire", () => {
    expect(
      resolveSanadLifecycleStage(
        {
          ...baseOps(),
          onboardingStatus: "not_started",
          registeredUserId: 42,
        },
        null,
      ),
    ).toBe("account_linked");
  });

  it("returns activated_office when linked id present", () => {
    const office = baseOffice();
    expect(
      resolveSanadLifecycleStage(
        {
          ...baseOps(),
          registeredUserId: 1,
          onboardingStatus: "licensing_review",
          linkedSanadOfficeId: 9,
        },
        office,
      ),
    ).toBe("activated_office");
  });

  it("returns public_listed when marketplace flag on", () => {
    const office = { ...baseOffice(), isPublicListed: 1 };
    expect(
      resolveSanadLifecycleStage(
        {
          ...baseOps(),
          linkedSanadOfficeId: 9,
          registeredUserId: 1,
          onboardingStatus: "licensed",
        },
        office,
      ),
    ).toBe("public_listed");
  });

  it("returns live_partner when listed and strong signal", () => {
    const office = { ...baseOffice(), isPublicListed: 1, totalReviews: 3 };
    expect(
      resolveSanadLifecycleStage(
        {
          ...baseOps(),
          linkedSanadOfficeId: 9,
          registeredUserId: 1,
          onboardingStatus: "licensed",
        },
        office,
        { activeCatalogueCount: 0 },
      ),
    ).toBe("live_partner");
  });
});

describe("compareSanadLifecycleStage", () => {
  it("orders stages monotonically", () => {
    expect(compareSanadLifecycleStage("registry", "live_partner")).toBeLessThan(0);
    expect(compareSanadLifecycleStage("live_partner", "registry")).toBeGreaterThan(0);
  });
});

describe("recommendedSanadPartnerNextActions", () => {
  it("includes marketplace reasons and dedupes", () => {
    const out = recommendedSanadPartnerNextActions(
      "activated_office",
      ["Complete compliance"],
      ["Office is not marked public-listed."],
    );
    expect(out.some((s) => s.includes("Marketplace"))).toBe(true);
    expect(out).toContain("Complete compliance");
    expect(out.length).toBeLessThanOrEqual(18);
  });
});
