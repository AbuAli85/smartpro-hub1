/**
 * After HR/workforce changes to employee vault docs or permit ingestion, refresh My Portal
 * queries in this browser session (work-status strip + documents list).
 *
 * Call this from any mutation `onSuccess` that can change:
 * - document expiry or row set (upload, replace, delete, metadata/expiry edit, verify/reject)
 * - work permit rows the portal summary reads (e.g. certificate ingest that creates/updates permit + doc)
 *
 * Not covered here: cross-device freshness. Same browser: My Portal uses `refetchOnWindowFocus`
 * on work-status, documents, and tasks queries so returning to the tab picks up changes made elsewhere.
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
