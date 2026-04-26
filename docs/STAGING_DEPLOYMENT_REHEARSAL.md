# SmartPRO Staging Deployment Rehearsal

**Date:** 2026-04-26  
**Verdict: PASS** (with one defect found and fixed during rehearsal)  
**Environment:** MySQL 8.4.8 (local), Windows 11 Pro, Node 24.12.0, pnpm 10.33.0  
**Database:** `smartpro_staging` (dedicated staging schema, fresh)  
**DB user:** `smartpro_staging` (least-privilege, scoped to staging schema only)  
**Port:** 3000  
**Credentials:** Non-production staging credentials only — no production keys used

---

## Prerequisites Check

| Tool | Required | Found | Status |
|------|---------|-------|--------|
| Node | 20+ | v24.12.0 | PASS |
| pnpm | 10.33.0 | 10.33.0 | PASS |
| MySQL | 8.0+ | 8.4.8 | PASS |
| Docker | 24+ | not available | N/A — non-Docker path used |
| MySQL CLI in PATH | optional | not in bash PATH | N/A — PowerShell used for DB queries |

> **Deployment path used:** Local non-Docker (`pnpm install → pnpm db:migrate → pnpm build → node dist/index.js`).  
> Docker Compose is the primary production target per runbook; this rehearsal validated the runbook's non-Docker path, which is equivalent in terms of application and migration logic.

---

## 1. Credential Verification

**No production credentials used.** All secrets are staging-only:

| Variable | Value (policy only — no actual value printed) | Status |
|---------|----------------------------------------------|--------|
| `DATABASE_URL` | `mysql://smartpro_staging:***@localhost:3306/smartpro_staging` | Staging DB only |
| `JWT_SECRET` | 51-char staging-only string | Not production |
| `OAUTH_SERVER_URL` | `https://api.manus.im` | Same IdP for staging |
| `THAWANI_SANDBOX` | `true` | Sandbox enforced |
| `STRIPE_SECRET_KEY` | not set | Payment features disabled |
| `THAWANI_SECRET_KEY` | not set | Payment features disabled |
| `RESEND_API_KEY` | not set | Email delivery disabled |

Payment gateway warned at startup (expected): `[SmartPRO] Payment gateway not fully configured (features disabled): THAWANI_SECRET_KEY, THAWANI_WEBHOOK_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET` — app continues, payment routes are disabled.

---

## 2. Environment Setup

```sh
# Staging database and user created
mysql -u root -e "
  CREATE DATABASE smartpro_staging CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER 'smartpro_staging'@'localhost' IDENTIFIED BY '<staging_pass>';
  GRANT ALL PRIVILEGES ON smartpro_staging.* TO 'smartpro_staging'@'localhost';
"

# .env written with staging credentials
# .gitignore confirmed .env is ignored: .gitignore:11:.env  .env
```

---

## 3. Dependency Install

```sh
pnpm install --frozen-lockfile
# Done in 9.2s using pnpm v10.33.0
```

**Result:** PASS

---

## 4. Migration

### Dry run

```sh
pnpm db:migrate:dry
# 90 migration files listed, 49 journal entries, fresh DB detected
```

### Apply

```sh
DATABASE_URL=<staging> pnpm db:migrate
```

**First run result:**
```
⚡  Fresh database detected — applying baseline recovery first …
  → 0070_drizzle_baseline_schema_recovery  (1 segment(s)) … ✓
⏳  Applying 48 pending migration(s) …
  [48 entries applied, with expected ER_TABLE_EXISTS_ERROR / ER_DUP_FIELDNAME idempotent skips]
✅  All migrations applied successfully.
```

### Defect found during rehearsal: 0079 missing from journal

**Symptom:** Drift guard reported `companies.enabledModules` missing at server startup.

**Root cause:** `0079_capability_modules.sql` adds `enabledModules json` to the `companies` table, but `0079` was never added to `drizzle/meta/_journal.json`. The 0070 baseline predates this migration and does not include the column. On fresh deployments the column was never created.

**Fix applied:**
- Added journal entry for `0079_capability_modules` (idx 42, between 0078 and 0080) to `drizzle/meta/_journal.json`.
- Re-ran `pnpm db:migrate` → applied 1 pending migration.
- Verified column appeared: `COLUMN_NAME=enabledModules, COLUMN_TYPE=json, IS_NULLABLE=YES`.

