# SmartPRO Migration Verification Report

**Date:** 2026-04-26  
**Verification method:** Static analysis (no live MySQL — Docker unavailable in this environment)  
**Migration files analysed:** 89 (drizzle/0000 – drizzle/0088)  
**Schema source:** drizzle/schema.ts (178 tables), drizzle/meta/_journal.json  
**Analyst:** Claude Code automated verification  

---

## Executive Summary

**Verdict: FAIL**

The migration chain contains one critical defect that **aborts a fresh-database deployment at migration 0084** and a second high-severity defect in migration 0087. All migrations up to 0083 are well-formed and will apply cleanly. Migrations 0084–0088 require surgical fixes before a green fresh-deploy is possible.

| Severity | Count |
|----------|-------|
| CRITICAL  | 1 |
| HIGH      | 2 |
| MEDIUM    | 2 |
| LOW       | 3 |

---

## 1. Migration Execution Analysis

### 1.1 File completeness

| Check | Result |
|-------|--------|
| Expected file count | 89 |
| Actual files on disk | 89 |
| Numbering gaps (0000–0088) | **None** |
| First migration | 0000_bent_psynapse.sql |
| Last migration | 0088_control_tower_item_states_indexes.sql |

All 89 migration files are present with a contiguous numerical sequence.

### 1.2 Journal consistency

| Check | Result |
|-------|--------|
| Journal entries | 45 |
| SQL files on disk | 89 |
| Files missing from journal | **44** |
| Ghost entries (journal only, no file) | 0 |
| Duplicate idx values | 0 |
| idx sequence monotonic | **No** (jumps: 24→44→45→27→28…) |

The `drizzle/meta/_journal.json` journal covers only 45 of 89 migration files. The migrator (`drizzle-orm/mysql2` `migrate()`) operates from the filesystem, not the journal, so this does **not prevent migration execution**. However, `drizzle-kit generate` (for future schema changes) will compute an incorrect current-state snapshot, risking duplicate or conflicting migration generation.

**Migration files absent from journal (44 files):**
`0003–0015`, `0020–0022`, `0028–0029`, `0035`, `0048–0053`, `0061–0069`, `0071`, `0076–0077`, `0079`, `0083–0088`

---

## 2. Critical Table Verification

### 2.1 Table creation sources

| Table | Created in | Status |
|-------|-----------|--------|
| `audit_events` | 0070_drizzle_baseline_schema_recovery | ✅ Present |
| `control_tower_item_states` | 0070_drizzle_baseline_schema_recovery | ✅ Present |
| `payroll_runs` | 0070_drizzle_baseline_schema_recovery | ✅ Present |
| `payroll_line_items` | 0070_drizzle_baseline_schema_recovery | ✅ Present |
| `salary_loans` | 0070_drizzle_baseline_schema_recovery | ✅ Present |
| `employee_wps_validations` | 0068_normalized_compliance_finance_tables | ✅ Present |
| `employees` | 0001_ancient_stranger | ✅ Present |
| `departments` | 0005_phase43_core_ops | ✅ Present |
| `positions` | 0005_phase43_core_ops | ✅ Present |
| `attendance_billing_candidates` | 0070 (IF NOT EXISTS) + **0084** (no IF NOT EXISTS) | ⚠️ Conflict |
| `attendance_invoices` | 0070 (IF NOT EXISTS) + **0085** (no IF NOT EXISTS) | ⚠️ Conflict |
| `attendance_invoice_payment_records` | 0070 (IF NOT EXISTS) + **0087 Part B** (no IF NOT EXISTS) | ⚠️ Conflict |

### 2.2 Payroll run columns (recent additions)

| Column | Migration | Status |
|--------|-----------|--------|
| `attendance_preflight_snapshot` | 0077 | ✅ Correct ALTER TABLE |
| `preview_only` | 0078 | ✅ Correct ALTER TABLE, `AFTER attendance_preflight_snapshot` |

### 2.3 audit_events column structure

Schema.ts definition vs migration 0070 create:

