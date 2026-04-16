/**
 * Single place for mailbox normalization (case-insensitive identity).
 * DB column `users.email_normalized` must match this output for lookups.
 */
export function normalizeEmail(email: string | null | undefined): string | null {
  if (email == null) return null;
  const t = `${email}`.trim().toLowerCase();
  return t.length === 0 ? null : t;
}
