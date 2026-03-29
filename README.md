# SmartPRO Hub

Multi-tenant B2B platform for Oman / GCC business services: Sanad and PRO workflows, workforce & MOL-aligned permits, HR & payroll (PASI / WPS), contracts & e-sign, CRM, marketplace, billing, client portal, and platform operations.

## Stack

- **Frontend:** React 19, Vite 7, tRPC + TanStack Query, Tailwind 4, Radix UI  
- **Backend:** Express, tRPC 11, Drizzle ORM, **MySQL**  
- **Auth:** OAuth (Manus WebDev-style) + signed session cookie  
- **Package manager:** `pnpm`

## Prerequisites

- Node.js 20+ recommended  
- pnpm 10+ (`corepack enable` or install pnpm globally)  
- MySQL 8+ with a database created for this app  

## Setup

1. **Clone and install**

   ```bash
   pnpm install
   ```

2. **Environment**

   Copy `.env.example` to `.env` and fill in at least:

   - `DATABASE_URL` — MySQL connection string  
   - `JWT_SECRET` — strong random string for session signing  
   - `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`, `VITE_APP_ID` — must match your OAuth app  

3. **Database migrations**

   ```bash
   pnpm db:push
   ```

   This runs Drizzle generate + migrate (see `drizzle/` and `drizzle.config.ts`). Adjust if your workflow prefers `drizzle-kit push` only.

4. **Run (development)**

   ```bash
   pnpm dev
   ```

   The API is mounted at `/api/trpc`; the SPA is served by the same process. Scripts use `cross-env` so `NODE_ENV` works on Windows and Unix.

5. **Quality gates**

   ```bash
   pnpm check    # TypeScript
   pnpm test     # Vitest (server tests under server/**/*.test.ts)
   pnpm build    # Vite client + esbuild server bundle → dist/
   pnpm start    # Production: node dist/index.js
   ```

## Project layout

| Path | Role |
|------|------|
| `client/src/` | React app, routes in `App.tsx` |
| `server/routers/` | tRPC routers (canonical business API) |
| `server/_core/` | Express entry, auth SDK, security, tRPC base |
| `server/db.ts` | Drizzle-backed data access helpers |
| `drizzle/schema.ts` | Table definitions |
| `shared/` | Shared constants and **RBAC helpers** (`shared/rbac.ts`) |
| `docs/ARCHITECTURE.md` | RBAC and env decisions |

## RBAC note

Platform-wide checks must use `canAccessGlobalAdminProcedures()` from `@shared/rbac` (or `adminProcedure` in tRPC), not only `users.role === "admin"`. See `docs/ARCHITECTURE.md`.

## Product tracker

`todo.md` is the living implementation checklist for modules and phases.

## License

MIT
