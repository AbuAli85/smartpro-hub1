# SmartPRO Deployment Runbook

**Target:** Docker Compose (MySQL 8.0 + Node 20 Alpine)  
**Migration count:** 89 (0000–0088)  
**Last migration:** `0088_control_tower_item_states_indexes` — adds production-safety indexes on `control_tower_item_states`

---

## Prerequisites

| Tool | Version |
|------|---------|
| Docker | 24+ |
| Docker Compose | v2 (plugin form: `docker compose`) |
| Node | 20 |
| pnpm | 10.33.0 |
| MySQL client (`mysql`) | 8.0 (optional, for verification queries) |

---

## 1. Environment Setup

Copy the example file and fill in every required value before any other step:

```sh
cp .env.example .env
```

### Required — application will refuse to start without these

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | `mysql://user:pass@host:3306/smartpro` |
| `JWT_SECRET` | Session signing key — minimum 16 characters; use `openssl rand -hex 32` |
| `OAUTH_SERVER_URL` | OAuth IdP base URL (e.g. `https://api.manus.im`) |
| `VITE_OAUTH_PORTAL_URL` | OAuth portal URL shown to users during sign-in |
| `VITE_APP_ID` | App registration ID on the IdP |

### Required in production if payment features are enabled

| Variable | Description |
|----------|-------------|
| `THAWANI_SECRET_KEY` | Thawani server-side key |
| `THAWANI_PUBLISHABLE_KEY` | Thawani client-side key |
| `THAWANI_WEBHOOK_SECRET` | Validate Thawani webhook POSTs |
| `STRIPE_SECRET_KEY` | Stripe server-side key |
| `STRIPE_WEBHOOK_SECRET` | Validate Stripe webhook POSTs |

### Required if 2FA is enabled

| Variable | Description |
|----------|-------------|
| `TWO_FACTOR_ENCRYPTION_KEY` | AES-256-GCM key for TOTP secrets at rest — minimum 32 characters; use `openssl rand -hex 32` |

### Required if HR document generation is used

| Variable | Description |
|----------|-------------|
| `GOOGLE_DOCS_SERVICE_ACCOUNT_JSON` | Full JSON of a Google service account with Drive + Docs API; share templates with its `client_email` |
| `GOOGLE_DOCS_SHARED_DRIVE_ID` | Team Drive ID where temporary doc copies are written |

### Optional but strongly recommended in production

| Variable | Description |
|----------|-------------|
| `SENTRY_DSN` | Server-side error reporting |
| `ALLOWED_ORIGINS` | Comma-separated CORS allowlist; defaults to same-origin if unset |
| `PORT` | HTTP port; defaults to 3000 |

---

## 2. Database Migration

Migrations are **idempotent** — already-applied migrations tracked in `__drizzle_migrations` are skipped automatically.

### 2a. Dry run (inspect what will be applied without executing)

```sh
pnpm tsx scripts/migrate.ts --dry-run
```

Expected output lists any unapplied migration tags, e.g.:
```
[dry-run] would apply: 0088_control_tower_item_states_indexes
[dry-run] nothing else pending
```

If no migrations are pending:
```
No pending migrations.
```

### 2b. Apply migrations

```sh
DATABASE_URL="mysql://user:pass@host:3306/smartpro" pnpm db:migrate
```

Or with the `.env` file already exported:

```sh
pnpm db:migrate
```

Script internals: `tsx scripts/migrate.ts` → `drizzle-orm/mysql2` `migrate()` → processes `drizzle/*.sql` files in sequence → records each tag in `__drizzle_migrations`.

### 2c. REQUIRED on first deploy — apply bootstrap foreign keys and constraints

The `drizzle/bootstrap/` directory contains two scripts that are **not** in the migration journal and are **not** applied by `pnpm db:migrate`. On a fresh database, these must be applied manually after `pnpm db:migrate` completes successfully:

