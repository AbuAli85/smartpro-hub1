/**
 * Daily attendance digest builder (Phase 9C).
 *
 * Pure — no database calls. Aggregates a list of DailyAttendanceState rows
 * into a compact summary suitable for admin dashboards and future notification
 * delivery (email / push / WhatsApp).
 *
 * Severity rules:
 *   critical  — payrollBlocked > 0, or any action item has severity "critical"
 *   attention — needsReview > 0, late > 0, missingCheckout > 0, or actionItems > 0
 *   normal    — no meaningful issues
 *
 * Future notification delivery:
 *   This module is intentionally notification-free.  When notification
 *   infrastructure is ready, a server job can call getDailyDigest (or
 *   buildAttendanceDailyDigest directly) and pass the result to the
 *   existing server/_core/notification.ts notifyOwner() or a future
 *   WhatsApp/email adapter.  The digest's headlineKey / summaryLineKey /
 *   topIssues are designed to translate into concise message payloads.
 */

import type { DailyAttendanceState } from "./attendanceDailyState";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DigestSeverity = "normal" | "attention" | "critical";
export type DigestIssueSeverity = "low" | "medium" | "high" | "critical";

export interface AttendanceDailyDigest {
  date: string;
  siteId?: string | null;
  siteName?: string | null;
  totals: {
    scheduled: number;
    checkedIn: number;
    checkedOut: number;
    late: number;
    absentOrNoArrival: number;
    missingCheckout: number;
    payrollBlocked: number;
    needsReview: number;
    ready: number;
    actionItems: number;
    employeesAffected: number;
  };
  severity: DigestSeverity;
  /** i18n key — use t(headlineKey) to render. */
  headlineKey: string;
  /** i18n key — use t(summaryLineKey) to render. */
  summaryLineKey: string;
  /** Deduplicated, sorted reason codes from all rows. */
  reasonCodes: string[];
  /** Action-item categories grouped and sorted: critical → high → medium → low, then count desc. */
  topIssues: Array<{
    category: string;
    count: number;
    severity: DigestIssueSeverity;
    isPayrollBlocking: boolean;
  }>;
  /** Per-site aggregation — only populated when >1 distinct site in the data. */
  siteBreakdown?: Array<{
    siteId: string;
    siteName: string;
    scheduled: number;
    payrollBlocked: number;
    needsReview: number;
    absentOrNoArrival: number;
  }>;
}