**Second run:**
```
⏳  Applying 1 pending migration(s) …
  → 0079_capability_modules  (1 segment(s)) … ✓
✅  All migrations applied successfully.
```

**Final applied count:** 50 (49 journal entries + 0079).

**Migration result:** PASS (after fix)

---

## 5. Build

```sh
NODE_ENV=production pnpm build
# vite v7.3.2 — 3695 modules transformed — built in 30.12s
# esbuild server bundle: dist/index.js (3.18 MB)
```

**Warnings (non-blocking):**
- `%VITE_ANALYTICS_ENDPOINT%` and `%VITE_ANALYTICS_WEBSITE_ID%` — undefined Umami analytics env vars. Analytics script tag in `index.html` is left as-is; no runtime impact (script is external).
- Three chunks >500 KB after minification: `exceljs.min` (936 KB), `index.js` (1.01 MB), `CartesianChart` (335 KB). These are code-split warnings, not errors.

**Result:** PASS

---

## 6. Start

```sh
NODE_ENV=production node dist/index.js
```

**Startup log (clean run after fix):**
```
[OAuth] Initialized with baseURL: https://api.manus.im
[SmartPRO] Payment gateway not fully configured (features disabled): THAWANI_SECRET_KEY, THAWANI_WEBHOOK_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
Server running on http://localhost:3000/
```

No drift-guard warnings, no errors.

**Result:** PASS

---

## 7. Post-Deploy Smoke Tests

### 7a. Health check

```sh
curl -sf http://localhost:3000/health
# {"ok":true,"ts":1777201700721}
```

**Result:** PASS

### 7b. Root page

```sh
curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3000/
# HTTP 200
```

SPA serves `index.html` on all routes (login page rendered by React client router).

**Result:** PASS

### 7c. Auth smoke test — protected endpoints reject unauthenticated requests

```sh
# Query (GET) without auth cookie
curl -G http://localhost:3000/api/trpc/controlTower.myAccess \
  --data-urlencode 'input={"json":{"companyId":1}}'
# {"error":{"json":{"message":"Please login (10001)","code":-32001,
#   "data":{"code":"UNAUTHORIZED","httpStatus":401,"path":"controlTower.myAccess"}}}}

curl -G http://localhost:3000/api/trpc/hr.listEmployees \
  --data-urlencode 'input={"json":{"companyId":1}}'
# {"error":{"json":{"message":"Please login (10001)","code":-32001,
#   "data":{"code":"UNAUTHORIZED","httpStatus":401,"path":"hr.listEmployees"}}}}
```

Both protected procedures return `UNAUTHORIZED / HTTP 401` for unauthenticated callers.

**Result:** PASS

### 7d. Control Tower indexes

```sql
SHOW INDEX FROM control_tower_item_states;
```

| Index | Unique | Columns |
|-------|--------|---------|
| `PRIMARY` | YES | `id` |
| `uq_ct_state_company_item` | YES (NON_UNIQUE=0) | `company_id`, `item_key` |
| `idx_ct_state_company_status` | NO | `company_id`, `status` |
| `idx_ct_state_domain` | NO | `company_id`, `domain` |
| `idx_ct_state_last_seen` | NO | `company_id`, `last_seen_at` |

All four indexes from runbook section 5d confirmed.

**Result:** PASS

### 7e. Control Tower uniqueness constraint

```sql
-- Insert 1: succeeds
INSERT INTO control_tower_item_states (company_id, item_key, domain, status)
VALUES (1, 'smoke_test_key', 'hr', 'open');  -- OK

-- Insert 2: duplicate (same company_id + item_key) — must reject
INSERT INTO control_tower_item_states (company_id, item_key, domain, status)
VALUES (1, 'smoke_test_key', 'hr', 'open');
-- ERROR 1062 (23000): Duplicate entry '1-smoke_test_key'
--   for key 'control_tower_item_states.uq_ct_state_company_item'
```

Constraint `uq_ct_state_company_item` correctly rejects duplicate `(company_id, item_key)`.

**Result:** PASS

### 7f. audit_events write smoke test

```sql
INSERT INTO audit_events (companyId, actorUserId, entityType, entityId, action, metadata)
VALUES (1, NULL, 'staging_rehearsal', 1, 'staging_smoke_test',
        JSON_OBJECT('note', 'staging deployment rehearsal write test', 'date', '2026-04-26'));

SELECT companyId, entityType, entityId, action, metadata, createdAt
FROM audit_events ORDER BY id DESC LIMIT 1;
-- companyId=1, entityType=staging_rehearsal, entityId=1,
-- action=staging_smoke_test, createdAt=2026-04-26 14:58:13
```

