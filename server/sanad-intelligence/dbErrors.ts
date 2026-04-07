import { TRPCError } from "@trpc/server";

const MIGRATE_HINT =
  "SANAD intelligence tables are missing or out of date. Apply migration drizzle/0025_sanad_network_intelligence.sql (see data/sanad-intelligence/IMPORT.txt), then run pnpm sanad-intel:import with DATABASE_URL set.";

function flattenErrorChain(err: unknown): string[] {
  const out: string[] = [];
  let cur: unknown = err;
  for (let i = 0; i < 12 && cur; i++) {
    if (cur instanceof Error) {
      out.push(cur.message);
      cur = cur.cause;
      continue;
    }
    if (cur && typeof cur === "object") {
      const o = cur as Record<string, unknown>;
      if (typeof o.sqlMessage === "string") out.push(o.sqlMessage);
      if (typeof o.message === "string") out.push(String(o.message));
    }
    break;
  }
  return out;
}

function chainHasMissingTableSignal(err: unknown): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 12 && cur; i++) {
    if (cur && typeof cur === "object") {
      const o = cur as Record<string, unknown>;
      if (o.errno === 1146 || o.code === "ER_NO_SUCH_TABLE") return true;
    }
    cur = cur instanceof Error ? cur.cause : undefined;
  }
  const text = flattenErrorChain(err).join("\n");
  return /doesn't exist|Unknown table|ER_NO_SUCH_TABLE|1146/i.test(text);
}

/** True when failure is consistent with missing `sanad_intel_*` tables (typical if migration 0025 was not applied). */
export function isSanadIntelMissingTableError(err: unknown): boolean {
  const text = flattenErrorChain(err).join("\n");
  if (!/sanad_intel_/i.test(text)) return false;
  if (chainHasMissingTableSignal(err)) return true;
  // Drizzle often surfaces only "Failed query: … from `sanad_intel_…`" without the MySQL errno in the client-facing message.
  if (/Failed query:/i.test(text)) return true;
  return false;
}

export function throwIfSanadIntelSchemaMissing(err: unknown): never {
  if (isSanadIntelMissingTableError(err)) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: MIGRATE_HINT });
  }
  throw err;
}
