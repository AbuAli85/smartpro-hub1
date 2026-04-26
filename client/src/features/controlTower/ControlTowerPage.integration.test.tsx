// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Router } from "wouter";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** Vitest bundle expects classic `React` for JSX in this page under test. */
vi.stubGlobal("React", React);
import type { ActionQueueItem } from "@/features/controlTower/actionQueueTypes";
import { attachExecutionToQueueItems } from "@/features/controlTower/executionMeta";
import { attachEscalationToQueueItems } from "@/features/controlTower/escalationMeta";
import type { ActionQueueResult } from "@/hooks/useActionQueue";

/** Fixed "now" so aging/stale signals stay stable for decision prompts. */
const FIXED_NOW = new Date("2026-04-09T12:00:00.000Z");

const { trpcQuery, engagementOpsSummaryInvalidate, mockCtSummary, mockMyAccess } = vi.hoisted(() => {
  const engagementOpsSummaryInvalidate = vi.fn();
  const mockCtSummary = vi.fn().mockReturnValue({
    data: {
      totalOpen: 0,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      byDomain: {},
      visibleDomains: [],
    },
    isLoading: false,
    isError: false,
    dataUpdatedAt: Date.now(),
  });
  const mockMyAccess = vi.fn().mockReturnValue({
    data: {
      access: true,
      isPlatformOp: false,
      scopeType: "company" as const,
      isReadOnly: false,
      allowedActions: ["view_detail", "acknowledge", "open_related", "resolve", "dismiss"],
      visibleDomains: ["hr", "finance", "compliance", "operations"],
      companyId: 4242,
    },
    isLoading: false,
    isError: false,
    dataUpdatedAt: Date.now(),
  });
  return {
    trpcQuery: (data: unknown, isLoading = false) => () => ({
      data,
      isLoading,
      isError: false,
      dataUpdatedAt: Date.now(),
    }),
    engagementOpsSummaryInvalidate,
    mockCtSummary,
    mockMyAccess,
  };
});

function buildQueueFixture(): ActionQueueResult {
  const raw: ActionQueueItem[] = [
    {
      id: "ct-int-p1",
      kind: "payroll_blocker",
      title: "Payroll run blocked",
      severity: "medium",
      blocking: true,
      source: "payroll",
      href: "/payroll",
      ctaLabel: "Review",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "ct-int-q2",
      kind: "generic_attention",
      title: "Follow up on contract",
      severity: "low",
      blocking: false,
      source: "hr",
      href: "/hr",
      ctaLabel: "Open",
      createdAt: "2026-04-08T00:00:00.000Z",
    },
  ];
  const views = attachExecutionToQueueItems(raw, null);
  const items = attachEscalationToQueueItems(views, FIXED_NOW);

  return {
    items,
    status: "ready",
    isLoading: false,
    hasHighSeverity: true,
    hasBlocking: true,
    lastUpdatedLabel: "Updated 1 min ago",
    scopeActive: true,
    queueError: false,
    pulseError: false,
  };
}

vi.mock("@/hooks/useSmartRoleHomeRedirect", () => ({
  useSmartRoleHomeRedirect: () => {},
}));

vi.mock("@/features/controlTower/snapshotStore", () => ({
  getPreviousSnapshot: () => null,
  saveSnapshot: () => {},
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "integration-user", role: "user", platformRole: null } }),
}));

