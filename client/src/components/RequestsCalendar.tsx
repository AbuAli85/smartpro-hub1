import React, { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft, ChevronRight, Plus, X, Calendar,
  Clock, ArrowLeftRight, FileText,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
interface ShiftRequest {
  request: {
    id: number;
    requestType: string;
    requestedDate: string;
    requestedEndDate?: string | null;
    requestedTime?: string | null;
    reason: string;
    status: "pending" | "approved" | "rejected" | "cancelled";
    adminNotes?: string | null;
    createdAt: string | Date;
  };
  preferredShift?: {
    id: number;
    name: string;
    startTime: string;
    endTime: string;
  } | null;
}

interface RequestsCalendarProps {
  requests: ShiftRequest[];
  month: number; // 0-based
  year: number;
  onMonthChange: (month: number, year: number) => void;
  selectedDay: string | null;
  onDaySelect: (day: string | null) => void;
  onCancel: (id: number) => void;
  onNewRequest: () => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const TYPE_LABELS: Record<string, string> = {
  shift_change: "Shift Change",
  time_off: "Time Off",
  early_leave: "Early Leave",
  late_arrival: "Late Arrival",
  day_swap: "Day Swap",
};

const STATUS_STYLES: Record<string, { dot: string; bg: string; border: string; text: string; badge: string }> = {
  approved:  { dot: "bg-green-500",  bg: "bg-green-50 dark:bg-green-950/20",  border: "border-green-200 dark:border-green-800",  text: "text-green-700 dark:text-green-400",  badge: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" },
  pending:   { dot: "bg-amber-400",  bg: "bg-amber-50 dark:bg-amber-950/20",  border: "border-amber-200 dark:border-amber-800",  text: "text-amber-700 dark:text-amber-400",  badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" },
  rejected:  { dot: "bg-red-500",    bg: "bg-red-50 dark:bg-red-950/20",      border: "border-red-200 dark:border-red-800",      text: "text-red-700 dark:text-red-400",      badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" },
  cancelled: { dot: "bg-gray-400",   bg: "bg-gray-50 dark:bg-gray-900/20",    border: "border-gray-200 dark:border-gray-700",    text: "text-gray-500 dark:text-gray-400",    badge: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Returns all YYYY-MM-DD strings covered by a request (including multi-day ranges)
function getRequestDays(req: ShiftRequest["request"]): string[] {
  const start = req.requestedDate;
  const end = req.requestedEndDate || start;
  const days: string[] = [];
  const cur = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");
  while (cur <= endDate) {
    days.push(cur.toISOString().split("T")[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

// ── Component ────────────────────────────────────────────────────────────────
export function RequestsCalendar({
  requests,
  month,
  year,
  onMonthChange,
  selectedDay,
  onDaySelect,
  onCancel,
  onNewRequest,
}: RequestsCalendarProps) {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  // Build a map: dateStr → list of requests that cover that date
  const dayMap = useMemo(() => {
    const map = new Map<string, ShiftRequest[]>();
    for (const item of requests) {
      const days = getRequestDays(item.request);
      for (const d of days) {
        if (!map.has(d)) map.set(d, []);
        map.get(d)!.push(item);
      }
    }
    return map;
  }, [requests]);

  // Calendar grid
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => {
    if (month === 0) onMonthChange(11, year - 1);
    else onMonthChange(month - 1, year);
  };
  const nextMonth = () => {
    if (month === 11) onMonthChange(0, year + 1);
    else onMonthChange(month + 1, year);
  };

  const selectedItems = selectedDay ? (dayMap.get(selectedDay) ?? []) : [];

  return (
    <div className="space-y-4">
      {/* ── Calendar Card ── */}
      <Card>
        <CardContent className="p-4">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={prevMonth}
              className="p-1.5 rounded-md hover:bg-muted transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h3 className="font-semibold text-sm">
              {MONTH_NAMES[month]} {year}
            </h3>
            <button
              onClick={nextMonth}
              className="p-1.5 rounded-md hover:bg-muted transition-colors"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_NAMES.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-y-1">
            {cells.map((day, idx) => {
              if (!day) return <div key={`empty-${idx}`} />;
              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const items = dayMap.get(dateStr) ?? [];
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDay;

              // Collect unique statuses for dots
              const statuses = Array.from(new Set(items.map((i) => i.request.status)));

              return (
                <button
                  key={dateStr}
                  onClick={() => onDaySelect(isSelected ? null : dateStr)}
                  className={`
                    relative flex flex-col items-center justify-start py-1.5 px-0.5 rounded-lg text-xs transition-all
                    ${isSelected ? "ring-2 ring-primary bg-primary/5" : "hover:bg-muted"}
                    ${isToday ? "font-bold" : ""}
                  `}
                >
                  {/* Date number */}
                  <span
                    className={`
                      w-6 h-6 flex items-center justify-center rounded-full text-xs
                      ${isToday ? "bg-primary text-primary-foreground" : ""}
                    `}
                  >
                    {day}
                  </span>

                  {/* Status dots */}
                  {statuses.length > 0 && (
                    <div className="flex items-center gap-0.5 mt-0.5 flex-wrap justify-center">
                      {statuses.slice(0, 3).map((s) => (
                        <span
                          key={s}
                          className={`w-1.5 h-1.5 rounded-full ${STATUS_STYLES[s]?.dot ?? "bg-gray-400"}`}
                        />
                      ))}
                    </div>
                  )}

                  {/* Count badge for many requests */}
                  {items.length > 1 && (
                    <span className="absolute top-0.5 right-0.5 text-[9px] text-muted-foreground font-medium">
                      {items.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Day Detail Panel ── */}
      {selectedDay && (
        <Card className="border-primary/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" />
                {new Date(selectedDay + "T12:00:00").toLocaleDateString(undefined, {
                  weekday: "long", year: "numeric", month: "long", day: "numeric",
                })}
              </h4>
              <button
                onClick={() => onDaySelect(null)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {selectedItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 gap-3 text-muted-foreground">
                <ArrowLeftRight className="w-8 h-8 opacity-20" />
                <p className="text-sm">No requests on this day</p>
                <Button size="sm" variant="outline" onClick={onNewRequest} className="gap-1.5 text-xs">
                  <Plus className="w-3 h-3" /> Submit a Request for This Day
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedItems.map((item) => {
                  const req = item.request;
                  const ps = item.preferredShift;
                  const sc = STATUS_STYLES[req.status] ?? STATUS_STYLES.cancelled;
                  return (
                    <div
                      key={req.id}
                      className={`rounded-lg border p-3 ${sc.bg} ${sc.border}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">
                              {TYPE_LABELS[req.requestType] ?? req.requestType}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc.badge}`}>
                              {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                            </span>
                          </div>

                          {/* Date range */}
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {req.requestedDate}
                            {req.requestedEndDate && req.requestedEndDate !== req.requestedDate
                              ? ` → ${req.requestedEndDate}`
                              : ""}
                            {req.requestedTime ? ` at ${req.requestedTime}` : ""}
                          </p>

                          {/* Reason */}
                          <p className="text-xs mt-1">{req.reason}</p>

                          {/* Preferred shift */}
                          {ps && (
                            <p className="text-xs text-primary mt-0.5 flex items-center gap-1">
                              <ArrowLeftRight className="w-3 h-3" />
                              Preferred: {ps.name} ({ps.startTime}–{ps.endTime})
                            </p>
                          )}

                          {/* Admin notes */}
                          {req.adminNotes && (
                            <div className={`mt-2 p-2 rounded text-xs italic ${sc.bg} border ${sc.border}`}>
                              <span className="font-medium not-italic">HR Note: </span>
                              {req.adminNotes}
                            </div>
                          )}

                          {/* Submitted date */}
                          <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                            <FileText className="w-3 h-3" />
                            Submitted {new Date(req.createdAt).toLocaleDateString()}
                          </p>
                        </div>

                        {/* Cancel button for pending */}
                        {req.status === "pending" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-destructive hover:text-destructive shrink-0"
                            onClick={() => onCancel(req.id)}
                          >
                            <X className="w-3 h-3 mr-1" /> Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Add another request for this day */}
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-1.5 text-xs"
                  onClick={onNewRequest}
                >
                  <Plus className="w-3 h-3" /> Add Another Request
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Month Summary ── */}
      <Card>
        <CardContent className="p-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            {MONTH_NAMES[month]} {year} — Summary
          </h4>
          {(() => {
            const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
            const monthItems = requests.filter((item) => {
              const d = item.request.requestedDate;
              const end = item.request.requestedEndDate || d;
              return d.startsWith(monthStr) || end.startsWith(monthStr);
            });
            if (monthItems.length === 0) {
              return (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No requests in {MONTH_NAMES[month]}
                </p>
              );
            }
            const counts = monthItems.reduce(
              (acc, item) => {
                acc[item.request.status] = (acc[item.request.status] ?? 0) + 1;
                return acc;
              },
              {} as Record<string, number>
            );
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(["approved", "pending", "rejected", "cancelled"] as const).map((s) => {
                  const count = counts[s] ?? 0;
                  const sc = STATUS_STYLES[s];
                  return (
                    <div
                      key={s}
                      className={`rounded-lg border p-3 text-center ${sc.bg} ${sc.border}`}
                    >
                      <div className={`text-xl font-bold ${sc.text}`}>{count}</div>
                      <div className={`text-xs mt-0.5 ${sc.text}`}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