export interface BuildDigestOptions {
  date: string;
  siteId?: string | null;
  siteName?: string | null;
  /**
   * Optional map from numeric siteId → site display name.
   * Used to populate siteBreakdown.siteName.  When absent, falls back to
   * "Site #<id>" or the reserved sentinel "no_site" for null siteId rows.
   */
  siteNameMap?: Map<number, string>;
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Build an AttendanceDailyDigest from pre-resolved DailyAttendanceState rows.
 *
 * Pure — no side effects.  Call once per date (or per date × site) on the
 * server-side after loading rows, or client-side via useMemo on the same
 * rows already fetched by getDailyStates.
 */
export function buildAttendanceDailyDigest(
  rows: DailyAttendanceState[],
  options: BuildDigestOptions,
): AttendanceDailyDigest {
  const totals = {
    scheduled: 0,
    checkedIn: 0,
    checkedOut: 0,
    late: 0,
    absentOrNoArrival: 0,
    missingCheckout: 0,
    payrollBlocked: 0,
    needsReview: 0,
    ready: 0,
    actionItems: 0,
    employeesAffected: 0,
  };

  const allReasonCodes = new Set<string>();
  const affectedEmpIds = new Set<number>();

  // category → { count, severity, isPayrollBlocking }
  const issueByCategory = new Map<
    string,
    { count: number; severity: DigestIssueSeverity; isPayrollBlocking: boolean }
  >();

  // siteId (number | null) → breakdown entry
  const siteDataMap = new Map<
    number | null,
    {
      siteId: string;
      siteName: string;
      scheduled: number;
      payrollBlocked: number;
      needsReview: number;
      absentOrNoArrival: number;
    }
  >();

  for (const row of rows) {
    const ss = row.scheduleState;
    const cs = row.canonicalStatus;
    const pr = row.payrollReadiness;
    const isScheduled =
      ss === "scheduled" ||
      ss === "missing_shift" ||
      ss === "missing_site" ||
      ss === "conflict";

    // ── Totals ──────────────────────────────────────────────────────────────

    if (isScheduled) totals.scheduled++;

    if (cs === "checked_in_on_time" || cs === "checked_in_late") totals.checkedIn++;
    if (cs === "checked_out") totals.checkedOut++;
    if (cs === "checked_in_late" || cs === "late_no_arrival") totals.late++;
    if (
      cs === "absent_confirmed" ||
      cs === "absent_pending" ||
      cs === "late_no_arrival"
    )
      totals.absentOrNoArrival++;

    if (pr === "blocked_missing_checkout") totals.missingCheckout++;
    if (pr.startsWith("blocked_")) totals.payrollBlocked++;
    if (pr === "needs_review") totals.needsReview++;
    if (pr === "ready" || pr === "excluded") totals.ready++;

    totals.actionItems += row.actionItems.length;
    if (row.actionItems.length > 0) affectedEmpIds.add(row.employeeId);

    // ── Reason codes ─────────────────────────────────────────────────────────

    for (const code of row.reasonCodes) allReasonCodes.add(code);

    // ── Group action items by category ────────────────────────────────────────
    // Each item already carries severity + isPayrollBlocking from the builder.

    for (const item of row.actionItems) {
      const existing = issueByCategory.get(item.category);
      if (existing) {
        existing.count++;
      } else {
        issueByCategory.set(item.category, {
          count: 1,
          severity: item.severity as DigestIssueSeverity,
          isPayrollBlocking: item.isPayrollBlocking,
        });
      }
    }

    // ── Site breakdown ────────────────────────────────────────────────────────

    const sid = row.siteId ?? null;
    if (!siteDataMap.has(sid)) {
      siteDataMap.set(sid, {
        siteId: sid != null ? String(sid) : "none",
        siteName:
          sid != null
            ? (options.siteNameMap?.get(sid) ?? `Site #${sid}`)
            : "no_site",
        scheduled: 0,
        payrollBlocked: 0,
        needsReview: 0,
        absentOrNoArrival: 0,
      });
    }
    const se = siteDataMap.get(sid)!;
    if (isScheduled) se.scheduled++;
    if (pr.startsWith("blocked_")) se.payrollBlocked++;
    if (pr === "needs_review") se.needsReview++;
    if (
      cs === "absent_confirmed" ||
      cs === "absent_pending" ||
      cs === "late_no_arrival"
    )
      se.absentOrNoArrival++;
  }

  totals.employeesAffected = affectedEmpIds.size;

  // ── Severity ──────────────────────────────────────────────────────────────

  const hasCriticalIssue = [...issueByCategory.values()].some(
    (i) => i.severity === "critical",
  );

  let severity: DigestSeverity = "normal";
  if (totals.payrollBlocked > 0 || hasCriticalIssue) {
    severity = "critical";
  } else if (
    totals.needsReview > 0 ||
    totals.late > 0 ||
    totals.missingCheckout > 0 ||
    totals.actionItems > 0
  ) {
    severity = "attention";
  }

  // ── Top issues: critical → high → medium → low, then count desc ───────────

  const topIssues = Array.from(issueByCategory.entries())
    .map(([category, data]) => ({ category, ...data }))
    .sort((a, b) => {
      const sd =
        (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4);
      return sd !== 0 ? sd : b.count - a.count;
    });

  // ── Reason codes: deduped + sorted ────────────────────────────────────────

  const reasonCodes = [...allReasonCodes].sort();

  // ── Site breakdown: only when >1 distinct site present ───────────────────

  const siteBreakdown =
    siteDataMap.size > 1
      ? Array.from(siteDataMap.values()).sort((a, b) => b.scheduled - a.scheduled)
      : undefined;

  return {
    date: options.date,
    siteId: options.siteId,
    siteName: options.siteName,
    totals,
    severity,
    headlineKey: `attendance.dailyDigest.headline.${severity}`,
    summaryLineKey: `attendance.dailyDigest.summaryLine.${severity}`,
    reasonCodes,
    topIssues,
    siteBreakdown,
  };
}