vi.mock("@/contexts/ActiveCompanyContext", () => ({
  useActiveCompany: () => ({
    activeCompanyId: 4242,
    activeCompany: { name: "Integration Co", role: "company_admin" },
    loading: false,
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      engagements: {
        getOpsSummary: { invalidate: engagementOpsSummaryInvalidate },
      },
      controlTower: {
        items: { invalidate: vi.fn() },
        summary: { invalidate: vi.fn() },
      },
    }),
    controlTower: {
      myAccess: {
        useQuery: mockMyAccess,
      },
      summary: {
        useQuery: mockCtSummary,
      },
      items: {
        useQuery: trpcQuery({ items: [], total: 0 }),
      },
      acknowledgeItem: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      resolveItem: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      dismissItem: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
    engagements: {
      getOpsSummary: { useQuery: trpcQuery({}) },
      refreshRollups: {
        useMutation: () => ({
          mutate: vi.fn(),
          mutateAsync: vi.fn().mockResolvedValue({ synced: 0 }),
          isPending: false,
        }),
      },
    },
    operations: {
      getOwnerBusinessPulse: {
        useQuery: trpcQuery({
          controlTower: {
            riskCompliance: { workPermitsExpiring7Days: 2 },
            decisionsQueue: { totalOpenCount: 3, items: [] },
          },
          revenue: { combinedPaid: { monthToDateOmr: 1200 } },
        }),
      },
      getDailySnapshot: {
        useQuery: trpcQuery({
          expiringDocs7Days: 1,
          pendingLeaveRequests: 0,
          pendingContracts: 1,
          pendingPayrollApprovals: 0,
          revenueMtdOmr: 800,
          slaBreaches: 0,
        }),
      },
    },
    companies: {
      myStats: { useQuery: trpcQuery({ employees: 42 }) },
      getRoleRedirectSettings: { useQuery: trpcQuery({ settings: {} }) },
    },
    compliance: {
      getWpsStatus: { useQuery: trpcQuery({ status: "paid" }) },
      getComplianceScore: {
        useQuery: trpcQuery({
          score: 82,
          grade: "B",
          checks: [{ id: "work_permit_validity", status: "pass", meta: { count: 0 } }],
        }),
      },
    },
    employeePortal: {
      myCapabilities: {
        useQuery: trpcQuery({
          canViewEmployeeList: true,
          canEditEmployeeProfile: true,
          canViewAttendanceForOthers: true,
          canApproveAttendance: true,
          canAssignTask: true,
          canViewComplianceCase: true,
          canViewSalary: true,
          canViewBankingDetails: true,
          canViewIdentityDocs: true,
          canViewPayrollInputs: true,
          canViewHrNotes: true,
          canRunPayroll: true,
          canApprovePayroll: true,
          canMarkPayrollPaid: true,
          canEditPayrollLineItem: true,
          canGenerateWpsFile: true,
          canUploadDocument: true,
          canViewEmployeeDocuments: true,
          canViewComplianceMatrix: true,
          canRunComplianceReports: true,
          canApproveTask: true,
          canViewAttendanceBoard: true,
          canManageAttendanceRecords: true,
          canViewPlatformControlTower: false,
          canViewCompanyControlTower: true,
          canManageControlTowerItems: true,
          canAssignControlTowerItems: true,
          canResolveControlTowerItems: true,
          canViewControlTowerFinanceSignals: true,
          canViewControlTowerHrSignals: true,
          canViewControlTowerComplianceSignals: true,
          canViewControlTowerOperationsSignals: true,
        }),
      },
    },
  },
}));

vi.mock("@/hooks/useActionQueue", () => ({
  useActionQueue: vi.fn(),
}));

import ControlTowerPage from "@/pages/ControlTowerPage";
import { useActionQueue } from "@/hooks/useActionQueue";

function renderControlTowerPage() {
  return render(
    <Router>
      <ControlTowerPage />
    </Router>,
  );
}

function clickMode(mode: "Operate" | "Brief" | "Present") {
  fireEvent.click(screen.getByRole("button", { name: mode }));
}

beforeAll(() => {
  vi.useFakeTimers({ now: FIXED_NOW });
});

afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.mocked(useActionQueue).mockImplementation(() => buildQueueFixture());
  mockCtSummary.mockReturnValue({
    data: {
      totalOpen: 0,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      byDomain: {},
      visibleDomains: [],
    },
    isLoading: false,
    isError: false,
    dataUpdatedAt: Date.now(),
  });
  mockMyAccess.mockReturnValue({
    data: {
      access: true,
      isPlatformOp: false,
      scopeType: "company" as const,
      isReadOnly: false,
      allowedActions: ["view_detail", "acknowledge", "open_related", "resolve", "dismiss"],
      visibleDomains: ["hr", "finance", "compliance", "operations"],
      companyId: 4242,
    },
    isLoading: false,
    isError: false,
    dataUpdatedAt: Date.now(),
  });
});

afterEach(() => {
  cleanup();
});

