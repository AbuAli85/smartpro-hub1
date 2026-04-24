// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { ClientAttendanceSheet } from "./ClientAttendanceSheet";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockGetDailyStatesForRange, mockListSites } = vi.hoisted(() => ({
  mockGetDailyStatesForRange: vi.fn(),
  mockListSites: vi.fn(),
}));

vi.stubGlobal("React", React);

vi.mock("@/lib/trpc", () => ({
  trpc: {
    attendance: {
      getDailyStatesForRange: {
        useQuery: (...args: unknown[]) => mockGetDailyStatesForRange(...args),
      },
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
  muscatCalendarYmdNow: () => "2026-04-25",
}));

vi.mock("@/lib/dateUtils", () => ({
  fmtTime: (s: string | undefined) => (s ? s.slice(11, 16) : "—"),
}));

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href }, children),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Radix Select → native <select> for easy testing
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) =>
    React.createElement(
      "select",
      {
        value,
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
          onValueChange(e.target.value),
      },
      children
    ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  SelectItem: ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => React.createElement("option", { value }, children),
}));

vi.mock("exceljs", () => ({
  default: class Workbook {
    addWorksheet() {
      return {
        columns: [],
        addRow: vi.fn().mockReturnValue({ font: {} }),
      };
    }
    xlsx = { writeBuffer: async () => new ArrayBuffer(0) };
  },
  Workbook: class Workbook {
    addWorksheet() {
      return {
        columns: [],
        addRow: vi.fn().mockReturnValue({ font: {} }),
      };
    }
    xlsx = { writeBuffer: async () => new ArrayBuffer(0) };
  },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRow(
  overrides: Partial<{
    employeeId: number;
    employeeName: string;
    attendanceDate: string;
    canonicalStatus: string;
    payrollReadiness: string;
    siteId: number | null;
    shiftStartAt: string | null;
    shiftEndAt: string | null;
    checkInAt: string | null;
    checkOutAt: string | null;
    hasOpenSession: boolean;
    clientApprovalStatus: string;
    clientApprovalComment: string | null;
    clientApprovalBatchId: number | null;
  }> = {}
) {
  return {
    employeeId: 1,
    employeeName: "Ahmed Al-Balushi",
    attendanceDate: "2026-04-25",
    companyId: 1,
    canonicalStatus: "checked_in_on_time",
    payrollReadiness: "ready",
    riskLevel: "none",
    scheduleState: "scheduled",
    siteId: 10,
    shiftStartAt: "09:00",
    shiftEndAt: "17:00",
    checkInAt: "2026-04-25T05:05:00.000Z",
    checkOutAt: "2026-04-25T13:05:00.000Z",
    hasOpenSession: false,
    hasOfficialRecord: true,
    hasPendingCorrection: false,
    hasPendingManualCheckin: false,
    isHoliday: false,
    isOnLeave: false,
    reasonCodes: [],
    actionItems: [],
    clientApprovalStatus: "not_submitted",
    clientApprovalComment: null,
    clientApprovalBatchId: null,
    ...overrides,
  };
}

function defaultRangeResult(rows: ReturnType<typeof makeRow>[] = [makeRow()]) {
  return {
    data: {
      startDate: "2026-04-25",
      endDate: "2026-04-25",
      rows,
    },
    isLoading: false,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockListSites.mockReturnValue({
    data: [{ id: 10, name: "Al-Khuwair Site", isActive: true }],
  });
  mockGetDailyStatesForRange.mockReturnValue(defaultRangeResult());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ClientAttendanceSheet", () => {
  // 1. Default date range
  it("defaults to today for both start and end date", () => {
    render(<ClientAttendanceSheet companyId={1} />);
    const [startInput, endInput] = screen.getAllByDisplayValue("2026-04-25");
    expect(startInput).toBeInTheDocument();
    expect(endInput).toBeInTheDocument();
  });

  // 2. Quick filter Today
  it("quick filter Today sets start and end to today", () => {
    render(<ClientAttendanceSheet companyId={1} />);
    const todayBtn = screen.getByRole("button", {
      name: /attendance\.clientSheet\.quickFilters\.today/i,
    });
    fireEvent.click(todayBtn);
    const dateInputs = screen.getAllByDisplayValue("2026-04-25");
    expect(dateInputs).toHaveLength(2);
  });

  // 3. Quick filter This month
  it("quick filter This Month sets first and last day of month", () => {
    render(<ClientAttendanceSheet companyId={1} />);
    const monthBtn = screen.getByRole("button", {
      name: /attendance\.clientSheet\.quickFilters\.thisMonth/i,
    });
    fireEvent.click(monthBtn);
    const startInput = screen.getByDisplayValue("2026-04-01");
    const endInput = screen.getByDisplayValue("2026-04-30");
    expect(startInput).toBeInTheDocument();
    expect(endInput).toBeInTheDocument();
  });

  // 4. Range > 31 days shows error and disables query
  it("shows range error when range exceeds 31 days", () => {
    render(<ClientAttendanceSheet companyId={1} />);
    const [startInput] = screen.getAllByDisplayValue("2026-04-25");
    // Set start to 2026-01-01, end stays 2026-04-25 → >31 days
    fireEvent.change(startInput, { target: { value: "2026-01-01" } });
    // t() mock returns key(opts) when opts present
    expect(
      screen.getByText(/attendance\.clientSheet\.rangeTooLarge/)
    ).toBeInTheDocument();
  });

  // 5. Renders rows from multiple dates
  it("renders rows across multiple dates", () => {
    mockGetDailyStatesForRange.mockReturnValue(
      defaultRangeResult([
        makeRow({ attendanceDate: "2026-04-24", employeeName: "Ahmed Al-Balushi", employeeId: 1 }),
        makeRow({ attendanceDate: "2026-04-25", employeeName: "Ahmed Al-Balushi", employeeId: 1 }),
        makeRow({ attendanceDate: "2026-04-25", employeeName: "Sara Al-Harthi", employeeId: 2 }),
      ])
    );
    render(<ClientAttendanceSheet companyId={1} />);
    expect(screen.getAllByText("Ahmed Al-Balushi")).toHaveLength(2);
    expect(screen.getByText("Sara Al-Harthi")).toBeInTheDocument();
    expect(screen.getByText("2026-04-24")).toBeInTheDocument();
  });

  // 6. Approval status pending renders correctly
  it("renders pending approval status badge", () => {
    mockGetDailyStatesForRange.mockReturnValue(
      defaultRangeResult([
        makeRow({ clientApprovalStatus: "pending" }),
      ])
    );
    render(<ClientAttendanceSheet companyId={1} />);
    expect(
      screen.getByText("attendance.clientSheet.approvalStatus.pending")
    ).toBeInTheDocument();
  });

  // 7. Approval status approved renders correctly
  it("renders approved approval status badge", () => {
    mockGetDailyStatesForRange.mockReturnValue(
      defaultRangeResult([
        makeRow({ clientApprovalStatus: "approved" }),
      ])
    );
    render(<ClientAttendanceSheet companyId={1} />);
    expect(
      screen.getByText("attendance.clientSheet.approvalStatus.approved")
    ).toBeInTheDocument();
  });

  // 8. Client approval comment renders
  it("renders client approval comment", () => {
    mockGetDailyStatesForRange.mockReturnValue(
      defaultRangeResult([
        makeRow({
          clientApprovalStatus: "rejected",
          clientApprovalComment: "Hours mismatch, please review",
        }),
      ])
    );
    render(<ClientAttendanceSheet companyId={1} />);
    expect(
      screen.getByText("Hours mismatch, please review")
    ).toBeInTheDocument();
  });

  // 9. Export button exists and includes date range in its behavior
  it("export button is present and enabled when rows exist", () => {
    render(<ClientAttendanceSheet companyId={1} />);
    const exportBtn = screen.getByRole("button", {
      name: /attendance\.clientSheet\.exportExcel/i,
    });
    expect(exportBtn).not.toBeDisabled();
  });

  // 10. Status filter still works across range
  it("status filter hides non-matching rows across range", () => {
    mockGetDailyStatesForRange.mockReturnValue(
      defaultRangeResult([
        makeRow({
          employeeName: "Ahmed Al-Balushi",
          employeeId: 1,
          canonicalStatus: "checked_in_on_time",
          payrollReadiness: "ready",
        }),
        makeRow({
          employeeName: "Sara Al-Harthi",
          employeeId: 2,
          canonicalStatus: "absent_confirmed",
          payrollReadiness: "blocked_missing_checkout",
        }),
      ])
    );
    render(<ClientAttendanceSheet companyId={1} />);
    expect(screen.getByText("Ahmed Al-Balushi")).toBeInTheDocument();
    expect(screen.getByText("Sara Al-Harthi")).toBeInTheDocument();

    // site=0, status=1
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[1], { target: { value: "payrollBlocked" } });

    expect(screen.queryByText("Ahmed Al-Balushi")).not.toBeInTheDocument();
    expect(screen.getByText("Sara Al-Harthi")).toBeInTheDocument();
  });

  // 11. Employee search still works across range
  it("employee search filters rows", () => {
    mockGetDailyStatesForRange.mockReturnValue(
      defaultRangeResult([
        makeRow({ employeeName: "Ahmed Al-Balushi", employeeId: 1 }),
        makeRow({ employeeName: "Sara Al-Harthi", employeeId: 2 }),
      ])
    );
    render(<ClientAttendanceSheet companyId={1} />);
    const searchInput = screen.getByPlaceholderText(
      "attendance.clientSheet.filters.employeePlaceholder"
    );
    fireEvent.change(searchInput, { target: { value: "Sara" } });
    expect(screen.queryByText("Ahmed Al-Balushi")).not.toBeInTheDocument();
    expect(screen.getByText("Sara Al-Harthi")).toBeInTheDocument();
  });

  // 12. Empty state links to setup health
  it("empty state links to setup health", () => {
    mockGetDailyStatesForRange.mockReturnValue(defaultRangeResult([]));
    render(<ClientAttendanceSheet companyId={1} />);
    expect(
      screen.getByText("attendance.clientSheet.emptyState")
    ).toBeInTheDocument();
    const link = screen.getByText("attendance.clientSheet.emptyStateLink");
    expect(link.closest("a")).toHaveAttribute(
      "href",
      "/hr/attendance/setup-health"
    );
  });

  // 13. Worked hours calculation
  it("worked hours displays correctly", () => {
    mockGetDailyStatesForRange.mockReturnValue(
      defaultRangeResult([
        makeRow({
          checkInAt: "2026-04-25T05:00:00.000Z",
          checkOutAt: "2026-04-25T13:00:00.000Z",
        }),
      ])
    );
    render(<ClientAttendanceSheet companyId={1} />);
    expect(screen.getByText("8h")).toBeInTheDocument();
  });

  // 14. Missing checkout shows Open
  it("shows Open for missing checkout", () => {
    mockGetDailyStatesForRange.mockReturnValue(
      defaultRangeResult([
        makeRow({ checkInAt: "2026-04-25T05:05:00.000Z", checkOutAt: null }),
      ])
    );
    render(<ClientAttendanceSheet companyId={1} />);
    expect(
      screen.getByText("attendance.clientSheet.workedHours.open")
    ).toBeInTheDocument();
  });

  // 15. Loading state
  it("shows loading state when isLoading is true", () => {
    mockGetDailyStatesForRange.mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    render(<ClientAttendanceSheet companyId={1} />);
    expect(
      screen.getByText("attendance.clientSheet.loadingRange")
    ).toBeInTheDocument();
  });

  // 16. Summary cards include approval counts
  it("summary cards show approval counts", () => {
    mockGetDailyStatesForRange.mockReturnValue(
      defaultRangeResult([
        makeRow({ clientApprovalStatus: "approved", employeeId: 1 }),
        makeRow({
          clientApprovalStatus: "rejected",
          employeeId: 2,
          attendanceDate: "2026-04-25",
        }),
        makeRow({
          clientApprovalStatus: "not_submitted",
          employeeId: 3,
          attendanceDate: "2026-04-25",
        }),
      ])
    );
    render(<ClientAttendanceSheet companyId={1} />);
    expect(
      screen.getByText("attendance.clientSheet.summaryCards.approved")
    ).toBeInTheDocument();
    expect(
      screen.getByText("attendance.clientSheet.summaryCards.rejected")
    ).toBeInTheDocument();
    expect(
      screen.getByText("attendance.clientSheet.summaryCards.notSubmitted")
    ).toBeInTheDocument();
  });

  // 17. Quick filter This week sets Mon-Sun range
  it("quick filter This Week sets monday to sunday range", () => {
    // 2026-04-25 is a Saturday (dow=6), so Mon=2026-04-20, Sun=2026-04-26
    render(<ClientAttendanceSheet companyId={1} />);
    const weekBtn = screen.getByRole("button", {
      name: /attendance\.clientSheet\.quickFilters\.thisWeek/i,
    });
    fireEvent.click(weekBtn);
    const startInput = screen.getByDisplayValue("2026-04-20");
    const endInput = screen.getByDisplayValue("2026-04-26");
    expect(startInput).toBeInTheDocument();
    expect(endInput).toBeInTheDocument();
  });
});
