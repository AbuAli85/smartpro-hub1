import {
  PROFILE_FIELD_KEY_FILTER_VALUES,
  type ProfileFieldKeyFilterValue,
} from "./profileChangeRequestFieldKey";
import type { ProfileRequestAgeBucket } from "./profileChangeRequestQueueFilters";

/** Path segment for the company profile-change queue (no query string). */
export const PROFILE_CHANGE_QUEUE_PATH = "/workforce/profile-change-requests";

const STATUS_VALUES = ["all", "pending", "resolved", "rejected"] as const;
export type ProfileChangeQueueStatus = (typeof STATUS_VALUES)[number];

const AGE_VALUES = ["any", "lt_24h", "d1_7", "gt_7d"] as const;

export type ProfileChangeQueueState = {
  status: ProfileChangeQueueStatus;
  fieldKey: ProfileFieldKeyFilterValue;
  ageBucket: ProfileRequestAgeBucket;
  /** Search text (trimmed for API; URL may omit when empty). */
  query: string;
  page: number;
};

export const DEFAULT_PROFILE_CHANGE_QUEUE_STATE: ProfileChangeQueueState = {
  status: "pending",
  fieldKey: "all",
  ageBucket: "any",
  query: "",
  page: 1,
};

function isStatus(v: string): v is ProfileChangeQueueStatus {
  return (STATUS_VALUES as readonly string[]).includes(v);
}

function isAge(v: string): v is ProfileRequestAgeBucket {
  return (AGE_VALUES as readonly string[]).includes(v);
}

function isFieldKeyFilter(v: string): v is ProfileFieldKeyFilterValue {
  return (PROFILE_FIELD_KEY_FILTER_VALUES as readonly string[]).includes(v);
}

/**
 * Parse wouter `useSearch()` output (with or without leading `?`) into queue filter state.
 */
export function parseProfileChangeQueueSearch(search: string): ProfileChangeQueueState {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);

  const statusRaw = params.get("status");
  const status = statusRaw && isStatus(statusRaw) ? statusRaw : DEFAULT_PROFILE_CHANGE_QUEUE_STATE.status;

  const fieldKeyRaw = params.get("fieldKey");
  const fieldKey =
    fieldKeyRaw && isFieldKeyFilter(fieldKeyRaw) ? fieldKeyRaw : DEFAULT_PROFILE_CHANGE_QUEUE_STATE.fieldKey;

  const ageRaw = params.get("ageBucket");
  const ageBucket = ageRaw && isAge(ageRaw) ? ageRaw : DEFAULT_PROFILE_CHANGE_QUEUE_STATE.ageBucket;

  const query = (params.get("query") ?? "").slice(0, 120);

  let page = DEFAULT_PROFILE_CHANGE_QUEUE_STATE.page;
  const pageRaw = params.get("page");
  if (pageRaw) {
    const n = Number.parseInt(pageRaw, 10);
    if (Number.isFinite(n) && n >= 1) page = Math.min(n, 10_000);
  }

  return { status, fieldKey, ageBucket, query, page };
}

/**
 * Build query string for the queue URL. Omits params at defaults for cleaner bookmarkable links.
 */
export function serializeProfileChangeQueueState(state: ProfileChangeQueueState): string {
  const p = new URLSearchParams();
  const d = DEFAULT_PROFILE_CHANGE_QUEUE_STATE;

  if (state.status !== d.status) p.set("status", state.status);
  if (state.fieldKey !== d.fieldKey) p.set("fieldKey", state.fieldKey);
  if (state.ageBucket !== d.ageBucket) p.set("ageBucket", state.ageBucket);
  if (state.query.trim()) p.set("query", state.query.trim());
  if (state.page !== d.page) p.set("page", String(state.page));

  return p.toString();
}

/** Full path including optional `?query` (empty string → path only). */
export function buildProfileChangeQueueHref(state: Partial<ProfileChangeQueueState>): string {
  const merged: ProfileChangeQueueState = { ...DEFAULT_PROFILE_CHANGE_QUEUE_STATE, ...state };
  const qs = serializeProfileChangeQueueState(merged);
  return qs ? `${PROFILE_CHANGE_QUEUE_PATH}?${qs}` : PROFILE_CHANGE_QUEUE_PATH;
}
