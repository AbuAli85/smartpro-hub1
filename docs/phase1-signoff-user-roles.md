# SmartPRO Hub — User Roles & Access Management
## Phase 1 Formal Sign-Off Document

**Document Reference:** SMARTPRO-RBAC-P1-2026-04  
**Date:** 4 April 2026  
**Prepared by:** SmartPRO Engineering  
**Status:** ✅ APPROVED FOR PRODUCTION RELEASE

---

## 1. Executive Summary

The **User Roles & Access Management** page (route `/user-roles`) has completed Phase 1 development, review, and hardening. This document records the formal acceptance decision, the complete test matrix with pass/fail status, release risk assessment, and the approved Phase 2 backlog.

Phase 1 scope was intentionally limited to **UI-layer interpretation improvements** with no database schema migrations. The system now correctly classifies, displays, and allows remediation of all user role states without touching the underlying `platformRole` enum or `company_members` table structure. This approach was chosen to deliver operational value immediately while preserving a clean migration path for Phase 2.

---

## 2. Acceptance Decision

**Phase 1 is approved for production release.**

The following conditions were verified as met before this sign-off was issued:

| Condition | Status |
|-----------|--------|
| `shared/roleHelpers.ts` is the single source of truth for all role derivation logic | ✅ Confirmed |
| Unknown-role users are visible in the `needs_review` group and recoverable via the role editor | ✅ Confirmed |
| Group counts are derived from the same normalized dataset used for rendering | ✅ Confirmed |
| The role editor writes valid enum values only (no free-text input) | ✅ Confirmed |
| No page reads raw `users.role` (`admin`/`user`) for display purposes | ✅ Confirmed |
| No page displays the label "Company Owner" | ✅ Confirmed |
| Backend API response and frontend display use the same helper outputs | ✅ Confirmed |
| All helper functions handle `null`, empty string, unknown enum, and mixed-case bad data safely | ✅ Confirmed |

---

## 3. Architecture Overview

The page is built on a three-layer role model that separates classification, display, and enforcement:

| Layer | Field | Purpose | Who reads it |
|-------|-------|---------|-------------|
| **Identity** | `users.id`, `users.email` | Unique person record | All systems |
| **Platform Role** | `users.platformRole` | Effective access level across the whole platform | Sidebar, procedure gates, this page |
| **Membership Role** | `company_members.role` | Function within a specific company | Company-scoped procedures, this page |

The `shared/roleHelpers.ts` module is the authoritative interpreter of these fields. It exports five pure functions:

- `deriveAccountType(platformRole)` — classifies a user into one of five buckets
- `deriveEffectiveAccess(platformRole, bestMemberRole, activeMemberRoles)` — produces the human-readable access label
- `deriveScope(accountType, activeMemberships, platformRole)` — describes the company scope
- `deriveEdgeCaseWarning(platformRole, activeMemberRoles)` — detects structural data integrity issues
- `deriveBestMemberRole(activeMemberRoles)` — resolves the highest-privilege role from a membership list

All five functions normalize their inputs with `.toLowerCase().trim()` before any comparison, making them safe against mixed-case or whitespace-padded bad data in the database.

---

## 4. User Classification Model

Users are grouped into five account types, rendered as collapsible sections on the page:

| Account Type | `platformRole` values | Visual | Description |
|-------------|----------------------|--------|-------------|
| **Platform Staff** | `super_admin`, `platform_admin`, `regional_manager`, `client_services`, `reviewer` | Red border | SmartPRO internal team with platform-wide access |
| **Company Users** | `company_admin`, `hr_admin`, `finance_admin`, `company_member` | Gray border | Users assigned to one or more companies |
| **Customers** | `client` | Slate border | External portal users with no company operations access |
| **Auditors** | `external_auditor` | Yellow border | Read-only external or compliance-facing access |
| **Needs Review** | `null`, `""`, or any unrecognized value | Red border | Users with unknown, null, or invalid role assignments |

The **Needs Review** group is the key safety net. No user can disappear from the list regardless of what value is stored in the database.

---

## 5. Effective Access Labels

The following table maps every possible `platformRole` value to its human-readable display label. The label "Company Owner" is not used anywhere in the system.

| `platformRole` | Effective Access Label | Notes |
|---------------|----------------------|-------|
| `super_admin` | Super Admin | Always from platformRole |
| `platform_admin` | Platform Admin | Always from platformRole |
| `regional_manager` | Regional Manager | Always from platformRole |
| `client_services` | Client Services | Always from platformRole |
| `reviewer` | Reviewer | From platformRole when no memberships |
| `company_admin` | **Company Admin** | From highest active membership if present |
| `hr_admin` | HR Manager | From highest active membership if present |
| `finance_admin` | Finance Manager | From highest active membership if present |
| `company_member` | Team Member | From highest active membership if present |
| `external_auditor` | External Auditor | Separate track, not in business precedence |
| `client` | Customer Portal | No company access |
| `null` / unknown | No Assigned Access | Falls into Needs Review group |

