# ADR-001: RBAC Phase 1 — UI Interpretation Layer Without Schema Migration

**Status:** Accepted  
**Date:** 4 April 2026  
**Deciders:** SmartPRO Hub Engineering  
**Technical Area:** Access Control / Role-Based Authorization  
**Document Reference:** SMARTPRO-ADR-001

---

## Context

SmartPRO Hub uses a multi-tenant role model where users can belong to multiple companies with different roles in each. The system stores two role-related fields per user:

- `users.platformRole` — a single enum value representing the user's effective access level across the entire platform
- `company_members.role` — one row per (user × company) pair, representing the user's function within a specific company

Prior to Phase 1, the following problems existed in production:

1. **Role mismatches** — `users.platformRole` could be out of sync with `company_members.role`, causing users to see incorrect sidebar navigation and be blocked from procedures they should have access to.
2. **No admin visibility** — there was no single page where a platform operator could see all users, their roles, and any mismatches at a glance.
3. **Misleading labels** — the UI displayed raw enum values (`company_admin`, `hr_admin`) and the incorrect label "Company Owner", which implied ownership semantics that do not exist in the data model.
4. **Silent failures** — users with `null` or invalid `platformRole` values disappeared from admin views with no indication that a problem existed.
5. **Duplicated derivation logic** — role interpretation logic was scattered across the frontend and backend with no shared source of truth, creating risk of divergence.

The team needed to address these problems without introducing a database schema migration, which carries higher risk and requires a coordinated deployment window.

---

## Decision

**Implement a UI-only interpretation layer (Phase 1) without any database schema changes.**

The core of this decision is the creation of `shared/roleHelpers.ts` — a single TypeScript module that exports all role derivation logic as pure functions. Both the backend (`server/routers/platformOps.ts`) and the frontend (`client/src/pages/UserRolesPage.tsx`) import from this module. No role interpretation logic exists anywhere else in the codebase.

The five exported functions are:

| Function | Input | Output |
|----------|-------|--------|
| `deriveAccountType(platformRole)` | Raw `platformRole` string | `AccountType` enum value |
| `deriveEffectiveAccess(platformRole, bestMemberRole, activeMemberRoles)` | Role fields | Human-readable access label |
| `deriveScope(accountType, activeMemberships, platformRole)` | Membership list | Scope description string |
| `deriveEdgeCaseWarning(platformRole, activeMemberRoles)` | Role fields | Edge case warning type or `null` |
| `deriveBestMemberRole(activeMemberRoles)` | Membership role list | Highest-privilege role string |

All five functions normalize their inputs with `.toLowerCase().trim()` before any comparison, making them safe against mixed-case values, whitespace-padded values, and any future bad data that may enter the database through direct SQL or external imports.

A new admin page at `/user-roles` provides full visibility into all users, their account types, effective access labels, company scopes, mismatches, and data integrity issues. The page allows operators to fix mismatches, update roles, and manage company memberships directly.

---

## Rationale

### Why UI-only first, not schema migration first?

A schema migration to add a formal `accountType` column or restructure the role model would require:

- A coordinated deployment window with downtime risk
- Data backfill scripts that must be tested against production data volumes
- Rollback procedures for the migration
- Updates to all procedures that currently read `platformRole` directly

The UI interpretation layer delivers the same operational value — correct display, mismatch detection, and role management — without any of this risk. It also provides a production observation window before committing to a schema design.

### Why `shared/roleHelpers.ts` instead of inline logic?

Before this change, role interpretation was duplicated between the backend query layer and the frontend rendering layer. Any change to the interpretation rules required two separate edits, with no guarantee they stayed in sync. A single shared module eliminates this class of bug entirely.

### Why five account types instead of two?

The original `users.role` field (`admin`/`user`) was a binary that could not express the operational reality of the platform. A company HR manager and a platform super admin are both `admin` in the legacy model, but they have completely different access scopes. The five-type model (`platform_staff`, `business_user`, `customer`, `auditor`, `needs_review`) maps directly to operational roles and makes the admin page self-documenting.

### Why `needs_review` as a fallback group?

Silent failures — where users with invalid role data simply disappear from admin views — are operationally dangerous. The `needs_review` group ensures that every user, regardless of what is stored in the database, is always visible and recoverable. This is a safety property, not a UX feature.

---

## Consequences

### Positive

- Platform operators can now see and fix all role issues from a single page without direct database access.
- Role interpretation is consistent between what the API returns and what the UI displays.
- Bad data (null, empty, unknown, mixed-case) is handled safely without crashes or silent disappearances.
- The codebase has a clear, documented source of truth for role semantics.
- No database migration risk was introduced.
- The interpretation layer provides a stable foundation for Phase 2 schema normalization.

### Negative / Trade-offs

- `users.platformRole` is still a single denormalized field. It must be kept in sync with `company_members.role` manually or via the fix procedures. This sync requirement is a known limitation of the current schema.
- `users.role` (`admin`/`user`) is still used by `adminProcedure` for backend access gating. It is hidden from the UI but not yet deprecated.
- Account type is derived at query time, not stored. This means it cannot be indexed or used in efficient database-level filtering at scale.
- The `OnboardingGuidePage.tsx` uses "Company Owner Walkthrough" as a section title. This is a user-facing guide label, not a role enum value, and is intentionally kept for readability. It does not affect enforcement.

---

## Alternatives Considered

### Alternative A: Schema migration first (rejected)

Introduce a formal `accountType` column and restructure the role model before building the admin page. Rejected because it carries higher deployment risk and does not deliver operational value faster than the UI-only approach.

### Alternative B: Keep role logic inline, add admin page only (rejected)

Build the admin page without centralizing the derivation logic. Rejected because it would have reproduced the existing problem of divergent interpretation between the backend and frontend.

### Alternative C: Use a third-party RBAC library (deferred to Phase 2)

Replace the custom role model with a library such as CASL or Casbin. Deferred because it requires a full permission matrix design and enforcement layer refactor, which is Phase 2 scope.

---

## Phase 2 Scope (Deferred)

The following items are explicitly deferred to Phase 2 and are not part of this decision:

| Item | Description |
|------|-------------|
| Formal `accountType` column | Add as a stored, indexed column in `users` table |
| Deprecate `users.role` | Replace `adminProcedure` dependency on `role === "admin"` with `platformRole`-based check |
| Permission matrix | Create `role_permissions` mapping table; replace direct role checks with permission checks |
| Separate platform and company access | Platform staff roles and company membership roles stored in separate structures |
| Deprecate direct `platformRole` reads | Replace all `ctx.user.platformRole === "..."` checks with permission-based checks |

Phase 2 should begin after the following entry criteria are met in production:

1. The support and admin team has used the User Roles page in real day-to-day workflows.
2. The frequency and patterns of role mismatches and `needs_review` users are documented.
3. Multi-company user behavior has been observed on real accounts.
4. No critical flows remain that depend on raw `platformRole` semantics in ways that would break under a schema change.
5. The top permission pain points are documented.

---

## Related Documents

| Document | Path |
|----------|------|
| Phase 1 Sign-Off | `docs/phase1-signoff-user-roles.md` |
| Role Helpers Source | `shared/roleHelpers.ts` |
| Role Audit Procedures | `server/routers/platformOps.ts` |
| Role Audit Tests | `server/routers/platformOps.roleAudit.test.ts` |
| User Roles Page | `client/src/pages/UserRolesPage.tsx` |

---

*This ADR was recorded as part of the SmartPRO Hub RBAC improvement initiative. For questions, refer to `shared/roleHelpers.ts` as the authoritative source of role derivation logic.*
