/**
 * URL-driven tab selection for `/my-portal?tab=…` (see shift request convention).
 * Keep in sync with tab `value` props on `EmployeePortalPage`.
 */
export const EMPLOYEE_PORTAL_TAB_IDS = [
  "overview",
  "attendance",
  "leave",
  "payroll",
  "tasks",
  "documents",
  "profile",
  "requests",
  "kpi",
  "expenses",
  "worklog",
  "training",
  "reviews",
] as const;

export type EmployeePortalTabId = (typeof EMPLOYEE_PORTAL_TAB_IDS)[number];

export function isEmployeePortalTabId(value: string): value is EmployeePortalTabId {
  return (EMPLOYEE_PORTAL_TAB_IDS as readonly string[]).includes(value);
}

/** Parse `?tab=<id>` from wouter `useSearch()` output. */
export function parseEmployeePortalTabFromSearch(search: string): EmployeePortalTabId | null {
  const s = search.startsWith("?") ? search.slice(1) : search;
  if (!s.trim()) return null;
  const raw = new URLSearchParams(s).get("tab");
  if (!raw) return null;
  const id = raw.trim().toLowerCase();
  return isEmployeePortalTabId(id) ? id : null;
}
