/**
 * Shared validation for manual HR attendance entry.
 * Used on both server (enforcement) and client (preview feedback).
 */

/** Exact-match weak terms that are not meaningful audit reasons. */
const WEAK_TERMS = new Set([
  "test", "ok", "done", "na", "n/a", "yes", "no", "none", "null", "nil", "-",
]);

/**
 * Returns true if the trimmed, lowercased reason is a meaningless placeholder.
 * Server rejects; client shows a warning.
 */
export function isWeakAuditReason(reason: string): boolean {
  return WEAK_TERMS.has(reason.trim().toLowerCase());
}
