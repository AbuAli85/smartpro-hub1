# Migration System

**As of 2026-04-26** — journal rebuilt from 50 → 90 entries; all SQL files now covered.

---

## How migrations work

Schema changes are tracked in `drizzle/meta/_journal.json`. Each entry in the journal references a SQL file in `drizzle/`. When you run `pnpm drizzle-kit migrate`, Drizzle compares the journal against `__drizzle_migrations` in the target database and applies any pending files in order.

```
drizzle/
  0000_bent_psynapse.sql        ← applied on fresh DB
  0001_ancient_stranger.sql
  ...
  0089_fresh_deploy_indexes.sql ← latest migration
  meta/
    _journal.json               ← index of all 90 files
    0089_snapshot.json          ← schema snapshot used by drizzle-kit generate
    schema.ts                   ← schema file produced by drizzle-kit introspect
```

On existing databases, `server/runPendingMigrations.ts` also runs at startup. It checks `information_schema` for missing columns/tables/indexes and applies them idempotently. This is a safety net — not the primary migration path.

---

## Running migrations

### Fresh database (new environment)

```bash
DATABASE_URL=mysql://user:pass@host/dbname pnpm drizzle-kit migrate
```

All 90 migrations apply in sequence. Takes ~5 seconds on a local MySQL instance.

### Adding a new migration

1. Make your schema changes in `drizzle/schema.ts`.
2. Generate the migration:
   ```bash
   DATABASE_URL=<staging-url> pnpm drizzle-kit generate --name=describe_the_change
   ```
   This creates a new SQL file in `drizzle/` and updates `_journal.json` and `meta/<n>_snapshot.json`.
3. Review the generated SQL — Drizzle can miss nullable column defaults or produce incorrect FK ordering. Fix by hand if needed.
4. Apply to staging:
   ```bash
   DATABASE_URL=<staging-url> pnpm drizzle-kit migrate
   ```
5. Commit both the SQL file and the updated `_journal.json` together.

### Never do this

- **Never hand-edit a SQL file after it has been applied to any database.** The `__drizzle_migrations` table stores hashes; edited files will be re-applied.
- **Never run `pnpm db:push`.** It is disabled — see the error message for why.
- **Never run `drizzle-kit push` directly.** It bypasses the migration chain and can silently diverge from the journal.

---

## Journal rebuild (2026-04-26)

The journal previously covered only 50 of 90 SQL files. The 40 missing files had been applied to production via `runPendingMigrations.ts` and manual scripts, so the live schema was correct — but `drizzle-kit migrate` on a fresh database would skip those files.

The rebuild was done with:

```bash
# 1. Capture old tags before overwriting
node -e "..." > scripts/old-journal-tags.txt

# 2. Rebuild
node scripts/rebuild-journal.mjs

# 3. Verify
node scripts/verify-journal.mjs --post

# 4. For existing DBs: backfill __drizzle_migrations
node scripts/generate-backfill.mjs > scripts/backfill-migrations.sql
# Then run backfill-migrations.sql inside a transaction against staging, then prod.
```

The backfill SQL (`scripts/backfill-migrations.sql`) inserts the 40 previously-missing entries into `__drizzle_migrations` so `drizzle-kit migrate` knows not to re-apply them on existing databases.

If you need to repeat this process: the scripts are idempotent and the old-tags snapshot is committed.

---

## Startup safety net: runPendingMigrations.ts

`server/runPendingMigrations.ts` runs at boot and applies any columns, indexes, or tables that `information_schema` shows as missing. It operates independently of the Drizzle journal and is safe to run on any database state.

It is NOT a replacement for `drizzle-kit migrate`. Its purpose is to handle the case where a deployment goes out before a migration has been applied — it closes the gap at runtime rather than failing hard.

If startup migration fails, the error is:
- Captured by Sentry (if `SENTRY_DSN` is set)
- Surfaced at `/health/ready` as `{ ok: false, migrationError: "..." }` — the readiness probe returns 503
- Logged to stdout as `[migrations] Auto-migration error (non-fatal): ...`

---

## CI canary

The `migrate-canary` job in `.github/workflows/ci.yml` spins up a throwaway MySQL 8.0 container, runs `drizzle-kit migrate`, and verifies that exactly 90 migrations were applied. It runs on every push to main and every PR.

If the canary fails:
- A SQL file was added without a journal entry (`pnpm drizzle-kit generate` was not used)
- A SQL file was deleted after being committed
- `_journal.json` was hand-edited incorrectly

To diagnose: run `node scripts/verify-journal.mjs --post` locally.

---

## Tooling reference

| Command | Purpose |
|---------|---------|
| `pnpm drizzle-kit migrate` | Apply pending migrations (requires `DATABASE_URL`) |
| `pnpm drizzle-kit generate --name=<name>` | Generate a new migration from schema diff |
| `node scripts/verify-journal.mjs` | Pre-rebuild check: shows missing files and problems |
| `node scripts/verify-journal.mjs --post` | Post-rebuild check: confirms journal is complete |
| `node scripts/rebuild-journal.mjs` | Rebuild `_journal.json` from SQL files on disk |
| `node scripts/generate-backfill.mjs` | Generate SQL to backfill `__drizzle_migrations` on existing DBs |
