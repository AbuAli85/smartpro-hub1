import { trpc } from "@/lib/trpc";
import { fmtTime } from "@/lib/dateUtils";
import { OverdueCheckoutsPanel } from "@/components/attendance/OverdueCheckoutsPanel";
import { getAdminBoardRowStatusPresentation } from "@/lib/adminBoardRowStatus";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  CalendarDays,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  PartyPopper,
  MapPin,
  LogOut,
  UserX,
  Sunrise,
  ListTodo,
} from "lucide-react";
import type { AdminBoardRowStatus } from "@shared/attendanceBoardStatus";
import { operationalBandFromBoardStatus, type OperationalBand } from "@shared/attendanceIntelligence";

const BAND_ORDER: OperationalBand[] = [
  "critical",
  "needs_attention",
  "active",
  "completed",
  "upcoming",
  "holiday",
];

const BAND_CONFIG: Record<
  OperationalBand,
  { sectionLabel: string; icon: typeof CheckCircle2; color: string; bg: string }
> = {
  critical: {
    sectionLabel: "Critical exceptions",
    icon: UserX,
    color: "text-red-800",
    bg: "bg-red-50 border-red-200",
  },
  needs_attention: {
    sectionLabel: "Needs attention",
    icon: ListTodo,
    color: "text-amber-900",
    bg: "bg-amber-50 border-amber-200",
  },
  active: {
    sectionLabel: "Checked in · active",
    icon: CheckCircle2,
    color: "text-emerald-800",
    bg: "bg-emerald-50 border-emerald-200",
  },
  completed: {
    sectionLabel: "Completed",
    icon: LogOut,
    color: "text-blue-800",
    bg: "bg-blue-50 border-blue-200",
  },
  upcoming: {
    sectionLabel: "Upcoming",
    icon: Sunrise,
    color: "text-slate-800",
    bg: "bg-slate-50 border-slate-200",
  },
  holiday: {
    sectionLabel: "Holiday",
    icon: PartyPopper,
    color: "text-purple-800",
    bg: "bg-purple-50 border-purple-200",
  },
};

function bandForRow(b: { operationalBand?: OperationalBand; status: string }): OperationalBand {
  return b.operationalBand ?? operationalBandFromBoardStatus(b.status as AdminBoardRowStatus);
}

