/**
 * Promoter assignment operating lifecycle — single source of truth for status rules.
 * Used by server mutations and may be imported by the admin UI for labels (no duplicated transition matrices).
 */

export const ASSIGNMENT_STATUSES = [
  "draft",
  "active",
  "suspended",
  "completed",
  "terminated",
] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const BILLING_MODELS = ["per_month", "per_day", "per_hour", "fixed_term"] as const;
export type BillingModel = (typeof BILLING_MODELS)[number];

export const RATE_SOURCES = ["assignment_override", "contract_default", "client_default"] as const;
export type RateSource = (typeof RATE_SOURCES)[number];

/** Allowed transitions: from -> to[] */
export const ALLOWED_ASSIGNMENT_TRANSITIONS: Record<AssignmentStatus, readonly AssignmentStatus[]> = {
  draft: ["active", "terminated"],
  active: ["suspended", "completed", "terminated"],
  suspended: ["active", "completed", "terminated"],
  completed: [],
  terminated: [],
};

const TERMINAL: ReadonlySet<AssignmentStatus> = new Set(["completed", "terminated"]);

export function canTransitionAssignmentStatus(from: AssignmentStatus, to: AssignmentStatus): boolean {
  if (from === to) return true;
  return (ALLOWED_ASSIGNMENT_TRANSITIONS[from] ?? []).includes(to);
}

export function isAssignmentActive(status: AssignmentStatus): boolean {
  return status === "active";
}

export function isAssignmentOperational(status: AssignmentStatus): boolean {
  return status === "active" || status === "suspended";
}

export function isAssignmentTerminal(status: AssignmentStatus): boolean {
  return TERMINAL.has(status);
}

/**
 * Terminal states should have an end date recorded when the transition completes.
 * Draft may omit end; active may omit end for open-ended deployments (Phase 1 allows NULL end_date).
 */
export function requiresEndDateForTerminalTransition(to: AssignmentStatus): boolean {
  return to === "completed" || to === "terminated";
}

export function requiresSuspensionReason(to: AssignmentStatus): boolean {
  return to === "suspended";
}

export function requiresTerminationReason(to: AssignmentStatus): boolean {
  return to === "terminated";
}

export type DateOnly = Date | string | null | undefined;

function toYmd(d: DateOnly): string | null {
  if (d == null) return null;
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/**
 * Validates ordering; returns normalized Date objects for persistence (date column semantics).
 * Throws Error with message for API layer to map to BAD_REQUEST.
 */
export function normalizeAssignmentDates(
  start: DateOnly,
  end: DateOnly,
): { startDate: Date; endDate: Date | null } {
  const s = toYmd(start);
  if (!s) throw new Error("Start date is required");
  const startDate = new Date(s);
  if (isNaN(startDate.getTime())) throw new Error("Invalid start date");

  const e = toYmd(end);
  if (!e) return { startDate, endDate: null };
  const endDate = new Date(e);
  if (isNaN(endDate.getTime())) throw new Error("Invalid end date");
  if (endDate < startDate) throw new Error("End date cannot be before start date");
  return { startDate, endDate };
}

/**
 * Two half-open calendar ranges [start,end] overlap if they share any day, treating NULL end as +∞ for active-like rows.
 * Used for overlap detection — see repository comment for business assumptions.
 */
export function dateRangesOverlap(
  aStart: Date,
  aEnd: Date | null,
  bStart: Date,
  bEnd: Date | null,
): boolean {
  const endA = aEnd ?? new Date("2099-12-31");
  const endB = bEnd ?? new Date("2099-12-31");
  return aStart <= endB && bStart <= endA;
}

/** Maps legacy varchar `status` values from pre-Phase-1 rows. */
export function migrateLegacyAssignmentStatus(raw: string | null | undefined): AssignmentStatus {
  switch (raw) {
    case "active":
      return "active";
    case "inactive":
      return "suspended";
    case "expired":
      return "completed";
    case "draft":
    case "suspended":
    case "completed":
    case "terminated":
      return raw as AssignmentStatus;
    default:
      return "active";
  }
}

/** Maps operating assignment status to outsourcing_contracts.status for dual-write (CMS). */
export function assignmentStatusToContractStatus(
  s: AssignmentStatus,
): "draft" | "active" | "expired" | "terminated" | "suspended" {
  switch (s) {
    case "draft":
      return "draft";
    case "active":
      return "active";
    case "suspended":
      return "suspended";
    case "completed":
      return "expired";
    case "terminated":
      return "terminated";
    default:
      return "draft";
  }
}
