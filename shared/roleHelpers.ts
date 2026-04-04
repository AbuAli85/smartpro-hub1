/**
 * shared/roleHelpers.ts
 *
 * Single source of truth for all role derivation logic used in the
 * User Roles & Access Management page.
 *
 * These helpers are used by:
 *  - server/routers/platformOps.ts  (getRoleAuditReport)
 *  - client/src/pages/UserRolesPage.tsx  (row rendering, group counts, filtering)
 *  - server/routers/roleAudit.test.ts  (vitest tests)
 *
 * NEVER duplicate this logic inline. Import from here.
 */

// ─── Role Sets ────────────────────────────────────────────────────────────────

export const PLATFORM_STAFF_ROLES = new Set([
  "super_admin",
  "platform_admin",
  "regional_manager",
  "client_services",
  "reviewer",
]);

export const BUSINESS_USER_ROLES = new Set([
  "company_admin",
  "hr_admin",
  "finance_admin",
  "company_member",
]);

/**
 * Strict precedence order for company membership roles.
 * company_admin > hr_admin > finance_admin > company_member
 * reviewer and external_auditor are separate tracks.
 */
export const MEMBERSHIP_ROLE_PRECEDENCE = [
  "company_admin",
  "hr_admin",
  "finance_admin",
  "company_member",
  "reviewer",
  "external_auditor",
  "client",
] as const;

// ─── Account Type ─────────────────────────────────────────────────────────────

export type AccountType =
  | "platform_staff"
  | "business_user"
  | "customer"
  | "auditor"
  | "needs_review"; // fallback for null/unknown/invalid roles

/**
 * Classify what kind of user this is (classification layer).
 * Every possible input must land in a bucket — no user disappears.
 */
export function deriveAccountType(platformRole: string | null | undefined): AccountType {
  const role = platformRole ?? "";
  if (PLATFORM_STAFF_ROLES.has(role)) return "platform_staff";
  if (BUSINESS_USER_ROLES.has(role)) return "business_user";
  if (role === "external_auditor") return "auditor";
  if (role === "client") return "customer";
  // null, empty, or unknown enum value → safe fallback
  return "needs_review";
}

// ─── Effective Access ─────────────────────────────────────────────────────────

/**
 * Human-readable permission summary label (what can this user do).
 *
 * Rules:
 * 1. Platform staff always derive from platformRole, not memberships.
 * 2. Business users derive from highest active company membership (strict precedence).
 * 3. Fallback to platformRole when no active memberships.
 * 4. Unknown/null → "No Assigned Access".
 */
export function deriveEffectiveAccess(
  platformRole: string | null | undefined,
  bestMemberRole: string | null | undefined,
  activeMemberRoles: string[],
): string {
  const role = platformRole ?? "";

  // Platform staff: always from platformRole
  if (role === "super_admin") return "Super Admin";
  if (role === "platform_admin") return "Platform Admin";
  if (role === "regional_manager") return "Regional Manager";
  if (role === "client_services") return "Client Services";
  if (role === "reviewer" && activeMemberRoles.length === 0) return "Reviewer";

  // Business users: derive from highest active company membership
  if (activeMemberRoles.length > 0 && bestMemberRole) {
    const memberLabels: Record<string, string> = {
      company_admin: "Company Admin", // NOT "Company Owner" — no ownership signal in data
      hr_admin: "HR Manager",
      finance_admin: "Finance Manager",
      company_member: "Team Member",
      reviewer: "Reviewer",
      external_auditor: "External Auditor",
    };
    return memberLabels[bestMemberRole] ?? "Business User";
  }

  // Fallback: derive from platformRole when no active memberships
  if (role === "company_admin") return "Company Admin";
  if (role === "hr_admin") return "HR Manager";
  if (role === "finance_admin") return "Finance Manager";
  if (role === "company_member") return "Team Member";
  if (role === "reviewer") return "Reviewer";
  if (role === "external_auditor") return "External Auditor";
  if (role === "client") return "Customer Portal";

  return "No Assigned Access";
}

// ─── Scope ────────────────────────────────────────────────────────────────────

/**
 * Which companies does this user have access to.
 */
export function deriveScope(
  accountType: AccountType,
  activeMemberships: { companyName: string }[],
  platformRole: string | null | undefined,
): string {
  if (accountType === "platform_staff") return "All companies";
  if (activeMemberships.length === 0) {
    if (platformRole === "external_auditor") return "Read-only scope";
    return "No company";
  }
  if (activeMemberships.length === 1) return activeMemberships[0].companyName;
  return `${activeMemberships.length} companies`;
}

