// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks (must be set up before importing the component under test)
// ---------------------------------------------------------------------------

const { mockGetPayrollGateReadiness, FakeTRPCClientError } = vi.hoisted(() => {
  class FakeTRPCClientError extends Error {
    data?: { code?: string };
    constructor(message: string, init: { data?: { code?: string } } = {}) {
      super(message);
      this.name = "TRPCClientError";
      this.data = init.data;
    }
  }
  return {
    mockGetPayrollGateReadiness: vi.fn(),
    FakeTRPCClientError,
  };
});

vi.stubGlobal("React", React);

vi.mock("@trpc/client", () => ({
  TRPCClientError: FakeTRPCClientError,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    attendance: {
      getPayrollGateReadiness: {
        useQuery: (...args: unknown[]) => mockGetPayrollGateReadiness(...args),
      },
    },
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && typeof opts.count === "number") {
        return `${key}(${opts.count})`;
      }
      return key;
    },
  }),
}));

vi.mock("wouter", () => ({
  Link: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

// Imported after the mocks so the component picks up the mocked modules.
// eslint-disable-next-line import/first
import { AttendanceReadinessPanel } from "./AttendanceReadinessPanel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readyGateData() {
  return {
    status: "ready" as const,
    isReady: true,
    reasonCodes: [],
    periodState: "locked" as const,
    reconciliationStatus: "ready" as const,
    clientApproval: {
      required: true,
      approvedBatches: 1,
      pendingBatches: 0,
      rejectedBatches: 0,
      missingBatches: 0,
    },
    blockers: [],
  };
}

function blockedGateData() {
  return {
    status: "blocked_period_not_locked" as const,
    isReady: false,
    reasonCodes: ["PERIOD_NOT_LOCKED", "CLIENT_APPROVAL_PENDING"],
    periodState: "open" as const,
    reconciliationStatus: "needs_review" as const,
    clientApproval: {
      required: true,
      approvedBatches: 0,
      pendingBatches: 2,
      rejectedBatches: 0,
      missingBatches: 0,
    },
    blockers: [
      {
        code: "PERIOD_NOT_LOCKED",
        messageKey: "attendance.payrollGate.blockers.periodNotLocked",
      },
      {
        code: "CLIENT_APPROVAL_PENDING",
        messageKey: "attendance.payrollGate.blockers.clientApprovalPending",
        count: 2,
      },
    ],
  };
}

afterEach(() => {
  cleanup();
  mockGetPayrollGateReadiness.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AttendanceReadinessPanel", () => {
  it("renders nothing when companyId is null (gate not meaningful yet)", () => {
    mockGetPayrollGateReadiness.mockReturnValue({
      isLoading: false,
      isError: false,
      data: undefined,
      error: undefined,
    });
    const { container } = render(
      <AttendanceReadinessPanel companyId={null} year={2026} month={4} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the ready state with no blockers and no warning", () => {
    mockGetPayrollGateReadiness.mockReturnValue({
      isLoading: false,
      isError: false,
      data: readyGateData(),
      error: undefined,
    });
    render(
      <AttendanceReadinessPanel companyId={1} year={2026} month={4} />,
    );

    expect(screen.getByTestId("attendance-readiness-panel")).toBeInTheDocument();
    // Status hint key for ready
    expect(
      screen.getByText("attendance.payrollGate.statusHint.ready"),
    ).toBeInTheDocument();
    // No warning banner when there are no blockers
    expect(
      screen.queryByTestId("attendance-readiness-warning"),
    ).not.toBeInTheDocument();
    // Approval counts are visible when required
    const panel = screen.getByTestId("attendance-readiness-panel");
    expect(panel).toHaveTextContent(
      "attendance.payrollGate.clientApproval.approved",
    );
    expect(panel).toHaveTextContent("1");
  });

  it("renders the blocked state with the warning message and blocker action links", () => {
    mockGetPayrollGateReadiness.mockReturnValue({
      isLoading: false,
      isError: false,
      data: blockedGateData(),
      error: undefined,
    });
    render(
      <AttendanceReadinessPanel companyId={1} year={2026} month={4} />,
    );

    // Warning banner is shown ("Payroll can still be run, but attendance is not fully ready.")
    expect(
      screen.getByTestId("attendance-readiness-warning"),
    ).toHaveTextContent("attendance.payrollGate.panel.warning");

    // Both blocker rows render with their i18n message keys
    expect(
      screen.getByText("attendance.payrollGate.blockers.periodNotLocked"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("attendance.payrollGate.blockers.clientApprovalPending(2)"),
    ).toBeInTheDocument();

    // Action links wired to the correct routes
    const lockLink = screen
      .getAllByText("attendance.payrollGate.actions.lockPeriod")
      .find((el) => el.tagName === "A") as HTMLAnchorElement;
    expect(lockLink).toBeDefined();
    expect(lockLink.getAttribute("href")).toBe("/hr/attendance-reconciliation");

    const clientApprovalsLinks = screen
      .getAllByText("attendance.payrollGate.actions.viewClientApprovals")
      .filter((el) => el.tagName === "A") as HTMLAnchorElement[];
    expect(clientApprovalsLinks.length).toBeGreaterThan(0);
    expect(clientApprovalsLinks[0].getAttribute("href")).toBe(
      "/hr/client-approvals",
    );

    // Footer link to the client attendance sheet is present
    const sheetLink = screen
      .getAllByText("attendance.payrollGate.actions.viewAttendanceSheet")
      .find((el) => el.tagName === "A") as HTMLAnchorElement;
    expect(sheetLink).toBeDefined();
    expect(sheetLink.getAttribute("href")).toBe(
      "/hr/reports/client-attendance",
    );
  });

  it("renders the neutral no-permission message when the query errors with FORBIDDEN", () => {
    const forbidden = new FakeTRPCClientError("Forbidden", {
      data: { code: "FORBIDDEN" },
    });

    mockGetPayrollGateReadiness.mockReturnValue({
      isLoading: false,
      isError: true,
      data: undefined,
      error: forbidden,
    });

    render(
      <AttendanceReadinessPanel companyId={1} year={2026} month={4} />,
    );

    expect(
      screen.getByTestId("attendance-readiness-no-permission"),
    ).toHaveTextContent("attendance.payrollGate.panel.noPermission");
    // No warning banner in the no-permission state
    expect(
      screen.queryByTestId("attendance-readiness-warning"),
    ).not.toBeInTheDocument();
  });

  it("never renders any disabled button or interactive element that could block payroll execution", () => {
    // Even in the worst-case blocked state the panel is read-only.
    mockGetPayrollGateReadiness.mockReturnValue({
      isLoading: false,
      isError: false,
      data: blockedGateData(),
      error: undefined,
    });
    render(
      <AttendanceReadinessPanel companyId={1} year={2026} month={4} />,
    );
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("propagates non-permission errors as their raw message (not the neutral fallback)", () => {
    const generic = new Error("Boom");
    mockGetPayrollGateReadiness.mockReturnValue({
      isLoading: false,
      isError: true,
      data: undefined,
      error: generic,
    });

    render(
      <AttendanceReadinessPanel companyId={1} year={2026} month={4} />,
    );

    expect(screen.getByText("Boom")).toBeInTheDocument();
    expect(
      screen.queryByTestId("attendance-readiness-no-permission"),
    ).not.toBeInTheDocument();
  });
});