function getInitials(name: string) {
  return (name ?? "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function TodayBoardPage() {
  const { activeCompanyId } = useActiveCompany();
  const utils = trpc.useUtils();

  const { data, isLoading, error, isFetching, dataUpdatedAt } = trpc.scheduling.getTodayBoard.useQuery(
    { companyId: activeCompanyId ?? undefined },
    {
      enabled: !!activeCompanyId,
      /** Keep ops view current while the tab stays open (no WebSocket; polling is the contract). */
      refetchInterval: 60_000,
      refetchIntervalInBackground: true,
    }
  );

  function handleRefresh() {
    utils.scheduling.getTodayBoard.invalidate();
  }

  const today = new Date().toLocaleDateString("en", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const summaryCards = data?.summary
    ? [
        { key: "criticalExceptions" as const, label: "Critical (live)", color: "text-red-800", bg: "bg-red-50" },
        { key: "needsAttention" as const, label: "Needs attention", color: "text-amber-900", bg: "bg-amber-50" },
        { key: "total" as const, label: "Scheduled", color: "text-foreground", bg: "bg-card" },
        { key: "checkedInActive" as const, label: "Checked in (active)", color: "text-emerald-700", bg: "bg-emerald-50" },
        { key: "notCheckedIn" as const, label: "Awaiting check-in", color: "text-amber-800", bg: "bg-amber-50" },
        { key: "lateNoCheckin" as const, label: "Late / no arrival", color: "text-orange-700", bg: "bg-orange-50" },
        { key: "absent" as const, label: "Absent (confirmed)", color: "text-red-700", bg: "bg-red-50" },
        { key: "checkedOut" as const, label: "Completed", color: "text-blue-700", bg: "bg-blue-50" },
        { key: "overdueOpenCheckoutCount" as const, label: "Open past shift end", color: "text-orange-800", bg: "bg-orange-50/80" },
      ]
    : [];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="text-primary" size={24} />
            Live attendance board
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{today}</p>
          <p className="text-[11px] text-muted-foreground mt-1 max-w-lg">
            Absent is shown only after the scheduled shift ends with no check-in. Earlier in the day you&apos;ll see upcoming or awaiting check-in instead.
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-[11px] text-muted-foreground">
            {dataUpdatedAt > 0 ? (
              <span>
                Last updated:{" "}
                <time dateTime={new Date(dataUpdatedAt).toISOString()}>
                  {new Date(dataUpdatedAt).toLocaleString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </time>
              </span>
            ) : null}
            {dataUpdatedAt > 0 ? <span className="hidden sm:inline" aria-hidden>·</span> : null}
            <span>Auto-refresh every 60s while this page is open</span>
            {isFetching && !isLoading ? (
              <span className="inline-flex items-center gap-1 text-primary font-medium">
                <RefreshCw size={12} className="animate-spin shrink-0" aria-hidden />
                Syncing…
              </span>
            ) : null}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 shrink-0"
          onClick={handleRefresh}
          disabled={isFetching}
        >
          <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-20" />
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card className="border-destructive/50">
          <CardContent className="py-8 text-center text-destructive">
            Failed to load today&apos;s board. Please try again.
          </CardContent>
        </Card>
      ) : data?.isHoliday ? (
        <Card className="border-purple-200 bg-purple-50">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <PartyPopper size={48} className="text-purple-500" />
            <h2 className="text-xl font-bold text-purple-700">{data.holidayName}</h2>
            <p className="text-purple-600">Today is a holiday — no attendance required</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {data?.summary && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {summaryCards.map(({ key, label, color, bg }) => (
                <Card key={key} className={`${bg} border`}>
                  <CardContent className="p-4 text-center">
                    <div className={`text-2xl font-bold ${color}`}>
                      {data.summary[key as keyof typeof data.summary] as number}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 leading-tight">{label}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <OverdueCheckoutsPanel />
          {data && (data.fullDaySummaries ?? []).length > 0 && (
            <Card className="border-primary/25 bg-primary/[0.04]">
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-semibold">Full day (multiple shifts, Muscat time)</p>
                <p className="text-xs text-muted-foreground leading-snug">
                  Cards below are grouped by status per shift. Times are stored punches (Muscat), not the shift bar only; duration still follows each shift window.
                </p>
                <ul className="space-y-2 text-sm">
                  {(data.fullDaySummaries ?? []).map((fd) => (
                    <li key={fd.employeeId} className="rounded-md border bg-background/90 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium">{fd.employeeDisplayName}</span>
                        <span className="text-xs text-muted-foreground">({fd.shiftCount} shifts)</span>
                        {fd.dayFullyComplete ? (
                          <Badge variant="outline" className="border-emerald-300 text-emerald-800 bg-emerald-50 text-[10px]">
                            Day complete
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-300 text-amber-900 bg-amber-50 text-[10px]">
                            In progress
                          </Badge>
                        )}
                        <span className="text-[11px] text-muted-foreground leading-snug w-full">
                          {fd.shiftsCheckedOutCount}/{fd.shiftCount} shifts completed
                          {fd.totalAttributedMinutes > 0 ? (
                            <> · {fd.totalAttributedMinutes}m attributed (per shift window)</>
                          ) : null}
                          {fd.shiftsCheckedOutCount < fd.shiftCount ? (
                            <> · upcoming shifts add 0m until check-in.</>
                          ) : null}
                        </span>
                      </div>
                      <ol className="mt-1.5 space-y-2 text-xs text-foreground/90 list-decimal list-outside ml-4 pl-1">
                        {fd.segments.map((seg) => {
                          const st = getAdminBoardRowStatusPresentation(seg.status);
                          return (
                            <li key={seg.scheduleId}>
                              <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
                                <span className="font-medium">{seg.shiftName ?? "Shift"}</span>
                                <span className="text-muted-foreground">({seg.expectedStart}–{seg.expectedEnd})</span>
                                <Badge variant="outline" className={`text-[10px] py-0 h-5 shrink-0 ${st.className}`}>
                                  {st.label}
                                </Badge>
                              </span>
                              <span className="block mt-0.5">
                                <span className="text-muted-foreground">In → out: </span>
                                <span>{seg.checkInAt ? fmtTime(seg.checkInAt) : "—"}</span>
                                <span> → </span>
                                <span>{seg.checkOutAt ? fmtTime(seg.checkOutAt) : "—"}</span>
                                {!seg.checkOutAt && seg.punchCheckOutAt ? (
                                  <span className="text-muted-foreground"> (open to {fmtTime(seg.punchCheckOutAt)})</span>
                                ) : seg.checkOutAt &&
                                  seg.punchCheckOutAt &&
                                  new Date(seg.punchCheckOutAt).getTime() !== new Date(seg.checkOutAt).getTime() ? (
                                  <span className="text-muted-foreground"> (to {fmtTime(seg.punchCheckOutAt)})</span>
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
              </CardContent>
            </Card>
          )}

          {!data?.board?.length ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                <CalendarDays size={40} className="opacity-30" />
                <p className="font-medium">No employees scheduled for today</p>
                <p className="text-sm">Assign schedules to employees to see them here</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {BAND_ORDER.map((bandKey) => {
                const group = data.board.filter((b) => bandForRow(b) === bandKey);
                if (!group.length) return null;
                const cfg = BAND_CONFIG[bandKey];
                const Icon = cfg.icon;
                return (
                  <div key={bandKey}>
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-t-lg border-b ${cfg.bg} border`}>
                      <Icon size={14} className={cfg.color} />
                      <span className={`text-sm font-semibold ${cfg.color}`}>
                        {cfg.sectionLabel} ({group.length})
                      </span>
                    </div>
                    <div className="space-y-1 mb-4">
                      {group.map((b: any) => (
                        <Card key={b.scheduleId} className={`border ${cfg.bg} rounded-t-none`}>
                          <CardContent className="p-3">
                            <div className="flex items-center gap-3">
                              <Avatar className="h-9 w-9">
                                <AvatarFallback className="text-xs font-semibold">
                                  {getInitials(b.employeeDisplayName ?? b.employee?.name ?? "?")}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-sm">
                                    {b.employeeDisplayName ?? b.employee?.name ?? "Unknown"}
                                  </span>
                                  <Badge variant="outline" className={`text-[10px] py-0 h-5 ${getAdminBoardRowStatusPresentation(b.status).className}`}>
                                    {getAdminBoardRowStatusPresentation(b.status).label}
                                  </Badge>
                                  {b.shift && (
                                    <Badge
                                      style={{ backgroundColor: b.shift.color ?? "#6366f1", color: "white" }}
                                      className="text-[10px] py-0"
                                    >
                                      {b.shift.name}
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                                  {b.site && (
                                    <span className="flex items-center gap-1">
                                      <MapPin size={10} /> {b.site.name}
                                    </span>
                                  )}
                                  {b.shift && (
                                    <span className="flex items-center gap-1">
                                      <Clock size={10} /> {b.shift.startTime} – {b.shift.endTime}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="text-right text-xs space-y-0.5">
                                {b.delayMinutes != null && b.delayMinutes > 0 && (
                                  <div className="text-orange-700 font-medium">+{b.delayMinutes}m</div>
                                )}
                                {b.checkInAt && (
                                  <div className="text-muted-foreground">
                                    In:{" "}
                                    <span className="font-medium text-foreground">{fmtTime(b.checkInAt)}</span>
                                  </div>
                                )}
                                {(b.checkOutAt || b.punchCheckOutAt) && (
                                  <div className="text-muted-foreground">
                                    Out:{" "}
                                    <span className="font-medium text-foreground">
                                      {b.checkOutAt ? fmtTime(b.checkOutAt) : "—"}
                                    </span>
                                    {!b.checkOutAt && b.punchCheckOutAt ? (
                                      <span className="block text-[10px] font-normal">
                                        Open session {fmtTime(b.punchCheckOutAt)}
                                      </span>
                                    ) : b.punchCheckOutAt &&
                                      b.checkOutAt &&
                                      new Date(b.punchCheckOutAt).getTime() !== new Date(b.checkOutAt).getTime() ? (
                                      <span className="block text-[10px] font-normal">
                                        Session {fmtTime(b.punchCheckOutAt)}
                                      </span>
                                    ) : null}
                                  </div>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
