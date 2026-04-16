# Repo Context (smartpro-hub)

Concrete navigation and commands for this codebase. **Start-here index and order of use:** `README.md` in this folder. Pair with `AI_OPERATING_SYSTEM.md` and `SMARTPRO_DOMAIN_GUARDRAILS.md`.

## Package model

- **Package manager:** `pnpm` (see `package.json` → `packageManager`).
- **Workspace:** single app — one root `package.json`, no monorepo workspaces (`pnpm-workspace.yaml` / Turbo not used).

## Core commands

| Action | Command | Notes |
|--------|---------|--------|
| Install | `pnpm install` | |
| Dev (API + Vite client) | `pnpm dev` | Runs `tsx watch server/_core/index.ts` |
| Production build | `pnpm build` | Vite client build + esbundle of `server/_core/index.ts` → `dist/` |
| Start (after build) | `pnpm start` | `node dist/index.js` |
| Typecheck | `pnpm check` | `tsc --noEmit` |
| Format | `pnpm format` | Prettier on repo |
| Tests | `pnpm test` | Vitest (`vitest run`) |
| DB: Drizzle generate + migrate (kit) | `pnpm db:push` | `drizzle-kit generate && drizzle-kit migrate` — requires `DATABASE_URL` |
| DB: app migration runner | `pnpm db:migrate` | `tsx scripts/migrate.ts` |
| DB: migrate dry-run | `pnpm db:migrate:dry` | |
| DB: run pending migrations | `pnpm db:run-pending` | `tsx scripts/run-pending-migrations.ts` |

**Not defined in `package.json`:** dedicated `lint` (no ESLint script), `test:unit` / `test:integration` split, or `db:reset`. Use `pnpm check` + `pnpm test` before PRs; DB reset is environment-specific (restore DB / re-run migrations as appropriate).

**Honest reporting:** This repo has **no root `lint` script**. Do not claim “lint passed” or “lint/typecheck/tests passed” unless you actually ran a real linter for the touched area (if one exists elsewhere) **and** say what ran. For the default workflow, report **`pnpm check`** (TypeScript) and **`pnpm test`** explicitly; use **`pnpm format`** only when formatting was applied or verified.

## Entry points

| Layer | Location |
|-------|----------|
| **Server bootstrap** | `server/_core/index.ts` — Express, `/api/trpc`, security middleware, static/Vite, webhooks |
| **tRPC root router** | `server/routers.ts` — `appRouter` composes feature routers |
| **tRPC core (procedures, middleware)** | `server/_core/trpc.ts` — `publicProcedure`, `protectedProcedure`, `adminProcedure`, `platformOperatorReadProcedure` |
| **Request context** | `server/_core/context.ts` — session user, etc. |
| **Client bootstrap** | `client/src/main.tsx` — React root, TanStack Query, tRPC links, i18n |
| **Vite config** | `vite.config.ts` |
| **Path aliases** | `@/*` → `client/src/*`, `@shared/*` → `shared/*` (see `tsconfig.json`; Vitest also maps `@assets`) |

## API style

- **tRPC** over HTTP at `/api/trpc` (Express adapter).
- Feature routers live under `server/routers/` and are mounted from `server/routers.ts`.
- Prefer tracing a flow: `client` → `trpc.*` → `server/routers/<feature>.ts` → services/repos → `drizzle/schema.ts`.

## Database & migrations

- **ORM:** Drizzle.
- **Schema:** `drizzle/schema.ts` (large; use search).
- **Kit config:** `drizzle.config.ts` — MySQL, `DATABASE_URL`.
- **SQL migrations:** `drizzle/*.sql`, journal in `drizzle/meta/_journal.json`.
- **Relations:** `drizzle/relations.ts` (if used by kit).

## Tests

- **Runner:** Vitest — `vitest.config.ts`.
- **Include patterns:** `server/**/*.test.ts`, `server/**/*.spec.ts`, `shared/**/*.test.ts`, `client/**/*.test.ts`, `client/**/*.test.tsx`.
- **Environments:** default `node`; `client/**/*.test.tsx` and one shared file use `jsdom` per `environmentMatchGlobs`.

