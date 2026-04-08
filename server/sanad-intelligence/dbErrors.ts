import { TRPCError } from "@trpc/server";

const MIGRATE_HINT =
  "SANAD intelligence tables are missing or out of date. Apply migration drizzle/0025_sanad_network_intelligence.sql (see data/sanad-intelligence/IMPORT.txt), then run pnpm sanad-intel:import with DATABASE_URL set.";

/** Drizzle's `DrizzleQueryError` carries the raw SQL on `.query` (reliable; `.message` may not reach the browser unchanged). */
function drizzleFailedQuerySql(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const q = (err as { query?: unknown }).query;
  return typeof q === "string" ? q : null;
}

function collectErrorText(err: unknown, depth = 0, seen = new Set<unknown>()): string[] {
  if (depth > 16 || err == null || seen.has(err)) return [];
  seen.add(err);

  const parts: string[] = [];

  if (err instanceof AggregateError) {
    for (const e of err.errors) parts.push(...collectErrorText(e, depth + 1, seen));
    parts.push(err.message);
    if (err.cause !== undefined) parts.push(...collectErrorText(err.cause, depth + 1, seen));
    return parts;
  }

  if (err instanceof Error) {
    parts.push(err.message);
    const sql = drizzleFailedQuerySql(err);
    if (sql) parts.push(sql);
    if (err.cause !== undefined) parts.push(...collectErrorText(err.cause, depth + 1, seen));
    return parts;
  }

  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    if (typeof o.sqlMessage === "string") parts.push(o.sqlMessage);
    if (typeof o.message === "string") parts.push(String(o.message));
    if (o.cause !== undefined) parts.push(...collectErrorText(o.cause, depth + 1, seen));
  }

  return parts;
}

function chainHasMissingTableSignal(err: unknown, seen = new Set<unknown>(), depth = 0): boolean {
  if (depth > 16 || err == null || seen.has(err)) return false;
  seen.add(err);

  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    if (o.errno === 1146 || o.code === "ER_NO_SUCH_TABLE") return true;
    if (o.cause !== undefined && chainHasMissingTableSignal(o.cause, seen, depth + 1)) return true;
  }
  if (err instanceof Error && err.cause !== undefined) {
    return chainHasMissingTableSignal(err.cause, seen, depth + 1);
  }
  return false;
}

/** True when failure is consistent with missing `sanad_intel_*` tables (typical if migration 0025 was not applied). */
export function isSanadIntelMissingTableError(err: unknown): boolean {
  const text = collectErrorText(err).join("\n");
  if (!/sanad_intel_/i.test(text)) return false;
  if (chainHasMissingTableSignal(err)) return true;
  // Driver/message-only cases (no errno on outer error)
  if (/doesn't exist/i.test(text) && /sanad_intel_/i.test(text)) return true;
  return false;
}

export function throwIfSanadIntelSchemaMissing(err: unknown): never {
  if (isSanadIntelMissingTableError(err)) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: MIGRATE_HINT });
  }
  throw err;
}