Row written and read back successfully. `createdAt` auto-populated by `DEFAULT_GENERATED now()`.

**Result:** PASS

### 7g. Role-boundary: company_member cannot access Control Tower

Control Tower router comment:
```
All procedures require an authenticated session (protectedProcedure).
Read procedures call requireCanViewCompanyControlTower() — admits
  platform_ops, company_admin, and specific domain-scoped admin roles.
Mutation procedures call requireCanManageControlTower() — company_admin,
  platform_ops only.
```

Unit test suite run:

```sh
pnpm vitest run server/routers/controlTower.access.test.ts
# ✓ 39 tests — all pass (13ms)

pnpm vitest run server/routers/controlTower.governance.test.ts
# ✓ 70 tests — all pass (25ms)
```

Access tests explicitly cover `company_member` rejection from Control Tower. 39 + 70 = **109 tests all passing**.

**Result:** PASS

### 7h. Audit logging unit tests

```sh
pnpm vitest run server/auditLogging.test.ts server/auditor.test.ts
# ✓ 42 + 25 = 67 tests — all pass (88ms)
```

**Result:** PASS

---

## 8. Defects Found and Fixed

| # | Defect | Severity | Fix | Status |
|---|--------|---------|-----|--------|
| 1 | `0079_capability_modules` missing from `drizzle/meta/_journal.json` — `companies.enabledModules` (json) absent on fresh deploy | P1 — missing column causes drift-guard warning and may cause runtime errors for capability-gated features | Added journal entry idx 42 between 0078 and 0080; re-ran migrations; column confirmed present | FIXED |

---

## 9. Warnings (Non-Blocking, No Fix Required)

| Warning | Source | Impact |
|---------|--------|--------|
| `%VITE_ANALYTICS_ENDPOINT%` undefined | Umami analytics tag in `index.html` | External analytics script not loaded; no app impact |
| Build chunks >500 KB | exceljs, recharts, main bundle | Performance concern for initial load; not a correctness issue |
| Payment gateway not configured | `validateProductionEnvironment()` | Expected for staging; payment routes disabled gracefully |

---

## 10. Migration Journal State After Rehearsal

| Metric | Value |
|--------|-------|
| Journal entries (after fix) | 50 |
| Applied migrations in DB | 50 |
| Last applied | `0089_fresh_deploy_indexes` |
| Drift warnings at startup | 0 |

---

## 11. Manual Ops Required Before Production Cut-Over

These items from the P0 secrets audit remain outstanding and block production (not staging):

| # | Item |
|---|------|
| 1 | Set `MYSQL_ROOT_PASSWORD` and `MYSQL_PASSWORD` in production secrets manager |
| 2 | Back up `TWO_FACTOR_ENCRYPTION_KEY` to secrets manager before first production write |
| 3 | Set `.env` permissions to `chmod 600` on production server |
| 4 | Run `git log --all -S "<value>"` historical secrets scan |
| 5 | Document rotation schedule (JWT_SECRET 90d, DATABASE_URL password 90d) |
| 6 | Add `*.pem` to `.gitignore` if TLS/SSH private key files are ever generated |
| 7 | Staging environment (when deployed externally) must use dedicated Thawani UAT + Stripe test keys |

---

## 12. Commands Reference

```sh
# Full staging setup (from scratch)
mysql -u root -e "CREATE DATABASE smartpro_staging ..."
pnpm install --frozen-lockfile
DATABASE_URL=<staging> pnpm db:migrate
NODE_ENV=production pnpm build
NODE_ENV=production DATABASE_URL=<staging> JWT_SECRET=<staging> ... node dist/index.js

# Verification
curl -sf http://localhost:3000/health
pnpm vitest run server/routers/controlTower.access.test.ts
pnpm vitest run server/routers/controlTower.governance.test.ts
pnpm vitest run server/auditLogging.test.ts server/auditor.test.ts
```

---

## Final Verdict: PASS

The application deployed end-to-end to a fresh staging database. One defect (0079 missing from migration journal) was found and fixed during the rehearsal. All post-deploy smoke tests pass. The application is ready for staging promotion with test data. Production cut-over remains gated on the 7 manual ops items listed above.