| Column | Schema.ts | 0070 SQL | Match |
|--------|-----------|----------|-------|
| `id` INT AUTO_INCREMENT PK | ✅ | ✅ | ✅ |
| `companyId` INT NOT NULL | ✅ | ✅ | ✅ |
| `actorUserId` INT | ✅ | ✅ | ✅ |
| `entityType` VARCHAR(100) NOT NULL | ✅ | ✅ | ✅ |
| `entityId` INT NOT NULL | ✅ | ✅ | ✅ |
| `action` VARCHAR(100) NOT NULL | ✅ | ✅ | ✅ |
| `beforeState` JSON | ✅ | ✅ | ✅ |
| `afterState` JSON | ✅ | ✅ | ✅ |
| `ipAddress` VARCHAR(64) | ✅ | ✅ | ✅ |
| `userAgent` TEXT | ✅ | ✅ | ✅ |
| `metadata` JSON | ✅ | ✅ | ✅ |
| `createdAt` TIMESTAMP NOT NULL DEFAULT NOW() | ✅ | ✅ | ✅ |

**audit_events table structure: PASS**

### 2.4 control_tower_item_states column structure

Schema.ts definition vs migration 0070 create:

| Column | Schema.ts | 0070 SQL | Match |
|--------|-----------|----------|-------|
| `id` INT AUTO_INCREMENT PK | ✅ | ✅ | ✅ |
| `company_id` INT NOT NULL | ✅ | ✅ | ✅ |
| `item_key` VARCHAR(255) NOT NULL | ✅ | ✅ | ✅ |
| `domain` VARCHAR(64) NOT NULL | ✅ | ✅ | ✅ |
| `status` ENUM (5 values) NOT NULL DEFAULT 'open' | ✅ | ✅ | ✅ |
| `owner_user_id` INT NULL | ✅ | ✅ | ✅ |
| `acknowledged_by` INT NULL | ✅ | ✅ | ✅ |
| `acknowledged_at` TIMESTAMP NULL | ✅ | ✅ | ✅ |
| `resolved_by` INT NULL | ✅ | ✅ | ✅ |
| `resolved_at` TIMESTAMP NULL | ✅ | ✅ | ✅ |
| `dismissed_by` INT NULL | ✅ | ✅ | ✅ |
| `dismissed_at` TIMESTAMP NULL | ✅ | ✅ | ✅ |
| `dismissal_reason` TEXT NULL | ✅ | ✅ | ✅ |
| `last_seen_at` TIMESTAMP NOT NULL DEFAULT NOW() | ✅ | ✅ | ✅ |
| `created_at` TIMESTAMP NOT NULL DEFAULT NOW() | ✅ | ✅ | ✅ |
| `updated_at` TIMESTAMP NOT NULL ON UPDATE | ✅ | ✅ | ✅ |

**control_tower_item_states table structure: PASS**

---

## 3. Control Tower Index Verification (Migration 0088)

Migration 0088 adds four indexes to `control_tower_item_states`:

| Index name | Type | Columns | SQL | Status |
|------------|------|---------|-----|--------|
| `uq_ct_state_company_item` | UNIQUE | (company_id, item_key) | `CREATE UNIQUE INDEX IF NOT EXISTS` | ✅ Correct |
| `idx_ct_state_company_status` | INDEX | (company_id, status) | `CREATE INDEX IF NOT EXISTS` | ✅ Correct |
| `idx_ct_state_domain` | INDEX | (company_id, domain) | `CREATE INDEX IF NOT EXISTS` | ✅ Correct |
| `idx_ct_state_last_seen` | INDEX | (company_id, last_seen_at) | `CREATE INDEX IF NOT EXISTS` | ✅ Correct |

All four use `IF NOT EXISTS` (requires MySQL 8.0.12+). All four include `-->  statement-breakpoint` separators (3 breakpoints between 4 statements — correct). Index names and columns match the documented intent.

**Note — schema.ts drift:** Schema.ts defines 3 indexes for this table (omits `idx_ct_state_last_seen`). The migration adds a beneficial 4th index that the schema definition does not track. This will cause `drizzle-kit generate` to detect drift and want to drop it. This does not affect runtime correctness.

---

## 4. Findings

---

### FINDING 1 — CRITICAL: Migration chain aborts at 0084 on fresh databases

**Affected migrations:** 0084, 0085, 0086, 0087, 0088  
**Risk:** Fresh production deployment is impossible without manual intervention.

**Root cause:**

