/**
 * After HR/workforce changes to employee vault docs or permit ingestion, refresh My Portal
 * queries in this browser session (work-status strip + documents list).
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
