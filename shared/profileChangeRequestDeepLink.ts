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

/** Tailwind-friendly scroll margin so sticky headers do not obscure the highlighted row. */
export const PROFILE_CHANGE_REQUEST_SCROLL_MARGIN_CLASS = "scroll-mt-24";

const DEFAULT_SCROLL_ATTEMPTS = 12;
const RETRY_MS = 100;

/**
 * Scroll to `#profile-change-request-{id}` with retries (async list load / layout).
 */
/** Single-line preview for tables (full value in `title`). */
export function previewProfileRequestValue(value: string, maxLen = 72): string {
  const t = value.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
}

export function scheduleScrollToProfileChangeRequest(
  requestId: number,
  options?: { maxAttempts?: number },
): void {
  if (typeof document === "undefined") return;
  const maxAttempts = options?.maxAttempts ?? DEFAULT_SCROLL_ATTEMPTS;
  let attempt = 0;
  const tryScroll = () => {
    const el = document.getElementById(`profile-change-request-${requestId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (attempt++ < maxAttempts) {
      window.setTimeout(tryScroll, RETRY_MS);
    }
  };
  window.setTimeout(tryScroll, 0);
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
