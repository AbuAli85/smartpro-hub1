import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CalendarDays, RefreshCw, Clock, CheckCircle2, AlertCircle, XCircle, PartyPopper, MapPin } from "lucide-react";

const STATUS_CONFIG = {
  on_time: {
    label: "On Time",
    icon: CheckCircle2,
    color: "text-green-600",
    bg: "bg-green-50 border-green-200",
    badge: "bg-green-100 text-green-700",
  },
  late: {
    label: "Late",
    icon: AlertCircle,
    color: "text-yellow-600",
    bg: "bg-yellow-50 border-yellow-200",
    badge: "bg-yellow-100 text-yellow-700",
  },
  absent: {
    label: "Absent",
    icon: XCircle,
    color: "text-red-600",
    bg: "bg-red-50 border-red-200",
    badge: "bg-red-100 text-red-700",
  },
  checked_out: {
    label: "Checked Out",
    icon: CheckCircle2,
    color: "text-blue-600",
    bg: "bg-blue-50 border-blue-200",
    badge: "bg-blue-100 text-blue-700",
  },
  holiday: {
    label: "Holiday",
    icon: PartyPopper,
    color: "text-purple-600",
    bg: "bg-purple-50 border-purple-200",
    badge: "bg-purple-100 text-purple-700",
  },
};

function getInitials(name: string) {
  return (name ?? "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
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
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="text-primary" size={24} />
            Today's Attendance Board
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{today}</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={handleRefresh}>
          <RefreshCw size={14} /> Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-20" />
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card className="border-destructive/50">
          <CardContent className="py-8 text-center text-destructive">
            Failed to load today's board. Please try again.
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
          {/* Summary Cards */}
          {data?.summary && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { key: "total", label: "Scheduled", color: "text-foreground", bg: "bg-card" },
                { key: "onTime", label: "On Time", color: "text-green-700", bg: "bg-green-50" },
                { key: "late", label: "Late", color: "text-yellow-700", bg: "bg-yellow-50" },
                { key: "absent", label: "Absent", color: "text-red-700", bg: "bg-red-50" },
                { key: "checkedOut", label: "Checked Out", color: "text-blue-700", bg: "bg-blue-50" },
              ].map(({ key, label, color, bg }) => (
                <Card key={key} className={`${bg} border`}>
                  <CardContent className="p-4 text-center">
                    <div className={`text-3xl font-bold ${color}`}>
                      {data.summary[key as keyof typeof data.summary]}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{label}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Board */}
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
              {["on_time", "late", "absent", "checked_out"].map((statusKey) => {
                const group = data.board.filter((b) => b.status === statusKey);
                if (!group.length) return null;
                const cfg = STATUS_CONFIG[statusKey as keyof typeof STATUS_CONFIG];
                return (
                  <div key={statusKey}>
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-t-lg border-b ${cfg.bg} border`}>
                      <cfg.icon size={14} className={cfg.color} />
                      <span className={`text-sm font-semibold ${cfg.color}`}>
                        {cfg.label} ({group.length})
                      </span>
                    </div>
                    <div className="space-y-1 mb-4">
                      {group.map((b) => (
                        <Card key={b.scheduleId} className={`border ${cfg.bg} rounded-t-none`}>
                          <CardContent className="p-3">
                            <div className="flex items-center gap-3">
                              <Avatar className="h-9 w-9">
                                <AvatarFallback className="text-xs font-semibold">
                                  {getInitials(b.employee?.name ?? "?")}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-sm">{b.employee?.name ?? "Unknown"}</span>
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
                              <div className="text-right text-xs">
                                {b.checkInAt && (
                                  <div className="text-muted-foreground">
                                    In: <span className="font-medium text-foreground">{formatTime(b.checkInAt)}</span>
                                  </div>
                                )}
                                {b.checkOutAt && (
                                  <div className="text-muted-foreground">
                                    Out: <span className="font-medium text-foreground">{formatTime(b.checkOutAt)}</span>
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
