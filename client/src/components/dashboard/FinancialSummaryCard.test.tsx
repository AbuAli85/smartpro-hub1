// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinancialSummaryCard } from "./FinancialSummaryCard";

const { mockSummaryUseQuery, mockTrendUseQuery } = vi.hoisted(() => ({
  mockSummaryUseQuery: vi.fn(),
  mockTrendUseQuery: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    financeHR: {
      getPnlSummary: { useQuery: (...args: unknown[]) => mockSummaryUseQuery(...args) },
      getPnlTrend: { useQuery: (...args: unknown[]) => mockTrendUseQuery(...args) },
    },
  },
}));

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

function makeQueryResult<T>(
  overrides: Partial<{ data: T; isLoading: boolean; error: Error | null; refetch: () => void }> = {},
) {
  return {
    data: null as T | null,
    isLoading: false,
    error: null as Error | null,
    refetch: vi.fn(),
    ...overrides,
  };
}

describe("FinancialSummaryCard", () => {
  beforeEach(() => {
    mockSummaryUseQuery.mockReset();
    mockTrendUseQuery.mockReset();
    mockSummaryUseQuery.mockReturnValue(makeQueryResult());
    mockTrendUseQuery.mockReturnValue(makeQueryResult({ data: [] }));
  });

  it("renders loading state", () => {
    mockSummaryUseQuery.mockReturnValue(makeQueryResult({ isLoading: true }));
    render(<FinancialSummaryCard companyId={1} canOpenFinanceOverview />);
    expect(screen.getByTestId("financial-summary-loading")).toBeInTheDocument();
  });

  it("renders empty state when no financial records exist", () => {
    mockSummaryUseQuery.mockReturnValue(
      makeQueryResult({
        data: {
          hasAnyData: false,
        },
      }),
    );
    render(<FinancialSummaryCard companyId={1} canOpenFinanceOverview />);
    expect(screen.getByTestId("financial-summary-empty")).toBeInTheDocument();
    expect(screen.getByText("No financial records yet")).toBeInTheDocument();
  });

  it("renders summary metrics and trend sparkline", () => {
    mockSummaryUseQuery.mockReturnValue(
      makeQueryResult({
        data: {
          revenueOmr: 2000,
          employeeCostOmr: 1200,
          platformOverheadOmr: 150,
          netMarginOmr: 650,
          netMarginPercent: 32.5,
          periodLabel: "Apr 2026",
          dataQualityStatus: "complete",
          dataQualityMessages: [],
          hasAnyData: true,
        },
      }),
    );
    mockTrendUseQuery.mockReturnValue(
      makeQueryResult({
        data: [
          { periodYm: "2025-11", periodLabel: "Nov", netMarginOmr: 120 },
          { periodYm: "2025-12", periodLabel: "Dec", netMarginOmr: 140 },
          { periodYm: "2026-01", periodLabel: "Jan", netMarginOmr: 220 },
          { periodYm: "2026-02", periodLabel: "Feb", netMarginOmr: 240 },
          { periodYm: "2026-03", periodLabel: "Mar", netMarginOmr: 280 },
          { periodYm: "2026-04", periodLabel: "Apr", netMarginOmr: 310 },
        ],
      }),
    );

    render(<FinancialSummaryCard companyId={1} canOpenFinanceOverview />);
    expect(screen.getByTestId("financial-summary-card")).toBeInTheDocument();
    expect(screen.getAllByText("Financial Summary").length).toBeGreaterThan(0);
    expect(screen.getByText("Apr 2026")).toBeInTheDocument();
    expect(screen.getByText("OMR 2,000.000")).toBeInTheDocument();
    expect(screen.getByText("32.50%")).toBeInTheDocument();
    expect(screen.getByTestId("financial-trend-sparkline")).toBeInTheDocument();
  });

  it("renders partial data quality with warnings", () => {
    mockSummaryUseQuery.mockReturnValue(
      makeQueryResult({
        data: {
          revenueOmr: 900,
          employeeCostOmr: 0,
          platformOverheadOmr: 0,
          netMarginOmr: 900,
          netMarginPercent: 100,
          periodLabel: "Apr 2026",
          dataQualityStatus: "partial",
          dataQualityMessages: [
            "Employee cost entries are missing for this period.",
            "No overhead allocation is included in this period.",
          ],
          hasAnyData: true,
        },
      }),
    );

    render(<FinancialSummaryCard companyId={1} canOpenFinanceOverview={false} />);
    expect(screen.getByText("Partial data")).toBeInTheDocument();
    expect(screen.getByText(/Employee cost entries are missing/)).toBeInTheDocument();
    expect(screen.getByText(/No overhead allocation is included/)).toBeInTheDocument();
  });

  it("renders error state and retries both queries", () => {
    const summaryRefetch = vi.fn();
    const trendRefetch = vi.fn();
    mockSummaryUseQuery.mockReturnValue(
      makeQueryResult({
        error: new Error("boom"),
        refetch: summaryRefetch,
      }),
    );
    mockTrendUseQuery.mockReturnValue(
      makeQueryResult({
        refetch: trendRefetch,
      }),
    );

    render(<FinancialSummaryCard companyId={1} canOpenFinanceOverview />);
    expect(screen.getByTestId("financial-summary-error")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(summaryRefetch).toHaveBeenCalledTimes(1);
    expect(trendRefetch).toHaveBeenCalledTimes(1);
  });
});
