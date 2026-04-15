/**
 * Granular report permission keys stored in companyMembers.permissions[].
 * These supplement role-based access — a company_member with view_reports
 * can access /reports even though their role normally cannot.
 */
export const REPORT_PERMISSION_KEYS = [
  "view_reports", // /reports page + exportMonthlyAttendance
  "view_payroll", // /payroll and /payroll/process
  "view_executive_summary", // /finance/overview executive KPIs
] as const;

export type ReportPermissionKey = (typeof REPORT_PERMISSION_KEYS)[number];

export function hasReportPermission(
  permissions: string[] | null | undefined,
  key: ReportPermissionKey,
): boolean {
  return Array.isArray(permissions) && permissions.includes(key);
}