// ─── Edge Case Warnings ───────────────────────────────────────────────────────

export type EdgeCaseWarning =
  | "business_role_no_membership" // business platformRole but no active company membership
  | "client_has_membership"       // client platformRole but has active company memberships
  | "unknown_role"                // null/empty/invalid platformRole
  | null;

/**
 * Detect data integrity issues for a user.
 * These are distinct from role mismatches — they represent structural data problems.
 */
export function deriveEdgeCaseWarning(
  platformRole: string | null | undefined,
  activeMemberRoles: string[],
): EdgeCaseWarning {
  const role = platformRole ?? "";

  // Unknown or null role
  if (!role || (!PLATFORM_STAFF_ROLES.has(role) && !BUSINESS_USER_ROLES.has(role) && role !== "client" && role !== "external_auditor")) {
    return "unknown_role";
  }

  // Business role but no active company membership
  if (BUSINESS_USER_ROLES.has(role) && activeMemberRoles.length === 0) {
    return "business_role_no_membership";
  }

  // Client platformRole but has company membership (inconsistent)
  if (role === "client" && activeMemberRoles.length > 0) {
    return "client_has_membership";
  }

  return null;
}

// ─── Best Member Role ─────────────────────────────────────────────────────────

/**
 * Find the highest-privilege role from a list of active membership roles,
 * using the strict MEMBERSHIP_ROLE_PRECEDENCE order.
 */
export function deriveBestMemberRole(activeMemberRoles: string[]): string | null {
  if (activeMemberRoles.length === 0) return null;
  const sorted = [...activeMemberRoles].sort(
    (a, b) =>
      MEMBERSHIP_ROLE_PRECEDENCE.indexOf(a as typeof MEMBERSHIP_ROLE_PRECEDENCE[number]) -
      MEMBERSHIP_ROLE_PRECEDENCE.indexOf(b as typeof MEMBERSHIP_ROLE_PRECEDENCE[number]),
  );
  return sorted[0] ?? null;
}

// ─── Account Type Config (for UI rendering) ───────────────────────────────────

export const ACCOUNT_TYPE_UI_CONFIG: Record<
  AccountType,
  { label: string; color: string; description: string; borderColor: string }
> = {
  platform_staff: {
    label: "Platform Staff",
    color: "bg-red-50 border-red-200",
    borderColor: "border-l-red-500",
    description: "SmartPRO internal team with platform-wide access",
  },
  business_user: {
    label: "Company Users",
    color: "bg-gray-50 border-gray-200",
    borderColor: "border-l-gray-500",
    description: "Users assigned to one or more companies",
  },
  customer: {
    label: "Customers",
    color: "bg-slate-50 border-slate-200",
    borderColor: "border-l-slate-400",
    description: "External portal users with no company operations access",
  },
  auditor: {
    label: "Auditors",
    color: "bg-yellow-50 border-yellow-200",
    borderColor: "border-l-yellow-500",
    description: "Read-only external or compliance-facing access",
  },
  needs_review: {
    label: "Needs Review",
    color: "bg-red-50 border-red-300",
    borderColor: "border-l-red-600",
    description: "Users with unknown, null, or invalid role assignments",
  },
};

// ─── Warning Severity (color semantics) ──────────────────────────────────────

/**
 * Warning color semantics:
 * - amber  = role mismatch (recoverable, fix available)
 * - orange = incomplete but recoverable (business role without membership)
 * - red    = error/action-required (unknown role)
 * - purple = inconsistent data (client with membership)
 *
 * Status (Suspended/Active) uses red/green and is SEPARATE from these.
 */
export const WARNING_STYLES: Record<
  NonNullable<EdgeCaseWarning> | "mismatch",
  { bg: string; border: string; text: string; icon: string; severity: "warning" | "error" | "inconsistency" }
> = {
  mismatch: {
    bg: "bg-amber-50",
    border: "border-amber-300",
    text: "text-amber-900",
    icon: "text-amber-600",
    severity: "warning",
  },
  business_role_no_membership: {
    bg: "bg-orange-50",
    border: "border-orange-300",
    text: "text-orange-900",
    icon: "text-orange-600",
    severity: "warning",
  },
  client_has_membership: {
    bg: "bg-purple-50",
    border: "border-purple-300",
    text: "text-purple-900",
    icon: "text-purple-600",
    severity: "inconsistency",
  },
  unknown_role: {
    bg: "bg-red-50",
    border: "border-red-300",
    text: "text-red-900",
    icon: "text-red-600",
    severity: "error",
  },
};
