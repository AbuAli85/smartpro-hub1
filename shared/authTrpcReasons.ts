/**
 * Stable machine-readable markers for auth/security tRPC errors.
 * Use for client branching — do not match on free-text `message`.
 * Surfaced on the wire as `error.data.reason` via the root errorFormatter.
 */

/** Thrown by adminProcedure when a super_admin/platform_admin has not enabled 2FA. */
export const PLATFORM_ADMIN_MFA_REQUIRED_REASON = "PLATFORM_ADMIN_MFA_REQUIRED" as const;
