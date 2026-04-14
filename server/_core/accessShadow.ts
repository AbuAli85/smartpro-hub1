/**
 * PR1 — Access v2 shadow mode: compare implicit (legacy first membership) vs explicit `input.companyId`
 * when `ACCESS_V2_SHADOW_COMPANY` is enabled. Aggregates in-memory for ops review; does not enforce.
 */

const MAX_LAST_SEEN = 50;
const MAX_AGG_KEYS = 500;

export type ShadowMismatchSample = {
  at: string;
  path: string;
  userId: number;
  implicitCompanyId: number | null;
  explicitCompanyId: number;
};

type AggKey = string;

const aggregates = new Map<
  AggKey,
  {
    count: number;
    path: string;
    implicitCompanyId: number | null;
    explicitCompanyId: number;
    lastSeen: string;
  }
>();
const lastSeen: ShadowMismatchSample[] = [];

export function isAccessV2ShadowCompanyEnabled(): boolean {
  const v = process.env.ACCESS_V2_SHADOW_COMPANY?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function toCompanyId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = parseInt(value, 10);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

/** Top-level or one-level nested `companyId` on tRPC input (JSON body). */
export function extractCompanyIdFromRawInput(raw: unknown): number | undefined {
  if (raw == null || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const direct = toCompanyId(o.companyId);
  if (direct !== undefined) return direct;
  const nested = o.input;
  if (nested && typeof nested === "object") {
    const n = toCompanyId((nested as Record<string, unknown>).companyId);
    if (n !== undefined) return n;
  }
  return undefined;
}

export function recordCompanyShadowMismatch(sample: Omit<ShadowMismatchSample, "at">): void {
  const nowIso = new Date().toISOString();
  const key: AggKey = `${sample.path}|${sample.implicitCompanyId ?? "null"}|${sample.explicitCompanyId}`;
  const prev = aggregates.get(key);
  if (prev) {
    prev.count += 1;
    prev.lastSeen = nowIso;
  } else {
    if (aggregates.size >= MAX_AGG_KEYS) {
      // Keep memory bounded for long-lived dev servers by dropping the least frequent key.
      let dropKey: AggKey | null = null;
      let dropCount = Number.MAX_SAFE_INTEGER;
      for (const [k, v] of aggregates.entries()) {
        if (v.count < dropCount) {
          dropCount = v.count;
          dropKey = k;
        }
      }
      if (dropKey) aggregates.delete(dropKey);
    }
    aggregates.set(key, {
      count: 1,
      path: sample.path,
      implicitCompanyId: sample.implicitCompanyId,
      explicitCompanyId: sample.explicitCompanyId,
      lastSeen: nowIso,
    });
  }

  const entry: ShadowMismatchSample = { ...sample, at: nowIso };
  lastSeen.push(entry);
  while (lastSeen.length > MAX_LAST_SEEN) lastSeen.shift();

  if (process.env.NODE_ENV === "development") {
    console.warn("[ACCESS_V2_SHADOW] company context mismatch", {
      path: sample.path,
      userId: sample.userId,
      implicitCompanyId: sample.implicitCompanyId,
      explicitCompanyId: sample.explicitCompanyId,
      hint: "Client should pass activeCompanyId correctly for tenant calls.",
    });
  }
}

export function getAccessShadowSnapshot(): {
  aggregates: Array<{
    path: string;
    implicitCompanyId: number | null;
    explicitCompanyId: number;
    count: number;
    lastSeen: string;
  }>;
  totalMismatches: number;
  uniqueRoutes: number;
  topRoutes: Array<{ path: string; count: number; lastSeen: string }>;
  lastSeen: ShadowMismatchSample[];
  enabled: boolean;
} {
  const list = Array.from(aggregates.values()).sort((a, b) => b.count - a.count);
  const totalMismatches = list.reduce((acc, row) => acc + row.count, 0);
  const uniqueRoutes = new Set(list.map((row) => row.path)).size;
  const routeAgg = new Map<string, { count: number; lastSeen: string }>();
  for (const row of list) {
    const prev = routeAgg.get(row.path);
    if (!prev) {
      routeAgg.set(row.path, { count: row.count, lastSeen: row.lastSeen });
      continue;
    }
    prev.count += row.count;
    if (row.lastSeen > prev.lastSeen) prev.lastSeen = row.lastSeen;
  }
  const topRoutes = Array.from(routeAgg.entries())
    .map(([path, data]) => ({ path, count: data.count, lastSeen: data.lastSeen }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  return {
    aggregates: list,
    totalMismatches,
    uniqueRoutes,
    topRoutes,
    lastSeen: [...lastSeen],
    enabled: isAccessV2ShadowCompanyEnabled(),
  };
}
