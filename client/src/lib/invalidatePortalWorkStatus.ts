/**
 * After HR/workforce changes to employee vault docs or permit ingestion, refresh My Portal
 * queries in this browser session (work-status strip + documents list).
 *
 * Call this from any mutation `onSuccess` that can change:
 * - document expiry or row set (upload, replace, delete, metadata/expiry edit, verify/reject)
 * - work permit rows the portal summary reads (e.g. certificate ingest that creates/updates permit + doc)
 *
 * Not covered here: cross-tab / cross-device freshness (refetch on focus, polling, or realtime).
 *
 * Checklist when adding flows: if it changes what the employee would see for permits or vault docs,
 * wire `invalidatePortalWorkStatusAndDocuments(utils)` on success.
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
