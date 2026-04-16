/**
 * Identity / authority hardening — implementation notes (Phase B audit)
 * -------------------------------------------------------------------------
 * Inspected: drizzle/schema (users, company_members), migrations 0000–0059,
 *   server/_core/sdk.ts (session), server/_core/oauth.ts,
 *   server/repositories/users.repository.ts (upsert),
 *   shared/rbac.ts, shared/clientNav.ts, server/routers/platformOps.ts,
 *   server/routers/companies.ts (syncPlatformRoleForCompanyMembership).
 *
 * Findings (pre-change):
 *   - Session key: OAuth `openId` stored on users.openId; lookup by getUserByOpenId.
 *   - No DB uniqueness on email; duplicates possible; scattered LOWER(TRIM) comparisons.
 *   - `users.role` (admin|user) legacy; `users.platformRole` overloaded (platform + tenant UI cache).
 *   - Tenant truth partially in company_members; PR2 sync copies membership → users.platformRole.
 *
 * Target direction:
 *   - platform_user_roles = global operator grants; company_members = tenant grants.
 *   - user_auth_identities = linked SSO subjects; canonical user row may absorb multiple subjects.
 *   - users.platformRole retained as UI/cache during transition (updated by existing sync).
 *
 * Risk: OAuth identity linking changes which row receives updates — guarded with duplicate-email logging.
 */

export {};
