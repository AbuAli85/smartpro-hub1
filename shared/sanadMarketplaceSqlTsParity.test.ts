import { describe, expect, it } from "vitest";
import { computeSanadMarketplaceReadiness } from "./sanadMarketplaceReadiness";
import type { SanadLifecycleOfficeInput } from "./sanadLifecycle";

type ListingOffice = {
  status: string;
  isPublicListed: number | boolean | string;
  phone: string | null;
  governorate: string | null;
  city: string | null;
  name: string | null;
  nameAr?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  avgRating?: string | number | null;
  languages?: string | null;
  services?: unknown;
};

function toLifecycleInput(o: ListingOffice): SanadLifecycleOfficeInput {
  return {
    name: o.name,
    description: o.description ?? null,
    phone: o.phone,
    governorate: o.governorate,
    city: o.city,
    languages: o.languages ?? null,
    logoUrl: null,
    status: o.status,
    isPublicListed: o.isPublicListed as SanadLifecycleOfficeInput["isPublicListed"],
    avgRating: o.avgRating ?? null,
    totalReviews: null,
    isVerified: null,
  };
}

/**
 * Mirrors `server/routers/sanad.ts` → `listPublicProviders` core eligibility when
 * `marketplaceReadyOnly !== false` and `publicListedOnly !== false`, without optional filters.
 */
function strictMarketplaceDiscoveryEligibleSqlParity(office: ListingOffice, activeCatalogueCount: number): boolean {
  if (office.status !== "active") return false;
  const listed =
    office.isPublicListed === 1 ||
    office.isPublicListed === true ||
    String(office.isPublicListed) === "1";
  if (!listed) return false;
  if (!String(office.phone ?? "").trim()) return false;
  if (!String(office.governorate ?? "").trim() && !String(office.city ?? "").trim()) return false;
  if (!String(office.name ?? "").trim()) return false;
  if (activeCatalogueCount < 1) return false;
  return true;
}

/** Optional filters from `listPublicProviders` (same semantics as the Drizzle query). */
function officeMatchesPublicProviderFilters(
  office: ListingOffice,
  input: {
    governorate?: string;
    wilayat?: string;
    serviceType?: string;
    language?: string;
    minRating?: number;
    search?: string;
  },
): boolean {
  if (input.governorate?.trim() && office.governorate !== input.governorate.trim()) return false;
  if (input.wilayat?.trim() && office.city !== input.wilayat.trim()) return false;
  if (input.serviceType) {
    let ok = false;
    try {
      const services = office.services as string[] | undefined;
      if (Array.isArray(services)) ok = services.includes(input.serviceType);
    } catch {
      ok = false;
    }
    if (!ok) return false;
  }
  if (input.language?.trim()) {
    const needle = input.language.trim();
    const hay = String(office.languages ?? "");
    if (!hay.includes(needle)) return false;
  }
  if (input.minRating != null) {
    const r = typeof office.avgRating === "number" ? office.avgRating : parseFloat(String(office.avgRating ?? "0"));
    if (!(Number.isFinite(r) && r >= input.minRating)) return false;
  }
  if (input.search?.trim()) {
    const q = input.search.trim().toLowerCase();
    const blobs = [office.name, office.nameAr, office.city, office.governorate, office.description, office.descriptionAr].map((s) =>
      String(s ?? "").toLowerCase(),
    );
    if (!blobs.some((b) => b.includes(q))) return false;
  }
  return true;
}

describe("SANAD marketplace readiness vs listPublicProviders SQL parity", () => {
  const fixtures: { office: ListingOffice; activeN: number; label: string }[] = [
    {
      label: "golden path",
      office: {
        status: "active",
        isPublicListed: 1,
        phone: "+968",
        governorate: "Muscat",
        city: null,
        name: "Office",
      },
      activeN: 1,
    },
    {
      label: "not listed",
      office: {
        status: "active",
        isPublicListed: 0,
        phone: "1",
        governorate: "A",
        name: "X",
      },
      activeN: 3,
    },
    {
      label: "inactive status",
      office: {
        status: "inactive",
        isPublicListed: 1,
        phone: "1",
        governorate: "A",
        name: "X",
      },
      activeN: 1,
    },
    {
      label: "whitespace phone",
      office: {
        status: "active",
        isPublicListed: 1,
        phone: "   ",
        governorate: "A",
        name: "X",
      },
      activeN: 1,
    },
    {
      label: "city only location",
      office: {
        status: "active",
        isPublicListed: 1,
        phone: "9",
        governorate: "",
        city: "Salalah",
        name: "South",
      },
      activeN: 2,
    },
    {
      label: "no location",
      office: {
        status: "active",
        isPublicListed: 1,
        phone: "9",
        governorate: "  ",
        city: null,
        name: "X",
      },
      activeN: 1,
    },
    {
      label: "empty display name",
      office: {
        status: "active",
        isPublicListed: 1,
        phone: "9",
        governorate: "A",
        name: " \t ",
      },
      activeN: 1,
    },
    {
      label: "no catalogue",
      office: {
        status: "active",
        isPublicListed: 1,
        phone: "9",
        governorate: "A",
        name: "X",
      },
      activeN: 0,
    },
    {
      label: "string listed flag",
      office: {
        status: "active",
        isPublicListed: "1",
        phone: "1",
        governorate: "A",
        name: "X",
      },
      activeN: 1,
    },
  ];

  it("strict SQL-parity gate matches computeSanadMarketplaceReadiness.ready for fixture grid", () => {
    for (const f of fixtures) {
      const sql = strictMarketplaceDiscoveryEligibleSqlParity(f.office, f.activeN);
      const ts = computeSanadMarketplaceReadiness(toLifecycleInput(f.office), f.activeN).ready;
      expect(ts, f.label).toBe(sql);
    }
  });

  it("optional public filters align with router semantics (governorate / wilayat / rating / search)", () => {
    const office: ListingOffice = {
      status: "active",
      isPublicListed: 1,
      phone: "1",
      governorate: "Muscat",
      city: "Matrah",
      name: "Typing Plus",
      nameAr: "بلس",
      avgRating: "4.5",
      languages: "ar,en",
      services: ["residence_visa"],
    };
    expect(officeMatchesPublicProviderFilters(office, { governorate: "Muscat" })).toBe(true);
    expect(officeMatchesPublicProviderFilters(office, { governorate: "Dhofar" })).toBe(false);
    expect(officeMatchesPublicProviderFilters(office, { wilayat: "Matrah" })).toBe(true);
    expect(officeMatchesPublicProviderFilters(office, { wilayat: "Other" })).toBe(false);
    expect(officeMatchesPublicProviderFilters(office, { minRating: 4 })).toBe(true);
    expect(officeMatchesPublicProviderFilters(office, { minRating: 5 })).toBe(false);
    expect(officeMatchesPublicProviderFilters(office, { language: "ar" })).toBe(true);
    expect(officeMatchesPublicProviderFilters(office, { language: "fr" })).toBe(false);
    expect(officeMatchesPublicProviderFilters(office, { serviceType: "residence_visa" })).toBe(true);
    expect(officeMatchesPublicProviderFilters(office, { serviceType: "exit_reentry" })).toBe(false);
    expect(officeMatchesPublicProviderFilters(office, { search: "Plus" })).toBe(true);
    expect(officeMatchesPublicProviderFilters(office, { search: "no-match-xyz" })).toBe(false);
  });
});
