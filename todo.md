# SmartPRO Hub — Active Work Items

> This file tracks only **active** tasks. Completed items were archived in
> `docs/todo.archive.md` on 2026-04-15.
>
> Prefer GitHub Issues / Project board for new feature tracking.

## Open Code Quality Items (from v3 review)

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| ARCH-04 | Medium | Attendance router — continue decomposing into sub-modules | In Progress |
| QUAL-01 | Medium | Test coverage gaps (12.6%) — add integration tests for critical routers | Open |
| QUAL-02 | Medium | i18n incomplete — ~17 pages still need `t()` string wrapping | In Progress |
| QUAL-05 | Low | Standardise coding patterns — migrate older modules to repository pattern | Open |

## Architecture (completed in this session)

- [x] **ARCH-02** Decompose `db.ts` → `server/repositories/*.repository.ts` (barrel re-export maintained)
- [x] **ARCH-04** Extract attendance sites sub-router into `server/routers/attendance/sites.router.ts`
- [x] **QUAL-03** Add `scripts/migrate.ts` idempotent Drizzle migration runner (`pnpm db:migrate`)
- [x] **QUAL-06** Archive 1,979-line `todo.md` → `docs/todo.archive.md`

## Bug Fixes (current session)

- [x] **BUG-LOGOUT** Fix logout not working: after `auth.logout` succeeds, `auth.me.invalidate()` re-fetches with the still-present session cookie (cookie clear not effective in browser) and returns the user again, so the UI never transitions to logged-out state. Fix: after logout mutation completes, force a hard redirect to the login URL instead of relying on React Query invalidation to detect the unauthenticated state.
- [x] **BUG-DRIFT-1** Fix `companies.myCompanies` 500 error: `removed_at` column missing from `company_members` (schema/DB drift from migration 0060)
- [x] **BUG-DRIFT-2** Fix `promoter_assignments` query 500 error: `assignment_status` and 12 other columns missing (schema/DB drift from migrations 0061–0064)
- [x] **BUG-DRIFT-3** Fix `attendance_records` query 500 error: `promoter_assignment_id` column missing
- [x] **FEAT-DRIFT-GUARD** Add `server/schemaDriftGuard.ts` — startup schema drift guard that compares Drizzle schema columns against live DB and logs warnings for any missing tables or columns; wired into `server/_core/index.ts` after `runPendingMigrations`
- [x] **TEST-LIFECYCLE** Add `server/promoterAssignmentLifecycle.e2e.test.ts` — 31 end-to-end tests covering the full promoter assignment lifecycle: draft → active → payroll staging → billing staging → suspension → completion
- [x] **TEST-DRIFT-GUARD** Add `server/schemaDriftGuard.test.ts` — 6 unit tests for the drift guard (disabled guard, no DB URL, full match, missing table, missing column, non-fatal on connection error)