## Important folders

| Area | Path |
|------|------|
| React UI, pages, components | `client/src/` |
| Shared business rules, RBAC, constants | `shared/` |
| Server-only code | `server/` |
| Drizzle schema & migrations | `drizzle/` |
| One-off / ops scripts | `scripts/` |
| Product docs | `docs/` |
| AI workflow pack | `docs/ai/` — `REPO_CONTEXT.md` (this file); optional `TASK_INTAKE_TEMPLATE.md` at start; `FINAL_REPORT_TEMPLATE.md` at closeout |
| Cursor project rules | `.cursor/rules/` |
| Runtime patches | `patches/` |

## Auth, RBAC, tenant

- **Session / auth wiring:** `server/_core/context.ts`, OAuth in `server/_core/oauth.ts`, cookies in `server/_core/cookies.ts`.
- **Platform / admin access helpers:** `shared/rbac.ts` — e.g. `canAccessGlobalAdminProcedures`, `mapMemberRoleToPlatformRole`. Comments there document `users.role` vs `users.platformRole` and company membership roles.
- **Procedure tiers:** `server/_core/trpc.ts` — unauthenticated vs `protectedProcedure` vs platform/admin variants; do not rely on UI alone.
- **Company / workspace:** membership and company-scoped logic are spread across routers and helpers (e.g. `server/_core/membership.ts`, `server/_core/accessShadow.ts` for shadow logging). For any change touching `companyId`, verify server-side checks and membership rules.

## Audit & compliance logging

- **Compliance-oriented audit helpers:** `server/complianceAudit.ts` — writes high-signal events (e.g. session login/logout) to `audit_events`-style tables as defined in schema.
- **Broader audit:** search `auditEvents` / `audit_events` in `drizzle/schema.ts` and call sites when adding sensitive actions.

## i18n

- **Initialization:** `client/src/lib/i18n` (imported from `client/src/main.tsx`).
- **Locales:** `client/src/locales/<locale>/` (e.g. `en-OM`, `ar-OM`) — JSON namespaces such as `common`, `hr`, `nav`, `billing`, etc.
- Add or change user-visible strings in line with existing namespaces; avoid hardcoding new copy when the screen is already translated.

## Shared constants & enums

- Cross-cutting messages and flags: `shared/const.ts` and other `shared/*.ts` modules.
- **Database enums / tables:** `drizzle/schema.ts` is the source of truth for persisted shape; keep server and client derived types in sync with schema changes.

## Architecture rules (short)

1. **Server authority** — tRPC procedures must enforce permissions and tenant scope; client hides UI only.
2. **Tenant scoping** — company-scoped reads/writes must use correct `companyId` / membership checks per existing router patterns.
3. **RBAC** — use `shared/rbac.ts` + procedure types from `server/_core/trpc.ts`; do not infer from route visibility alone.
4. **State / status** — workflow state belongs in the DB and server logic; labels in UI must match server state.
5. **Audit** — security-sensitive or compliance-relevant actions should follow patterns in `complianceAudit.ts` / `audit_events` usage.
6. **i18n** — follow `client/src/locales` structure for user-facing strings.

## High-risk domains

Treat changes in these areas with extra end-to-end review: attendance, payroll, billing/invoicing/payments, compliance, contracts, HR records, admin/membership/permissions, Sanad/government-adjacent flows.

## PR completion checklist

- [ ] `pnpm check` passes
- [ ] `pnpm test` passes (or explain gaps)
- [ ] Do not claim “lint passed” unless a real lint was run; otherwise state only what ran (see **Honest reporting** above)
- [ ] Relevant manual QA (happy path + permission/tenant cases where applicable)
- [ ] Role/tenant behavior verified for sensitive flows
- [ ] User-facing strings handled for i18n if applicable
- [ ] Final report for substantive work (use `FINAL_REPORT_TEMPLATE.md`; principles in `AI_OPERATING_SYSTEM.md`)
