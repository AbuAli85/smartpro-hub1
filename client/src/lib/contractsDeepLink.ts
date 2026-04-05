/**
 * Deep links from audit / route hints: `/contracts?id=<contractId>`.
 */

export function parseContractIdFromSearch(search: string): number | null {
  const q = search.startsWith("?") ? search.slice(1) : search;
  const raw = new URLSearchParams(q).get("id");
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** True when the contract exists in the loaded list but is not in the current filtered subset. */
export function isContractHiddenByFilters(
  highlightId: number,
  contracts: { id: number }[] | undefined,
  filtered: { id: number }[] | undefined,
): boolean {
  if (!contracts?.length || !filtered) return false;
  if (!contracts.some((c) => c.id === highlightId)) return false;
  return !filtered.some((c) => c.id === highlightId);
}
