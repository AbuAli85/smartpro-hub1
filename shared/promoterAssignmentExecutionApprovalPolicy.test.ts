import { describe, expect, it } from "vitest";
import {
  canIncludePayrollStagingRow,
  canIncludeBillingStagingRow,
} from "./promoterAssignmentExecutionApprovalPolicy";

describe("promoterAssignmentExecutionApprovalPolicy", () => {
  it("blocks payroll when readiness is blocked", () => {
    const r = canIncludePayrollStagingRow(
      { readiness: "blocked", blockers: ["x"], warnings: [] },
      { acceptedWarningKeys: [] },
    );
    expect(r.allowed).toBe(false);
  });

  it("allows payroll when ready", () => {
    const r = canIncludePayrollStagingRow(
      { readiness: "ready", blockers: [], warnings: [] },
      undefined,
    );
    expect(r.allowed).toBe(true);
  });

  it("requires ack for payroll warnings", () => {
    const r = canIncludePayrollStagingRow(
      { readiness: "warning", blockers: [], warnings: ["low_attendance_vs_overlap"] },
      { acceptedWarningKeys: [] },
    );
    expect(r.allowed).toBe(false);
    const ok = canIncludePayrollStagingRow(
      { readiness: "warning", blockers: [], warnings: ["low_attendance_vs_overlap"] },
      { acceptedWarningKeys: ["low_attendance_vs_overlap"] },
    );
    expect(ok.allowed).toBe(true);
  });

  it("requires note for estimate-only billing warnings", () => {
    const r = canIncludeBillingStagingRow(
      {
        readiness: "warning",
        blockers: [],
        warnings: ["monthly_estimate_only"],
      },
      { acceptedWarningKeys: ["monthly_estimate_only"] },
    );
    expect(r.allowed).toBe(false);
    const ok = canIncludeBillingStagingRow(
      {
        readiness: "warning",
        blockers: [],
        warnings: ["monthly_estimate_only"],
      },
      { acceptedWarningKeys: ["monthly_estimate_only"], reviewerNote: "Approved for interim billing" },
    );
    expect(ok.allowed).toBe(true);
  });
});
