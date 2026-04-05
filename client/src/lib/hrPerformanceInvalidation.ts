/**
 * Centralized tRPC cache invalidation for `/hr/performance` so list fallbacks and
 * the composed dashboard stay in sync after mutations. Replace client-side fallback
 * math once the dashboard is the only source of truth for overview stats.
 */

export type HrPerformanceTrpcUtils = {
  financeHR: {
    getHrPerformanceDashboard: { invalidate: () => Promise<void> | void };
    adminListTraining: { invalidate: () => Promise<void> | void };
    adminListSelfReviews: { invalidate: () => Promise<void> | void };
  };
  kpi: {
    adminGetTeamProgress: { invalidate: () => Promise<void> | void };
    getLeaderboard: { invalidate: () => Promise<void> | void };
    listMyTargets: { invalidate: () => Promise<void> | void };
    getMyProgress: { invalidate: () => Promise<void> | void };
  };
};

export async function invalidateAfterTrainingMutation(utils: HrPerformanceTrpcUtils) {
  await Promise.all([
    utils.financeHR.getHrPerformanceDashboard.invalidate(),
    utils.financeHR.adminListTraining.invalidate(),
  ]);
}

export async function invalidateAfterSelfReviewMutation(utils: HrPerformanceTrpcUtils) {
  await Promise.all([
    utils.financeHR.getHrPerformanceDashboard.invalidate(),
    utils.financeHR.adminListSelfReviews.invalidate(),
  ]);
}

/** KPI period + leaderboard + dashboard KPI snapshot for the selected month. */
export async function invalidateAfterKpiTargetMutation(utils: HrPerformanceTrpcUtils) {
  await Promise.all([
    utils.financeHR.getHrPerformanceDashboard.invalidate(),
    utils.kpi.adminGetTeamProgress.invalidate(),
    utils.kpi.getLeaderboard.invalidate(),
    utils.kpi.listMyTargets.invalidate(),
    utils.kpi.getMyProgress.invalidate(),
  ]);
}

/** After lifecycle transitions (`transitionKpiTarget`, soft cancel via `deleteTarget`). Same breadth as set-target. */
export async function invalidateAfterKpiLifecycleMutation(utils: HrPerformanceTrpcUtils) {
  await invalidateAfterKpiTargetMutation(utils);
}
