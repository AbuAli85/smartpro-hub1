# Live database — schema drift and table recovery

## 1) Where “missing tables” comes from

- **Source of truth for comparison:** `drizzle/schema.ts` (every `mysqlTable` export).
- **Runtime checker:** `server/schemaDriftGuard.ts` loads `Object.entries` from `../drizzle/schema`, reads each table’s SQL name from Drizzle’s internal `drizzle:Name` symbol, then compares:
  - table names → `information_schema.TABLES`
  - column names → `information_schema.COLUMNS`
- **Startup:** `server/_core/index.ts` calls `runSchemaDriftGuard()` after migrations (non-blocking; logs only).
- **Exact count on a given environment:** depends how many tables/columns already exist in that DB. A typical “mostly empty” live DB reported **162 missing tables and a small amount of column drift** (e.g. legacy `promoter_assignments` missing Phase 1+ columns, **plus** migration **0069** drift columns if those alters were not applied).

## 2) Inventory (schema size)

- **Total tables in Drizzle:** **163** (see `pnpm exec tsx scripts/list-drizzle-tables.ts`).
- **Classification script:** `pnpm exec tsx scripts/classify-drizzle-table-usage.ts`  
  For each table export, counts how often its **symbol** appears in any file under `server/`, `client/`, `shared/` that imports `…/drizzle/schema` (reduces false positives for short names like `users`).

### 2.1 Operational tiers (automated cut-lines)

Thresholds are **code-reference frequency**, not business importance — use this as a first pass; override manually for known low-traffic but legally critical paths.

| Tier | Rule (reference count in schema-import files) | Count |
|------|-----------------------------------------------|-------|
| **Tier 1** | `refCount >= 20` | **100** |
| **Tier 2** | `5 <= refCount <= 19` | **48** |
| **Tier 3** | `refCount <= 4` or `refCount === 0` | **15** |

**Tier 3 with zero code references in schema-import files (review before creating on production):**

`client_messages`, `client_portal_tokens`, `contract_type_defs`, `customer_contracts`, `sanad_intel_center_metrics_yearly`

These are still in Drizzle (and in migration **0070**) so the DB can align with the schema when you intentionally enable those flows.

## 3) Controlled recovery — migration 0070

### 3.1 What was added

- **File:** `drizzle/0070_drizzle_baseline_schema_recovery.sql`  
- **Generator:** `pnpm run db:build-baseline-0070` → `scripts/build-0070-baseline-migration.mjs`  
  Invokes `drizzle-kit export --schema ./drizzle/schema.ts --dialect mysql`, strips the CLI banner, rewrites every `CREATE TABLE` → `CREATE TABLE IF NOT EXISTS`.
- **Journal:** Registered in `drizzle/meta/_journal.json` as tag `0070_drizzle_baseline_schema_recovery` (after `0060_identity_model_hardening`).

### 3.2 Semantics

- **Tables:** Idempotent — safe when only *some* tables are missing.
- **ALTER TABLE (FKs) / CREATE INDEX:** Taken from `drizzle-kit export` **after** the CREATE section. Applying **0070 twice** on a database that already has those constraints/indexes may error (duplicate FK/index). Treat **ALTER + INDEX** as *single-apply* on environments that already partially migrated.

### 3.3 Relationship to older numbered SQL files (`0061` … `0069`)

Those files remain in `drizzle/` for history and manual ops, but **many earlier snapshots were never registered in `drizzle/meta/_journal.json`.** Until the journal is fully reconciled, **`pnpm` `db:migrate` / `migrate()` only runs migrations listed in the journal.**  
**0070** is intended as a **single reviewed baseline** that matches **current** `drizzle/schema.ts`, reducing reliance on partially registered historical files.

## 4) Verification checklist (by module)

Run after applying **0070** (or after full migrate) on a staging DB with `DATABASE_URL` set:

| Area | Smoke |
|------|--------|
| **Auth / RBAC** | Sign-in, company switch, `users` / `company_members` / `platform_user_roles` paths |
| **HR / employees** | Employee list, profile, documents — `employees`, `employee_documents`, `work_permits` |
| **Attendance** | Clock in/out, sessions, operational issues — `attendance_records`, `attendance_sessions`, `attendance_operational_issues` |
| **Promoter / outsourcing** | Assignments, contracts, deployment — `promoter_assignments`, `outsourcing_*`, `customer_deployments` |
| **Payroll / WPS** | Payroll runs, WPS validation surfaces — `payroll_runs`, `employee_wps_validations`, `promoter_payroll_runs` |
| **Finance / billing** | Invoices, payments — `pro_billing_cycles`, `client_service_invoices`, `payment_gateway_sessions` |
| **Compliance / Omanization** | Snapshots — `company_omanization_snapshots` |
| **Sanad / surveys** | Pipelines, surveys — `sanad_centres_pipeline`, `surveys`, `survey_responses` |

Then restart the API and confirm `[drift-guard]` logs **no missing tables** (and no unexpected missing columns). Address **column** drift with **additive** migrations (pattern: **0069** / `server/runPendingMigrations.ts` for small, idempotent deltas).

## 5) Recommended next steps

1. **Staging:** Apply **0070**; run verification checklist; re-run drift guard.
2. **Column drift:** If anything remains (e.g. long-lived `promoter_assignments`), apply targeted **ALTER** migrations or extend `PENDING_COLUMNS` in `server/runPendingMigrations.ts` for idempotent startup repair.
3. **Journal hygiene (optional hardening):** Audit `drizzle/meta/_journal.json` vs all `drizzle/*.sql` files; add missing entries **or** rely on **0070** + newer incremental migrations only (document team choice).
4. **Tier 2/3 tables:** No extra batch required for drift **warnings** once **0070** is applied; Tier 2/3 distinction remains useful for **performance testing** and **deprecation** decisions later.

## 6) Regenerating 0070 after schema changes

After editing `drizzle/schema.ts`:

```bash
pnpm run db:build-baseline-0070
```

Commit the updated `0070` SQL and keep **journal** in sync if you add a **new** migration instead of regenerating 0070.
