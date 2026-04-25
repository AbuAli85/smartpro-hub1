/**
 * Employee self-service attendance page.
 * Route: /my-portal/attendance
 *
 * Tabs:
 *   Today   — current shift + check-in/out status
 *   History — past attendance records (paginated)
 *   Requests — manual check-in + correction requests
 */
import { useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Clock, CalendarDays, ListChecks, CheckCircle2, XCircle } from "lucide-react";
import { muscatCalendarYmdNow } from "@shared/attendanceMuscatTime";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Muscat",
  });
}

function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Muscat",
  });
}

function statusBadge(status: string) {
  switch (status) {
    case "approved":
      return <Badge className="bg-green-100 text-green-800">Approved</Badge>;
    case "rejected":
      return <Badge className="bg-red-100 text-red-800">Rejected</Badge>;
    case "pending":
      return <Badge variant="secondary">Pending</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

// ---------------------------------------------------------------------------
// Today tab
// ---------------------------------------------------------------------------

function TodayTab() {
  const todayQ = trpc.attendance.myToday.useQuery({});
  const shiftsQ = trpc.attendance.myTodayShifts.useQuery({}, {
    retry: false,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Today&apos;s Attendance</CardTitle>
        </CardHeader>
        <CardContent>
          {todayQ.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : todayQ.data ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">Checked in</span>
                <span className="text-sm text-muted-foreground">at {formatTime(todayQ.data.checkIn)}</span>
              </div>
              {todayQ.data.checkOut ? (
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-gray-400" />
                  <span className="text-sm">Checked out at {formatTime(todayQ.data.checkOut)}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-500 animate-pulse" />
                  <span className="text-sm text-blue-600">Session still open</span>
                </div>
              )}
              {todayQ.data.siteName && (
                <p className="text-xs text-muted-foreground">Site: {todayQ.data.siteName}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No check-in recorded for today.</p>
          )}
        </CardContent>
      </Card>

      {shiftsQ.data && shiftsQ.data.shifts && shiftsQ.data.shifts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Today&apos;s Shifts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {shiftsQ.data.shifts.map((shift: any, i: number) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  <span>{shift.shiftName ?? "Shift"}</span>
                  <span className="text-muted-foreground">
                    {shift.startTime} – {shift.endTime}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// History tab
// ---------------------------------------------------------------------------

function HistoryTab() {
  const currentMonth = muscatCalendarYmdNow().slice(0, 7);
  const historyQ = trpc.employeePortal.getMyAttendanceRecords.useQuery(
    { month: currentMonth },
    { retry: false },
  );

  const records = historyQ.data?.records ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Recent Attendance</CardTitle>
        <CardDescription>Current month — {records.length} records</CardDescription>
      </CardHeader>
      <CardContent>
        {historyQ.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : records.length > 0 ? (
          <div className="divide-y">
            {records.map((rec: any, i: number) => (
              <div key={rec.id ?? i} className="py-2 flex items-center justify-between gap-4 text-sm">
                <span className="font-medium">{rec.businessDate ?? rec.date ?? "—"}</span>
                <span className="text-muted-foreground">
                  {rec.shiftName ?? rec.shiftStart ?? "—"}
                  {rec.shiftStart && rec.shiftEnd ? ` (${rec.shiftStart}–${rec.shiftEnd})` : ""}
                </span>
                <Badge variant="outline" className="text-xs capitalize">
                  {rec.completionStatus ?? rec.status ?? "—"}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No attendance records found.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Requests tab
// ---------------------------------------------------------------------------

function RequestsTab() {
  const manualsQ = trpc.attendance.myManualCheckIns.useQuery({}, { retry: false });
  const correctionsQ = trpc.attendance.myCorrections.useQuery({}, { retry: false });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Manual Check-in Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {manualsQ.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (manualsQ.data?.length ?? 0) > 0 ? (
            <div className="divide-y">
              {(manualsQ.data ?? []).map((req: any) => (
                <div key={req.req?.id ?? req.id} className="py-2 flex items-center justify-between gap-4 text-sm">
                  <span>{formatDate(req.req?.requestedAt ?? req.requestedAt)}</span>
                  {statusBadge(req.req?.status ?? req.status)}
                  {(req.req?.adminNote ?? req.adminNote) && (
                    <span className="text-xs text-muted-foreground">{req.req?.adminNote ?? req.adminNote}</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No manual check-in requests.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Correction Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {correctionsQ.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (correctionsQ.data?.length ?? 0) > 0 ? (
            <div className="divide-y">
              {(correctionsQ.data ?? []).map((req: any) => (
                <div key={req.id} className="py-2 flex items-center justify-between gap-4 text-sm">
                  <span>{formatDate(req.requestedDate)}</span>
                  {statusBadge(req.status)}
                  {req.adminNote && (
                    <span className="text-xs text-muted-foreground">{req.adminNote}</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No correction requests.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EmployeeAttendancePage() {
  const [tab, setTab] = useState("today");

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/my-portal">
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            Portal
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold">My Attendance</h1>
          <p className="text-sm text-muted-foreground">Your check-ins, history, and requests.</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="today" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Clock className="h-3.5 w-3.5" />
            Today
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <CalendarDays className="h-3.5 w-3.5" />
            History
          </TabsTrigger>
          <TabsTrigger value="requests" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <ListChecks className="h-3.5 w-3.5" />
            Requests
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="mt-4">
          <TodayTab />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryTab />
        </TabsContent>

        <TabsContent value="requests" className="mt-4">
          <RequestsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
