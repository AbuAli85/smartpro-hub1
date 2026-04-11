import { normalizeProfileFieldLabelForKey } from "./profileChangeRequestFieldLabel";

/**
 * Canonical logical identity for profile change requests (stable for analytics / dedupe).
 * Display copy remains in `fieldLabel` (human-editable text).
 */
export const PROFILE_FIELD_KEYS = [
  "legal_name",
  "contact_phone",
  "emergency_contact",
  "bank_details",
  "date_of_birth",
  "nationality",
  "employment_details",
  "other",
] as const;

export type ProfileFieldKey = (typeof PROFILE_FIELD_KEYS)[number];

export const OTHER_PROFILE_FIELD_KEY: ProfileFieldKey = "other";

const KEY_SET = new Set<string>(PROFILE_FIELD_KEYS);

export function isProfileFieldKey(value: string): value is ProfileFieldKey {
  return KEY_SET.has(value);
}

/** Short labels for filters / admin UI (not employee-authored). */
export const PROFILE_FIELD_KEY_LABELS: Record<ProfileFieldKey, string> = {
  legal_name: "Legal name",
  contact_phone: "Phone / contact",
  emergency_contact: "Emergency contact",
  bank_details: "Bank / payroll",
  date_of_birth: "Date of birth",
  nationality: "Nationality",
  employment_details: "Employment",
  other: "Other / custom",
};

/** `all` + every canonical key — for queue / API filters. */
export const PROFILE_FIELD_KEY_FILTER_VALUES = ["all", ...PROFILE_FIELD_KEYS] as const;
export type ProfileFieldKeyFilterValue = (typeof PROFILE_FIELD_KEY_FILTER_VALUES)[number];

export const PROFILE_FIELD_KEY_FILTER_OPTIONS: { value: ProfileFieldKeyFilterValue; label: string }[] = [
  { value: "all", label: "All fields" },
  ...PROFILE_FIELD_KEYS.map((k) => ({ value: k, label: PROFILE_FIELD_KEY_LABELS[k] })),
];

/**
 * Derive canonical `fieldKey` from employee-entered `fieldLabel`.
 * Heuristic: first matching rule wins; unknown text maps to `other`.
 */
export function resolveProfileFieldKeyFromLabel(fieldLabel: string): ProfileFieldKey {
  const n = fieldLabel.trim().toLowerCase().replace(/\s+/g, " ");
  if (!n) return OTHER_PROFILE_FIELD_KEY;

  // Bank / payroll — before generic "employment" to catch "bank details for payroll"
  if (
    /\b(bank|iban|payroll|salary)\b/.test(n) ||
    n.includes("account number") ||
    n.includes("bank details")
  ) {
    return "bank_details";
  }

  if (n.includes("emergency")) {
    return "emergency_contact";
  }

  if (
    /\b(legal name|full name|arabic name|name in arabic)\b/.test(n) ||
    /^name$/i.test(fieldLabel.trim())
  ) {
    return "legal_name";
  }

  if (/\b(phone|mobile|tel|contact number)\b/.test(n)) {
    return "contact_phone";
  }

  if (/\b(date of birth|dob|birthday|birth date)\b/.test(n) || n === "dob") {
    return "date_of_birth";
  }

  if (/\bnationality\b/.test(n)) {
    return "nationality";
  }

  if (
    /\b(employment|department|position|manager|job title|hire date|employment type|job\b|company)\b/.test(n) ||
    n.includes("employment details")
  ) {
    return "employment_details";
  }

  return OTHER_PROFILE_FIELD_KEY;
}

/**
 * Identity key for dedupe: prefer stored non-`other` `fieldKey`, otherwise infer from label
 * (covers legacy rows and free-text before `fieldKey` was persisted).
 */
export function effectiveProfileFieldKeyForIdentity(row: { fieldKey: string; fieldLabel: string }): ProfileFieldKey {
  if (isProfileFieldKey(row.fieldKey) && row.fieldKey !== OTHER_PROFILE_FIELD_KEY) {
    return row.fieldKey;
  }
  return resolveProfileFieldKeyFromLabel(row.fieldLabel);
}

/**
 * Pending duplicate rule:
 * - Same effective key → duplicate (canonical fields).
 * - When effective key is `other`, same normalized label → duplicate (custom free-text).
 */
export function isPendingDuplicateProfileRequest(
  incomingKey: ProfileFieldKey,
  incomingLabelNormalized: string,
  existing: { fieldKey: string; fieldLabel: string },
): boolean {
  const effectiveExisting = effectiveProfileFieldKeyForIdentity(existing);
  if (incomingKey !== OTHER_PROFILE_FIELD_KEY && effectiveExisting === incomingKey) {
    return true;
  }
  if (incomingKey === OTHER_PROFILE_FIELD_KEY && effectiveExisting === OTHER_PROFILE_FIELD_KEY) {
    return normalizeProfileFieldLabelForKey(existing.fieldLabel) === incomingLabelNormalized;
  }
  return false;
}