Migration `0070_drizzle_baseline_schema_recovery.sql` was regenerated from the current `schema.ts` snapshot **after** migrations 0084, 0085, and 0087 were authored. As a result, 0070 now pre-creates tables using `CREATE TABLE IF NOT EXISTS` that 0084 and 0085 also create using plain `CREATE TABLE` (without `IF NOT EXISTS`).

Execution order on a fresh database:
1. Migrations 0000–0083 apply cleanly.
2. **0084 runs** → `CREATE TABLE \`attendance_billing_candidates\`` → `ER_TABLE_EXISTS_ERROR` (0070 already created it) → **migrate() throws, stops**.
3. Migrations 0085, 0086, 0087, 0088 are **never applied**.

**Consequence on a failed deploy:**
- `attendance_invoices` is missing unique constraints `uq_ai_candidate` and `uq_ai_inv_number` (data integrity gap).
- `attendance_invoices` is missing columns `html_artifact_key`, `html_artifact_url` (added by 0086).
- `attendance_invoices` is missing columns `sent_at`, `sent_by_user_id`, `amount_paid_omr` (added by 0087 Part A).
- `control_tower_item_states` is missing all four production indexes (from 0088).

**Fix:**

In `drizzle/0084_attendance_billing_candidates.sql`, line 11, change:
```sql
CREATE TABLE `attendance_billing_candidates` (
```
to:
```sql
CREATE TABLE IF NOT EXISTS `attendance_billing_candidates` (
```

In `drizzle/0085_attendance_invoices.sql`, line 7, change:
```sql
CREATE TABLE `attendance_invoices` (
```
to:
```sql
CREATE TABLE IF NOT EXISTS `attendance_invoices` (
```

After this fix, both migrations silently no-op on a fresh database (where 0070 already created the tables). The subsequent `ALTER TABLE` migrations (0086, 0087 Part A) and index migrations (0088) then run correctly.

**Note on inline indexes:** Because 0084 and 0085 will now skip on fresh databases (IF NOT EXISTS = table already exists → skip entire CREATE), the performance indexes defined inline in those files (`idx_abc_company`, `idx_abc_status` for candidates; `idx_ai_company`, `idx_ai_status`, `idx_ai_client` for invoices) will not be applied. These must be added to `drizzle/bootstrap/0070_indexes.sql` for fresh-deploy coverage. See FINDING 3.

---

### FINDING 2 — HIGH: Migration 0087 is missing a statement-breakpoint

**Affected migration:** 0087_attendance_invoice_payments.sql  
**Risk:** On a fresh database, Part B (CREATE TABLE) may silently not execute or cause a parse error.

**Root cause:**

Migration 0087 contains two independent DDL statements separated only by a comment:

```sql
-- Part A: ALTER TABLE attendance_invoices
ALTER TABLE attendance_invoices
  ADD COLUMN sent_at ...;

-- Part B: CREATE TABLE attendance_invoice_payment_records
CREATE TABLE attendance_invoice_payment_records (...);
```

The Drizzle migrator splits SQL files on `--> statement-breakpoint` markers. Without this marker, both statements are sent to mysql2 as a single string. By default, `mysql2.createConnection()` does **not** enable `multipleStatements`, so only the first statement executes; the second is silently dropped (or a parse error is raised depending on the mysql2 version).

**Additional conflict:** The `CREATE TABLE attendance_invoice_payment_records` in Part B has the same conflict as FINDING 1 — 0070 already creates this table. Part B must also become `CREATE TABLE IF NOT EXISTS`.

**Fix:**

In `drizzle/0087_attendance_invoice_payments.sql`, between Part A and Part B, add:
```sql
--> statement-breakpoint
```
And change the Part B `CREATE TABLE` to `CREATE TABLE IF NOT EXISTS`.