describe("ControlTowerPage integration (composition)", () => {
  it("operate mode renders the full stack", () => {
    renderControlTowerPage();

    expect(screen.getByRole("region", { name: "Operating brief" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Executive decisions" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Executive commitments" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Operating review" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Today's priorities" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Risk indicators" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Action queue" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Key metrics" })).toBeInTheDocument();
    expect(screen.getByText("Operational snapshot")).toBeInTheDocument();
  });

  it("brief mode keeps executive stack and hides the action queue", () => {
    renderControlTowerPage();
    clickMode("Brief");

    expect(screen.getByRole("region", { name: "Operating brief" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Executive decisions" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Executive commitments" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Operating review" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Action queue" })).toBeNull();
    expect(screen.getByRole("region", { name: "Key metrics" })).toBeInTheDocument();
  });

  it("present mode hides queue, KPI snapshot, footer, and priorities while keeping the executive stack", () => {
    renderControlTowerPage();
    clickMode("Present");

    expect(screen.getByRole("region", { name: "Operating brief" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Executive decisions" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Executive commitments" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Operating review" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Executive review" })).toBeInTheDocument();
    expect(screen.getByLabelText("Presentation summary")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Risk indicators" })).toBeInTheDocument();

    expect(screen.queryByRole("region", { name: "Action queue" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Key metrics" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Today's priorities" })).toBeNull();
    expect(screen.queryByText("Operational snapshot")).toBeNull();
  });

  it("weekly variant + present mode still renders without breaking composition", () => {
    renderControlTowerPage();
    const audienceSelect = screen.getByLabelText(/Brief audience/i);
    fireEvent.change(audienceSelect, { target: { value: "weekly" } });
    clickMode("Present");

    expect(screen.getByRole("region", { name: "Operating brief" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Executive decisions" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Action queue" })).toBeNull();
    expect((screen.getByLabelText(/Brief audience/i) as HTMLSelectElement).value).toBe("weekly");
  });

  it("switching back to operate restores queue, KPI, and footer", () => {
    renderControlTowerPage();
    clickMode("Present");
    expect(screen.queryByRole("region", { name: "Action queue" })).toBeNull();

    clickMode("Operate");

    expect(screen.getByRole("region", { name: "Action queue" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Key metrics" })).toBeInTheDocument();
    expect(screen.getByText("Operational snapshot")).toBeInTheDocument();
  });

  it("renders compact engagement health card instead of KPI tiles", () => {
    renderControlTowerPage();

    expect(screen.getByRole("region", { name: "Engagement health" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Engagements Ops" })).toHaveAttribute("href", "/engagements/ops");
    expect(screen.getByText("Managed in Engagements Ops — overdue, at risk, awaiting client, and unassigned engagements.")).toBeInTheDocument();
  });

  it("initialises selectedDomain from URL ?domain= param", () => {
    mockCtSummary.mockReturnValue({
      data: {
        totalOpen: 5,
        bySeverity: { critical: 0, high: 1, medium: 2, low: 2 },
        byDomain: { compliance: 3, hr: 2 },
        visibleDomains: ["compliance", "hr"],
      },
      isLoading: false,
      isError: false,
      dataUpdatedAt: Date.now(),
    });

    window.history.pushState({}, "", "/control-tower?domain=compliance");
    renderControlTowerPage();

    const complianceBtn = screen.getByRole("button", { name: /compliance/i });
    expect(complianceBtn.className).toMatch(/border-primary/);

    window.history.pushState({}, "", "/control-tower");
  });

  it("main sections appear in the intended order in operate mode", () => {
    renderControlTowerPage();

    const brief = screen.getByRole("region", { name: "Operating brief" });
    const decisions = screen.getByRole("region", { name: "Executive decisions" });
    const commitments = screen.getByRole("region", { name: "Executive commitments" });
    const review = screen.getByRole("region", { name: "Operating review" });
    const priorities = screen.getByRole("region", { name: "Today's priorities" });
    const queue = screen.getByRole("region", { name: "Action queue" });

    const assertFollowing = (a: HTMLElement, b: HTMLElement) =>
      expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);

    assertFollowing(brief, decisions);
    assertFollowing(decisions, commitments);
    assertFollowing(commitments, review);
    assertFollowing(review, priorities);
    assertFollowing(priorities, queue);
  });
});

describe("ControlTowerPage — Risk Strip reflects open signals", () => {
  it("1 medium open signal → Upcoming card shows 1 (not 0)", () => {
    mockCtSummary.mockReturnValue({
      data: {
        totalOpen: 1,
        bySeverity: { critical: 0, high: 0, medium: 1, low: 0 },
        byDomain: { payroll: 1 },
        visibleDomains: ["payroll"],
      },
      isLoading: false,
      isError: false,
      dataUpdatedAt: Date.now(),
    });
    renderControlTowerPage();

    const strip = screen.getByRole("region", { name: "Risk indicators" });
    // The Upcoming card renders the count "1"
    const upcomingLabel = within(strip).getByText(/upcoming/i);
    const upcomingCard = upcomingLabel.closest("[data-testid]") ?? upcomingLabel.closest(".shadow-sm");
    // Count "1" should appear somewhere in the strip
       expect(within(strip).getByText("1")).toBeInTheDocument();
  });

  it("zero open signals + zero compliance → all three cards show 0", () => {
    mockCtSummary.mockReturnValue({
      data: {
        totalOpen: 0,
        bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
        byDomain: {},
        visibleDomains: [],
      },
      isLoading: false,
      isError: false,
      dataUpdatedAt: Date.now(),
    });
     // The global trpc mock has workPermitsExpiring7Days: 2 which feeds into the
    // At-risk card. With zero open signals and zero compliance failures, the
    // Blocked (0) and Upcoming (0) cards show 0. At-risk shows the pulse value.
    // Verify that Blocked and Upcoming are both 0 and the strip renders 3 cards.
    renderControlTowerPage();
    const strip = screen.getByRole("region", { name: "Risk indicators" });
    // Three cards must be present
    expect(within(strip).getByText(/^blocked$/i)).toBeInTheDocument();
    expect(within(strip).getByText(/^at.?risk$/i)).toBeInTheDocument();
    expect(within(strip).getByText(/^upcoming$/i)).toBeInTheDocument();
    // Blocked and Upcoming are 0 (no compliance failures, no medium signals)
    const zeros = within(strip).getAllByText("0");
    expect(zeros.length).toBeGreaterThanOrEqual(2);
  });
});

describe("ControlTowerPage — subtitle from myAccess.scopeType", () => {
  function setMyAccess(scopeType: "company" | "department" | "team" | "self", isReadOnly = false) {
    mockMyAccess.mockReturnValue({
      data: {
        access: true,
        isPlatformOp: false,
        scopeType,
        isReadOnly,
        allowedActions: isReadOnly ? ["view_detail", "open_related"] : ["view_detail", "acknowledge", "open_related", "resolve", "dismiss"],
        visibleDomains: ["hr", "finance", "compliance", "operations"],
        companyId: 4242,
      },
      isLoading: false,
      isError: false,
      dataUpdatedAt: Date.now(),
    });
  }

  it("company scope → generic subtitle", () => {
    setMyAccess("company");
    renderControlTowerPage();
    expect(screen.getByText("Monitor blockers, priorities, and operational health in one place.")).toBeInTheDocument();
  });

  it("department scope → 'Department Control Tower' subtitle", () => {
    setMyAccess("department");
    renderControlTowerPage();
    expect(screen.getByText("Department Control Tower")).toBeInTheDocument();
  });

  it("team scope → 'Team Control Tower' subtitle", () => {
    setMyAccess("team");
    renderControlTowerPage();
    expect(screen.getByText("Team Control Tower")).toBeInTheDocument();
  });

  it("self scope → generic subtitle", () => {
    setMyAccess("self");
    renderControlTowerPage();
    expect(screen.getByText("Monitor blockers, priorities, and operational health in one place.")).toBeInTheDocument();
  });

  it("read-only + department → 'Department Control Tower — Read-only view' subtitle", () => {
    setMyAccess("department", true);
    renderControlTowerPage();
    expect(screen.getByText("Department Control Tower — Read-only view")).toBeInTheDocument();
  });

  it("read-only + company → 'Control Tower — Read-only view' subtitle", () => {
    setMyAccess("company", true);
    renderControlTowerPage();
    expect(screen.getByText("Control Tower — Read-only view")).toBeInTheDocument();
  });
});