```sh
# Foreign-key constraints (only apply once; will fail with duplicate-constraint error if re-run)
mysql -h HOST -u USER -p DBNAME < drizzle/bootstrap/0070_constraints.sql

# Secondary indexes (only apply once; will fail with duplicate-index error if re-run)
mysql -h HOST -u USER -p DBNAME < drizzle/bootstrap/0070_indexes.sql
```

**Do not run bootstrap scripts on an existing database** that already has these constraints and indexes — they will fail. They are single-apply, fresh-database-only scripts. The journaled migration 0089 (`0089_fresh_deploy_indexes.sql`) provides an idempotent alternative for the key performance indexes using `CREATE INDEX IF NOT EXISTS`; run 0089 via `pnpm db:migrate` and skip the bootstrap index script if you want a fully automated path.

### 2c. MySQL-specific considerations

- **`IF NOT EXISTS` guards** — migrations 0088 and the bootstrap `0070_indexes.sql` use `CREATE INDEX IF NOT EXISTS` (MySQL 8.0.12+). Do not run these against MySQL < 8.0.12.
- **DDL is auto-committed in MySQL** — there is no DDL rollback. A failed migration leaves the schema in a partially-applied state. Always take a database dump before migrating production.
- **Breakpoints (`--> statement-breakpoint`)** — the Drizzle runner executes each statement separately. A single-statement failure does not skip remaining statements in the same file; it aborts the migration run. Fix and re-run.
- **`0070` is a special baseline recovery migration** — it reconstructs the full schema for databases that existed before the Drizzle journal was introduced. The companion `drizzle/bootstrap/0070_constraints.sql` and `drizzle/bootstrap/0070_indexes.sql` are one-time scripts run manually on brownfield databases; they are **not** in the journal and will not run via `pnpm db:migrate`.

### 2d. Pre-migration backup

```sh
mysqldump \
  --single-transaction \
  --routines \
  --triggers \
  --set-gtid-purged=OFF \
  -h HOST -u USER -p DBNAME > smartpro_pre_deploy_$(date +%Y%m%d_%H%M%S).sql
```

Store the dump file outside the Docker volume before proceeding.

---

## 3. Build

### 3a. Local build (non-Docker)

```sh
pnpm install --frozen-lockfile
NODE_ENV=production pnpm build
```

`pnpm build` runs Vite (client) then `bundle-server` (esbuild for `dist/index.js`).

### 3b. Docker build

```sh
docker compose build
```

Multi-stage Dockerfile: `deps` → `builder` → `runner`.  
Final image: Node 20 Alpine, non-root user `appuser`, entrypoint `node dist/index.js`.

---

## 4. Deploy

### 4a. Docker Compose (primary deployment target)

```sh
docker compose up -d
```

This starts:
- `app` on port `3000` (mapped from internal 3000)
- `db` — MySQL 8.0

To deploy a new build without downtime interruption:

```sh
docker compose build app
docker compose up -d --no-deps app
```

### 4b. Environment variables in Docker

Pass via `.env` file (Docker Compose auto-loads `.env` in the same directory) or via `environment:` block in `docker-compose.yml`. Never bake secrets into the image.

### 4c. Migrations in Docker context

Run migrations **before** starting the new app container:

```sh
docker compose run --rm app pnpm db:migrate
docker compose up -d
```

Or as a one-liner for CI/CD pipelines:

```sh
docker compose run --rm app pnpm db:migrate && docker compose up -d
```

---

## 5. Post-Deploy Verification

### 5a. Health check

```sh
curl -f http://localhost:3000/health
```

Expected: HTTP 200.

Docker Compose also runs this internally:
```yaml
healthcheck:
  test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/health"]
```

### 5b. Database connectivity

```sh
mysql -h HOST -u USER -p DBNAME -e \
  "SELECT tag, applied_at FROM __drizzle_migrations ORDER BY id DESC LIMIT 5;"
```

Expected: last row is `0088_control_tower_item_states_indexes`.

### 5c. Audit events table

```sh
mysql -h HOST -u USER -p DBNAME -e \
  "SELECT COUNT(*) AS event_count FROM audit_events;"
```

