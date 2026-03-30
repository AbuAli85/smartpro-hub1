/**
 * Canonical RBAC helpers for SmartPRO.
 *
 * The `users.role` column ("user" | "admin") is a legacy template flag.
 * Production access control uses `users.platformRole` (see drizzle/schema users table).
 *
 * Use `canAccessGlobalAdminProcedures` anywhere the code previously checked
 * `user.role === "admin"` for cross-tenant / platform-level operations.
 */

export function canAccessGlobalAdminProcedures(user: {
  role?: string | null;
  platformRole?: string | null;
}): boolean {
  if (user.role === "admin") return true;
  const pr = user.platformRole;
  return pr === "super_admin" || pr === "platform_admin";
}

/**
 * Users who may auto-provision a default company on first login (workforce / onboarding).
 */
export function isCompanyProvisioningAdmin(user: {
  role?: string | null;
  platformRole?: string | null;
}): boolean {
  if (canAccessGlobalAdminProcedures(user)) return true;
  return user.platformRole === "company_admin";
}

/**
 * Returns true when the user's company membership role is external_auditor.
 * Call this with the membership row, not the platform-level user object.
 */
export function isExternalAuditor(membershipRole: string | null | undefined): boolean {
  return membershipRole === "external_auditor";
}

/**
 * Throws a FORBIDDEN TRPCError when the caller is an external_auditor.
 * Import TRPCError from @trpc/server at the call site.
 *
 * Usage:
 *   const m = await getCompanyMembership(ctx);
 *   assertNotAuditor(m?.role, "Cannot modify payroll in Audit Mode");
 */
export function assertNotAuditor(
  membershipRole: string | null | undefined,
  message = "External Auditors have read-only access and cannot perform this action.",
): void {
  if (isExternalAuditor(membershipRole)) {
    // Throw a plain Error; callers wrap it in TRPCError({ code: 'FORBIDDEN' })
    throw new Error(message);
  }
}
