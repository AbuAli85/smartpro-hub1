/**
 * AttendanceReadinessPanel
 *
 * Compact warning panel summarising the attendance payroll/billing gate for a
 * given period (year + month). Embedded into the payroll execution screen so
 * payroll/finance users can see whether attendance is ready before they kick
 * off a payroll run.
 *
 * Phase note: this is **warning-only** — it never disables the surrounding
 * payroll execute button. Hard-blocking is a follow-up step.
 */
import type { ComponentType } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { TRPCClientError } from "@trpc/client";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  AlertTriangle,
  LockOpen,
  ShieldCheck,
} from "lucide-react";
import type { AttendancePayrollGateStatus } from "@shared/attendancePayrollReadiness";

const GATE_STATUS_CONFIG: Record<
  AttendancePayrollGateStatus,
  { icon: ComponentType<{ size?: number; className?: string }>; badgeClass: string }
> = {
  ready: { icon: ShieldCheck, badgeClass: "border-green-600 text-green-700 bg-green-50 dark:bg-green-950/40" },
  needs_review: { icon: AlertTriangle, badgeClass: "border-amber-600 text-amber-800 bg-amber-50 dark:bg-amber-950/30" },
  blocked_period_not_locked: { icon: LockOpen, badgeClass: "border-red-600 text-red-800 bg-red-50 dark:bg-red-950/30" },
  blocked_reconciliation: { icon: AlertCircle, badgeClass: "border-red-600 text-red-800 bg-red-50 dark:bg-red-950/30" },
  blocked_client_approval_pending: { icon: AlertTriangle, badgeClass: "border-amber-600 text-amber-800 bg-amber-50 dark:bg-amber-950/30" },
  blocked_client_approval_rejected: { icon: AlertCircle, badgeClass: "border-red-600 text-red-800 bg-red-50 dark:bg-red-950/30" },
  not_required: { icon: ShieldCheck, badgeClass: "border-slate-400 text-slate-600 bg-slate-50 dark:bg-slate-900/40" },
};

function PayrollGateBadge({ status }: { status: AttendancePayrollGateStatus }) {
  const { t } = useTranslation("hr");
  const cfg = GATE_STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`flex items-center gap-1.5 ${cfg.badgeClass}`}>
      <Icon size={14} />
      {t(`attendance.payrollGate.status.${status}`)}
    </Badge>
  );
}

function isPermissionError(error: unknown): boolean {
  if (!(error instanceof TRPCClientError)) return false;
  const code = (error.data as { code?: string } | undefined)?.code;
  return code === "FORBIDDEN" || code === "UNAUTHORIZED";
}

export interface AttendanceReadinessPanelProps {
  /** Active company. When null/undefined the panel renders nothing (gate isn't meaningful). */
  companyId: number | null | undefined;
  year: number;
  month: number;
  /**
   * Whether client approval batches are required for this period. Default true
   * so the gate surfaces approval state on the payroll screen.
   */
  requireClientApproval?: boolean;
  /** Optional site filter for client approval batch lookup. */
  siteId?: number;
}

/**
 * Compact, read-only readiness panel. Never disables surrounding actions —
 * if blockers exist it shows a soft warning that payroll *can* still run.
 */
export function AttendanceReadinessPanel({
  companyId,
  year,
  month,
  requireClientApproval = true,
  siteId,
}: AttendanceReadinessPanelProps) {
  const { t } = useTranslation("hr");

  const enabled = companyId != null;
  const payrollGate = trpc.attendance.getPayrollGateReadiness.useQuery(
    {
      companyId: companyId ?? undefined,
      year,
      month,
      requireClientApproval,
      ...(siteId != null ? { siteId } : {}),
    },
    { enabled, retry: false },
  );

  if (!enabled) return null;

  return (
    <div
      className="rounded-lg border border-border bg-muted/20 p-3 space-y-2"
      data-testid="attendance-readiness-panel"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold flex items-center gap-1.5">
          <ShieldCheck size={14} className="text-muted-foreground" />
          {t("attendance.payrollGate.cardTitle")}
        </p>
      </div>

      {payrollGate.isLoading ? (
        <Skeleton className="h-10 w-full rounded-md" />
      ) : payrollGate.isError ? (
        isPermissionError(payrollGate.error) ? (
          <p className="text-xs text-muted-foreground" data-testid="attendance-readiness-no-permission">
            {t("attendance.payrollGate.panel.noPermission")}
          </p>
        ) : (
          <p className="text-xs text-destructive">{payrollGate.error.message}</p>
        )
      ) : payrollGate.data ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <PayrollGateBadge status={payrollGate.data.status} />
            <span className="text-xs text-muted-foreground">
              {t(`attendance.payrollGate.statusHint.${payrollGate.data.status}`)}
            </span>
          </div>

          {payrollGate.data.blockers.length > 0 ? (
            <p
              className="text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50/80 dark:bg-amber-950/30 rounded px-2 py-1 border border-amber-200 dark:border-amber-800"
              data-testid="attendance-readiness-warning"
            >
              {t("attendance.payrollGate.panel.warning")}
            </p>
          ) : null}

          {payrollGate.data.blockers.length > 0 ? (
            <ul className="space-y-1">
              {payrollGate.data.blockers.map((blocker) => (
                <li
                  key={blocker.code}
                  className="flex items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50/50 dark:bg-red-950/20 px-2 py-1.5 text-[11px]"
                >
                  <span className="text-red-800 dark:text-red-300 font-medium">
                    {t(blocker.messageKey, { count: blocker.count })}
                  </span>
                  {blocker.code === "PERIOD_NOT_LOCKED" ? (
                    <Link
                      href="/hr/attendance-reconciliation"
                      className="text-[11px] text-primary hover:underline shrink-0"
                    >
                      {t("attendance.payrollGate.actions.lockPeriod")}
                    </Link>
                  ) : blocker.code === "RECONCILIATION_BLOCKED" ? (
                    <Link
                      href="/hr/attendance-reconciliation"
                      className="text-[11px] text-primary hover:underline shrink-0"
                    >
                      {t("attendance.payrollGate.actions.viewBlockers")}
                    </Link>
                  ) : blocker.code === "CLIENT_APPROVAL_PENDING" ||
                    blocker.code === "CLIENT_APPROVAL_REJECTED" ? (
                    <Link
                      href="/hr/client-approvals"
                      className="text-[11px] text-primary hover:underline shrink-0"
                    >
                      {t("attendance.payrollGate.actions.viewClientApprovals")}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {payrollGate.data.clientApproval.required ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span>
                {t("attendance.payrollGate.clientApproval.approved")}:{" "}
                <strong>{payrollGate.data.clientApproval.approvedBatches}</strong>
              </span>
              <span>
                {t("attendance.payrollGate.clientApproval.pending")}:{" "}
                <strong>{payrollGate.data.clientApproval.pendingBatches}</strong>
              </span>
              <span>
                {t("attendance.payrollGate.clientApproval.rejected")}:{" "}
                <strong>{payrollGate.data.clientApproval.rejectedBatches}</strong>
              </span>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3 pt-0.5 text-[11px]">
            <Link
              href="/hr/attendance-reconciliation"
              className="text-primary hover:underline"
            >
              {t("attendance.payrollGate.actions.viewBlockers")}
            </Link>
            <Link href="/hr/client-approvals" className="text-primary hover:underline">
              {t("attendance.payrollGate.actions.viewClientApprovals")}
            </Link>
            <Link
              href="/hr/reports/client-attendance"
              className="text-primary hover:underline"
            >
              {t("attendance.payrollGate.actions.viewAttendanceSheet")}
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default AttendanceReadinessPanel;