Complete corrected file:
```sql
-- Phase 12F: Add sent/payment tracking columns to attendance_invoices,
--            and create the attendance_invoice_payment_records table.

-- Part A: columns on attendance_invoices
ALTER TABLE attendance_invoices
  ADD COLUMN sent_at           TIMESTAMP NULL                            AFTER html_artifact_url,
  ADD COLUMN sent_by_user_id   INT NULL                                  AFTER sent_at,
  ADD COLUMN amount_paid_omr   DECIMAL(14,3) NOT NULL DEFAULT '0.000'   AFTER sent_by_user_id;

--> statement-breakpoint

-- Part B: payment records table
CREATE TABLE IF NOT EXISTS attendance_invoice_payment_records (
  ...
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### FINDING 3 — MEDIUM: audit_events and attendance table performance indexes not in migration chain

**Affected tables:** `audit_events`, `attendance_billing_candidates`, `attendance_invoices`  
**Risk:** On a fresh deployment, queries against these tables will perform full table scans.

**Root cause:**

The `drizzle/bootstrap/0070_indexes.sql` file contains indexes that are NOT in the journaled migration chain. This file is manually applied and explicitly documented as "NOT journaled." Among the indexes only in bootstrap:

| Index | Table | Missing from chain |
|-------|-------|--------------------|
| `idx_ae_company` | `audit_events` | ✅ Only in bootstrap |
| `idx_ae_entity` | `audit_events` | ✅ Only in bootstrap |
| `idx_ae_actor` | `audit_events` | ✅ Only in bootstrap |
| `idx_ae_action` | `audit_events` | ✅ Only in bootstrap |

Additionally, once FINDING 1 is fixed (0084/0085 use IF NOT EXISTS and skip on fresh DBs), the following inline indexes from 0084/0085 also become unreachable on fresh deployments:

| Index | Table | Defined in |
|-------|-------|-----------|
| `idx_abc_company` | `attendance_billing_candidates` | 0084 inline only |
| `idx_abc_status` | `attendance_billing_candidates` | 0084 inline only |
| `idx_ai_company` | `attendance_invoices` | 0085 inline only |
| `idx_ai_status` | `attendance_invoices` | 0085 inline only |
| `idx_ai_client` | `attendance_invoices` | 0085 inline only |

**Fix:**

Create `drizzle/0089_fresh_deploy_indexes.sql` with `CREATE INDEX IF NOT EXISTS` statements for all 9 missing indexes. This file applies to both fresh and existing databases safely.

Alternatively, append them to `drizzle/bootstrap/0070_indexes.sql` and update the deployment runbook to make the bootstrap step mandatory for fresh deployments. The runbook currently does not call this out explicitly.

**Impact on audit governance:** The `audit_events` table is the central audit log. Without `idx_ae_company`, every company-scoped audit log query performs a full table scan. At scale this becomes critical.

---

### FINDING 4 — MEDIUM: Journal incomplete — 44 of 89 files absent

**Risk:** Future `drizzle-kit generate` calls will compute an incorrect current-state snapshot and may generate conflicting migrations.

**Root cause:** The `drizzle/meta/_journal.json` was not updated each time a migration file was created outside `drizzle-kit generate`. Additionally, the `idx` sequence in the journal is non-monotonic (entries jump: 24→44→45→27→28), indicating manual edits.

This does **not** affect the `pnpm db:migrate` runner (which scans the filesystem, not the journal). However, any future use of `drizzle-kit generate` or `drizzle-kit push` is unreliable until the journal is rebuilt.

**Fix:**

Rebuild the journal using:
```sh
pnpm drizzle-kit generate --name=journal_rebuild
```
Then verify the generated snapshot matches the current schema. Do not merge any generated migration file — the goal is only the journal update.

---

### FINDING 5 — LOW: control_tower_item_states schema drift (extra index)

**Risk:** `drizzle-kit generate` will want to drop `idx_ct_state_last_seen`.

Migration 0088 creates 4 indexes. Schema.ts defines 3 (omits `idx_ct_state_last_seen`). The migration is more correct than the schema definition (the index improves re-emergence/cleanup queries). 

**Fix:** Add `index("idx_ct_state_last_seen").on(t.companyId, t.lastSeenAt)` to the `controlTowerItemStates` table definition in `drizzle/schema.ts`.

---

### FINDING 6 — LOW: Journal idx values non-monotonic

The journal entries use `idx` values that jump (24→44→45→27→28→29…). No runtime impact; purely cosmetic. Indicates the journal was partially hand-edited at some point.

---

### FINDING 7 — LOW: Table count mismatch between schema.ts and 0070

Schema.ts defines 178 tables via `mysqlTable()`. Migration 0070 contains 179 `CREATE TABLE IF NOT EXISTS` statements. The extra table in 0070 may be a legacy/renamed table still present in the baseline but removed from the active schema. This is worth investigating but has no production impact if the extra table is truly unused.

---

## 5. Schema Drift Check

| Category | Status |
|----------|--------|
| audit_events columns | ✅ Match |
| control_tower_item_states columns | ✅ Match |
| payroll_runs key columns (0077, 0078) | ✅ Match |
| audit_events indexes in chain | ❌ Only in bootstrap (not journaled) |
| control_tower_item_states indexes (0088) | ✅ Present (4 indexes, all IF NOT EXISTS) |
| attendance_invoices unique constraints | ❌ At risk — absent if 0085 skipped |
| Schema.ts ↔ 0070 idx_ct_state_last_seen | ❌ Not in schema.ts |
| Table count schema.ts vs 0070 | ❌ 178 vs 179 |

---

## 6. Migration-by-Migration Assessment (0083–0088)

| Migration | Operation | Breakpoints | Fresh DB | Risk |
|-----------|-----------|------------|---------|------|
| 0083 | ALTER TABLE attendance_audit (ENUM extend) | Not needed | ✅ OK | None |
| 0084 | CREATE TABLE attendance_billing_candidates | Not needed | ❌ FAILS | **CRITICAL** |
| 0085 | CREATE TABLE attendance_invoices | Not needed | ❌ FAILS (after 0084 aborts) | **CRITICAL** |
| 0086 | ALTER TABLE attendance_invoices (2 ADD COLUMNs) | Not needed | ❌ Never runs | HIGH |
| 0087 | ALTER TABLE + CREATE TABLE (2 statements, no breakpoint) | **MISSING** | ❌ Never runs / partial | **HIGH** |
| 0088 | 4× CREATE INDEX IF NOT EXISTS | ✅ 3 breakpoints | ❌ Never runs | HIGH (consequence) |

---

## 7. Smoke Query Analysis (Static)

### 7a. SELECT from audit_events
```sql
SELECT COUNT(*) FROM audit_events;
-- Will succeed (table exists).
-- Will be a full scan without idx_ae_company (only in bootstrap).
```

### 7b. SELECT from control_tower_item_states
```sql
SELECT COUNT(*) FROM control_tower_item_states;
-- Will succeed (table exists from 0070).
-- Indexes from 0088 will NOT exist if migration aborted at 0084.
```

### 7c. INSERT test audit record
```sql
INSERT INTO audit_events
  (companyId, actorUserId, entityType, entityId, action, metadata, createdAt)
