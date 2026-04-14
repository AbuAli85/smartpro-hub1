import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { muscatCalendarYmdNow } from "@shared/attendanceMuscatTime";

/**
 * Shared invalidation + mutations for force checkout and operational issue triage.
 */
export function useAttendanceOperationalMutations(companyId: number | null) {
  const utils = trpc.useUtils();

  const invalidateAll = () => {
    void utils.scheduling.getOverdueCheckouts.invalidate();
    void utils.scheduling.getTodayBoard.invalidate();
    void utils.attendance.listOperationalIssuesForBusinessDate.invalidate();
    void utils.attendance.listOperationalIssuesByIssueKeys.invalidate();
    void utils.attendance.getOperationalIssueHistory.invalidate();
    void utils.attendance.listAttendanceAudit.invalidate();
  };

  const forceCheckout = trpc.attendance.forceCheckout.useMutation({
    onSuccess: () => {
      toast.success("Force checkout recorded");
      invalidateAll();
    },
    onError: (e) => toast.error(e.message),
  });

  const setIssueStatus = trpc.attendance.setOperationalIssueStatus.useMutation({
    onSuccess: (_data, variables) => {
      toast.success(
        variables.action === "acknowledge"
          ? "Issue acknowledged"
          : variables.action === "resolve"
            ? "Issue resolved"
            : "Assignment updated",
      );
      invalidateAll();
    },
    onError: (e) => toast.error(e.message),
  });

  async function acknowledgeOverdueCheckout(opts: { attendanceRecordId: number; note?: string }) {
    if (companyId == null) return;
    await setIssueStatus.mutateAsync({
      companyId,
      businessDateYmd: muscatCalendarYmdNow(),
      kind: "overdue_checkout",
      attendanceRecordId: opts.attendanceRecordId,
      action: "acknowledge",
      note: opts.note?.trim() || undefined,
    });
  }

  return {
    forceCheckout,
    setIssueStatus,
    acknowledgeOverdueCheckout,
    isPending: forceCheckout.isPending || setIssueStatus.isPending,
  };
}
