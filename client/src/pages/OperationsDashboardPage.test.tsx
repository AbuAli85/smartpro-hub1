// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);

/** English translations mirror for the "operations" namespace.  Keeps test
 *  assertions on readable strings rather than raw translation keys. */
const EN: Record<string, string> = {
  "overview.title": "Operations Overview",
  "overview.subtitle":
    "Track delivery health, workload, and execution performance. Critical actions are managed in Control Tower.",
  "overview.refresh": "Refresh",
  "ctCard.heading": "Need to act on blockers?",
  "ctCard.body":
    "Live priority signals, pending approvals, and compliance alerts are managed in Control Tower.",
  "ctCard.cta": "Open Control Tower",
  "kpi.openCases": "Open Cases",
  "kpi.openCasesSub": "{{count}} due today",
  "kpi.slaBreaches": "SLA Breaches",
  "kpi.slaBreachesSub": "Require immediate action",
  "kpi.revenueMtd": "Revenue MTD",
  "kpi.revenueMtdSub": "Month to date, paid",
  "kpi.expiringDocs": "Expiring Docs",
  "kpi.expiringDocsSub": "Within 7 days",
  "kpi.pendingContracts": "Pending Contracts",
  "kpi.pendingContractsSub": "Awaiting signature",
  "kpi.leaveRequests": "Leave Requests",
  "kpi.leaveRequestsSub": "Pending approval",
  "kpi.activeWorkflows": "Active Workflows",
  "kpi.activeWorkflowsSub": "Renewal workflows",
  "kpi.draftQuotations": "Draft Quotations",
  "kpi.draftQuotationsSub": "Not yet sent",
  "workforce.title": "Today's Workforce Status",
  "workforce.viewAll": "View All",
  "workforce.present": "Present",
  "workforce.absent": "Absent",
  "workforce.onLeave": "On Leave",
  "workforce.attendanceRate": "Attendance Rate",
  "workforce.kpiAverage": "KPI Average",
  "officers.title": "Officer Workload",
  "officers.empty": "No officers assigned",
  "officers.manage": "Manage Officers",
  "modules.title": "Go to source module",
  "modules.engagementsOps": "Engagements Ops",
  "modules.tasks": "Tasks",
  "modules.hrAttendance": "HR & Attendance",
  "modules.payroll": "Payroll",
  "modules.compliance": "Compliance Center",
  "activity.title": "Recent Activity",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const raw = EN[key] ?? key;
      if (!opts) return raw;
      return raw.replace(/\{\{(\w+)\}\}/g, (_, v) => String(opts[v] ?? `{{${v}}}`));
    },
    i18n: { language: "en-OM" },
  }),
}));

vi.mock("@/contexts/ActiveCompanyContext", () => ({
  useActiveCompany: () => ({
    activeCompanyId: 1,
    activeCompany: { id: 1, role: "company_admin", name: "Test Co" },
    loading: false,
  }),
}));

const { mockSnapshot, mockHrStats } = vi.hoisted(() => ({
  mockSnapshot: vi.fn().mockReturnValue({ data: undefined, isLoading: false }),
  mockHrStats: vi.fn().mockReturnValue({ data: undefined, isLoading: false }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    operations: {
      getDailySnapshot: { useQuery: mockSnapshot },
    },
    hr: {
      getDashboardStats: { useQuery: mockHrStats },
    },
  },
}));

