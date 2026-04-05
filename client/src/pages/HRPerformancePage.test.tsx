// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import HRPerformancePage from "./HRPerformancePage";

const { mockDashboardQuery } = vi.hoisted(() => ({
  mockDashboardQuery: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      financeHR: {
        getHrPerformanceDashboard: { invalidate: vi.fn() },
        adminListTraining: { invalidate: vi.fn() },
        adminListSelfReviews: { invalidate: vi.fn() },
      },
      kpi: {
        adminGetTeamProgress: { invalidate: vi.fn() },
        getLeaderboard: { invalidate: vi.fn() },
      },
      hr: { listReviews: { invalidate: vi.fn() } },
    }),
    hr: {
      listEmployees: { useQuery: () => ({ data: [] }) },
      listReviews: { useQuery: () => ({ data: [] }) },
      createReview: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    financeHR: {
      getHrPerformanceDashboard: { useQuery: () => mockDashboardQuery() },
      adminListTraining: { useQuery: () => ({ data: [], isLoading: false }) },
      adminListSelfReviews: { useQuery: () => ({ data: [], isLoading: false }) },
      adminAssignTraining: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      adminUpdateTraining: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      adminUpdateSelfReview: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    kpi: {
      adminGetTeamProgress: { useQuery: () => ({ data: [] }) },
      getLeaderboard: { useQuery: () => ({ data: [] }) },
      listMyTargets: { useQuery: () => ({ data: [] }) },
      getMyProgress: { useQuery: () => ({ data: [] }) },
      setTarget: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

vi.mock("wouter", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const dashboardOk = {
  overview: {
    companyId: 1,
    employees: { total: 12, active: 10 },
    training: {
      totalRecords: 5,
      assigned: 1,
      inProgress: 0,
      completed: 3,
      overdue: 1,
      averageScoreCompleted: 88,
    },
    selfReviews: {
      draft: 0,
      submitted: 2,
      reviewed: 1,
      acknowledged: 0,
      pendingManagerReview: 2,
      averageManagerRating: 4,
      averageSelfRating: 4,
    },
    targets: {
      periodYear: 2026,
      periodMonth: 4,
      targetRowsThisPeriod: 3,
      averageAchievementPctThisPeriod: 72.3,
    },
  },
  training: {
    companyId: 1,
    totalRecords: 5,
    byStatus: { assigned: 1, inProgress: 0, completed: 3, overdue: 1 },
    completionRate: 60,
    averageScore: 88,
    byDepartment: [],
  },
  selfReviews: {
    companyId: 1,
    byStatus: { draft: 0, submitted: 2, reviewed: 1, acknowledged: 0 },
    reviewBacklog: 2,
    managerResponseRate: 33,
    averageManagerRating: 4,
    averageSelfRating: 4,
  },
  leaderboard: {
    companyId: 1,
    topPerformers: [],
    recentTrainingCompletions: [],
    topDepartmentsByTrainingHealth: [],
  },
};

describe("HRPerformancePage overview dashboard", () => {
  beforeEach(() => {
    mockDashboardQuery.mockReset();
  });

  it("shows loading skeleton while the dashboard query is loading", () => {
    mockDashboardQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });
    render(<HRPerformancePage />);
    expect(screen.getByTestId("hr-dashboard-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("hr-dashboard-metrics")).not.toBeInTheDocument();
  });

  it("renders overview metrics from the dashboard payload", () => {
    mockDashboardQuery.mockReturnValue({
      data: dashboardOk,
      isLoading: false,
      isError: false,
      error: null,
    });
    render(<HRPerformancePage />);
    expect(screen.getByTestId("hr-dashboard-metrics")).toBeInTheDocument();
    expect(screen.getByText("72.3%")).toBeInTheDocument();
    expect(screen.getByText(/Training completed \(all-time\)/)).toBeInTheDocument();
  });

  it("shows an error alert when the dashboard query fails", () => {
    mockDashboardQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { message: "FORBIDDEN" },
    });
    render(<HRPerformancePage />);
    expect(screen.getByTestId("hr-dashboard-error")).toBeInTheDocument();
    expect(screen.getByText(/FORBIDDEN/)).toBeInTheDocument();
  });
});
