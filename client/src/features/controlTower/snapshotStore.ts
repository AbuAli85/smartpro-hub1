import type { ControlTowerSnapshot } from "./trendTypes";

const PREFIX = "smartpro.controlTower.snapshot";

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
    return v;
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
