/**
 * Canonical RBAC helpers for SmartPRO.
 *
 * Global operator grants are stored in `platform_user_roles` and exposed on the session user
 * as `platformRoles`. Legacy `users.platformRole` may still appear on the session user during transition — see
 * shared/identityAuthority.ts. Tenant UI must use `company_members.role` (nav `memberRole`), not `users.role`.
 */

import {
  canAccessGlobalAdminFromIdentity,
  canAccessSurveyAdminFromIdentity,
  isCompanyProvisioningAdminFromIdentity,
  type IdentityAugmentedUser,
} from "./identityAuthority";

export function canAccessGlobalAdminProcedures(user: IdentityAugmentedUser): boolean {
  return canAccessGlobalAdminFromIdentity(user);
}

/**
 * Users who may auto-provision a default company on first login (workforce / onboarding).
 */
export function isCompanyProvisioningAdmin(user: IdentityAugmentedUser): boolean {
  return isCompanyProvisioningAdminFromIdentity(user);
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
export function canAccessSurveyAdmin(user: IdentityAugmentedUser): boolean {
  return canAccessSurveyAdminFromIdentity(user);
}

/**
 * Returns true when the user's company membership role is external_auditor.
 * Call this with the membership row, not the platform-level user object.
 */
export function isExternalAuditor(membershipRole: string | null | undefined): boolean {
  return membershipRole === "external_auditor";
}

/**
 * Tenant-side operator roles (HR/Finance/Owner) — must come from **company_members.role**, not `users.platformRole`.
 * Used by workspace UI and server helpers so a stale or default global platform role cannot imply tenant admin access.
 */
export function hasTenantOperatorMembership(memberRole: string | null | undefined): boolean {
  return (
    memberRole === "company_admin" ||
    memberRole === "hr_admin" ||
    memberRole === "finance_admin"
  );
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
