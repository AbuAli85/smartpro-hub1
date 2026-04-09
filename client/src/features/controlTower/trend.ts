import type { ControlTowerSnapshot, TrendComparison } from "./trendTypes";

export type SnapshotNumericKey = keyof Pick<
  ControlTowerSnapshot,
  | "totalItems"
  | "escalatedCount"
  | "attentionCount"
  | "breachedCount"
  | "unassignedHighCount"
  | "stuckCount"
  | "prioritiesCount"
>;

/** Higher values = worse operational pressure (including backlog size). */
export type TrendPolarity = "risk" | "lower_is_better";

const RISK_KEYS = new Set<SnapshotNumericKey>([
  "totalItems",
  "escalatedCount",
  "attentionCount",
  "breachedCount",
  "unassignedHighCount",
  "stuckCount",
]);

export function getPolarity(key: SnapshotNumericKey): TrendPolarity {
  return key === "prioritiesCount" ? "lower_is_better" : "risk";
}

function worseningDelta(key: SnapshotNumericKey, delta: number): boolean {
  if (delta < MEANINGFUL) return false;
  if (key === "prioritiesCount") return true;
  return RISK_KEYS.has(key);
}

/**
 * Delta from previous to current. `null` if no baseline.
 */
export function getDelta(
  current: ControlTowerSnapshot,
  previous: ControlTowerSnapshot | null,
  key: SnapshotNumericKey,
): number | null {
  if (!previous) return null;
  return current[key] - previous[key];
}

export type TrendDirection = "up" | "down" | "flat" | "unknown";

/**
 * For risk / lower-is-better metrics: `up` means pressure increased (worse), `down` means improved.
 */
export function getTrendDirection(delta: number | null, _polarity: TrendPolarity): TrendDirection {
  if (delta === null) return "unknown";
  if (delta === 0) return "flat";
  return delta > 0 ? "up" : "down";
}

export function getTrendLabel(key: SnapshotNumericKey, delta: number | null): string {
  if (delta === null) return "No prior snapshot";
  if (delta === 0) {
    if (key === "totalItems") return "No change in backlog";
    return "No change";
  }
  const mag = Math.abs(delta);
  const unit = mag === 1 ? "" : "s";
  switch (key) {
    case "escalatedCount":
      return delta > 0 ? `Escalations increased (+${mag})` : `Escalations reduced (${delta})`;
    case "attentionCount":
      return delta > 0 ? `Attention items increased (+${mag})` : `Attention items decreased (${delta})`;
    case "breachedCount":
      return delta > 0 ? `SLA breaches increased (+${mag})` : `Fewer SLA breaches (${delta})`;
    case "unassignedHighCount":
      return delta > 0 ? `Ownership gaps increased (+${mag})` : `Ownership gaps narrowed (${delta})`;
    case "stuckCount":
      return delta > 0 ? `More items stuck (+${mag})` : `Fewer stuck items (${delta})`;
    case "totalItems":
      return delta > 0 ? `Backlog grew (+${mag} item${unit})` : `Backlog shrank (${delta} item${unit})`;
    case "prioritiesCount":
      return delta > 0 ? `Priority load increased (+${mag})` : `Priority load reduced (${delta})`;
    default:
      return delta > 0 ? `Increased (+${mag})` : `Decreased (${delta})`;
  }
}

const DRIFT_KEYS: SnapshotNumericKey[] = [
  "escalatedCount",
  "stuckCount",
  "unassignedHighCount",
  "breachedCount",
  "attentionCount",
  "totalItems",
];

const PROGRESS_KEYS: SnapshotNumericKey[] = [
  "escalatedCount",
  "attentionCount",
  "stuckCount",
  "breachedCount",
  "unassignedHighCount",
  "prioritiesCount",
  "totalItems",
];

const MEANINGFUL = 1;

function isImproving(key: SnapshotNumericKey, delta: number): boolean {
  if (delta > -MEANINGFUL) return false;
  if (key === "prioritiesCount") return true;
  if (key === "totalItems") return true;
  if (key === "escalatedCount") return true;
  if (key === "attentionCount") return true;
  if (key === "stuckCount") return true;
  if (key === "breachedCount") return true;
  if (key === "unassignedHighCount") return true;
  return false;
}

