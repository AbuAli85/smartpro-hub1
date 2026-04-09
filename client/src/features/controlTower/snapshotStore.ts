import type { SnapshotItemRef } from "./outcomeTypes";
import type { ControlTowerSnapshot } from "./trendTypes";

const PREFIX = "smartpro.controlTower.snapshot";

const ESC_LEVELS = new Set(["normal", "attention", "escalated"]);
const SLA_STATES = new Set(["within_sla", "nearing_sla", "breached", "unknown"]);
const DOMAINS = new Set(["payroll", "workforce", "contracts", "hr", "compliance", "operations", "general"]);

function normalizeItemRefs(raw: unknown): SnapshotItemRef[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: SnapshotItemRef[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    if (typeof o.id !== "string" || o.id.length === 0) continue;
    const ref: SnapshotItemRef = { id: o.id };
    if (typeof o.escalationLevel === "string" && ESC_LEVELS.has(o.escalationLevel)) {
      ref.escalationLevel = o.escalationLevel as SnapshotItemRef["escalationLevel"];
    }
    if (typeof o.slaState === "string" && SLA_STATES.has(o.slaState)) {
      ref.slaState = o.slaState as SnapshotItemRef["slaState"];
    }
    if (typeof o.assigned === "boolean") ref.assigned = o.assigned;
    if (typeof o.needsOwner === "boolean") ref.needsOwner = o.needsOwner;
    if (typeof o.domain === "string" && DOMAINS.has(o.domain)) {
      ref.domain = o.domain as SnapshotItemRef["domain"];
    }
    out.push(ref);
  }
  return out;
}

export function snapshotStorageKey(companyId: number | string | null | undefined, userId: number | string | null | undefined): string {
  return `${PREFIX}.v1.${String(companyId ?? "none")}.${String(userId ?? "anon")}`;
}

function safeParse(raw: string | null): ControlTowerSnapshot | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as ControlTowerSnapshot;
    if (
      typeof v.timestamp !== "string" ||
      typeof v.totalItems !== "number" ||
      typeof v.escalatedCount !== "number" ||
      typeof v.attentionCount !== "number" ||
      typeof v.breachedCount !== "number" ||
      typeof v.unassignedHighCount !== "number" ||
      typeof v.stuckCount !== "number" ||
      typeof v.prioritiesCount !== "number"
    ) {
      return null;
    }
    const itemRefs = normalizeItemRefs(v.itemRefs);
    const { itemRefs: _drop, ...rest } = v as ControlTowerSnapshot & { itemRefs?: unknown };
    return { ...(rest as ControlTowerSnapshot), ...(itemRefs !== undefined ? { itemRefs } : {}) };
  } catch {
    return null;
  }
}

export function getPreviousSnapshot(
  companyId: number | string | null | undefined,
  userId: number | string | null | undefined,
): ControlTowerSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    return safeParse(localStorage.getItem(snapshotStorageKey(companyId, userId)));
  } catch {
    return null;
  }
}

export function saveSnapshot(
  snapshot: ControlTowerSnapshot,
  companyId: number | string | null | undefined,
  userId: number | string | null | undefined,
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(snapshotStorageKey(companyId, userId), JSON.stringify(snapshot));
  } catch {
    /* quota / private mode */
  }
}
