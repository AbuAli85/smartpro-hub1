# SmartPRO Hub — architecture notes

## RBAC: `role` vs `platformRole`

- **`users.role`** (`user` | `admin`): legacy flag from the original auth template. It is **not** sufficient for SmartPRO’s six-role model.
- **`users.platformRole`**: primary field for B2B SaaS access (`super_admin`, `platform_admin`, `company_admin`, `company_member`, `reviewer`, `client`, plus internal roles such as `finance_admin`).

**Decision:** Platform-wide procedures that previously required `user.role === "admin"` now use `canAccessGlobalAdminProcedures()` from `@shared/rbac`, which treats `super_admin` and `platform_admin` as equivalent to legacy admin for those code paths.

**Decision:** `adminProcedure` in `server/_core/trpc.ts` uses the same rule so `platformOps`, `officers` mutations, and `system.notifyOwner` align with the rest of the app.

Granular company permissions remain in `company_members.permissions` (see `server/routers/workforce.ts`).

## Environment

- **Server** reads `DATABASE_URL`, `JWT_SECRET`, `VITE_APP_ID` (also used server-side for OAuth client id), `OAUTH_SERVER_URL`, optional `OWNER_OPEN_ID`, `BUILT_IN_FORGE_API_*` for storage proxy, `PORT`, `NODE_ENV`.
- **Client** uses `VITE_OAUTH_PORTAL_URL`, `VITE_APP_ID`, and optional map keys (`VITE_FRONTEND_FORGE_API_*`).

See `.env.example` at the repo root.

## Custom report builder

**Decision:** The ad-hoc report builder validates and stamps report specifications on the server (`analytics.buildAdHocReportSpec`). Row-level query execution remains a future enhancement; the canonical JSON export is server-generated metadata plus a clear `executionNote`.

## Renewal workflows & scheduled analytics reports

**Decision:** `renewalWorkflows` company scope uses `getUserCompany` plus `canAccessGlobalAdminProcedures`, not `users.role === "platform_admin"` (that value lives on `platformRole` and was never set on `role`).

**Decision:** `analytics.updateReportStatus`, `deleteReport`, and `runReportNow` verify the report belongs to the caller’s company before mutating rows.

## npm scripts

**Decision:** `cross-env` sets `NODE_ENV` in `dev` / `start` so Windows shells behave the same as Unix.
