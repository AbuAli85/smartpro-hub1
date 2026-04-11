/**
 * Normalization for free-text `fieldLabel` when `fieldKey` is `other` (custom requests).
 * Canonical identity uses `fieldKey` + `profileChangeRequestFieldKey.ts`; keep labels for display only.
 */
export function normalizeProfileFieldLabelForKey(fieldLabel: string): string {
  return fieldLabel.trim().toLowerCase();
}
