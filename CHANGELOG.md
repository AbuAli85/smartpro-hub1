# Changelog

All notable changes to SmartPRO Hub are documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions. Versions correspond to internal release checkpoints, not semantic version tags.

---

## [Unreleased]

### Deployment notes

- Apply `drizzle/0049_shift_template_break_minutes.sql` before enabling the **auto-absent marking** background job (`server/jobs/markMissedShiftsAbsent.ts`). The job is gated with `DISABLE_ABSENT_MARK_JOB=1` for local opt-out.
- **Payroll:** KPI commissions now auto-populate `commission_pay` on payroll line items. Apply `drizzle/0050_payroll_commission_pay.sql` before deploying. Existing payroll runs are not backfilled — only new runs pick up commissions.
- **Dashboard:** Control Tower now shows today's workforce attendance signal — scheduled count, active check-ins, absences, late arrivals, and overdue checkouts — alongside the existing financial and risk panels. Absence and overdue-checkout counts feed into the executive insight narrative.
- **Billing:** New "Client Invoices" tab in Billing Engine — groups monthly attendance by client site, applies contracted `daily_rate_omr`, and produces a per-promoter breakdown with CSV export (columns: Client, Site, Promoter, Billable Days, Billable Hours, Daily Rate, Amount OMR).
- **Attendance Sites:** Added `daily_rate_omr` field (contracted daily billing rate per site). Apply `drizzle/0051_attendance_site_daily_rate.sql` before deploy.

---

## [Phase 1 — RBAC UI Interpretation Layer] — 2026-04-04

**Checkpoint:** `0d174de6`  
**ADR:** [ADR-001](docs/adr/ADR-001-rbac-phase1-ui-interpretation-layer.md)  
**Sign-off:** [Phase 1 Formal Sign-Off](docs/phase1-signoff-user-roles.md)  
**Issues:** [#2](https://github.com/AbuAli85/smartpro-hub1/issues/2), [#3](https://github.com/AbuAli85/smartpro-hub1/issues/3)

### Added

- **`shared/roleHelpers.ts`** — Single source of truth for all role derivation logic. Exports five pure functions: `deriveAccountType`, `deriveEffectiveAccess`, `deriveScope`, `deriveEdgeCaseWarning`, `deriveBestMemberRole`. All inputs normalized with `.toLowerCase().trim()` for safety against mixed-case and whitespace-padded bad data.
- **`/user-roles` page** — New admin dashboard for reviewing and managing all user roles and company access. Features: five account type groups (Platform Staff, Company Users, Customers, Auditors, Needs Review), Effective Access labels, mismatch detection, bulk fix, per-user role editor, company membership management, and paginated audit log.
- **9 new tRPC procedures** under `platformOps`: `getRoleAuditReport`, `fixRoleMismatch`, `bulkFixMismatches`, `updateUserRole`, `updateCompanyMemberRole`, `addUserToCompany`, `removeUserFromCompany`, `getRoleAuditLogs`, `listCompanies`.
- **15 new vitest tests** in `server/routers/platformOps.roleAudit.test.ts` covering mismatch detection, role mapping, bulk fix computation, and highest-privilege resolution.
- **`docs/adr/ADR-000-index.md`** — ADR registry with template and naming conventions.
- **`docs/adr/ADR-001-rbac-phase1-ui-interpretation-layer.md`** — Architecture Decision Record for the Phase 1 UI interpretation layer decision.
- **`docs/phase1-signoff-user-roles.md`** — Formal Phase 1 sign-off document with acceptance criteria, full test matrix (32 tests), release risk assessment, known limitations, and Phase 2 backlog.
- **`CHANGELOG.md`** — This file.

### Changed

- **`server/routers/platformOps.ts`** — `getRoleAuditReport` now computes `accountType`, `effectiveAccess`, and `scope` fields using `shared/roleHelpers.ts` instead of inline logic.
- **`client/src/pages/UserRolesPage.tsx`** — Full redesign from a flat user list to a grouped, classified view with Effective Access labels, warning color semantics, and edge case banners.
- **`shared/clientNav.ts`** — Added `/user-roles` to `PLATFORM_ONLY_HREFS` and `AUDITOR_BLOCKED_HREFS`.
- **`client/src/components/PlatformLayout.tsx`** — Added "User Roles & Access" navigation item to the Platform section of the sidebar.

### Removed

- Raw `users.role` field (`admin`/`user`) removed from all UI display surfaces. It remains in the database and is still used by `adminProcedure` for backend gating, but is no longer shown to any user in any page.
- Label "Company Owner" removed from all UI surfaces and replaced with "Company Admin".

### Fixed

- Role mismatch for `chairman@falconeyegroup.net`: `users.platformRole` corrected from `company_member` to `company_admin` to match `company_members.role`.
- Duplicate account for `luxsess2001@gmail.com` (id 33064) deactivated; primary account (id 695, role: `company_admin`) remains active.

### Security

- All role-editing procedures are gated behind `adminProcedure` (requires `users.role = "admin"`).
- Every role change is recorded in `audit_logs` with actor, timestamp, and before/after values.
- Route `/user-roles` is restricted to platform operators only via `PLATFORM_ONLY_HREFS`.

---

## [Platform Hardening] — 2026-03-29

**Issues:** [#1](https://github.com/AbuAli85/smartpro-hub1/issues/1), [#2](https://github.com/AbuAli85/smartpro-hub1/issues/2)

Initial platform hardening pass covering edge-case security, tenant isolation, and architectural stability. See Issue #1 and #2 for full details.

---

[Unreleased]: https://github.com/AbuAli85/smartpro-hub1/compare/main...HEAD
