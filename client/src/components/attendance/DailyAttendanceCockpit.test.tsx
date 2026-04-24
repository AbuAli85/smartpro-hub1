// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { DailyAttendanceCockpit } from "./DailyAttendanceCockpit";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockGetDailyStates, mockListSites } = vi.hoisted(() => ({
  mockGetDailyStates: vi.fn(),
  mockListSites: vi.fn(),
}));

vi.stubGlobal("React", React);

vi.mock("@/lib/trpc", () => ({
  trpc: {
    attendance: {
      getDailyStates: { useQuery: (...args: unknown[]) => mockGetDailyStates(...args) },
      listSites: { useQuery: (...args: unknown[]) => mockListSites(...args) },
    },
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts) return `${key}(${JSON.stringify(opts)})`;
      return key;
    },
  }),
}));

vi.mock("@shared/attendanceMuscatTime", () => ({
  muscatCalendarYmdNow: () => "2026-04-24",
}));

vi.mock("@/lib/dateUtils", () => ({
  fmtTime: (s: string) => s.slice(11, 16),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<{
  employeeId: number;
  employeeName: string;
  canonicalStatus: string;
  payrollReadiness: string;
  riskLevel: string;
  scheduleState: string;
  siteId: number | null;
  shiftStartAt: string;
  shiftEndAt: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  actionItems: unknown[];
}> = {}) {
  return {
    employeeId: 1,
    employeeName: "Ahmed Al-Balushi",
    attendanceDate: "2026-04-24",
    companyId: 1,
    canonicalStatus: "checked_in_on_time",
    payrollReadiness: "ready",
    riskLevel: "none",
    scheduleState: "scheduled",
    siteId: 10,
    shiftStartAt: "09:00",
    shiftEndAt: "17:00",
    checkInAt: "2026-04-24T05:05:00.000Z",
    checkOutAt: null,
    hasOpenSession: true,
    hasOfficialRecord: false,
    hasPendingCorrection: false,
    hasPendingManualCheckin: false,
    isHoliday: false,
    isOnLeave: false,
    reasonCodes: [],
    actionItems: [],
    ...overrides,
  };
}

function makeActionItem(overrides: Partial<{
  category: string;
  riskLevel: string;
  isPayrollBlocking: boolean;
  employeeId: number;
  employeeName: string;
  ctaTarget: string;
}> = {}) {
  return {
    category: "missing_checkout",
    riskLevel: "high",
    isPayrollBlocking: true,
    employeeId: 1,
    employeeName: "Ahmed Al-Balushi",
    attendanceDate: "2026-04-24",
    ctaTarget: "live_today",
    ...overrides,
  };
}

const DEFAULT_SUMMARY = {
  total: 3,
  scheduled: 3,
  notScheduled: 0,
  conflicts: 0,
  ready: 2,
  blocked: 1,
  needsReview: 0,
  actionItems: 1,
  employeesAffected: 1,
};

const FULL_CAPS = {
  canViewAttendanceBoard: true,
  canApproveManualCheckIns: true,
  canApproveAttendanceCorrections: true,
  canForceCheckout: true,
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function setupMocks(rows: ReturnType<typeof makeRow>[] = [], summary = DEFAULT_SUMMARY) {
  mockGetDailyStates.mockReturnValue({
    data: { date: "2026-04-24", isHoliday: false, rows, summary },
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  });
  mockListSites.mockReturnValue({
    data: [{ id: 10, name: "Main Site", isActive: true }, { id: 11, name: "Branch", isActive: true }],
    isLoading: false,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DailyAttendanceCockpit", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    mockGetDailyStates.mockReset();
    mockListSites.mockReset();
  });

  // 1. Summary counts render correctly
  it("renders summary counts from getDailyStates data", () => {
    const rows = [
      makeRow({ employeeId: 1, canonicalStatus: "checked_in_on_time", payrollReadiness: "ready" }),
      makeRow({ employeeId: 2, canonicalStatus: "checked_in_late", payrollReadiness: "ready", riskLevel: "medium" }),
      makeRow({ employeeId: 3, canonicalStatus: "absent_confirmed", payrollReadiness: "blocked_missing_checkout", riskLevel: "critical" }),
    ];
    setupMocks(rows, { ...DEFAULT_SUMMARY, scheduled: 3, ready: 2, blocked: 1, needsReview: 0, total: 3, notScheduled: 0, conflicts: 0, actionItems: 0, employeesAffected: 0 });

    render(<DailyAttendanceCockpit companyId={1} caps={FULL_CAPS} />);

    // Scheduled = 3 (server summary)
    expect(screen.getByTestId("cockpit-count-scheduled")).toHaveTextContent("3");
    // Checked in = 2 (client-side: on_time + late)
    expect(screen.getByTestId("cockpit-count-checkedIn")).toHaveTextContent("2");
    // Late = 1 (client-side: checked_in_late only — no late_no_arrival)
    expect(screen.getByTestId("cockpit-count-late")).toHaveTextContent("1");
    // Payroll blocked = 1 (server summary)
    expect(screen.getByTestId("cockpit-count-payrollBlocked")).toHaveTextContent("1");
  });

  // 2. Needs-action-only filter
  it("needs-action-only toggle filters out employees with no action items", () => {
    const rows = [
      makeRow({ employeeId: 1, employeeName: "Ahmed Al-Balushi", actionItems: [] }),
      makeRow({ employeeId: 2, employeeName: "Sara Al-Harthi", actionItems: [makeActionItem({ employeeId: 2, employeeName: "Sara Al-Harthi" })] }),
    ];
    setupMocks(rows);

    render(<DailyAttendanceCockpit companyId={1} caps={FULL_CAPS} />);

    // Before toggle: both rows visible in the employee table
    const tableCard = screen.getByTestId("cockpit-table");
    const rowsBefore = Array.from(tableCard.querySelectorAll('[data-testid="cockpit-table-row"]'));
    expect(rowsBefore).toHaveLength(2);

    // Toggle on
    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);

    // After toggle: only Sara's row visible
    const rowsAfter = Array.from(tableCard.querySelectorAll('[data-testid="cockpit-table-row"]'));
    expect(rowsAfter).toHaveLength(1);
    expect(rowsAfter[0]).toHaveTextContent("Sara Al-Harthi");
  });

  // 3. Employee search filter
  it("employee search filters rows by name", () => {
    const rows = [
      makeRow({ employeeId: 1, employeeName: "Ahmed Al-Balushi" }),
      makeRow({ employeeId: 2, employeeName: "Sara Al-Harthi" }),
      makeRow({ employeeId: 3, employeeName: "Khalid Mahmood" }),
    ];
    setupMocks(rows);

    render(<DailyAttendanceCockpit companyId={1} caps={FULL_CAPS} />);

    const searchInputs = screen.getAllByPlaceholderText("attendance.cockpit.controls.searchPlaceholder");
    const searchInput = searchInputs[0];
    fireEvent.change(searchInput, { target: { value: "sara" } });

    const tableCard = screen.getByTestId("cockpit-table");
    const tableRows = Array.from(tableCard.querySelectorAll('[data-testid="cockpit-table-row"]'));
    expect(tableRows).toHaveLength(1);
    expect(tableRows[0]).toHaveTextContent("Sara Al-Harthi");
  });

  // 4. Site grouping — blocked count per site
  it("site breakdown groups employees and counts blockers per site", () => {
    const rows = [
      makeRow({ employeeId: 1, siteId: 10, payrollReadiness: "blocked_missing_checkout" }),
      makeRow({ employeeId: 2, siteId: 10, payrollReadiness: "ready" }),
      makeRow({ employeeId: 3, siteId: 11, payrollReadiness: "blocked_pending_correction" }),
    ];
    setupMocks(rows);

    render(<DailyAttendanceCockpit companyId={1} caps={FULL_CAPS} />);

    const breakdown = screen.getByTestId("cockpit-site-breakdown");
    // Main Site: 2 scheduled, 1 blocked
    expect(breakdown).toHaveTextContent("Main Site");
    expect(breakdown).toHaveTextContent("Branch");
  });

  // 5. No data / empty state
  it("shows empty state when no rows are returned", () => {
    mockGetDailyStates.mockReturnValue({
      data: { date: "2026-04-24", isHoliday: false, rows: [], summary: { total: 0, scheduled: 0, notScheduled: 0, conflicts: 0, ready: 0, blocked: 0, needsReview: 0, actionItems: 0, employeesAffected: 0 } },
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    mockListSites.mockReturnValue({ data: [], isLoading: false });

    render(<DailyAttendanceCockpit companyId={1} caps={FULL_CAPS} />);

    expect(screen.getByTestId("cockpit-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("cockpit-table")).not.toBeInTheDocument();
  });

  // 6. Capability-disabled CTA shows read-only hint
  it("shows no-permission hint when user lacks the required capability for a CTA", () => {
    const item = makeActionItem({ category: "missing_checkout", ctaTarget: "live_today" });
    const rows = [makeRow({ employeeId: 1, actionItems: [item] })];
    setupMocks(rows);

    // Caps WITHOUT canForceCheckout
    const limitedCaps = { canViewAttendanceBoard: true, canForceCheckout: false };
    render(<DailyAttendanceCockpit companyId={1} caps={limitedCaps} />);

    // Action list should be visible
    expect(screen.getByTestId("cockpit-action-list")).toBeInTheDocument();
    // CTA button should not appear; no-permission hint should
    expect(screen.queryByTestId("cockpit-action-cta")).not.toBeInTheDocument();
    expect(screen.getByTestId("cockpit-no-permission")).toBeInTheDocument();
  });
});
