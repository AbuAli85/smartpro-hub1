import {
  isProfileFieldKey,
  PROFILE_FIELD_KEY_LABELS,
  type ProfileFieldKey,
} from "./profileChangeRequestFieldKey";

export type PendingFieldKeyCount = { fieldKey: string; count: number };

/** Pick the category with the highest pending count (ties: lexicographic fieldKey). */
export function pickTopPendingFieldKey(rows: PendingFieldKeyCount[]): {
  fieldKey: ProfileFieldKey | null;
  count: number;
  label: string | null;
} {
  if (rows.length === 0) return { fieldKey: null, count: 0, label: null };
  const sorted = [...rows].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.fieldKey.localeCompare(b.fieldKey);
  });
  const top = sorted[0]!;
  const fk = top.fieldKey;
  return {
    fieldKey: isProfileFieldKey(fk) ? fk : null,
    count: top.count,
    label: isProfileFieldKey(fk) ? PROFILE_FIELD_KEY_LABELS[fk] : fk,
  };
}

/** Oldest pending age in hours (floor), or null if none. */
export function oldestPendingAgeHours(oldestSubmittedAt: Date | string | null | undefined): number | null {
  if (oldestSubmittedAt == null) return null;
  const t =
    typeof oldestSubmittedAt === "string" ? new Date(oldestSubmittedAt).getTime() : oldestSubmittedAt.getTime();
  if (Number.isNaN(t)) return null;
  const hours = Math.floor((Date.now() - t) / 3600000);
  return Math.max(0, hours);
}