Expected: command succeeds (table exists). Count may be 0 on a fresh database.

### 5d. Control Tower indexes

```sh
mysql -h HOST -u USER -p DBNAME -e \
  "SHOW INDEX FROM control_tower_item_states;"
```

Expected output includes:
- `uq_ct_state_company_item` (UNIQUE)
- `idx_ct_state_company_status`
- `idx_ct_state_domain`
- `idx_ct_state_last_seen`

### 5e. Application smoke test (manual)

1. Navigate to `http://localhost:3000` — login page loads.
2. Sign in as a `company_admin` user.
3. Navigate to `/dashboard` — Recent Activity section appears.
4. Navigate to `/control-tower` — page loads without 500 errors.
5. Navigate to `/audit-log` — audit log page loads.
6. Perform one mutation (e.g., create or update a department) — verify a row appears in `audit_events`.

### 5f. Verify audit event write

After performing a mutation in step 5e:

```sh
mysql -h HOST -u USER -p DBNAME -e \
  "SELECT entity_type, action, actor_user_id, created_at
   FROM audit_events
   ORDER BY id DESC
   LIMIT 3;"
```

Expected: at least one row with `action` matching the mutation performed.

---

## 6. Rollback Procedure

### 6a. Application rollback

Drizzle migrations are not reversible with a `down` step. Roll back by restoring the pre-migration database dump.

**Step 1 — Stop the running container:**
```sh
docker compose stop app
```

**Step 2 — Restore database from pre-migration dump:**
```sh
mysql -h HOST -u USER -p DBNAME < smartpro_pre_deploy_YYYYMMDD_HHMMSS.sql
```

**Step 3 — Deploy the previous image:**
```sh
# If using image tags
docker compose up -d --no-deps app  # with previous image tag set in docker-compose.yml

# If using git to restore previous build
git checkout <previous-sha>
docker compose build app
docker compose up -d
```

**Step 4 — Verify health:**
```sh
curl -f http://localhost:3000/health
```

### 6b. If only the application is broken (schema is fine)

Skip the database restore. Rebuild from the previous commit and redeploy:

```sh
git checkout <previous-sha>
docker compose build app
docker compose up -d --no-deps app
curl -f http://localhost:3000/health
```

### 6c. If a migration partially failed

The `__drizzle_migrations` journal will not contain the tag of the failed migration. After fixing the SQL or schema issue:

1. Inspect what ran: `SHOW INDEX FROM <table>` / `DESCRIBE <table>`
2. Manually undo any partial DDL (MySQL DDL is auto-committed — there is no rollback)
3. Re-run: `pnpm db:migrate`

If the partial state cannot be manually repaired, restore from the pre-migration dump (step 6a).

---

## 7. Key File Reference

| Path | Purpose |
|------|---------|
| `scripts/migrate.ts` | Drizzle migration runner |
| `drizzle/*.sql` | Migration files (0000–0088) |
| `drizzle/meta/_journal.json` | Applied migration journal |
| `drizzle/bootstrap/0070_indexes.sql` | One-time brownfield index script (not journaled) |
| `drizzle/bootstrap/0070_constraints.sql` | One-time brownfield constraint script (not journaled) |
| `docker-compose.yml` | Service definitions (app + db) |
| `Dockerfile` | Multi-stage production image |
| `.env.example` | Canonical list of all environment variables |
| `dist/index.js` | Compiled server bundle (generated by `pnpm build`) |

---

## 8. pnpm Scripts Reference

| Script | Command | Use |
|--------|---------|-----|
| `pnpm db:migrate` | `tsx scripts/migrate.ts` | Apply pending migrations |
| `pnpm build` | `vite build && bundle-server` | Production build |
| `pnpm start` | `node dist/index.js` | Start compiled server |
| `pnpm dev` | `tsx server/index.ts` | Development server (not for production) |
| `pnpm test` | `vitest run` | Run all unit tests |
| `pnpm check` | `tsc --noEmit` | TypeScript type check |