/** Worsening signals — max 3, highest severity first. */
export function getDriftSignals(comparison: TrendComparison): string[] {
  if (!comparison.previous) return [];
  const { current, previous } = comparison;
  const out: string[] = [];

  for (const key of DRIFT_KEYS) {
    const d = current[key] - previous[key];
    if (!worseningDelta(key, d)) continue;
    switch (key) {
      case "escalatedCount":
        out.push("Escalations are rising");
        break;
      case "stuckCount":
        out.push("More items are getting stuck");
        break;
      case "unassignedHighCount":
        out.push("Ownership gaps increasing");
        break;
      case "breachedCount":
        out.push("More SLA breaches detected");
        break;
      case "attentionCount":
        out.push("More items need attention");
        break;
      case "totalItems":
        out.push("Queue backlog growing");
        break;
      default:
        break;
    }
    if (out.length >= 3) break;
  }

  return out.slice(0, 3);
}

/** Positive momentum — max 2. */
export function getProgressSignals(comparison: TrendComparison): string[] {
  if (!comparison.previous) return [];
  const { current, previous } = comparison;
  const out: string[] = [];

  for (const key of PROGRESS_KEYS) {
    const d = current[key] - previous[key];
    if (!isImproving(key, d)) continue;
    switch (key) {
      case "escalatedCount":
        out.push("Escalations reduced");
        break;
      case "attentionCount":
        out.push("Attention load easing");
        break;
      case "stuckCount":
        out.push("Backlog clearing");
        break;
      case "breachedCount":
        out.push("SLA pressure easing");
        break;
      case "unassignedHighCount":
        out.push("Ownership gaps narrowing");
        break;
      case "prioritiesCount":
        out.push("Priority load reduced");
        break;
      case "totalItems":
        out.push("Queue size down");
        break;
      default:
        break;
    }
    if (out.length >= 2) break;
  }

  return out.slice(0, 2);
}

/**
 * One line for the executive header. No baseline → null.
 */
export function buildTrendSummaryLine(comparison: TrendComparison): string | null {
  if (!comparison.previous) return null;
  const drift = getDriftSignals(comparison);
  const progress = getProgressSignals(comparison);
  if (drift.length === 0 && progress.length === 0) return null;
  if (drift.length > 0 && progress.length > 0) {
    return `${drift[0]} · ${progress[0]}`;
  }
  if (drift.length > 0) {
    return drift.slice(0, 2).join(" · ");
  }
  return progress.join(" · ");
}

export type TrendGlyph = "↑" | "↓" | "—";

export function trendGlyphForRiskMetric(direction: TrendDirection): TrendGlyph | null {
  if (direction === "unknown") return null;
  if (direction === "flat") return "—";
  if (direction === "up") return "↑";
  return "↓";
}

/** Compact hints for priorities row: escalated / stuck / unassigned high. */
export function buildPrioritiesTrendHints(comparison: TrendComparison): string | null {
  if (!comparison.previous) return null;
  const parts: string[] = [];
  const keys: SnapshotNumericKey[] = ["escalatedCount", "stuckCount", "unassignedHighCount"];
  for (const key of keys) {
    const delta = getDelta(comparison.current, comparison.previous, key);
    const dir = getTrendDirection(delta, getPolarity(key));
    if (dir === "flat" || dir === "unknown") continue;
    const g = trendGlyphForRiskMetric(dir);
    if (!g) continue;
    const label =
      key === "escalatedCount" ? "Escalated" : key === "stuckCount" ? "Stuck" : "Unassigned";
    parts.push(`${label} ${g}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

/** Subtle KPI strip hint from queue size change. */
export function buildQueueTotalTrendHint(comparison: TrendComparison): string | null {
  if (!comparison.previous) return null;
  const delta = getDelta(comparison.current, comparison.previous, "totalItems");
  if (delta === null || delta === 0) return null;
  if (Math.abs(delta) < MEANINGFUL) return null;
  const dir = delta > 0 ? "up" : "down";
  const sign = delta > 0 ? "+" : "";
  return dir === "up"
    ? `${sign}${delta} queue item${Math.abs(delta) === 1 ? "" : "s"} vs last check`
    : `${delta} queue item${Math.abs(delta) === 1 ? "" : "s"} vs last check`;
}
