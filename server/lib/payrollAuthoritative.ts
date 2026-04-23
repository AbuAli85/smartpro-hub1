import { TRPCError } from "@trpc/server";

export type PayrollRunRowForPolicy = {
  status: string;
  previewOnly?: boolean | null;
  attendancePreflightSnapshot?: string | null;
};

/**
 * Durable classification for reporting/dashboards: not a preview row and has a stored attendance preflight snapshot
 * from `executeMonthlyPayroll`. (Legacy ambiguous rows: `preview_only = 0` but empty snapshot → not authoritative.)
 */
export function isAuthoritativePayrollRun(
  run: Pick<PayrollRunRowForPolicy, "previewOnly" | "attendancePreflightSnapshot">,
): boolean {
  return Boolean(!run.previewOnly && run.attendancePreflightSnapshot?.trim());
}

/** Authoritative payroll = produced by `executeMonthlyPayroll` (reconciliation + snapshot), not salary preview. */
export function assertAuthoritativePayrollForApprove(run: PayrollRunRowForPolicy): void {
  if (run.previewOnly) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "This run is a non-authoritative salary preview only. Use Execute Payroll (with attendance reconciliation) before approval.",
    });
  }
  if (run.status !== "pending_execution") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only payroll runs in pending execution (from Execute Payroll) can be approved.",
    });
  }
  if (!run.attendancePreflightSnapshot?.trim()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This payroll run has no attendance preflight snapshot and cannot be approved as authoritative payroll.",
    });
  }
}

export function assertAuthoritativePayrollForMarkPaid(run: PayrollRunRowForPolicy): void {
  if (run.previewOnly) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Non-authoritative preview payroll runs cannot be marked paid.",
    });
  }
}

export function assertAuthoritativePayrollForFinancialExport(run: PayrollRunRowForPolicy, actionLabel: string): void {
  if (run.previewOnly) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Non-authoritative preview payroll runs cannot ${actionLabel}.`,
    });
  }
}
