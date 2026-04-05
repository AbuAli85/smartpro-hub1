import { describe, expect, it, vi } from "vitest";
import {
  invalidateAfterKpiTargetMutation,
  invalidateAfterSelfReviewMutation,
  invalidateAfterTrainingMutation,
} from "./hrPerformanceInvalidation";

function makeUtils() {
  return {
    financeHR: {
      getHrPerformanceDashboard: { invalidate: vi.fn().mockResolvedValue(undefined) },
      adminListTraining: { invalidate: vi.fn().mockResolvedValue(undefined) },
      adminListSelfReviews: { invalidate: vi.fn().mockResolvedValue(undefined) },
    },
    kpi: {
      adminGetTeamProgress: { invalidate: vi.fn().mockResolvedValue(undefined) },
      getLeaderboard: { invalidate: vi.fn().mockResolvedValue(undefined) },
      listMyTargets: { invalidate: vi.fn().mockResolvedValue(undefined) },
      getMyProgress: { invalidate: vi.fn().mockResolvedValue(undefined) },
    },
  };
}

describe("hrPerformanceInvalidation", () => {
  it("invalidateAfterTrainingMutation refreshes dashboard and training list", async () => {
    const utils = makeUtils();
    await invalidateAfterTrainingMutation(utils);
    expect(utils.financeHR.getHrPerformanceDashboard.invalidate).toHaveBeenCalledTimes(1);
    expect(utils.financeHR.adminListTraining.invalidate).toHaveBeenCalledTimes(1);
    expect(utils.financeHR.adminListSelfReviews.invalidate).not.toHaveBeenCalled();
  });

  it("invalidateAfterSelfReviewMutation refreshes dashboard and self-review list", async () => {
    const utils = makeUtils();
    await invalidateAfterSelfReviewMutation(utils);
    expect(utils.financeHR.getHrPerformanceDashboard.invalidate).toHaveBeenCalledTimes(1);
    expect(utils.financeHR.adminListSelfReviews.invalidate).toHaveBeenCalledTimes(1);
    expect(utils.financeHR.adminListTraining.invalidate).not.toHaveBeenCalled();
  });

  it("invalidateAfterKpiTargetMutation refreshes dashboard and KPI period queries", async () => {
    const utils = makeUtils();
    await invalidateAfterKpiTargetMutation(utils);
    expect(utils.financeHR.getHrPerformanceDashboard.invalidate).toHaveBeenCalledTimes(1);
    expect(utils.kpi.adminGetTeamProgress.invalidate).toHaveBeenCalledTimes(1);
    expect(utils.kpi.getLeaderboard.invalidate).toHaveBeenCalledTimes(1);
    expect(utils.kpi.listMyTargets.invalidate).toHaveBeenCalledTimes(1);
    expect(utils.kpi.getMyProgress.invalidate).toHaveBeenCalledTimes(1);
  });
});
