/**
 * OverdueCheckoutsPanel
 * Manager / HR summary of employees who are still clocked in after their shift ended.
 * Refreshes automatically every 60 seconds.
 */
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AlertTriangle, Clock, MapPin, RefreshCw } from "lucide-react";
import { fmtTime } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function overdueLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m overdue`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m overdue` : `${h}h overdue`;
}

function overdueSeverity(minutes: number): "low" | "medium" | "high" {
  if (minutes >= 60) return "high";
  if (minutes >= 20) return "medium";
  return "low";
}

const SEVERITY_BADGE: Record<string, string> = {
  low: "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
  medium: "border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300",
  high: "border-red-300 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300",
};

const SEVERITY_AVATAR: Record<string, string> = {
  low: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  medium: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

export function OverdueCheckoutsPanel({ className }: { className?: string }) {
  const { activeCompanyId } = useActiveCompany();

  const { data, isLoading, isFetching, dataUpdatedAt, refetch } =
    trpc.scheduling.getOverdueCheckouts.useQuery(
      { companyId: activeCompanyId ?? undefined },
      {
        enabled: activeCompanyId != null,
        refetchInterval: 60_000,
        refetchOnWindowFocus: true,
      }
    );

  const overdue = data?.overdueEmployees ?? [];
  const updatedAt = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  if (isLoading) {
    return (
      <Card className={cn("border-orange-200/60", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
            Still Clocked In After Shift
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        overdue.length > 0
          ? "border-orange-300/70 bg-orange-50/30 dark:border-orange-700/40 dark:bg-orange-950/10"
          : "border-border",
        className
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle
              className={cn(
                "w-4 h-4",
                overdue.length > 0 ? "text-orange-500" : "text-muted-foreground"
              )}
            />
            Still Clocked In After Shift
            {overdue.length > 0 && (
              <Badge
                variant="outline"
                className="ml-1 border-orange-300 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 text-[10px] px-1.5 py-0 font-bold"
              >
                {overdue.length}
              </Badge>
            )}
          </CardTitle>
          <button
            onClick={() => void refetch()}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh"
            aria-label="Refresh overdue list"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
          </button>
        </div>
        {updatedAt && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Updated {updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {overdue.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
            <Clock className="w-8 h-8 opacity-30" />
            <p className="text-sm font-medium">All clear</p>
            <p className="text-xs text-center leading-snug">
              No employees are clocked in past their shift end time.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {overdue.map((emp) => {
              const sev = overdueSeverity(emp.minutesOverdue);
              return (
                <div
                  key={emp.employeeUserId}
                  className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/70 px-3 py-2.5"
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className={cn("text-xs font-semibold", SEVERITY_AVATAR[sev])}>
                      {initials(emp.employeeDisplayName)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate leading-tight">
                      {emp.employeeDisplayName}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                      {emp.shiftName && (
                        <span className="text-[11px] text-muted-foreground truncate">
                          {emp.shiftName}
                        </span>
                      )}
                      {emp.siteName && (
                        <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                          <MapPin className="w-2.5 h-2.5 shrink-0" />
                          {emp.siteName}
                        </span>
                      )}
                      <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                        <Clock className="w-2.5 h-2.5 shrink-0" />
                        In: {fmtTime(emp.checkInAt)} · End: {emp.expectedEnd}
                      </span>
                    </div>
                  </div>

                  <Badge
                    variant="outline"
                    className={cn("text-[10px] font-semibold shrink-0 whitespace-nowrap", SEVERITY_BADGE[sev])}
                  >
                    {overdueLabel(emp.minutesOverdue)}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
