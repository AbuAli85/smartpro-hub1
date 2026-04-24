import { TRPCError } from "@trpc/server";
import { PLATFORM_ADMIN_MFA_REQUIRED_REASON } from "@shared/authTrpcReasons";

/**
 * Enforces that a confirmed global-admin caller (super_admin / platform_admin) has 2FA
 * enabled on their account before accessing adminProcedure endpoints.
 *
 * Call ONLY after canAccessGlobalAdminProcedures() has returned true — this function
 * does not re-check the RBAC gate; it adds the 2FA layer on top.
 *
 * Why twoFactorEnabled is the right signal:
 *   - The field is read fresh from the DB on every request (not from the JWT).
 *   - The OAuth login flow already enforces the MFA challenge when twoFactorEnabled=true,
 *     so a session that exists AND has twoFactorEnabled=true was created after MFA verification.
 *   - Requiring enabled 2FA (not just a passed challenge token) is simpler and still closes
 *     the gap: admins without 2FA are blocked regardless of their session age.
 */
export function assertPlatformAdminMfaEnabled(user: { twoFactorEnabled: boolean }): void {
  if (!user.twoFactorEnabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Platform admin access requires two-factor authentication. " +
        "Enable 2FA in your account security settings to continue.",
      cause: { reason: PLATFORM_ADMIN_MFA_REQUIRED_REASON },
    });
  }
}
