import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  assertAuthoritativePayrollForApprove,
  assertAuthoritativePayrollForFinancialExport,
  assertAuthoritativePayrollForMarkPaid,
} from "./payrollAuthoritative";

describe("payrollAuthoritative guards", () => {
  it("approve rejects preview-only runs", () => {
    expect(() =>
      assertAuthoritativePayrollForApprove({
        status: "draft",
        previewOnly: true,
        attendancePreflightSnapshot: null,
      }),
    ).toThrow(TRPCError);
  });

  it("approve rejects pending_execution without snapshot", () => {
    expect(() =>
      assertAuthoritativePayrollForApprove({
        status: "pending_execution",
        previewOnly: false,
        attendancePreflightSnapshot: "",
      }),
    ).toThrow(TRPCError);
  });

  it("approve allows pending_execution with snapshot and not preview", () => {
    expect(() =>
      assertAuthoritativePayrollForApprove({
        status: "pending_execution",
        previewOnly: false,
        attendancePreflightSnapshot: '{"v":1}',
      }),
    ).not.toThrow();
  });

  it("mark paid rejects preview", () => {
    expect(() =>
      assertAuthoritativePayrollForMarkPaid({
        status: "approved",
        previewOnly: true,
        attendancePreflightSnapshot: "{}",
      }),
    ).toThrow(TRPCError);
  });

  it("financial export rejects preview", () => {
    expect(() =>
      assertAuthoritativePayrollForFinancialExport({ status: "approved", previewOnly: true }, "export WPS"),
    ).toThrow(TRPCError);
  });
});
