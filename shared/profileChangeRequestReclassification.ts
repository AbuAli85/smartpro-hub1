/**
 * Helpers and constants for HR reclassification of `profile_change_requests.fieldKey`.
 * Successful reclassifications are persisted to `audit_events` (see workforce `reclassifyFieldKey`):
 * actor, timestamps, and before/after `fieldKey` plus metadata; `fieldLabel` is not modified on the row.
 */
import { PROFILE_FIELD_KEYS, type ProfileFieldKey, isProfileFieldKey } from "./profileChangeRequestFieldKey";

/** Stored in `audit_events.entityType` for profile change request classification changes. */
export const PROFILE_CHANGE_REQUEST_AUDIT_ENTITY_TYPE = "profile_change_request";

/** Stored in `audit_events.action`. */
export const PROFILE_CHANGE_REQUEST_AUDIT_ACTION = "field_key_reclassified";

/**
 * tRPC procedure ids for cache invalidation after reclassification (see client `utils.invalidate`).
 */
export const PROFILE_CHANGE_RECLASSIFY_INVALIDATION = {
  listCompany: "workforce.profileChangeRequests.listCompany",
  queueKpis: "workforce.profileChangeRequests.queueKpis",
  listForEmployee: "workforce.profileChangeRequests.listForEmployee",
  getMyProfileChangeRequests: "employeePortal.getMyProfileChangeRequests",
} as const;

/** Whether the target key is a valid canonical `fieldKey`. */
export function isValidReclassifyTargetFieldKey(value: string): value is ProfileFieldKey {
  return isProfileFieldKey(value);
}

/** True when applying the same key again (server should reject). */
export function reclassifyFieldKeyIsNoOp(currentFieldKey: string, nextFieldKey: string): boolean {
  return currentFieldKey.trim() === nextFieldKey.trim();
}

/** Suggested default selection when opening the reclassify dialog (first canonical key different from current). */
export function defaultReclassifyTargetKey(currentFieldKey: string): ProfileFieldKey {
  const cur = isProfileFieldKey(currentFieldKey) ? currentFieldKey : "other";
  const alt = PROFILE_FIELD_KEYS.find((k) => k !== cur);
  return alt ?? cur;
}
