/**
 * Future admin reclassification: UPDATE `profile_change_requests.fieldKey` only; never rewrite `fieldLabel`
 * (audit + employee-visible text). Queue, KPIs, and filters already key off `fieldKey`.
 *
 * After a reclassify mutation, invalidate list + KPI procedures and employee-facing history queries.
 */
export const PROFILE_CHANGE_RECLASSIFY_INVALIDATION = {
  listCompany: "workforce.profileChangeRequests.listCompany",
  queueKpis: "workforce.profileChangeRequests.queueKpis",
  listForEmployee: "workforce.profileChangeRequests.listForEmployee",
  getMyProfileChangeRequests: "employeePortal.getMyProfileChangeRequests",
} as const;