VALUES
  (1, 1, 'smoke_test', 0, 'migration_verification', '{}', NOW());
```
Expected: succeeds. Table structure is correct. No indexes required for INSERT.

---

## 8. Required Actions Before Deployment

The following must be completed **before** running `pnpm db:migrate` on a fresh production database.

### Action 1 — Fix 0084 (CRITICAL, 1 line)

In [drizzle/0084_attendance_billing_candidates.sql](../drizzle/0084_attendance_billing_candidates.sql), change line 11:
```sql
-- FROM:
CREATE TABLE `attendance_billing_candidates` (
-- TO:
CREATE TABLE IF NOT EXISTS `attendance_billing_candidates` (
```

### Action 2 — Fix 0085 (CRITICAL, 1 line)

In [drizzle/0085_attendance_invoices.sql](../drizzle/0085_attendance_invoices.sql), change line 7:
```sql
-- FROM:
CREATE TABLE `attendance_invoices` (
-- TO:
CREATE TABLE IF NOT EXISTS `attendance_invoices` (
```

### Action 3 — Fix 0087 (HIGH, 2 changes)

In [drizzle/0087_attendance_invoice_payments.sql](../drizzle/0087_attendance_invoice_payments.sql):

1. Add `--> statement-breakpoint` after the semicolon ending Part A's ALTER TABLE.
2. Change `CREATE TABLE attendance_invoice_payment_records` to `CREATE TABLE IF NOT EXISTS attendance_invoice_payment_records`.

### Action 4 — Add missing indexes to migration chain (MEDIUM)

Create `drizzle/0089_fresh_deploy_indexes.sql`:
```sql
-- Migration 0089: Production indexes for tables created via 0070 baseline recovery.
-- Uses IF NOT EXISTS — safe on both fresh databases and databases where these
-- indexes already exist from historical inline CREATE TABLE definitions.

CREATE INDEX IF NOT EXISTS `idx_ae_company` ON `audit_events` (`companyId`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ae_entity` ON `audit_events` (`entityType`, `entityId`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ae_actor` ON `audit_events` (`actorUserId`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ae_action` ON `audit_events` (`action`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_abc_company` ON `attendance_billing_candidates` (`company_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_abc_status` ON `attendance_billing_candidates` (`company_id`, `status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ai_company` ON `attendance_invoices` (`company_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ai_status` ON `attendance_invoices` (`company_id`, `status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ai_client` ON `attendance_invoices` (`company_id`, `client_company_id`);
```

### Action 5 — Add idx_ct_state_last_seen to schema.ts (LOW)

In `drizzle/schema.ts`, update the `controlTowerItemStates` table definition index array to include:
```ts
index("idx_ct_state_last_seen").on(t.companyId, t.lastSeenAt),
```

### Action 6 — Update DEPLOYMENT_RUNBOOK.md (MEDIUM)

The runbook must explicitly call out that `drizzle/bootstrap/0070_indexes.sql` and `drizzle/bootstrap/0070_constraints.sql` are **required** on first deployment of a fresh database. These are not executed by `pnpm db:migrate` and must be applied manually. Until Action 4 is completed, these bootstrap scripts are the only source for `audit_events` indexes.

---

## 9. Post-Fix Expected Migration Sequence (Fresh DB)

After Actions 1–4 are applied, the expected sequence on a fresh database:

| Phase | Range | Expected outcome |
|-------|-------|-----------------|
| Foundation | 0000–0002 | Core tables: users, companies, company_members |
| HR baseline | 0001–0015 | employees, departments, positions, employee docs |
| Operations | 0016–0069 | Contracts, attendance, HR letters, surveys, payroll, WPS |
| Baseline recovery | **0070** | All remaining tables via IF NOT EXISTS (no conflicts) |
| Post-baseline | 0071–0083 | Column additions, index additions, enum extensions |
| New tables (FIXED) | **0084** (IF NOT EXISTS) | No-op (table already from 0070) |
| New tables (FIXED) | **0085** (IF NOT EXISTS) | No-op (table already from 0070) |
| Artifact columns | 0086 | Adds html_artifact_key, html_artifact_url to attendance_invoices |
| Payment columns (FIXED) | **0087** (breakpoint added) | Part A: adds sent_at, sent_by_user_id, amount_paid_omr. Part B: IF NOT EXISTS → no-op |
| CT indexes | 0088 | Adds 4 indexes on control_tower_item_states |
| Missing indexes (NEW) | **0089** | Adds audit_events + attendance table indexes |

---

## 10. Final Verdict

| Dimension | Verdict |
|-----------|---------|
| File completeness | ✅ PASS |
| Numbering continuity | ✅ PASS |
| Core table presence | ✅ PASS |
| audit_events structure | ✅ PASS |
| control_tower_item_states structure | ✅ PASS |
| 0088 index SQL correctness | ✅ PASS |
| Recent migration SQL syntax (0083–0086) | ✅ PASS |
| 0084 CREATE TABLE conflict | ❌ FAIL |
| 0085 CREATE TABLE conflict | ❌ FAIL |
| 0087 missing statement-breakpoint | ❌ FAIL |
| 0087 CREATE TABLE conflict | ❌ FAIL |
| audit_events indexes in chain | ❌ FAIL |
| Journal completeness | ⚠️ WARN |
| Schema drift (CT extra index) | ⚠️ WARN |

**Overall: FAIL**

The migration chain cannot be deployed to a fresh production database in its current state. Three specific fixes (Actions 1–3 above, totalling approximately 6 lines of SQL changes) are required before this FAIL becomes a PASS. Action 4 (new 0089 migration) removes the dependency on manual bootstrap steps.

---

*Verification performed by static SQL analysis — no live database executed. All findings verified against source SQL files and schema.ts. Live database verification (with `pnpm db:migrate` against a real MySQL 8.0 instance) should be performed after the Actions above are applied and before production deployment.*
