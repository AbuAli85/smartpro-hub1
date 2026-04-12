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
 * Maps a companyMembers.role to the correct users.platformRole.
 * Called whenever a user joins a company so their sidebar reflects their job.
 *
 * Rules:
 *  - company_admin  → company_admin  (full dashboard)
 *  - hr_admin       → company_admin  (needs HR sidebar, platformRole drives it)
 *  - finance_admin  → company_admin  (needs Finance sidebar)
 *  - reviewer       → company_member (limited access)
 *  - company_member → company_member (My Portal only)
 *  - client         → client         (client portal only)
 *  - external_auditor → external_auditor (read-only)
 */
export function mapMemberRoleToPlatformRole(
  memberRole: string,
): "company_admin" | "company_member" | "client" | "external_auditor" {
  // Normalize so DB/driver quirks (whitespace, casing) never fall through to "client"
  // for real membership roles like company_member.
  const r = (memberRole ?? "").trim().toLowerCase();
  switch (r) {
    case "company_admin":
    case "hr_admin":
    case "finance_admin":
      return "company_admin";
    case "reviewer":
    case "company_member":
      return "company_member";
    case "external_auditor":
      return "external_auditor";
    case "client":
      return "client";
    default:
      return "client";
  }
}

/**
 * Users who may access survey admin (response list, detail, analytics).
 * Platform operators + regional_manager + client_services.
 */
export function canAccessSurveyAdmin(user: {
  role?: string | null;
  platformRole?: string | null;
}): boolean {
  if (canAccessGlobalAdminProcedures(user)) return true;
  const pr = user.platformRole;
  return pr === "regional_manager" || pr === "client_services" || pr === "company_admin";
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
