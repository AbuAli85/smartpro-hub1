import { trpc } from "@/lib/trpc";
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
  Timer,
  LogOut,
  UserX,
  Sunrise,
} from "lucide-react";

const STATUS_ORDER = [
  "late_no_checkin",
  "not_checked_in",
  "upcoming",
  "checked_in_late",
  "checked_in_on_time",
  "checked_out",
  "absent",
  "holiday",
] as const;

const STATUS_CONFIG: Record<
  (typeof STATUS_ORDER)[number],
  { label: string; icon: typeof CheckCircle2; color: string; bg: string }
> = {
  late_no_checkin: {
    label: "Late · no check-in",
    icon: AlertCircle,
    color: "text-orange-700",
    bg: "bg-orange-50 border-orange-200",
  },
  not_checked_in: {
    label: "Awaiting check-in",
    icon: Timer,
    color: "text-amber-800",
    bg: "bg-amber-50 border-amber-200",
  },
  upcoming: {
    label: "Upcoming",
    icon: Sunrise,
    color: "text-slate-700",
    bg: "bg-slate-50 border-slate-200",
  },
  checked_in_late: {
    label: "Checked in · late",
    icon: AlertCircle,
    color: "text-yellow-800",
    bg: "bg-yellow-50 border-yellow-200",
  },
  checked_in_on_time: {
    label: "Checked in",
    icon: CheckCircle2,
    color: "text-emerald-700",
    bg: "bg-emerald-50 border-emerald-200",
  },
  checked_out: {
    label: "Completed",
    icon: LogOut,
    color: "text-blue-700",
    bg: "bg-blue-50 border-blue-200",
  },
  absent: {
    label: "Absent (shift ended)",
    icon: UserX,
    color: "text-red-700",
    bg: "bg-red-50 border-red-200",
  },
  holiday: {
    label: "Holiday",
    icon: PartyPopper,
    color: "text-purple-700",
    bg: "bg-purple-50 border-purple-200",
  },
};

function getInitials(name: string) {
  return (name ?? "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatTime(d: Date | string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", hour12: true });
}

export default function TodayBoardPage() {
  const { activeCompanyId } = useActiveCompany();
  const utils = trpc.useUtils();

  const { data, isLoading, error } = trpc.scheduling.getTodayBoard.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: !!activeCompanyId, refetchInterval: 60_000 }
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
        { key: "total" as const, label: "Scheduled", color: "text-foreground", bg: "bg-card" },
        { key: "checkedInActive" as const, label: "Checked in (active)", color: "text-emerald-700", bg: "bg-emerald-50" },
        { key: "notCheckedIn" as const, label: "Awaiting check-in", color: "text-amber-800", bg: "bg-amber-50" },
        { key: "lateNoCheckin" as const, label: "Late / no arrival", color: "text-orange-700", bg: "bg-orange-50" },
        { key: "absent" as const, label: "Absent (confirmed)", color: "text-red-700", bg: "bg-red-50" },
        { key: "checkedOut" as const, label: "Completed", color: "text-blue-700", bg: "bg-blue-50" },
      ]
    : [];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="text-primary" size={24} />
            Today&apos;s Attendance Board
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{today}</p>
          <p className="text-[11px] text-muted-foreground mt-1 max-w-lg">
            Absent is shown only after the scheduled shift ends with no check-in. Earlier in the day you&apos;ll see upcoming or awaiting check-in instead.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={handleRefresh}>
          <RefreshCw size={14} /> Refresh
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {summaryCards.map(({ key, label, color, bg }) => (
                <Card key={key} className={`${bg} border`}>
                  <CardContent className="p-4 text-center">
                    <div className={`text-2xl font-bold ${color}`}>{data.summary[key]}</div>
                    <div className="text-xs text-muted-foreground mt-1 leading-tight">{label}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
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
              {STATUS_ORDER.map((statusKey) => {
                const group = data.board.filter((b) => b.status === statusKey);
                if (!group.length) return null;
                const cfg = STATUS_CONFIG[statusKey];
                const Icon = cfg.icon;
                return (
                  <div key={statusKey}>
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-t-lg border-b ${cfg.bg} border`}>
                      <Icon size={14} className={cfg.color} />
                      <span className={`text-sm font-semibold ${cfg.color}`}>
                        {cfg.label} ({group.length})
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
                                    <span className="font-medium text-foreground">{formatTime(b.checkInAt)}</span>
                                  </div>
                                )}
                                {b.checkOutAt && (
                                  <div className="text-muted-foreground">
                                    Out:{" "}
                                    <span className="font-medium text-foreground">{formatTime(b.checkOutAt)}</span>
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
