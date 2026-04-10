/**
 * Whether an office is eligible for the public SANAD marketplace (discovery-quality bar).
 * Server and client can share this for consistent messaging.
 */

import type { SanadLifecycleOfficeInput } from "./sanadLifecycle";

export type SanadMarketplaceReadiness = {
  ready: boolean;
  reasons: string[];
};

export function computeSanadMarketplaceReadiness(
  office: SanadLifecycleOfficeInput,
  activeCatalogueCount: number,
): SanadMarketplaceReadiness {
  const reasons: string[] = [];
  if (!office) {
    return { ready: false, reasons: ["Operational office profile is not available yet."] };
  }
  const listed =
    office.isPublicListed === 1 || office.isPublicListed === true || String(office.isPublicListed) === "1";
  if (!listed) reasons.push("Office is not marked public-listed.");
  if (office.status !== "active") reasons.push("Office status must be active.");
  const phoneOk = Boolean(String(office.phone ?? "").trim());
  if (!phoneOk) reasons.push("Contact phone is required for marketplace visibility.");
  const locOk =
    Boolean(String(office.governorate ?? "").trim()) || Boolean(String(office.city ?? "").trim());
  if (!locOk) reasons.push("Governorate or city is required.");
  const nameOk = Boolean(String(office.name ?? "").trim());
  if (!nameOk) reasons.push("Office display name is required.");
  if (activeCatalogueCount < 1) reasons.push("At least one active catalogue item is required.");

  const ready = reasons.length === 0;
  return { ready, reasons: ready ? [] : reasons };
}

/**
 * Readiness to **turn on** public listing / appear on marketplace: same bar as discovery quality,
 * but evaluates as if `isPublicListed` were already enabled (so we do not block on "not listed yet").
 */
export function computeSanadGoLiveReadiness(
  office: SanadLifecycleOfficeInput,
  activeCatalogueCount: number,
): SanadMarketplaceReadiness {
  if (!office) {
    return { ready: false, reasons: ["Operational office profile is not available yet."] };
  }
  const hypothetical: SanadLifecycleOfficeInput = {
    ...office,
    isPublicListed: 1,
  };
  return computeSanadMarketplaceReadiness(hypothetical, activeCatalogueCount);
}
