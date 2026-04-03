import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CalendarDays, ChevronLeft, ChevronRight, TrendingUp, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getInitials(name: string) {
  return (name ?? "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function pct(val: number, total: number) {
  if (!total) return 0;
  return Math.round((val / total) * 100);
}

export default function MonthlyReportPage() {
  const { activeCompanyId } = useActiveCompany();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data, isLoading } = trpc.scheduling.getMonthlyReport.useQuery(
    { companyId: activeCompanyId ?? undefined, year, month },
    { enabled: !!activeCompanyId }
  );

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }

  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  const isCurrentOrFuture = year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);

  // data.report is the array of per-employee rows
  const report = data?.report ?? [];
  const holidays = data?.holidays ?? [];

  // Compute summary from report rows
  const totalScheduled = report.reduce((s, r) => s + r.scheduledDays, 0);
  const totalPresent = report.reduce((s, r) => s + r.presentDays, 0);
  const totalLate = report.reduce((s, r) => s + r.lateDays, 0);
  const totalAbsent = report.reduce((s, r) => s + r.absentDays, 0);
  const avgAttendancePct = report.length > 0
    ? Math.round(report.reduce((s, r) => s + r.attendanceRate, 0) / report.length)
    : 0;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="text-primary" size={24} />
            Monthly Attendance Report
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Per-employee attendance summary for the selected month
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 border rounded-lg overflow-hidden">
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={prevMonth}>
              <ChevronLeft size={16} />
            </Button>
            <span className="px-3 text-sm font-semibold min-w-[140px] text-center">
              {MONTHS[month - 1]} {year}
            </span>
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={nextMonth} disabled={isCurrentOrFuture}>
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-24" />
            </Card>
          ))}
        </div>
      ) : !report.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <CalendarDays size={40} className="opacity-30" />
            <p className="font-medium">No attendance data for {MONTHS[month - 1]} {year}</p>
            <p className="text-sm">Assign employee schedules and record attendance to see reports</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="bg-card">
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold">{holidays.length}</div>
                <div className="text-xs text-muted-foreground mt-1">Holidays</div>
              </CardContent>
            </Card>
            <Card className="bg-green-50">
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold text-green-700">{avgAttendancePct}%</div>
                <div className="text-xs text-muted-foreground mt-1">Avg Attendance</div>
              </CardContent>
            </Card>
            <Card className="bg-yellow-50">
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold text-yellow-700">{totalLate}</div>
                <div className="text-xs text-muted-foreground mt-1">Total Late</div>
              </CardContent>
            </Card>
            <Card className="bg-red-50">
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold text-red-700">{totalAbsent}</div>
                <div className="text-xs text-muted-foreground mt-1">Total Absent</div>
              </CardContent>
            </Card>
          </div>

          {/* Per-Employee Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Employee Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                      <th className="text-left pb-3 pr-4 font-medium">Employee</th>
                      <th className="text-center pb-3 px-2 font-medium">Scheduled</th>
                      <th className="text-center pb-3 px-2 font-medium">
                        <span className="flex items-center justify-center gap-1">
                          <CheckCircle2 size={12} className="text-green-600" /> Present
                        </span>
                      </th>
                      <th className="text-center pb-3 px-2 font-medium">
                        <span className="flex items-center justify-center gap-1">
                          <AlertCircle size={12} className="text-yellow-600" /> Late
                        </span>
                      </th>
                      <th className="text-center pb-3 px-2 font-medium">
                        <span className="flex items-center justify-center gap-1">
                          <XCircle size={12} className="text-red-600" /> Absent
                        </span>
                      </th>
                      <th className="text-center pb-3 pl-2 font-medium">
                        <span className="flex items-center justify-center gap-1">
                          <TrendingUp size={12} className="text-primary" /> Rate
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {report.map((row, idx) => {
                      const attendancePct = row.attendanceRate;
                      return (
                        <tr key={idx} className="hover:bg-muted/30 transition-colors">
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-7 w-7">
                                <AvatarFallback className="text-[10px] font-semibold">
                                  {getInitials(row.employee?.name ?? "?")}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="font-medium text-sm">{row.employee?.name ?? "Unknown"}</div>
                                <div className="text-[10px] text-muted-foreground">{row.employee?.email ?? ""}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-center font-medium">{row.scheduledDays}</td>
                          <td className="py-3 px-2 text-center">
                            <span className="font-semibold text-green-700">{row.presentDays}</span>
                          </td>
                          <td className="py-3 px-2 text-center">
                            <span className="font-semibold text-yellow-700">{row.lateDays}</span>
                          </td>
                          <td className="py-3 px-2 text-center">
                            <span className="font-semibold text-red-700">{row.absentDays}</span>
                          </td>
                          <td className="py-3 pl-2 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span
                                className={`text-xs font-bold ${
                                  attendancePct >= 90 ? "text-green-700" :
                                  attendancePct >= 75 ? "text-yellow-700" :
                                  "text-red-700"
                                }`}
                              >
                                {attendancePct}%
                              </span>
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    attendancePct >= 90 ? "bg-green-500" :
                                    attendancePct >= 75 ? "bg-yellow-500" :
                                    "bg-red-500"
                                  }`}
                                  style={{ width: `${attendancePct}%` }}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
