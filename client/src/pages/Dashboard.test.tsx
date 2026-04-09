// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "./Dashboard";

const { mockRoleQueue } = vi.hoisted(() => ({
  mockRoleQueue: vi.fn(),
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: 1, role: "user", platformRole: "company_admin", email: "owner@test.om", name: "Owner" },
    isLoading: false,
  }),
}));

vi.mock("@/contexts/ActiveCompanyContext", () => ({
  useActiveCompany: () => ({
    activeCompanyId: 1,
    activeCompany: { id: 1, role: "company_admin", name: "Test Co" },
    companies: [],
    loading: false,
    switchCompany: vi.fn(),
    expiryWarningDays: 30,
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      operations: { getRoleActionQueue: { prefetch: vi.fn() } },
    }),
    analytics: {
      companyStats: { useQuery: () => ({ data: null, isLoading: false }) },
      contractsOverview: { useQuery: () => ({ data: [] }) },
      proServicesOverview: { useQuery: () => ({ data: [] }) },
      salesPipeline: { useQuery: () => ({ data: [] }) },
      smartInsights: { useQuery: () => ({ data: null }) },
      criticalItems: { useQuery: () => ({ data: [] }) },
      myTasks: { useQuery: () => ({ data: [] }) },
      taskSummary: { useQuery: () => ({ data: null }) },
    },
    payroll: {
      listRuns: { useQuery: () => ({ data: [] }) },
      getWpsComplianceSummary: { useQuery: () => ({ data: null }) },
      getRecentComplianceAlerts: { useQuery: () => ({ data: [] }) },
      getOwnerComplianceOverview: { useQuery: () => ({ data: null, isLoading: false }) },
    },
    operations: {
      getSmartDashboardSnapshot: { useQuery: () => ({ data: null, isLoading: false }) },
      getOwnerBusinessPulse: { useQuery: () => ({ data: null, isLoading: false }) },
      getRoleActionQueue: { useQuery: () => mockRoleQueue() },
    },
    employeePortal: {
      getOverview: { useQuery: () => ({ data: null }) },
      getNotifications: { useQuery: () => ({ data: [] }) },
    },
    hr: {
      listEmployees: { useQuery: () => ({ data: [] }) },
      listLeaveRequests: { useQuery: () => ({ data: [] }) },
    },
    workspace: {
      listKpis: { useQuery: () => ({ data: [] }) },
    },
  },
}));

vi.mock("@shared/clientNav", () => ({
  getHiddenNavHrefs: () => new Set<string>(),
  shouldHideBottomNav: () => false,
}));

vi.mock("wouter", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
  useLocation: () => ["/dashboard", vi.fn()],
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

describe("Dashboard role queue widget", () => {
  beforeEach(() => {
    mockRoleQueue.mockReset();
  });

  it("renders empty queue state", () => {
    mockRoleQueue.mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
      error: null,
    });

    render(<Dashboard />);
    expect(screen.getByText("Focus view")).toBeInTheDocument();
    expect(screen.getByText("No urgent work detected.")).toBeInTheDocument();
  });

  it("renders non-empty queue state", () => {
    mockRoleQueue.mockReturnValue({
      data: [
        {
          id: "payroll-1",
          type: "payroll_blocker",
          title: "Payroll waiting for approval",
          severity: "critical",
          ownerUserId: "1",
          dueAt: null,
          status: "blocked",
          href: "/payroll",
          reason: "Current month run is not approved.",
        },
      ],
      isLoading: false,
      isFetching: false,
      error: null,
    });

    render(<Dashboard />);
    expect(screen.getByText("Payroll waiting for approval")).toBeInTheDocument();
    expect(screen.getByText("Owner: you")).toBeInTheDocument();
  });
});
