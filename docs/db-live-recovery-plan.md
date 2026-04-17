# Live database — schema drift and table recovery

## 1) Where "missing tables" comes from

- **Source of truth for comparison:** `drizzle/schema.ts` (every `mysqlTable` export).
- **Runtime checker:** `server/schemaDriftGuard.ts` loads `Object.entries` from `../drizzle/schema`, reads each table's SQL name from Drizzle's internal `drizzle:Name` symbol, then compares:
  - table names → `information_schema.TABLES`
  - column names → `information_schema.COLUMNS`
- **Startup:** `server/_core/index.ts` calls `runSchemaDriftGuard()` after migrations (non-blocking; logs only).
- **Exact count on a given environment:** depends how many tables/columns already exist in that DB. A typical "mostly empty" live DB reported **162 missing tables and a small amount of column drift** (e.g. legacy `promoter_assignments` missing Phase 1+ columns, **plus** migration **0069** drift columns if those alters were not applied).

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

## 3) Migration 0070 — baseline table recovery

### 3.1 Shape after the staging-safety split

`0070` is now **tables-only** — the risky FK/index tail was moved out of the journaled migration because MySQL has no `ADD CONSTRAINT IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`.

| Artifact | Journaled? | Idempotent? | Statements |
|----------|------------|-------------|------------|
| `drizzle/0070_drizzle_baseline_schema_recovery.sql` | **yes** | **yes** (`CREATE TABLE IF NOT EXISTS`) | 163 tables |
| `drizzle/bootstrap/0070_constraints.sql` | no | no (single-apply) | 59 FKs |
| `drizzle/bootstrap/0070_indexes.sql` | no | no (single-apply) | 288 indexes |

**Generator:** `pnpm run db:build-baseline-0070` → `scripts/build-0070-baseline-migration.mjs`
Invokes `drizzle-kit export --schema ./drizzle/schema.ts --dialect mysql`, splits the output by statement type, rewrites `CREATE TABLE` → `CREATE TABLE IF NOT EXISTS`, and writes the three files above.

**Test coverage:** `server/schemaDriftGuard.test.ts` asserts that (a) `0070` has exactly one `CREATE TABLE IF NOT EXISTS` per Drizzle table and (b) `0070` contains **no** `ALTER TABLE` / `CREATE INDEX` statements (the split is enforced).

### 3.2 Why the FK/index tail is NOT journaled

On any DB that already has the matching constraints/indexes from historical loose migrations (`0018`…`0069`), re-running the FK/index tail would crash with duplicate-constraint / duplicate-index errors and leave the migration marked as un-applied. Excluding them from `meta/_journal.json` keeps `migrate()` safe on existing production and staging databases. For a **genuinely fresh** dev/staging DB, an operator applies `bootstrap/0070_constraints.sql` and `bootstrap/0070_indexes.sql` manually after `0070`.

### 3.3 Relationship to older numbered SQL files (`0018` … `0069`)

Those files remain in `drizzle/` for history and manual ops, but **many earlier files were never registered in `drizzle/meta/_journal.json`.** Drizzle's `migrate()` only runs files listed in the journal; the unjournaled ones must be applied separately (or their column deltas are picked up at boot by `server/runPendingMigrations.ts`).

**`0070` is the consolidation point aligned to current schema.** Future work **must** be small incremental migrations on top of `0070` — not another baseline dump.

## 4) Staging apply playbook

Pre-reqs: take a DB backup before any apply.

1. Run the automated migration pass (drizzle reads `meta/_journal.json`):
   ```bash
   pnpm run db:migrate
   ```
   This applies `0069` (if not already applied) and `0070` (tables-only).
2. Start the API once. `server/runPendingMigrations.ts` will idempotently add any missing columns / indexes listed in its `PENDING_*` arrays (currently covers drift from `0032` / `0033` / `0036` / `0039`–`0042` / `0052` / `0053` / `0058` / `0066` / `0067` / `0069`).
3. Read the `[drift-guard]` block in the startup log. Expected outcome on staging:
   - **Missing tables:** 0
   - **Missing columns:** 0 across `employees` / `companies` / `attendance_*` / `survey_*`
4. If drift remains, look at §5 for the single **manually deferred** cluster (`promoter_assignments`) and apply the matching history migration (`0061` / `0062` / `0063`) manually — it contains a `DROP COLUMN` and cannot be expressed as an additive startup fix.
5. If starting from a genuinely fresh DB (no rows, no historical FKs/indexes), also apply the bootstrap layer:
   ```bash
   mysql … < drizzle/bootstrap/0070_constraints.sql
   mysql … < drizzle/bootstrap/0070_indexes.sql
   ```
   Skip this step on any DB that already went through `0060` / earlier — the constraints/indexes are already there.

