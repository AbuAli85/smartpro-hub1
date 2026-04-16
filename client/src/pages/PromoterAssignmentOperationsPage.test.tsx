// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PromoterAssignmentOperationsPage from "./PromoterAssignmentOperationsPage";

vi.mock("@/contexts/ActiveCompanyContext", () => ({
  useActiveCompany: () => ({
    activeCompanyId: 10,
    activeCompany: { id: 10, name: "Acme", role: "company_admin" },
    companies: [],
    loading: false,
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      promoterAssignments: {
        list: { invalidate: vi.fn() },
        summary: { invalidate: vi.fn() },
      },
    }),
    promoterAssignments: {
      summary: {
        useQuery: () => ({
          data: {
            total: 3,
            byStatus: { draft: 1, active: 1, suspended: 0, completed: 1, terminated: 0 },
            operationalTodayTotal: 1,
            scheduledFutureTotal: 0,
            needsAttentionApproxCount: 0,
            activeHeadcountByBrand: [{ firstPartyCompanyId: 1, brandName: "Brand A", count: 1 }],
            activeHeadcountBySite: [{ clientSiteId: 5, siteName: "Mall", count: 1 }],
            coverageByBrand: [
              {
                brandId: 1,
                brandName: "Brand A",
                requiredHeadcount: 5,
                operationalActiveCount: 1,
                gap: 4,
                overstaffed: 0,
              },
            ],
          },
          isLoading: false,
        }),
      },
      list: {
        useQuery: () => ({
          data: [
            {
              id: "550e8400-e29b-41d4-a716-446655440000",
              assignmentStatus: "active",
              firstPartyName: "Brand A",
              secondPartyName: "Employer",
              siteName: "Mall",
              promoterName: "Test User",
              billingModel: "per_month",
              billingRate: "100.0000",
              currencyCode: "OMR",
              startDate: "2026-01-01",
              endDate: "2026-12-31",
              supervisorLabel: null,
              temporalState: "operational",
              healthFlags: ["missing_supervisor"],
            },
          ],
          isLoading: false,
        }),
      },
      transitionAssignmentStatus: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

describe("PromoterAssignmentOperationsPage", () => {
  it("renders KPI strip, coverage, and table heading", () => {
    render(<PromoterAssignmentOperationsPage />);
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("Assignments")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Staffing coverage by brand")).toBeInTheDocument();
    expect(screen.getByText("No supervisor")).toBeInTheDocument();
  });
});