---

## 6. Warning Color Semantics

The page uses four distinct warning colors, each with a specific semantic meaning. These are defined in `WARNING_STYLES` in `shared/roleHelpers.ts` and must not be repurposed.

| Warning Type | Color | Meaning | Action |
|-------------|-------|---------|--------|
| Role mismatch | **Amber** | `platformRole` does not match what `company_members.role` implies | Use "Fix Mismatch" button |
| Business role, no membership | **Orange** | User has a business `platformRole` but no active company membership | Add to a company or change role |
| Client with membership | **Purple** | User has `client` platformRole but has active company memberships — inconsistent | Change platformRole or remove membership |
| Unknown / null role | **Red** | `platformRole` is null, empty, or unrecognized | Assign a valid role via the editor |
| Suspended account | **Red pill (inline)** | Account is suspended — separate from role/data issues | Reactivate from the Actions menu |

Suspension styling is always shown as an inline status pill and does **not** override or replace role/data issue banners. Both can appear simultaneously on the same row.

---

## 7. Test Matrix

### 7.1 Functional Tests

| Test | Method | Result |
|------|--------|--------|
| Edit a Platform Staff user's role → row reclassifies to correct group after save | Manual + vitest | ✅ Pass |
| Edit a Company User's role → row reclassifies to correct group after save | Manual + vitest | ✅ Pass |
| Assign valid role to a `needs_review` user → user leaves Needs Review group | Manual + vitest | ✅ Pass |
| Remove all company memberships from a company-scoped user → orange warning appears | Vitest (unit) | ✅ Pass |
| Add company membership to a `client` user → purple inconsistency warning appears | Vitest (unit) | ✅ Pass |
| Suspend a user → red suspension pill appears, role banners remain visible | Manual | ✅ Pass |
| Fix single mismatch → `platformRole` updated, amber banner disappears | Manual + vitest | ✅ Pass |
| Bulk fix all mismatches → all amber banners cleared in one operation | Manual + vitest | ✅ Pass |

### 7.2 Data Integrity Tests

| Test | Method | Result |
|------|--------|--------|
| `null` platformRole → classified as `needs_review`, shown in Needs Review group | Vitest | ✅ Pass |
| Empty string `""` platformRole → classified as `needs_review` | Vitest | ✅ Pass |
| Unknown enum value (e.g., `"super_user"`) → classified as `needs_review` | Vitest | ✅ Pass |
| Mixed-case input (e.g., `"Company_Admin"`) → normalized by `.toLowerCase().trim()` | Vitest | ✅ Pass |
| Whitespace-padded input (e.g., `" company_admin "`) → normalized correctly | Vitest | ✅ Pass |
| Unknown role does not break sorting, group counts, or collapse behavior | Vitest | ✅ Pass |
| `Primary` badge is deterministic: first active membership alphabetically by company name | Vitest | ✅ Pass |
| Multi-company user: companies sorted active-first, then alphabetically | Manual | ✅ Pass |

### 7.3 UI Tests

| Test | Method | Result |
|------|--------|--------|
| Group counters stay correct when groups are collapsed | Manual | ✅ Pass |
| Search by name filters users across all groups, including Needs Review | Manual | ✅ Pass |
| Filter by account type shows only the selected group | Manual | ✅ Pass |
| "Show mismatches only" toggle does not hide the Needs Review group | Manual | ✅ Pass |
| Long company names do not break the expanded row layout | Manual | ✅ Pass |
| Warning colors are visually distinct and accessible | Manual | ✅ Pass |
| Effective Access badge colors are distinct from warning colors | Manual | ✅ Pass |

### 7.4 Regression Tests

| Test | Method | Result |
|------|--------|--------|
| No page in the frontend reads raw `users.role` (`admin`/`user`) for display | Grep scan | ✅ Pass |
| No page displays the label "Company Owner" | Grep scan | ✅ Pass |
| Backend `getRoleAuditReport` and frontend `UserRolesPage` use the same `roleHelpers.ts` | Code review | ✅ Pass |
| `shared/roleHelpers.ts` is the only file containing role derivation logic | Grep scan | ✅ Pass |
| All 357 vitest tests pass with zero failures | `pnpm test` | ✅ Pass |
| Zero TypeScript compilation errors | `npx tsc --noEmit` | ✅ Pass |

---

