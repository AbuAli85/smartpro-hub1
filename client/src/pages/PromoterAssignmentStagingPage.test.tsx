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
            mismatchIssueCountToday: 1,
            futureAssignmentAttendanceAttempts: 0,
            suspendedAttemptedAttendance: 0,
          },
          isLoading: false,
        }),
      },
      mismatchSummary: {
        useQuery: () => ({
          data: {
            totalAttendanceInRange: 40,
            issuesCount: 3,
            ambiguousResolutionCases: 0,
            bySignal: { unlinked_attendance: 2 },
            topBrands: [],
            topSites: [],
            topEmployees: [],
          },
          isLoading: false,
        }),
      },
      mismatchDetail: {
        useQuery: () => ({
          data: [],
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
                warnings: [],
                blockers: ["missing_payroll_basis"],
              },
            ],
            summary: {
              totalRows: 1,
              ready: 0,
              warning: 0,
              blocked: 1,
              notApplicable: 0,
              topBlockers: [{ reason: "missing_payroll_basis", count: 1 }],
              topWarnings: [],
              totalBillableAmount: 0,
            },
          },
          isLoading: false,
        }),
      },
      billingStaging: {
        useQuery: () => ({
          data: {
            rows: [],
            summary: {
              totalRows: 0,
              ready: 0,
              warning: 0,
              blocked: 0,
              notApplicable: 0,
              topBlockers: [],
              topWarnings: [],
              totalBillableAmount: 0,
            },
          },
          isLoading: false,
        }),
      },
    },
  },
}));

describe("PromoterAssignmentStagingPage", () => {
  it("renders execution trust strip and payroll blocker text", () => {
    render(<PromoterAssignmentStagingPage />);
    expect(screen.getByText(/Promoter execution & staging/i)).toBeInTheDocument();
    expect(screen.getByText("Jane")).toBeInTheDocument();
    expect(screen.getByText(/missing_payroll_basis/i)).toBeInTheDocument();
    expect(screen.getByText(/Execution trust strip/i)).toBeInTheDocument();
  });
});
