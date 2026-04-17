// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OmanizationStatusCell } from "./OmanizationStatusCell";

const { mockMutation, toastSuccess, toastError } = vi.hoisted(() => ({
  mockMutation: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    companies: {
      captureOmanizationSnapshot: {
        useMutation: (...args: unknown[]) => mockMutation(...args),
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

describe("OmanizationStatusCell", () => {
  beforeEach(() => {
    mockMutation.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it("renders compliance badge, rate, counts, and snapshot date", () => {
    mockMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
    render(
      <OmanizationStatusCell
        companyId={7}
        latestSnapshot={{
          createdAt: "2026-04-10T00:00:00.000Z",
          snapshotMonth: 4,
          snapshotYear: 2026,
          omaniRatio: "33.33",
          omaniEmployees: 10,
          totalEmployees: 30,
          complianceStatus: "warning",
        }}
        onRefreshed={vi.fn()}
      />,
    );

    expect(screen.getByText("Warning")).toBeInTheDocument();
    expect(screen.getByText("33.33% · 10/30")).toBeInTheDocument();
    expect(screen.getByText(/Snapshot:/)).toBeInTheDocument();
  });

  it("renders no-snapshot state", () => {
    mockMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
    render(<OmanizationStatusCell companyId={5} latestSnapshot={null} onRefreshed={vi.fn()} />);

    expect(screen.getByText("No snapshot")).toBeInTheDocument();
    expect(screen.getByText("No Omanization snapshot recorded yet.")).toBeInTheDocument();
  });

  it("shows stale badge for old snapshots", () => {
    mockMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
    render(
      <OmanizationStatusCell
        companyId={1}
        latestSnapshot={{
          createdAt: "2025-01-01T00:00:00.000Z",
          snapshotMonth: 1,
          snapshotYear: 2025,
          omaniRatio: "18.20",
          omaniEmployees: 4,
          totalEmployees: 22,
          complianceStatus: "non_compliant",
        }}
        onRefreshed={vi.fn()}
      />,
    );

    expect(screen.getByText("Stale")).toBeInTheDocument();
  });

  it("supports refresh success flow", () => {
    const onRefreshed = vi.fn();
    let mutationOptions: { onSuccess?: () => void; onError?: (e: { message?: string }) => void } = {};
    const mutate = vi.fn(() => mutationOptions.onSuccess?.());
    mockMutation.mockImplementation((opts: typeof mutationOptions) => {
      mutationOptions = opts;
      return { mutate, isPending: false };
    });

    render(<OmanizationStatusCell companyId={9} latestSnapshot={null} onRefreshed={onRefreshed} />);
    fireEvent.click(screen.getByRole("button", { name: /refresh omanization snapshot for company 9/i }));

    expect(mutate).toHaveBeenCalledWith({ companyId: 9 });
    expect(toastSuccess).toHaveBeenCalled();
    expect(onRefreshed).toHaveBeenCalled();
  });

  it("supports refresh error flow and loading state", () => {
    let mutationOptions: { onSuccess?: () => void; onError?: (e: { message?: string }) => void } = {};
    const mutate = vi.fn(() => mutationOptions.onError?.({ message: "boom" }));
    mockMutation.mockImplementation((opts: typeof mutationOptions) => {
      mutationOptions = opts;
      return { mutate, isPending: true };
    });

    render(<OmanizationStatusCell companyId={10} latestSnapshot={null} onRefreshed={vi.fn()} />);
    const btn = screen.getByRole("button", { name: /refresh omanization snapshot for company 10/i });
    expect(btn).toBeDisabled();
    expect(btn.textContent).toContain("Refresh");
    fireEvent.click(btn);
    expect(mutate).not.toHaveBeenCalled();

    // Re-render as enabled to test onError callback path.
    mockMutation.mockImplementation((opts: typeof mutationOptions) => {
      mutationOptions = opts;
      return { mutate, isPending: false };
    });
    render(<OmanizationStatusCell companyId={10} latestSnapshot={null} onRefreshed={vi.fn()} />);
    fireEvent.click(screen.getAllByRole("button", { name: /refresh omanization snapshot for company 10/i })[1]!);
    expect(toastError).toHaveBeenCalled();
  });

  it("renders updated snapshot values after parent refresh", () => {
    mockMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
    const { rerender } = render(<OmanizationStatusCell companyId={4} latestSnapshot={null} onRefreshed={vi.fn()} />);
    const initialCell = screen.getByTestId("omanization-cell-4");
    expect(within(initialCell).getByText("No snapshot")).toBeInTheDocument();

    rerender(
      <OmanizationStatusCell
        companyId={4}
        latestSnapshot={{
          createdAt: "2026-04-17T00:00:00.000Z",
          snapshotMonth: 4,
          snapshotYear: 2026,
          omaniRatio: "42.50",
          omaniEmployees: 17,
          totalEmployees: 40,
          complianceStatus: "compliant",
        }}
        onRefreshed={vi.fn()}
      />,
    );

    const updatedCell = screen.getByTestId("omanization-cell-4");
    expect(within(updatedCell).getByText("Compliant")).toBeInTheDocument();
    expect(within(updatedCell).getByText("42.50% · 17/40")).toBeInTheDocument();
  });
});
