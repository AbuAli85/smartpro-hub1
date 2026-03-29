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

## Access-control responses: `NOT_FOUND` vs `FORBIDDEN`

**Decision:** Responses are chosen to limit cross-tenant enumeration and to signal authorization clearly within a tenant.

- **`NOT_FOUND`:** The referenced id does not exist **or** it exists under another company than the caller’s active membership (treat as “not visible”). Optional `companyId` filters that do not match the caller’s tenant follow the same rule where the API would otherwise leak existence.
- **`FORBIDDEN`:** The caller is authenticated but lacks permission for the operation, has no active company membership, or is not allowed to use a platform-only path (e.g. Sanad licence renewal for non–platform users).
- **Platform staff** (`canAccessGlobalAdminProcedures`): May omit company filters where the product intentionally aggregates across tenants; explicit `companyId` in inputs is still validated where required (e.g. creating tenant-bound renewal cases).

## Tenant boundaries (`server/_core/tenant.ts`)

**Decision:** Shared helpers enforce company scope on row reads/updates:

- `requireActiveCompanyId` — mutations that create tenant data must not fall back to `companyId = 1`.
- `assertRowBelongsToActiveCompany` — cross-tenant access returns **NOT_FOUND** (not FORBIDDEN) to reduce enumeration.
- Contract signing: `assertContractReadable` / `assertContractSignersVisible` allow **owning company**, **platform staff**, or **invited signer email** so `/contracts/:id/sign` keeps working.
- `submitSignature` / `declineSignature` require the authenticated user’s email to match the signer row.
- **Quotations:** `assertQuotationTenantAccess` — rows with `companyId` are scoped to the active company; legacy rows with `null` companyId are visible only to the original `createdBy` user (platform staff bypass).
- **CRM:** Creates resolve `companyId` via active membership, or explicit `companyId` / caller’s company for platform users; updates and communications validate the contact/deal `companyId` matches that resolved tenant.
- **Sanad work orders:** Reads and mutations use `assertRowBelongsToActiveCompany` on `sanad_applications.companyId` (client company). Office KPI endpoints (`officeDashboard`, `officerPerformance`, `earningsTrend`, `workOrderStats`), catalogue CRUD aliases (`addCatalogueItem`, etc.), `getMyOfficeProfile`, and `upsertOfficeProfile` are restricted to `canAccessGlobalAdminProcedures` so arbitrary tenants cannot scrape office metrics or mutate catalogue rows by id.
- **Billing router:** All procedures remain platform-only (`canAccessGlobalAdminProcedures`); no company-scoped billing reads are exposed there (client invoice visibility lives under `clientPortal`).
- **Workforce:** `caseTasks` updates require a join to `governmentServiceCases` and the caller’s company. Document uploads validate `employeeId` / optional `workPermitId` against the same company. MOL certificate ingestion scopes permit upserts by `companyId` + `workPermitNumber` so permit numbers cannot hijack another tenant’s row. `employees.getById` requires `employees.read` and scopes nested permits, documents, and cases by `companyId`.
- **Payroll:** `company_members` resolution for payroll uses `isActive`; `getRun` line items are filtered by `companyId` as well as `payrollRunId`.
- **Reports / client portal:** Company-scoped PDF reports resolve the tenant via `getUserCompany()` (active membership). `generateOfficerPayoutReport` is platform-only. Client portal company context uses the same `getUserCompany` helper.
- **Alerts:** Expiry queries resolve the active company via `getUserCompany`; company users cannot pass another tenant’s `companyId`. Work permits, government profile expiries, PRO services, and vault documents are scoped to that company. Sanad office licence alerts are shown only to platform operators. `triggerRenewal` binds `companyId` from membership (or explicit platform `companyId` with entity validation) and never inserts `companyId = 0`. Badge counts for work permits respect the same company scope for non-platform users.
- **Membership helpers:** `server/_core/membership.ts` (`getActiveCompanyMembership` / `requireActiveCompanyMembership`) delegates to `getUserCompany` so routers do not reimplement `company_members` queries with divergent `isActive` rules.
- **Stats / dashboard scope:** `resolveStatsCompanyFilter` and `resolvePlatformOrCompanyScope` in `server/_core/tenant.ts` centralize optional `input.companyId` handling for compliance-style stats vs operations/SLA dashboards (platform `null` = aggregate all tenants; company users forced to active membership).
- **Compliance:** All procedures use `resolveStatsCompanyFilter`; permit matrix loads permits only for in-scope employees plus `workPermits.companyId` when tenant-scoped; PASI line items are filtered by `payrollLineItems.companyId` matching the run.
- **Operations:** `getDailySnapshot`, `getAiInsights`, and `getTodaysTasks` scope SLA joins, cases, permits, leave, payroll, billing revenue, renewal runs, audit tail, contracts, and quotations to the active company when the caller is not platform staff.
- **SLA router:** Breaches list, performance summary aggregates, `startTracking`, `resolve`, and `getCaseSlaStatus` enforce government-case company ownership for non-platform users (inner-join / pre-check pattern). **`listRules` / `upsertRule` / `deleteRule`** on `service_sla_rules` are **platform-only** (`canAccessGlobalAdminProcedures`); company users receive `FORBIDDEN`.
- **Renewal workflows:** Company scope uses `resolvePlatformOrCompanyScope` (same as operations). Users without active membership can no longer list all rules or mutate arbitrary rules. Tenant **update/delete** is allowed only when `rule.companyId` matches their company (global template rules with `companyId` null are **not** mutable by tenants); cross-tenant id probes return **NOT_FOUND**.
- **Client portal:** `requirePortalCompanyId` uses `requireActiveCompanyId` and rejects platform accounts with a clear `FORBIDDEN` (portal is company-only).
- **Quotations:** Generated quotation HTML uploads use storage keys under `quotations/{companyId|creator-{userId}}/…` so objects are partitioned by tenant or legacy creator.
- **Storage:** `storagePut` / `storageGet` are server-only; callers must embed tenant in keys (e.g. `reports/payslips/${companyId}-…`). PDF/report routers validate `companyId` on source rows before upload.

## Production startup

**Decision:** `validateProductionEnvironment()` in `server/_core/env.ts` runs on server boot when `NODE_ENV=production` and exits if `DATABASE_URL`, `JWT_SECRET` (≥16 chars), `VITE_APP_ID`, or `OAUTH_SERVER_URL` is missing.
