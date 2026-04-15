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