## 5) Column drift — what the startup runner now covers

`server/runPendingMigrations.ts` applies every missing column idempotently (inspects `information_schema.COLUMNS` before `ALTER`). Columns added in this pass:

| Migration history | Table | Columns (all additive, nullable or `DEFAULT`-ed) |
|-------------------|-------|-------------------------------------------------|
| `0058` | `employees` | `iban_number` |
| `0066` | `companies` | `company_size`, `established_at`, `company_type`, `omanization_required`, `omanization_ratio`, `mol_compliance_status`, `mol_last_checked_at`, `billing_model`, `subscription_fee`, `contract_start`, `contract_end`, `account_manager_id` |
| `0067` | `employees` | `basic_salary`, `housing_allowance`, `transport_allowance`, `other_allowances`, `total_salary`, `wps_status`, `wps_last_validated_at`, `probation_end_date`, `contract_type`, `notice_period_days`, `last_working_day`, `deployment_type`, `cost_to_company`, `salary_cost`, `margin_omr`, `is_omani` |
| `0066` / `0067` indexes | `companies`, `employees` | `idx_companies_mol_status`, `idx_companies_billing_model`, `idx_companies_contract_end`, `idx_emp_wps_status`, `idx_emp_deployment_type`, `idx_emp_is_omani`, `idx_emp_contract_type` |

### 5.1 Drift clusters NOT fixed by the startup runner (deferred)

These cannot be expressed as pure additive DDL and need a manual one-shot apply on any DB that missed the original migration:

| Source | Table | Reason |
|--------|-------|--------|
| `0061` | `promoter_assignments` | Contains `DROP COLUMN status` + new `assignment_status` enum backfill. Apply the full `0061` SQL manually. |
| `0062` / `0063` | `promoter_assignments` | Phase 1.5 / Phase 2 attendance column set. Apply the respective files manually. |
| `0064` / `0065` | various | Financial execution / hardening — apply files manually if drift guard flags their tables/columns. |
| `0068` | normalized compliance & finance | New tables only — already covered by `0070` `CREATE TABLE IF NOT EXISTS`. No action needed beyond `0070`. |

Staging operators should review `[drift-guard]` output, look up any remaining missing column in the history files above, and decide whether to patch manually or accept the gap (Tier 3 / unreachable features).

## 6) Migration operating policy (going forward)

1. **`0070` is the consolidation point.** Do **not** regenerate another giant baseline for routine schema changes.
2. **Future schema changes → small journaled migrations.** One file per logical change, idempotent where possible, always listed in `drizzle/meta/_journal.json`.
3. **Column drift → additive-only.** Either a small new migration file **or** a `PENDING_COLUMNS` entry in `server/runPendingMigrations.ts`. Never a `DROP` / `RENAME` at startup.
4. **Non-idempotent DDL (FKs, indexes) on a new migration** → either include a guard (look up `information_schema` first, like `runPendingMigrations.ts` does) **or** split into a documented bootstrap file.
5. **Regenerating `0070` is a maintenance op**, not a release op. Only re-run `pnpm run db:build-baseline-0070` when onboarding a brand-new environment; commit the updated SQL alongside.

## 7) Verification checklist (by module)

Run after the staging apply above, with the API started and `DATABASE_URL` set:

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

Then restart the API and confirm `[drift-guard]` logs **no missing tables** and no unexpected missing columns for active modules.

## 8) Recommended next steps

1. **Staging apply:** Follow §4 playbook; capture the `[drift-guard]` output after boot.
2. **Residual column drift (if any):** Patch via new `PENDING_COLUMNS` entries (preferred) or a small numbered SQL migration registered in the journal. Never another baseline dump.
3. **Promoter-assignment history gap:** Decide whether to manually apply `0061` / `0062` / `0063` on environments that missed them, or accept the gap for now (impacts promoter/outsourcing pages only).
4. **Tier 2/3 tables:** No extra batch required; the distinction is now useful for performance testing and deprecation planning, not for recovery.

## 9) Regenerating 0070 after schema changes

After editing `drizzle/schema.ts`:

```bash
pnpm run db:build-baseline-0070
```

This rewrites `drizzle/0070_drizzle_baseline_schema_recovery.sql` and both `drizzle/bootstrap/*.sql` files. Commit all three. Remember: in normal operation **do not regenerate** — add an incremental migration instead.
