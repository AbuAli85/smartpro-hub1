/**
 * Shared HR terminology dictionary.
 *
 * Purpose: single source of truth for standardised HR terms used across the
 * entire HR module.  Import the i18n key paths from here instead of
 * copy-pasting raw strings, so a terminology change only needs one update.
 *
 * Usage:
 *   import { HR_TERMS } from "@/lib/hrTerminology";
 *   const label = t(HR_TERMS.activeEmployees);   // "hr:workforce.active"
 */

/** Full i18n key (namespace:path) for each canonical HR term. */
export const HR_TERMS = {
  // ── Workforce counts ──────────────────────────────────────────────────────
  activeEmployees: "hr:workforce.active",
  totalWorkforce: "hr:workforce.total",
  onLeave: "hr:workforce.onLeave",
  attrition: "hr:workforce.attrition",
  workforceDirectory: "hr:workforce.directory",

  // ── Lifecycle statuses ────────────────────────────────────────────────────
  statusActive: "hr:lifecycle.active",
  statusOnProbation: "hr:lifecycle.onProbation",
  statusResigned: "hr:lifecycle.resigned",
  statusTerminated: "hr:lifecycle.terminated",
  statusTransferred: "hr:lifecycle.transferred",
  statusRetired: "hr:lifecycle.retired",

  // ── Attendance statuses ───────────────────────────────────────────────────
  attendancePresent: "hr:attendance.present",
  attendanceAbsent: "hr:attendance.absent",
  attendanceLate: "hr:attendance.late",
  attendanceOnLeave: "hr:attendance.onLeave",
  attendanceHoliday: "hr:attendance.holiday",
  attendanceEarlyLeave: "hr:attendance.earlyLeave",

  // ── Leave types ───────────────────────────────────────────────────────────
  leaveAnnual: "hr:leave.annual",
  leaveSick: "hr:leave.sick",
  leaveMaternity: "hr:leave.maternity",
  leavePaternity: "hr:leave.paternity",
  leaveEmergency: "hr:leave.emergency",
  leaveUnpaid: "hr:leave.unpaid",
  leaveOther: "hr:leave.other",

  // ── Leave statuses ────────────────────────────────────────────────────────
  leavePending: "hr:leave.pending",
  leaveApproved: "hr:leave.approved",
  leaveRejected: "hr:leave.rejected",

  // ── KPI lifecycle statuses ────────────────────────────────────────────────
  kpiDraft: "hr:kpi.lifecycle.draft",
  kpiActive: "hr:kpi.lifecycle.active",
  kpiCompleted: "hr:kpi.lifecycle.completed",
  kpiArchived: "hr:kpi.lifecycle.archived",
  kpiCancelled: "hr:kpi.lifecycle.cancelled",

  // ── Page titles ───────────────────────────────────────────────────────────
  hrTitle: "hr:title",
  attendanceTitle: "hr:attendance.title",
  leaveTitle: "hr:leave.title",
  payrollTitle: "hr:payroll.title",
  performanceTitle: "hr:performance.title",
  kpiTitle: "hr:kpi.title",
  insightsTitle: "hr:insights.title",
  recruitmentTitle: "hr:recruitment.title",
  documentsTitle: "hr:documents.title",
} as const;

/** Canonical status map with translation keys — use for badge lookups. */
export const EMPLOYEE_STATUS_I18N: Record<string, string> = {
  active: "hr:lifecycle.active",
  on_leave: "hr:attendance.onLeave",
  terminated: "hr:lifecycle.terminated",
  resigned: "hr:lifecycle.resigned",
  on_probation: "hr:lifecycle.onProbation",
  transferred: "hr:lifecycle.transferred",
  retired: "hr:lifecycle.retired",
};

/** Canonical leave type map with translation keys. */
export const LEAVE_TYPE_I18N: Record<string, string> = {
  annual: "hr:leave.annual",
  sick: "hr:leave.sick",
  maternity: "hr:leave.maternity",
  paternity: "hr:leave.paternity",
  emergency: "hr:leave.emergency",
  unpaid: "hr:leave.unpaid",
  other: "hr:leave.other",
};

/** Canonical leave status map with translation keys. */
export const LEAVE_STATUS_I18N: Record<string, string> = {
  pending: "hr:leave.pending",
  approved: "hr:leave.approved",
  rejected: "hr:leave.rejected",
};

/** Canonical KPI metric type map with translation keys. */
export const KPI_METRIC_TYPE_I18N: Record<string, string> = {
  sales_amount: "hr:kpi.metricTypes.sales_amount",
  client_count: "hr:kpi.metricTypes.client_count",
  leads_count: "hr:kpi.metricTypes.leads_count",
  calls_count: "hr:kpi.metricTypes.calls_count",
  meetings_count: "hr:kpi.metricTypes.meetings_count",
  proposals_count: "hr:kpi.metricTypes.proposals_count",
  revenue: "hr:kpi.metricTypes.revenue",
  units_sold: "hr:kpi.metricTypes.units_sold",
  custom: "hr:kpi.metricTypes.custom",
};

/** Canonical KPI lifecycle status map with translation keys. */
export const KPI_STATUS_I18N: Record<string, string> = {
  draft: "hr:kpi.lifecycle.draft",
  active: "hr:kpi.lifecycle.active",
  completed: "hr:kpi.lifecycle.completed",
  archived: "hr:kpi.lifecycle.archived",
  cancelled: "hr:kpi.lifecycle.cancelled",
};
