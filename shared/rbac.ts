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
