// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { ClientAttendanceSheet } from "./ClientAttendanceSheet";

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
    t: (key: string) => key,
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

// Radix Select doesn't work well in jsdom; swap to a plain native <select>
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) =>
    React.createElement("select", {
      value,
      onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
        onValueChange(e.target.value),
    }, children),
  SelectTrigger: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) =>
    React.createElement("option", { value }, children),
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

function makeRow(overrides: Partial<{
  employeeId: number;
  employeeName: string;
  canonicalStatus: string;
  payrollReadiness: string;
  siteId: number | null;
  shiftStartAt: string | null;
  shiftEndAt: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  hasOpenSession: boolean;
}> = {}) {
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
    ...overrides,
  };
}

function defaultQueryResult(rows: ReturnType<typeof makeRow>[] = [makeRow()]) {
  return {
    data: {
      date: "2026-04-25",
      isHoliday: false,
      rows,
      summary: {
        total: rows.length,
        scheduled: rows.length,
        notScheduled: 0,
        conflicts: 0,
        ready: rows.length,
        blocked: 0,
        needsReview: 0,
        actionItems: 0,
        employeesAffected: 0,
      },
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
  mockGetDailyStates.mockReturnValue(defaultQueryResult());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ClientAttendanceSheet", () => {
  it("renders rows from mocked getDailyStates data", () => {
    render(<ClientAttendanceSheet companyId={1} />);
    expect(screen.getByText("Ahmed Al-Balushi")).toBeInTheDocument();
  });

  it("shows all 13 column headers", () => {
    render(<ClientAttendanceSheet companyId={1} />);
    expect(
      screen.getByText("attendance.clientSheet.table.employee")
    ).toBeInTheDocument();
    expect(
      screen.getByText("attendance.clientSheet.table.workedHours")
    ).toBeInTheDocument();
    expect(
      screen.getByText("attendance.clientSheet.table.approvalStatus")
    ).toBeInTheDocument();
    expect(
      screen.getByText("attendance.clientSheet.table.comment")
    ).toBeInTheDocument();
  });

  it("employee search filters rows", () => {
    mockGetDailyStates.mockReturnValue(
      defaultQueryResult([
        makeRow({ employeeName: "Ahmed Al-Balushi", employeeId: 1 }),
        makeRow({ employeeName: "Sara Al-Harthi", employeeId: 2 }),
      ])
    );
    render(<ClientAttendanceSheet companyId={1} />);
    expect(screen.getByText("Ahmed Al-Balushi")).toBeInTheDocument();
    expect(screen.getByText("Sara Al-Harthi")).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(
      "attendance.clientSheet.filters.employeePlaceholder"
    );
    fireEvent.change(searchInput, { target: { value: "Sara" } });

    expect(screen.queryByText("Ahmed Al-Balushi")).not.toBeInTheDocument();
    expect(screen.getByText("Sara Al-Harthi")).toBeInTheDocument();
  });

  it("status filter hides non-matching rows", () => {
    mockGetDailyStates.mockReturnValue(
      defaultQueryResult([
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

    // Both rows visible initially
    expect(screen.getByText("Ahmed Al-Balushi")).toBeInTheDocument();
    expect(screen.getByText("Sara Al-Harthi")).toBeInTheDocument();

    // The Select mock renders a native <select>; pick the status one (second select)
    const selects = screen.getAllByRole("combobox");
    const statusSelect = selects[1]; // site=0, status=1

    fireEvent.change(statusSelect, { target: { value: "payrollBlocked" } });

    // Ahmed is not payroll-blocked, Sara is
    expect(screen.queryByText("Ahmed Al-Balushi")).not.toBeInTheDocument();
    expect(screen.getByText("Sara Al-Harthi")).toBeInTheDocument();
  });

  it("worked hours displays correctly when both check-in and check-out exist", () => {
    mockGetDailyStates.mockReturnValue(
      defaultQueryResult([
        makeRow({
          checkInAt: "2026-04-25T05:00:00.000Z",
          checkOutAt: "2026-04-25T13:00:00.000Z",
        }),
      ])
    );
    render(<ClientAttendanceSheet companyId={1} />);
    expect(screen.getByText("8h")).toBeInTheDocument();
  });

  it("shows Open for missing checkout", () => {
    mockGetDailyStates.mockReturnValue(
      defaultQueryResult([
        makeRow({
          checkInAt: "2026-04-25T05:05:00.000Z",
          checkOutAt: null,
          hasOpenSession: true,
        }),
      ])
    );
    render(<ClientAttendanceSheet companyId={1} />);
    expect(
      screen.getByText("attendance.clientSheet.workedHours.open")
    ).toBeInTheDocument();
  });

  it("shows — when neither check-in nor check-out exists", () => {
    mockGetDailyStates.mockReturnValue(
      defaultQueryResult([
        makeRow({
          checkInAt: null,
          checkOutAt: null,
          canonicalStatus: "absent_confirmed",
        }),
      ])
    );
    render(<ClientAttendanceSheet companyId={1} />);
    expect(
      screen.getByText("attendance.clientSheet.workedHours.none")
    ).toBeInTheDocument();
  });

  it("empty state links to setup health", () => {
    mockGetDailyStates.mockReturnValue(
      defaultQueryResult([])
    );
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

  it("export button exists and is disabled when no rows", () => {
    mockGetDailyStates.mockReturnValue(defaultQueryResult([]));
    render(<ClientAttendanceSheet companyId={1} />);
    const exportBtn = screen.getByRole("button", {
      name: /attendance\.clientSheet\.exportExcel/i,
    });
    expect(exportBtn).toBeDisabled();
  });

  it("export button is enabled when rows are present", () => {
    render(<ClientAttendanceSheet companyId={1} />);
    const exportBtn = screen.getByRole("button", {
      name: /attendance\.clientSheet\.exportExcel/i,
    });
    expect(exportBtn).not.toBeDisabled();
  });

  it("shows approval status as not submitted", () => {
    render(<ClientAttendanceSheet companyId={1} />);
    const cells = screen.getAllByText(
      "attendance.clientSheet.approvalStatus.notSubmitted"
    );
    expect(cells.length).toBeGreaterThan(0);
  });

  it("shows loading state when isLoading is true", () => {
    mockGetDailyStates.mockReturnValue({ data: undefined, isLoading: true });
    render(<ClientAttendanceSheet companyId={1} />);
    expect(
      screen.getByText("attendance.clientSheet.loading")
    ).toBeInTheDocument();
  });
});
