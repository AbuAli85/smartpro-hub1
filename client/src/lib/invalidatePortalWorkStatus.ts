/**
 * After HR/workforce changes to employee vault docs or permit ingestion, refresh My Portal
 * queries in this browser session (work-status strip + documents list).
 *
 * Call this from any mutation `onSuccess` that can change:
 * - document expiry or row set (upload, replace, delete, metadata/expiry edit, verify/reject)
 * - work permit rows the portal summary reads (e.g. certificate ingest that creates/updates permit + doc)
 *
 * Not covered here: cross-device freshness. Same browser: My Portal uses `refetchOnWindowFocus`
 * on work-status, documents, and tasks when the user returns to the tab; `getMyWorkStatusSummary` also
 * polls every 90s while the tab is foreground (`refetchIntervalInBackground: false`). Documents/tasks
 * lists are not polled — open those tabs or refocus to refresh them.
 *
 * Checklist when adding flows: if it changes what the employee would see for permits or vault docs,
 * wire `invalidatePortalWorkStatusAndDocuments(utils)` on success.
 *
 * Do not:
 * - Invalidate only one of the two queries (strip and Docs tab must stay aligned).
 * - Treat this as a generic portal invalidation hook — keep it scoped to work-status + documents only.
 */
export function invalidatePortalWorkStatusAndDocuments(utils: {
  employeePortal: {
    getMyWorkStatusSummary: { invalidate: () => unknown };
    getMyDocuments: { invalidate: () => unknown };
  };
}) {
  void utils.employeePortal.getMyWorkStatusSummary.invalidate();
  void utils.employeePortal.getMyDocuments.invalidate();
}
