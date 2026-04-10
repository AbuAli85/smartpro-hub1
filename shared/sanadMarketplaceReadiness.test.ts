import { describe, expect, it } from "vitest";
import { computeSanadMarketplaceReadiness } from "./sanadMarketplaceReadiness";

describe("computeSanadMarketplaceReadiness", () => {
  it("requires active office, listing, contact, location, name, and catalogue", () => {
    const office = {
      name: "  Test  ",
      status: "active" as const,
      isPublicListed: 1 as const,
      phone: "+968",
      governorate: "Muscat",
      city: null,
    };
    expect(computeSanadMarketplaceReadiness(office, 1).ready).toBe(true);
  });

  it("fails when catalogue empty", () => {
    const office = {
      name: "X",
      status: "active" as const,
      isPublicListed: 1 as const,
      phone: "1",
      governorate: "A",
    };
    const r = computeSanadMarketplaceReadiness(office, 0);
    expect(r.ready).toBe(false);
    expect(r.reasons.some((x) => x.includes("catalogue"))).toBe(true);
  });
});
