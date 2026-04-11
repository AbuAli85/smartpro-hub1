/**
 * Parse `?profileRequest=<id>` from a URL search string (wouter `useSearch()` output).
 */
export function parseProfileRequestIdFromSearch(search: string): number | null {
  const s = search.startsWith("?") ? search.slice(1) : search;
  if (!s.trim()) return null;
  const params = new URLSearchParams(s);
  const raw = params.get("profileRequest");
  if (!raw) return null;
  const id = Number.parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** Human-readable age for operational queue scanning. */
export function formatProfileRequestAge(submittedAt: Date | string | null | undefined): string {
  if (submittedAt == null) return "—";
  const t = typeof submittedAt === "string" ? new Date(submittedAt).getTime() : submittedAt.getTime();
  if (Number.isNaN(t)) return "—";
  const hours = Math.floor((Date.now() - t) / 3600000);
  if (hours < 1) return "<1h";
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
