/**
 * Normalization for matching profile fields across duplicate checks and future `fieldKey` adoption.
 * Today the DB stores `fieldLabel` (human text); server duplicate-pending logic uses this shape.
 * When `fieldKey` exists, prefer comparing keys and keep `fieldLabel` for display only.
 */
export function normalizeProfileFieldLabelForKey(fieldLabel: string): string {
  return fieldLabel.trim().toLowerCase();
}
