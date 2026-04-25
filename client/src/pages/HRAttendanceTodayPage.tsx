import { trpc } from "@/lib/trpc";
import { useTranslation } from "react-i18next";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { OverdueCheckoutsPanel } from "@/components/attendance/OverdueCheckoutsPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { fmtTime } from "@/lib/dateUtils";
import { getAdminBoardRowStatusPresentation } from "@/lib/adminBoardRowStatus";

function boardStatusBadge(status: string) {
  const m = getAdminBoardRowStatusPresentation(status);
  return <Badge variant="outline" className={m.className}>{m.label}</Badge>;
}

function TodayBoard({ companyId }: { companyId: number | null }) {
  const { t } = useTranslation("hr");
  const { data, isLoading, isFetching, dataUpdatedAt, refetch } = trpc.scheduling.getTodayBoard.useQuery(
    { companyId: companyId ?? undefined },
    {
      enabled: companyId != null,
      refetchInterval: 60_000,
      refetchIntervalInBackground: true,
    },
  );
  if (companyId == null) {
    return (
      <div className="py-12 text-center text-muted-foreground border border-dashed rounded-lg">
        {t("attendance.todayBoard.selectCompany")}
      </div>
    );
  }
  if (isLoading) return <div className="py-12 text-center text-muted-foreground">{t("attendance.todayBoard.loading")}</div>;
  if (!data) return <div className="py-12 text-center text-muted-foreground">{t("attendance.todayBoard.noData")}</div>;
  const s = data.summary;
  const stats = [
    { label: t("attendance.todayBoard.critical"), count: s.criticalExceptions ?? 0, color: "text-red-800", bg: "bg-red-50" },
    { label: t("attendance.todayBoard.needsAttention"), count: s.needsAttention ?? 0, color: "text-amber-900", bg: "bg-amber-50" },
    { label: t("attendance.todayBoard.openPastShiftEnd"), count: s.overdueOpenCheckoutCount, color: "text-orange-800", bg: "bg-orange-50/90" },
    { label: t("attendance.todayBoard.scheduled"), count: s.total, color: "text-slate-700", bg: "bg-slate-50" },
    { label: t("attendance.todayBoard.upcoming"), count: s.upcoming, color: "text-slate-600", bg: "bg-slate-50/80" },
    { label: t("attendance.todayBoard.awaitingCheckin"), count: s.notCheckedIn, color: "text-amber-700", bg: "bg-amber-50" },
    { label: t("attendance.todayBoard.checkedInActive"), count: s.checkedInActive, color: "text-emerald-700", bg: "bg-emerald-50" },
    { label: t("attendance.todayBoard.lateNoArrival"), count: s.lateNoCheckin, color: "text-orange-700", bg: "bg-orange-50" },
    { label: t("attendance.todayBoard.completed"), count: s.checkedOut, color: "text-gray-700", bg: "bg-gray-50" },
    { label: t("attendance.todayBoard.absentConfirmed"), count: s.absent, color: "text-red-600", bg: "bg-red-50" },
    { label: t("attendance.todayBoard.holiday"), count: s.holiday, color: "text-blue-600", bg: "bg-blue-50" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-sm text-muted-foreground">
            {new Date(data.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 max-w-xl">
            {t("attendance.todayBoard.absentNote")}
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[11px] text-muted-foreground">
            {dataUpdatedAt > 0 ? (
              <span>
                {t("attendance.todayBoard.lastUpdated")}{" "}
                <time dateTime={new Date(dataUpdatedAt).toISOString()}>
                  {new Date(dataUpdatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </time>
              </span>
            ) : null}
            {dataUpdatedAt > 0 ? <span className="hidden sm:inline" aria-hidden>·</span> : null}
            <span>{t("attendance.todayBoard.autoRefresh")}</span>
            {isFetching && !isLoading ? (
              <span className="inline-flex items-center gap-1 text-primary font-medium">
                <RefreshCw className="h-3 w-3 animate-spin shrink-0" aria-hidden />
                {t("attendance.todayBoard.syncing")}
              </span>
            ) : null}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          {t("attendance.todayBoard.refresh")}
        </Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {stats.map((st) => (
          <div key={st.label} className={`rounded-lg p-3 ${st.bg}`}>
            <div className={`text-xl font-bold ${st.color}`}>{st.count}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{st.label}</div>
          </div>
        ))}
      </div>
      <OverdueCheckoutsPanel className="mt-2" />
      {(data.fullDaySummaries ?? []).length > 0 && (
        <div className="rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-3 space-y-2">
          <p className="text-xs font-semibold text-foreground">{t("attendance.todayBoard.fullDayTitle")}</p>
          <ul className="space-y-2 text-sm">
            {(data.fullDaySummaries ?? []).map((fd) => (
              <li key={fd.employeeId} className="rounded-md bg-background/80 border px-2.5 py-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium">{fd.employeeDisplayName}</span>
                  <span className="text-xs text-muted-foreground">({t("attendance.todayBoard.shifts", { count: fd.shiftCount })})</span>
                  {fd.dayFullyComplete ? (
                    <Badge variant="outline" className="border-emerald-300 text-emerald-800 bg-emerald-50 text-[10px]">
                      {t("attendance.todayBoard.dayComplete")}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-300 text-amber-900 bg-amber-50 text-[10px]">
                      {t("attendance.todayBoard.inProgress")}
                    </Badge>
                  )}
                  <span className="w-full basis-full text-xs text-muted-foreground leading-snug">
                    {t("attendance.todayBoard.shiftsCompleted", { done: fd.shiftsCheckedOutCount, total: fd.shiftCount })}
                    {fd.totalAttributedMinutes > 0 ? (
                      <> {t("attendance.todayBoard.minutesAttributed", { minutes: fd.totalAttributedMinutes })}</>
                    ) : null}
                    {fd.shiftsCheckedOutCount < fd.shiftCount ? (
                      <> {t("attendance.todayBoard.openShiftsNote")}</>
                    ) : null}
                  </span>
                </div>
                <ol className="mt-1.5 space-y-2 text-xs text-foreground/90 list-decimal list-outside ml-4 pl-1">
                  {fd.segments.map((seg) => {
                    const st = getAdminBoardRowStatusPresentation(seg.status);
                    return (
                      <li key={seg.scheduleId}>
                        <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
                          <span className="font-medium">{seg.shiftName ?? t("attendance.todayBoard.headers.shift")}</span>
                          <span className="text-muted-foreground">({seg.expectedStart}–{seg.expectedEnd})</span>
                          <Badge variant="outline" className={`text-[10px] py-0 h-5 shrink-0 ${st.className}`}>
                            {st.label}
                          </Badge>
                        </span>
                        <span className="block mt-0.5 text-foreground/90">
                          <span className="text-muted-foreground">{t("attendance.todayBoard.inOut")} </span>
                          <span>{seg.checkInAt ? fmtTime(seg.checkInAt) : "—"}</span>
                          <span> – </span>
                          <span>{seg.checkOutAt ? fmtTime(seg.checkOutAt) : "—"}</span>
                          {!seg.checkOutAt && seg.punchCheckOutAt ? (
                            <span className="text-muted-foreground"> ({t("attendance.todayBoard.openSession", { time: fmtTime(seg.punchCheckOutAt) })})</span>
                          ) : seg.checkOutAt && seg.punchCheckOutAt &&
                            new Date(seg.punchCheckOutAt).getTime() !== new Date(seg.checkOutAt).getTime() ? (
                            <span className="text-muted-foreground"> ({t("attendance.todayBoard.sessionTo", { time: fmtTime(seg.punchCheckOutAt) })})</span>
                          ) : null}
                          {seg.durationMinutes != null && seg.checkInAt ? (
                            <span className="text-muted-foreground"> ({seg.durationMinutes}m)</span>
                          ) : null}
                          {seg.methodLabel ? (
                            <span className="text-muted-foreground"> · {seg.methodLabel}</span>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm min-w-[980px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-2.5 font-medium">{t("attendance.todayBoard.headers.employee")}</th>
              <th className="text-left px-3 py-2.5 font-medium">{t("attendance.todayBoard.headers.site")}</th>
              <th className="text-left px-3 py-2.5 font-medium">{t("attendance.todayBoard.headers.shift")}</th>
              <th className="text-left px-3 py-2.5 font-medium">{t("attendance.todayBoard.headers.checkIn")}</th>
              <th className="text-left px-3 py-2.5 font-medium">{t("attendance.todayBoard.headers.checkOut")}</th>
              <th className="text-left px-3 py-2.5 font-medium">{t("attendance.todayBoard.headers.delay")}</th>
              <th className="text-left px-3 py-2.5 font-medium">{t("attendance.todayBoard.headers.worked")}</th>
              <th className="text-left px-3 py-2.5 font-medium">{t("attendance.todayBoard.headers.source")}</th>
              <th className="text-left px-3 py-2.5 font-medium">{t("attendance.todayBoard.headers.risk")}</th>
              <th className="text-left px-3 py-2.5 font-medium">{t("attendance.todayBoard.headers.payroll")}</th>
              <th className="text-left px-3 py-2.5 font-medium">{t("attendance.todayBoard.headers.status")}</th>
            </tr>
          </thead>
          <tbody>
            {data.board.map((row: any) => (
              <tr key={row.scheduleId} className="border-t hover:bg-muted/30">
                <td className="px-3 py-2.5">
                  <div className="font-medium">{row.employeeDisplayName ?? row.employee?.name ?? `Schedule #${row.scheduleId}`}</div>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[140px] truncate" title={row.siteName ?? ""}>
                  {row.siteName ?? "—"}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground text-xs">
                  {row.shift ? (row.shift as { name?: string | null }).name ?? "—" : "—"}
                  {row.expectedStart && row.expectedEnd ? (
                    <div className="text-[11px]">{row.expectedStart}–{row.expectedEnd}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">{row.checkInAt ? fmtTime(row.checkInAt) : "—"}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {row.checkOutAt ? fmtTime(row.checkOutAt) : "—"}
                  {!row.checkOutAt && row.punchCheckOutAt ? (
                    <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                      {t("attendance.todayBoard.openSession", { time: fmtTime(row.punchCheckOutAt) })}
                    </div>
                  ) : row.checkOutAt && row.punchCheckOutAt &&
                    new Date(row.punchCheckOutAt).getTime() !== new Date(row.checkOutAt).getTime() ? (
                    <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                      {t("attendance.todayBoard.sessionTo", { time: fmtTime(row.punchCheckOutAt) })}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                  {row.delayMinutes != null && row.delayMinutes > 0 ? `${row.delayMinutes}m` : "—"}
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                  {row.durationMinutes != null && row.checkInAt ? `${row.durationMinutes}m` : "—"}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{row.methodLabel ?? "—"}</td>
                <td className="px-3 py-2.5">
                  {row.riskLevel ? (
                    <Badge
                      variant="outline"
                      className={
                        row.riskLevel === "critical"
                          ? "text-[10px] border-red-300 bg-red-50 text-red-800"
                          : row.riskLevel === "warning"
                            ? "text-[10px] border-amber-300 bg-amber-50 text-amber-900"
                            : "text-[10px]"
                      }
                    >
                      {row.riskLevel}
                    </Badge>
                  ) : "—"}
                </td>
                <td className="px-3 py-2.5 text-[11px] text-muted-foreground capitalize">
                  {row.payrollHints?.payrollImpact
                    ? String(row.payrollHints.payrollImpact).replace(/_/g, " ")
                    : "—"}
                </td>
                <td className="px-3 py-2.5">{boardStatusBadge(row.status)}</td>
              </tr>
            ))}
            {data.board.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">
                  {t("attendance.todayBoard.noEmployeesScheduled")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function HRAttendanceTodayPage() {
  const { activeCompanyId } = useActiveCompany();
  return <TodayBoard companyId={activeCompanyId} />;
}
