// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PromoterAssignmentStagingPage from "./PromoterAssignmentStagingPage";

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
    promoterAssignmentOps: {
      executionSummary: {
        useQuery: () => ({
          data: {
            operationalAssignmentsToday: 2,
            attendanceResolvedToday: 1,
            attendanceUnresolvedToday: 0,
          },
          isLoading: false,
        }),
      },
      payrollStaging: {
        useQuery: () => ({
          data: {
            rows: [
              {
                assignmentId: "x",
                employeeName: "Jane",
                brandName: "Brand",
                assignmentStatus: "active",
                overlapDays: 5,
                attendanceDaysInPeriod: 3,
                readiness: "blocked",
                blockers: ["payroll_basis_not_configured"],
              },
            ],
            summary: { totalRows: 1, ready: 0, blocked: 1, topBlockers: [], totalBillableAmount: 0 },
          },
          isLoading: false,
        }),
      },
      billingStaging: {
        useQuery: () => ({
          data: {
            rows: [],
            summary: { totalRows: 0, ready: 0, blocked: 0, topBlockers: [], totalBillableAmount: 0 },
          },
          isLoading: false,
        }),
      },
    },
  },
}));

describe("PromoterAssignmentStagingPage", () => {
  it("renders execution summary and payroll blocker text", () => {
    render(<PromoterAssignmentStagingPage />);
    expect(screen.getByText(/Promoter execution & staging/i)).toBeInTheDocument();
    expect(screen.getByText("Jane")).toBeInTheDocument();
    expect(screen.getByText(/payroll_basis_not_configured/i)).toBeInTheDocument();
  });
});
