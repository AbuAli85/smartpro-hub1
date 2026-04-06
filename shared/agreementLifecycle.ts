/**
 * Typed accessors for `outsourcing_contracts.metadata` lifecycle keys (Phase 3).
 * Keep keys stable for reporting and UI.
 */
export const LIFECYCLE_METADATA_KEYS = {
  lifecycleKind: "lifecycleKind",
  renewedFromContractId: "renewedFromContractId",
  amendsContractId: "amendsContractId",
  rootContractId: "rootContractId",
} as const;

export const AGREEMENT_LIFECYCLE_KINDS = ["original", "renewal", "amendment", "termination"] as const;
export type AgreementLifecycleKind = (typeof AGREEMENT_LIFECYCLE_KINDS)[number];

export type OutsourcingContractLifecycleMetadata = {
  lifecycleKind?: string;
  renewedFromContractId?: string;
  amendsContractId?: string;
  rootContractId?: string;
};

export function parseOutsourcingContractLifecycleMetadata(
  metadata: Record<string, unknown> | null | undefined
): OutsourcingContractLifecycleMetadata {
  if (!metadata || typeof metadata !== "object") return {};
  const o = metadata as Record<string, unknown>;
  return {
    lifecycleKind: typeof o.lifecycleKind === "string" ? o.lifecycleKind : undefined,
    renewedFromContractId:
      typeof o.renewedFromContractId === "string" ? o.renewedFromContractId : undefined,
    amendsContractId: typeof o.amendsContractId === "string" ? o.amendsContractId : undefined,
    rootContractId: typeof o.rootContractId === "string" ? o.rootContractId : undefined,
  };
}

/** Merge new lifecycle fields into existing metadata (shallow). */
export function mergeLifecycleMetadata(
  existing: Record<string, unknown> | null | undefined,
  patch: OutsourcingContractLifecycleMetadata & Record<string, unknown>
): Record<string, unknown> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...existing }
      : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) base[k] = v;
  }
  return base;
}