vi.mock("wouter", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import OperationsDashboardPage from "./OperationsDashboardPage";

afterEach(cleanup);

const BASE_SNAPSHOT = {
  openCases: { total: 4 },
  casesDueToday: [],
  slaBreaches: 0,
  revenueMtdOmr: 1500,
  expiringDocs7Days: 0,
  pendingContracts: 2,
  pendingLeaveRequests: 1,
  activeWorkflows: 3,
  draftQuotations: 0,
  officerWorkload: [],
  recentActivity: [],
};

describe("OperationsDashboardPage", () => {
  beforeEach(() => {
    mockSnapshot.mockReturnValue({ data: BASE_SNAPSHOT, isLoading: false });
    mockHrStats.mockReturnValue({ data: undefined, isLoading: false });
  });

  it('renders "Operations Overview" as the page title', () => {
    render(<OperationsDashboardPage />);
    expect(
      screen.getByRole("heading", { name: "Operations Overview", level: 1 }),
    ).toBeInTheDocument();
  });

  it('does not render "Command Centre" anywhere', () => {
    render(<OperationsDashboardPage />);
    expect(screen.queryByText(/Command Centre/i)).toBeNull();
  });

  it("renders the execution-focus subtitle copy", () => {
    render(<OperationsDashboardPage />);
    expect(
      screen.getByText(/Track delivery health, workload, and execution performance/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Critical actions are managed in Control Tower/i)).toBeInTheDocument();
  });

  it("renders the Control Tower blockers card with correct link", () => {
    render(<OperationsDashboardPage />);
    const region = screen.getByRole("region", { name: "Control Tower blockers" });
    expect(region).toBeInTheDocument();
    expect(screen.getByText("Need to act on blockers?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Control Tower" })).toHaveAttribute(
      "href",
      "/control-tower",
    );
  });

  it("renders KPI cards for open cases and SLA breaches", () => {
    render(<OperationsDashboardPage />);
    expect(screen.getByText("Open Cases")).toBeInTheDocument();
    expect(screen.getByText("SLA Breaches")).toBeInTheDocument();
    expect(screen.getByText("Revenue MTD")).toBeInTheDocument();
    expect(screen.getByText("Expiring Docs")).toBeInTheDocument();
    expect(screen.getByText("Pending Contracts")).toBeInTheDocument();
    expect(screen.getByText("Leave Requests")).toBeInTheDocument();
    expect(screen.getByText("Active Workflows")).toBeInTheDocument();
    expect(screen.getByText("Draft Quotations")).toBeInTheDocument();
  });

  it("does not render the alert banner / action queue", () => {
    render(<OperationsDashboardPage />);
    expect(screen.queryByText(/Action queue for this workspace/i)).toBeNull();
  });

  it("does not render Pending Leave Approvals card", () => {
    render(<OperationsDashboardPage />);
    expect(screen.queryByText(/Pending Leave Approvals/i)).toBeNull();
  });

  it("does not render Payroll Awaiting Payment card", () => {
    render(<OperationsDashboardPage />);
    expect(screen.queryByText(/Payroll Awaiting Payment/i)).toBeNull();
    expect(screen.queryByText(/Pay Now/i)).toBeNull();
  });

  it("does not render Cases Due Today card", () => {
    render(<OperationsDashboardPage />);
    expect(screen.queryByText(/Cases Due Today/i)).toBeNull();
  });

  it("does not render Expiring in 7 Days document list card", () => {
    render(<OperationsDashboardPage />);
    expect(screen.queryByText("Trigger Renewals")).toBeNull();
  });

  it("does not render AI Insights & Alerts section", () => {
    render(<OperationsDashboardPage />);
    expect(screen.queryByText(/AI Insights/i)).toBeNull();
    expect(screen.queryByText(/AI Insights & Alerts/i)).toBeNull();
  });

  it("does not render old Quick Actions card", () => {
    render(<OperationsDashboardPage />);
    expect(screen.queryByText("Quick Actions")).toBeNull();
    expect(screen.queryByText("New Quotation")).toBeNull();
    expect(screen.queryByText("New PRO request")).toBeNull();
    expect(screen.queryByText("Run Payroll")).toBeNull();
  });

  it("renders source module navigation links", () => {
    render(<OperationsDashboardPage />);
    expect(screen.getByText("Go to source module")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Engagements Ops" })).toHaveAttribute(
      "href",
      "/engagements/ops",
    );
    expect(screen.getByRole("link", { name: "Tasks" })).toHaveAttribute(
      "href",
      "/operations/tasks",
    );
    expect(screen.getByRole("link", { name: "HR & Attendance" })).toHaveAttribute(
      "href",
      "/hr/attendance",
    );
    expect(screen.getByRole("link", { name: "Payroll" })).toHaveAttribute("href", "/payroll");
    expect(screen.getByRole("link", { name: "Compliance Center" })).toHaveAttribute(
      "href",
      "/compliance",
    );
  });

  it("renders Officer Workload section with empty state", () => {
    render(<OperationsDashboardPage />);
    expect(screen.getByText("Officer Workload")).toBeInTheDocument();
    expect(screen.getByText("No officers assigned")).toBeInTheDocument();
  });

  it("renders Officer Workload bars when officers are present", () => {
    mockSnapshot.mockReturnValue({
      data: {
        ...BASE_SNAPSHOT,
        officerWorkload: [
          { officerId: 1, name: "Alice", activeAssignments: 8, capacity: 20 },
          { officerId: 2, name: "Bob", activeAssignments: 19, capacity: 20 },
        ],
      },
      isLoading: false,
    });
    render(<OperationsDashboardPage />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("renders Today's Workforce Status when hrStats is present", () => {
    mockHrStats.mockReturnValue({
      data: {
        todayPresent: 30,
        todayAbsent: 5,
        pendingLeave: 2,
        activeEmployees: 35,
        kpiAvgPct: 0,
      },
      isLoading: false,
    });
    render(<OperationsDashboardPage />);
    expect(screen.getByText("Today's Workforce Status")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("Present")).toBeInTheDocument();
  });

  it("does not render Today's Workforce Status when hrStats is absent", () => {
    mockHrStats.mockReturnValue({ data: undefined, isLoading: false });
    render(<OperationsDashboardPage />);
    expect(screen.queryByText("Today's Workforce Status")).toBeNull();
  });

  it("renders Recent Activity when snapshot has events", () => {
    mockSnapshot.mockReturnValue({
      data: {
        ...BASE_SNAPSHOT,
        recentActivity: [
          {
            id: 1,
            action: "case_updated",
            entityType: "compliance_case",
            entityId: 42,
            createdAt: new Date().toISOString(),
          },
        ],
      },
      isLoading: false,
    });
    render(<OperationsDashboardPage />);
    expect(screen.getByText("Recent Activity")).toBeInTheDocument();
  });

  it("does not render Recent Activity when snapshot has no events", () => {
    render(<OperationsDashboardPage />);
    expect(screen.queryByText("Recent Activity")).toBeNull();
  });

  it("renders loading skeleton when isLoading=true", () => {
    mockSnapshot.mockReturnValue({ data: undefined, isLoading: true });
    render(<OperationsDashboardPage />);
    expect(screen.queryByText("Open Cases")).toBeNull();
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });
});