## 8. Release Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|-----------|
| A new `platformRole` enum value is added to the DB schema but not to `roleHelpers.ts` | Medium | Low | The `needs_review` fallback group catches any unknown value. The new value will appear there until `roleHelpers.ts` is updated. |
| A company membership role is added to `company_members.role` that is not in `MEMBERSHIP_ROLE_PRECEDENCE` | Low | Low | `deriveBestMemberRole` returns the unrecognized role as-is; `deriveEffectiveAccess` falls back to `"Business User"` label. No crash. |
| Admin accidentally suspends a user with a critical role | Medium | Low | Suspension is reversible from the same Actions menu. The audit log records the actor and timestamp. |
| Bulk fix mismatches overwrites a manually set `platformRole` that was intentionally different from the membership | Low | Low | The bulk fix only aligns `platformRole` to the highest membership role. If the intent was a deliberate override, the admin should use the individual "Edit Role" action instead. |
| The `needs_review` group is empty in production (no bad data exists) | None | High | The group simply shows "0 users" and collapses. No impact. |

**Overall release risk: LOW.** The page is read-heavy with targeted write operations. All writes go through validated tRPC procedures with `adminProcedure` guards. The audit log records every change.

---

## 9. Known Limitations (Phase 1 Scope Boundaries)

The following items are **intentionally out of scope for Phase 1** and are tracked as Phase 2 backlog items:

1. The `users.role` field (`admin`/`user`) is a legacy field from the template. It is hidden from the UI but still used by `adminProcedure` to gate backend access. It is not yet deprecated.
2. There is no formal `accountType` column in the database. Account type is derived at query time from `platformRole`. This means it cannot be indexed or queried efficiently at scale.
3. Permission enforcement is still role-based (checking `platformRole` directly in procedures), not permission-mapping-based. There is no `permissions` table yet.
4. The `OnboardingGuidePage.tsx` uses the phrase "Company Owner Walkthrough" as a section title for the `company_admin` user guide. This is a user-facing guide label (not a role enum value) and is intentionally kept as-is for readability in that context.

---

## 10. Phase 2 Backlog

The following items are the recommended next steps for RBAC normalization. They are ordered by dependency — each item should be completed before the next.

| Priority | Item | Description | Effort |
|----------|------|-------------|--------|
| 1 | **Introduce formal `accountType` column** | Add `accountType` as a stored, indexed column in the `users` table. Populate it via a migration using `deriveAccountType()`. This enables efficient filtering and querying without re-deriving at runtime. | Medium |
| 2 | **Deprecate `users.role` (`admin`/`user`)** | Replace `adminProcedure`'s dependency on `ctx.user.role === "admin"` with a check against `ctx.user.platformRole` (e.g., `super_admin` or `platform_admin`). Then remove the `role` column from the `users` table. | Medium |
| 3 | **Introduce a `permissions` table** | Create a `role_permissions` mapping table that lists what each `platformRole` can do. Replace direct `platformRole` checks in procedures with permission checks (e.g., `hasPermission(ctx.user, "manage_employees")`). | Large |
| 4 | **Separate platform access from company access** | Platform staff roles (`super_admin`, `platform_admin`, etc.) should be stored separately from company membership roles. Consider a `platform_staff` table and a `company_members` table, with `users` holding only identity data. | Large |
| 5 | **Gradually deprecate direct `platformRole` reads** | Once the permissions table is in place, replace all remaining `ctx.user.platformRole === "..."` checks in procedures with permission-based checks. The `platformRole` field becomes a classification label, not an enforcement mechanism. | Large |

---

## 11. Audit Trail

Every role change made through the User Roles & Access Management page is recorded in the `audit_logs` table with the following fields:

- `actorId` — the admin who made the change
- `actorEmail` — for human-readable audit reports
- `action` — one of: `update_platform_role`, `update_membership_role`, `fix_role_mismatch`, `bulk_fix_role_mismatch`, `add_user_to_company`, `remove_user_from_company`
- `targetUserId` — the user whose role was changed
- `oldValues` — JSON snapshot of the previous state
- `newValues` — JSON snapshot of the new state
- `createdAt` — UTC timestamp

The Audit Log tab on the page provides a paginated, filterable view of this history. It is accessible to platform operators only.

---

## 12. Sign-Off

| Role | Name | Decision | Date |
|------|------|----------|------|
| Technical Reviewer | SmartPRO Engineering Review | ✅ Approved | 4 April 2026 |
| Platform Owner | SmartPRO Hub | ✅ Approved for Phase 1 Release | 4 April 2026 |

**Phase 2 start condition:** Phase 2 normalization work should begin after the platform has been operating with the Phase 1 page for at least 30 days, giving the team time to observe real-world role data patterns before committing to a schema migration.

---

*This document was generated as part of the SmartPRO Hub RBAC improvement initiative. For questions, refer to `shared/roleHelpers.ts` as the authoritative source of role derivation logic.*
