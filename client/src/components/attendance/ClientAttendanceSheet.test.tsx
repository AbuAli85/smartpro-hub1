// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { ClientAttendanceSheet } from "./ClientAttendanceSheet";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockGetDailyStatesForRange,
  mockListSites,
  mockCaps,
  mockCreateBatchMutateAsync,
  mockSubmitBatchMutateAsync,
  mockInvalidate,
  mockToastSuccess,
  mockToastError,
} = vi.hoisted(() => ({
  mockGetDailyStatesForRange: vi.fn(),
  mockListSites: vi.fn(),
  mockCaps: vi.fn(),
  mockCreateBatchMutateAsync: vi.fn(),
  mockSubmitBatchMutateAsync: vi.fn(),
  mockInvalidate: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.stubGlobal("React", React);

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      attendance: {
        getDailyStatesForRange: { invalidate: mockInvalidate },
      },
    }),
    attendance: {
      getDailyStatesForRange: {
        useQuery: (...args: unknown[]) => mockGetDailyStatesForRange(...args),
      },
      listSites: { useQuery: (...args: unknown[]) => mockListSites(...args) },
      createClientApprovalBatch: {
        useMutation: () => ({
          mutateAsync: mockCreateBatchMutateAsync,
          isPending: false,
        }),
      },
      submitClientApprovalBatch: {
        useMutation: () => ({
          mutateAsync: mockSubmitBatchMutateAsync,
          isPending: false,
        }),
      },
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

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

vi.mock("@/hooks/useMyCapabilities", () => ({
  useMyCapabilities: () => ({ caps: mockCaps(), loading: false }),
}));

// Radix Dialog → simple DOM passthrough when open; also export useDialogComposition
// used by Input component internally.
vi.mock("@/components/ui/dialog", () => ({
  useDialogComposition: () => ({
    isComposing: () => false,
    setComposing: () => {},
    justEndedComposing: () => false,
    markCompositionEnd: () => {},
  }),
  Dialog: ({
    open,
    children,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    children: React.ReactNode;
  }) =>
    open
      ? React.createElement(
          "div",
          { "data-testid": "batch-dialog" },
          children
        )
      : null,
  DialogContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  DialogHeader: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  DialogTitle: ({ children }: { children: React.ReactNode }) =>
    React.createElement("h2", null, children),
  DialogFooter: ({ children, className }: { children: React.ReactNode; className?: string }) =>
    React.createElement("div", { className }, children),
  DialogDescription: ({ children }: { children: React.ReactNode }) =>
    React.createElement("p", null, children),
}));

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

const defaultCaps = {
  canCreateAttendanceClientApproval: true,
  canSubmitAttendanceClientApproval: true,
  canApproveAttendanceClientApproval: false,
  canViewAttendanceClientApproval: true,
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockListSites.mockReturnValue({
    data: [{ id: 10, name: "Al-Khuwair Site", isActive: true }],
  });
  mockGetDailyStatesForRange.mockReturnValue(defaultRangeResult());
  mockCaps.mockReturnValue(defaultCaps);
  mockCreateBatchMutateAsync.mockResolvedValue({ batchId: 42, itemCount: 1 });
  mockSubmitBatchMutateAsync.mockResolvedValue({ batchId: 42, status: "submitted" });
  mockInvalidate.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ClientAttendanceSheet", () => {
  // ── Existing tests (unchanged) ─────────────────────────────────────────────

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

  // 9. Export button exists and is enabled when rows exist
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

  // ── UX-3C: Create Approval Batch ───────────────────────────────────────────

  // 18. Create button is disabled when there are no rows
  it("create batch button is disabled when no filtered rows", () => {
    mockGetDailyStatesForRange.mockReturnValue(defaultRangeResult([]));
    render(<ClientAttendanceSheet companyId={1} />);
    // Empty state — no rows, so button should be disabled
    const btn = screen.queryByTestId("create-batch-btn");
    // Button rendered because canCreate=true; disabled because filteredRows.length===0
    expect(btn).toBeDisabled();
  });

  // 19. Create button is absent when user lacks canCreateAttendanceClientApproval
  it("create batch button is not rendered without capability", () => {
    mockCaps.mockReturnValue({
      ...defaultCaps,
      canCreateAttendanceClientApproval: false,
    });
    render(<ClientAttendanceSheet companyId={1} />);
    expect(screen.queryByTestId("create-batch-btn")).not.toBeInTheDocument();
  });

  // 20. Create button is enabled when rows exist and cap is present
  it("create batch button is enabled when rows exist and cap is present", () => {
    render(<ClientAttendanceSheet companyId={1} />);
    const btn = screen.getByTestId("create-batch-btn");
    expect(btn).not.toBeDisabled();
  });

  // 21. Clicking opens dialog with row count info
  it("dialog opens with summary info when create batch button clicked", () => {
    mockGetDailyStatesForRange.mockReturnValue(
      defaultRangeResult([
        makeRow({ employeeId: 1, clientApprovalStatus: "not_submitted" }),
        makeRow({ employeeId: 2, clientApprovalStatus: "not_submitted", attendanceDate: "2026-04-25" }),
      ])
    );
    render(<ClientAttendanceSheet companyId={1} />);
    fireEvent.click(screen.getByTestId("create-batch-btn"));

    expect(screen.getByTestId("batch-dialog")).toBeInTheDocument();
    expect(
      screen.getByText("attendance.clientSheet.batch.dialogTitle")
    ).toBeInTheDocument();
    // total rows label
    expect(
      screen.getByText("attendance.clientSheet.batch.totalRows")
    ).toBeInTheDocument();
    // employees label
    expect(
      screen.getByText("attendance.clientSheet.batch.employees")
    ).toBeInTheDocument();
  });

  // 22. Payroll-blocked warning shown when filtered rows include blocked entries
  it("payroll-blocked warning appears in dialog when blocked rows exist", () => {
    mockGetDailyStatesForRange.mockReturnValue(
      defaultRangeResult([
        makeRow({ payrollReadiness: "blocked_missing_checkout" }),
      ])
    );
    render(<ClientAttendanceSheet companyId={1} />);
    fireEvent.click(screen.getByTestId("create-batch-btn"));

    expect(screen.getByTestId("payroll-blocked-warning")).toBeInTheDocument();
    expect(
      screen.getByText("attendance.clientSheet.batch.payrollBlockedWarning")
    ).toBeInTheDocument();
  });

  // 23. Payroll-blocked warning not shown when no blocked rows
  it("payroll-blocked warning is absent when no blocked rows", () => {
    render(<ClientAttendanceSheet companyId={1} />);
    fireEvent.click(screen.getByTestId("create-batch-btn"));

    expect(
      screen.queryByTestId("payroll-blocked-warning")
    ).not.toBeInTheDocument();
  });

  // 24. Create Draft button calls createClientApprovalBatch with correct params
  it("Create Draft calls createClientApprovalBatch with startDate/endDate", async () => {
    render(<ClientAttendanceSheet companyId={1} />);
    fireEvent.click(screen.getByTestId("create-batch-btn"));
    fireEvent.click(screen.getByTestId("create-draft-btn"));

    await waitFor(() => {
      expect(mockCreateBatchMutateAsync).toHaveBeenCalledWith({
        periodStart: "2026-04-25",
        periodEnd: "2026-04-25",
        siteId: undefined, // "all" → no siteId
      });
    });
    expect(mockSubmitBatchMutateAsync).not.toHaveBeenCalled();
  });

  // 25. Create and Submit calls create then submit
  it("Create & Submit calls create then submitClientApprovalBatch", async () => {
    render(<ClientAttendanceSheet companyId={1} />);
    fireEvent.click(screen.getByTestId("create-batch-btn"));
    fireEvent.click(screen.getByTestId("create-and-submit-btn"));

    await waitFor(() => {
      expect(mockCreateBatchMutateAsync).toHaveBeenCalledWith({
        periodStart: "2026-04-25",
        periodEnd: "2026-04-25",
        siteId: undefined,
      });
    });
    await waitFor(() => {
      expect(mockSubmitBatchMutateAsync).toHaveBeenCalledWith({ batchId: 42 });
    });
  });

  // 26. Success toast appears after draft creation
  it("shows createdToast after successful draft creation", async () => {
    render(<ClientAttendanceSheet companyId={1} />);
    fireEvent.click(screen.getByTestId("create-batch-btn"));
    fireEvent.click(screen.getByTestId("create-draft-btn"));

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith(
        "attendance.clientSheet.batch.createdToast",
        expect.objectContaining({
          action: expect.objectContaining({
            label: "attendance.clientSheet.batch.goToApprovals",
          }),
        })
      );
    });
  });

  // 27. Success toast for submit shows submittedToast
  it("shows submittedToast after Create & Submit", async () => {
    render(<ClientAttendanceSheet companyId={1} />);
    fireEvent.click(screen.getByTestId("create-batch-btn"));
    fireEvent.click(screen.getByTestId("create-and-submit-btn"));

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith(
        "attendance.clientSheet.batch.submittedToast",
        expect.objectContaining({
          action: expect.objectContaining({
            label: "attendance.clientSheet.batch.goToApprovals",
          }),
        })
      );
    });
  });

  // 28. getDailyStatesForRange is invalidated after batch creation
  it("sheet data is refetched (invalidated) after batch created", async () => {
    render(<ClientAttendanceSheet companyId={1} />);
    fireEvent.click(screen.getByTestId("create-batch-btn"));
    fireEvent.click(screen.getByTestId("create-draft-btn"));

    await waitFor(() => {
      expect(mockInvalidate).toHaveBeenCalled();
    });
  });

  // 29. Create & Submit not shown when canSubmit=false
  it("Create & Submit button is absent when user lacks canSubmitAttendanceClientApproval", () => {
    mockCaps.mockReturnValue({
      ...defaultCaps,
      canSubmitAttendanceClientApproval: false,
    });
    render(<ClientAttendanceSheet companyId={1} />);
    fireEvent.click(screen.getByTestId("create-batch-btn"));

    expect(screen.queryByTestId("create-and-submit-btn")).not.toBeInTheDocument();
    expect(screen.getByTestId("create-draft-btn")).toBeInTheDocument();
  });

  // 30. Error toast shown when createMutation fails
  it("shows error toast when batch creation fails", async () => {
    mockCreateBatchMutateAsync.mockRejectedValue(new Error("Duplicate batch"));
    render(<ClientAttendanceSheet companyId={1} />);
    fireEvent.click(screen.getByTestId("create-batch-btn"));
    fireEvent.click(screen.getByTestId("create-draft-btn"));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Duplicate batch");
    });
  });

  // 31. Create button disabled when range is invalid (>31 days)
  it("create batch button is disabled when date range is invalid", () => {
    render(<ClientAttendanceSheet companyId={1} />);
    // Set start to 2026-01-01 → range > 31 days
    const [startInput] = screen.getAllByDisplayValue("2026-04-25");
    fireEvent.change(startInput, { target: { value: "2026-01-01" } });

    // Button not disabled because rows=0 in invalid state, but rangeInvalid also disables it
    const btn = screen.queryByTestId("create-batch-btn");
    expect(btn).toBeDisabled();
  });

  // 32. Export still works after the batch feature is added
  it("export button is still present and functional alongside batch button", () => {
    render(<ClientAttendanceSheet companyId={1} />);
    const exportBtn = screen.getByRole("button", {
      name: /attendance\.clientSheet\.exportExcel/i,
    });
    expect(exportBtn).toBeInTheDocument();
    expect(exportBtn).not.toBeDisabled();
    // Both buttons co-exist
    expect(screen.getByTestId("create-batch-btn")).toBeInTheDocument();
  });
});
