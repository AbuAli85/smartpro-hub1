// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ClientApprovalsPage from "./ClientApprovalsPage";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockListBatches,
  mockListSites,
  mockGetBatch,
  mockCaps,
  mockSubmitMutate,
  mockApproveMutate,
  mockRejectMutate,
  mockGenerateTokenMutate,
  mockInvalidate,
  mockToastSuccess,
  mockToastError,
  mockWriteText,
} = vi.hoisted(() => ({
  mockListBatches: vi.fn(),
  mockListSites: vi.fn(),
  mockGetBatch: vi.fn(),
  mockCaps: vi.fn(),
  mockSubmitMutate: vi.fn(),
  mockApproveMutate: vi.fn(),
  mockRejectMutate: vi.fn(),
  mockGenerateTokenMutate: vi.fn(),
  mockInvalidate: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
  mockWriteText: vi.fn(),
}));

vi.stubGlobal("React", React);

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      attendance: {
        listClientApprovalBatches: { invalidate: mockInvalidate },
        getClientApprovalBatch: { invalidate: mockInvalidate },
      },
    }),
    attendance: {
      listClientApprovalBatches: {
        useQuery: (...args: unknown[]) => mockListBatches(...args),
      },
      listSites: {
        useQuery: (...args: unknown[]) => mockListSites(...args),
      },
      getClientApprovalBatch: {
        useQuery: (...args: unknown[]) => mockGetBatch(...args),
      },
      submitClientApprovalBatch: {
        useMutation: (opts: { onSuccess?: () => void; onError?: () => void }) => ({
          mutate: (vars: unknown) => {
            mockSubmitMutate(vars);
            opts?.onSuccess?.();
          },
          mutateAsync: async (vars: unknown) => { mockSubmitMutate(vars); },
          isPending: false,
          variables: undefined,
        }),
      },
      approveClientApprovalBatch: {
        useMutation: (opts: { onSuccess?: () => void; onError?: () => void }) => ({
          mutate: (vars: unknown) => {
            mockApproveMutate(vars);
            opts?.onSuccess?.();
          },
          isPending: false,
        }),
      },
      rejectClientApprovalBatch: {
        useMutation: (opts: { onSuccess?: () => void; onError?: () => void }) => ({
          mutate: (vars: unknown) => {
            mockRejectMutate(vars);
            opts?.onSuccess?.();
          },
          isPending: false,
        }),
      },
      generateClientApprovalToken: {
        useMutation: (opts: { onError?: () => void }) => ({
          mutateAsync: async (vars: unknown) => mockGenerateTokenMutate(vars),
          isPending: false,
          _opts: opts,
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

vi.mock("@/hooks/useMyCapabilities", () => ({
  useMyCapabilities: () => ({ caps: mockCaps(), loading: false }),
}));

vi.mock("@/contexts/ActiveCompanyContext", () => ({
  useActiveCompany: () => ({ activeCompanyId: 1, loading: false }),
}));

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href, "data-testid": "link" }, children),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, className }: { children: React.ReactNode; className?: string }) =>
    React.createElement("span", { className, "data-testid": "badge" }, children),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    open,
    children,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    children: React.ReactNode;
  }) => (open ? React.createElement("div", { "data-testid": "dialog" }, children) : null),
  DialogContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  DialogHeader: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  DialogTitle: ({ children }: { children: React.ReactNode }) =>
    React.createElement("h2", null, children),
  DialogDescription: ({ children }: { children: React.ReactNode }) =>
    React.createElement("p", null, children),
  DialogFooter: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
}));

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({
    open,
    children,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    children: React.ReactNode;
  }) => (open ? React.createElement("div", { "data-testid": "detail-sheet" }, children) : null),
  SheetContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  SheetHeader: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  SheetTitle: ({ children }: { children: React.ReactNode }) =>
    React.createElement("h2", null, children),
}));

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
      { value, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onValueChange(e.target.value) },
      children,
    ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) =>
    React.createElement("option", { value }, children),
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) =>
    React.createElement("div", { className }, children),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) =>
    React.createElement("div", { className }, children),
  CardHeader: ({ children, className }: { children: React.ReactNode; className?: string }) =>
    React.createElement("div", { className }, children),
  CardTitle: ({ children, className }: { children: React.ReactNode; className?: string }) =>
    React.createElement("h3", { className }, children),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    className,
    "data-testid": dtid,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
    "data-testid"?: string;
  }) =>
    React.createElement(
      "button",
      { onClick, disabled, className, "data-testid": dtid },
      children,
    ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
    React.createElement("input", props),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeBatch(overrides: Partial<{
  id: number;
  status: string;
  periodStart: string;
  periodEnd: string;
  siteId: number | null;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  clientComment: string | null;
  itemCounts: { total: number; pending: number; approved: number; rejected: number; disputed: number };
}> = {}) {
  return {
    id: 1,
    status: "draft",
    periodStart: "2026-04-01",
    periodEnd: "2026-04-30",
    siteId: null,
    submittedAt: null,
    approvedAt: null,
    rejectedAt: null,
    rejectionReason: null,
    clientComment: null,
    createdAt: new Date("2026-04-01"),
    updatedAt: new Date("2026-04-01"),
    itemCounts: { total: 5, pending: 5, approved: 0, rejected: 0, disputed: 0 },
    companyId: 1,
    clientCompanyId: null,
    promoterAssignmentId: null,
    submittedByUserId: null,
    approvedByUserId: null,
    rejectedByUserId: null,
    ...overrides,
  };
}

function makeItem(overrides: Partial<{
  id: number;
  employeeId: number;
  attendanceDate: string;
  status: string;
  clientComment: string | null;
  employeeDisplayName: string;
  checkInAt: Date | null;
  checkOutAt: Date | null;
}> = {}) {
  return {
    id: 1,
    batchId: 1,
    employeeId: 10,
    attendanceDate: "2026-04-01",
    attendanceSessionId: null,
    status: "pending",
    clientComment: null,
    employeeDisplayName: "Ahmed Al-Balushi",
    checkInAt: null,
    checkOutAt: null,
    ...overrides,
  };
}

const defaultCaps = {
  canViewAttendanceClientApproval: true,
  canCreateAttendanceClientApproval: true,
  canSubmitAttendanceClientApproval: true,
  canApproveAttendanceClientApproval: true,
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockCaps.mockReturnValue(defaultCaps);
  mockListSites.mockReturnValue({ data: [{ id: 10, name: "Al-Khuwair Site", isActive: true }] });
  mockListBatches.mockReturnValue({ data: [], isLoading: false });
  mockGetBatch.mockReturnValue({ data: undefined, isLoading: false });
  mockInvalidate.mockResolvedValue(undefined);
  mockToastSuccess.mockReset();
  mockToastError.mockReset();

  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: mockWriteText },
    writable: true,
    configurable: true,
  });
  mockWriteText.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ClientApprovalsPage", () => {
  // 1. Renders batch list
  it("renders batch list with batch rows", () => {
    mockListBatches.mockReturnValue({
      data: [
        makeBatch({ id: 7, status: "submitted", submittedAt: "2026-04-10T10:00:00Z" }),
        makeBatch({ id: 8, status: "draft" }),
      ],
      isLoading: false,
    });
    render(<ClientApprovalsPage />);
    expect(screen.getByTestId("batch-list-table")).toBeInTheDocument();
    expect(screen.getByText(/attendance\.clientApproval\.batchId\({"id":7}\)/)).toBeInTheDocument();
    expect(screen.getByText(/attendance\.clientApproval\.batchId\({"id":8}\)/)).toBeInTheDocument();
  });

  // 2. Status filter passes correct value to query
  it("status filter updates query input", () => {
    render(<ClientApprovalsPage />);
    const selects = screen.getAllByRole("combobox");
    const statusSelect = selects[0]!;
    fireEvent.change(statusSelect, { target: { value: "submitted" } });
    // The second call to listBatches should have status: "submitted"
    const lastCall = mockListBatches.mock.calls[mockListBatches.mock.calls.length - 1];
    expect(lastCall?.[0]?.status).toBe("submitted");
  });

  // 3. Empty state links to Client Attendance Sheet
  it("empty state shows CTA linking to /hr/reports/client-attendance", () => {
    mockListBatches.mockReturnValue({ data: [], isLoading: false });
    render(<ClientApprovalsPage />);
    const cta = screen.getByTestId("empty-state-cta");
    expect(cta).toBeInTheDocument();
    const link = cta.closest("a");
    expect(link).toHaveAttribute("href", "/hr/reports/client-attendance");
  });

  // 4. Detail panel opens and shows item rows
  it("clicking a batch row opens detail panel with items table", async () => {
    mockListBatches.mockReturnValue({
      data: [makeBatch({ id: 5, status: "approved", approvedAt: "2026-04-20T12:00:00Z" })],
      isLoading: false,
    });
    mockGetBatch.mockReturnValue({
      data: {
        batch: makeBatch({ id: 5, status: "approved", approvedAt: "2026-04-20T12:00:00Z" }),
        items: [
          makeItem({ id: 1, employeeDisplayName: "Ahmed Al-Balushi", attendanceDate: "2026-04-01" }),
          makeItem({ id: 2, employeeDisplayName: "Sara Al-Rashdi", attendanceDate: "2026-04-02" }),
        ],
      },
      isLoading: false,
    });

    render(<ClientApprovalsPage />);
    const rows = screen.getAllByText(/attendance\.clientApproval\.batchId/);
    fireEvent.click(rows[0]!);

    await waitFor(() => {
      expect(screen.getByTestId("detail-sheet")).toBeInTheDocument();
    });
    expect(screen.getByTestId("items-table")).toBeInTheDocument();
    expect(screen.getByText("Ahmed Al-Balushi")).toBeInTheDocument();
    expect(screen.getByText("Sara Al-Rashdi")).toBeInTheDocument();
  });

  // 5. Submit button hidden without canSubmitAttendanceClientApproval
  it("submit button is absent when user lacks submit capability", () => {
    mockCaps.mockReturnValue({
      ...defaultCaps,
      canSubmitAttendanceClientApproval: false,
    });
    mockListBatches.mockReturnValue({
      data: [makeBatch({ id: 3, status: "draft" })],
      isLoading: false,
    });
    render(<ClientApprovalsPage />);
    expect(
      screen.queryByText("attendance.clientApprovalsPage.actions.submit"),
    ).not.toBeInTheDocument();
  });

  // 6. Copy link button appears for submitted batch
  it("copy link button appears for submitted batch", async () => {
    mockListBatches.mockReturnValue({
      data: [makeBatch({ id: 9, status: "submitted", submittedAt: "2026-04-15T08:00:00Z" })],
      isLoading: false,
    });
    mockGetBatch.mockReturnValue({
      data: {
        batch: makeBatch({ id: 9, status: "submitted", submittedAt: "2026-04-15T08:00:00Z" }),
        items: [],
      },
      isLoading: false,
    });
    mockGenerateTokenMutate.mockResolvedValue({
      token: "test-jwt",
      expiresInDays: 14,
      approvalUrl: "/attendance-approval/test-jwt",
    });

    render(<ClientApprovalsPage />);
    fireEvent.click(screen.getByText(/attendance\.clientApproval\.batchId\({"id":9}\)/));

    await waitFor(() => {
      expect(screen.getByTestId("copy-link-btn")).toBeInTheDocument();
    });
  });

  // 6b. "Copy Reminder Text" button appears for submitted batch
  it("copy reminder text button appears for submitted batch in detail panel", async () => {
    mockListBatches.mockReturnValue({
      data: [makeBatch({ id: 15, status: "submitted", submittedAt: "2026-04-15T08:00:00Z" })],
      isLoading: false,
    });
    mockGetBatch.mockReturnValue({
      data: {
        batch: makeBatch({ id: 15, status: "submitted", submittedAt: "2026-04-15T08:00:00Z" }),
        items: [],
      },
      isLoading: false,
    });
    mockGenerateTokenMutate.mockResolvedValue({
      token: "test-jwt",
      expiresInDays: 14,
      approvalUrl: "/attendance-approval/test-jwt",
    });

    render(<ClientApprovalsPage />);
    fireEvent.click(screen.getByText(/attendance\.clientApproval\.batchId\({"id":15}\)/));

    await waitFor(() => {
      expect(screen.getByTestId("copy-reminder-btn")).toBeInTheDocument();
    });

    // Clicking it should call generateToken and write to clipboard
    fireEvent.click(screen.getByTestId("copy-reminder-btn"));
    await waitFor(() => {
      expect(mockGenerateTokenMutate).toHaveBeenCalledWith({ batchId: 15 });
    });
    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalled();
    });
    const copiedText: string = mockWriteText.mock.calls[0]?.[0] ?? "";
    // The mock t() returns the i18n key, so batchId key contains "15" and period key contains the date
    expect(copiedText).toContain("15");
    expect(copiedText).toContain("2026-04-01");
    // The approval URL should always be present verbatim
    expect(copiedText).toContain("/attendance-approval/test-jwt");
  });

  // 7. Rejected batch shows rejection reason
  it("rejected batch detail shows rejection reason", async () => {
    mockListBatches.mockReturnValue({
      data: [makeBatch({ id: 11, status: "rejected" })],
      isLoading: false,
    });
    mockGetBatch.mockReturnValue({
      data: {
        batch: makeBatch({
          id: 11,
          status: "rejected",
          rejectedAt: "2026-04-22T09:00:00Z",
          rejectionReason: "Hours do not match contract.",
          clientComment: "Please resubmit with corrected times.",
        }),
        items: [],
      },
      isLoading: false,
    });

    render(<ClientApprovalsPage />);
    fireEvent.click(screen.getByText(/attendance\.clientApproval\.batchId\({"id":11}\)/));

    await waitFor(() => {
      expect(screen.getByTestId("rejection-reason")).toBeInTheDocument();
    });
    expect(screen.getByTestId("rejection-reason").textContent).toBe(
      "Hours do not match contract.",
    );
  });

  // 8. Approved batch shows approved timestamp
  it("approved batch detail shows approved timestamp label", async () => {
    mockListBatches.mockReturnValue({
      data: [makeBatch({ id: 13, status: "approved" })],
      isLoading: false,
    });
    mockGetBatch.mockReturnValue({
      data: {
        batch: makeBatch({
          id: 13,
          status: "approved",
          approvedAt: "2026-04-21T11:30:00Z",
        }),
        items: [],
      },
      isLoading: false,
    });

    render(<ClientApprovalsPage />);
    fireEvent.click(screen.getByText(/attendance\.clientApproval\.batchId\({"id":13}\)/));

    await waitFor(() => {
      expect(screen.getByTestId("detail-sheet")).toBeInTheDocument();
    });
    expect(
      screen.getByText("attendance.clientApprovalsPage.detail.approvedAt"),
    ).toBeInTheDocument();
  });
});
