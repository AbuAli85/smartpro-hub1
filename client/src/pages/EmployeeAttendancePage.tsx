/**
 * Employee self-service attendance page.
 * Route: /my-portal/attendance/:tab?
 *
 * Tabs:
 *   today    — check-in/out via AttendanceTodayCard
 *   history  — monthly records with month navigation
 *   requests — correction + manual check-in requests (with sanitized admin notes)
 */
import { useState } from "react";
import { Link, useLocation, Redirect } from "wouter";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Clock,
  CalendarDays,
  ListChecks,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import AttendanceTodayCard from "@/components/employee-portal/AttendanceTodayCard";
import { type ProfileEmpData } from "@/lib/employeeProfileUtils";
import { type ServerEligibilityHints } from "@/lib/employeePortalOverviewPresentation";

const VALID_TABS = ["today", "history", "requests"] as const;
type TabId = typeof VALID_TABS[number];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeAdminNote(note: string | null | undefined): string | null {
  if (!note) return null;
  // Suppress raw server reason codes like "REASON_CODE_ALL_CAPS"
  if (/^[A-Z][A-Z_]{2,}$/.test(note.trim())) return null;
  return note;
}

function statusBadge(status: string) {
  if (status === "approved")
    return <Badge className="bg-green-100 text-green-800 border-green-300">Approved</Badge>;
  if (status === "rejected")
    return <Badge className="bg-red-100 text-red-800 border-red-300">Rejected</Badge>;
  return <Badge variant="secondary">Pending</Badge>;
}

// ---------------------------------------------------------------------------
// History tab
// ---------------------------------------------------------------------------

function HistoryTab({ activeCompanyId }: { activeCompanyId: number | null }) {
  const [attMonth, setAttMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const today = new Date();
  const maxMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  function prevMonth() {
    const [y, m] = attMonth.split("-").map(Number);
    const d = new Date(y!, m! - 1, 1);
    d.setMonth(d.getMonth() - 1);
    setAttMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  function nextMonth() {
    const [y, m] = attMonth.split("-").map(Number);
    const d = new Date(y!, m! - 1, 1);
    d.setMonth(d.getMonth() + 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (next <= maxMonth) setAttMonth(next);
  }

  const summaryQ = trpc.employeePortal.getMyAttendanceSummary.useQuery(
    { month: attMonth, companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null, retry: false },
  );
  const recordsQ = trpc.employeePortal.getMyAttendanceRecords.useQuery(
    { month: attMonth, companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null, retry: false },
  );

  const summary = summaryQ.data?.summary ?? null;
  const records = recordsQ.data?.records ?? [];
  const [monthLabel] = (() => {
    const [y, m] = attMonth.split("-").map(Number);
    const d = new Date(y!, m! - 1, 1);
    return [d.toLocaleDateString("en-GB", { month: "long", year: "numeric" })];
  })();

  return (
    <div className="space-y-3">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">{monthLabel}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={nextMonth}
          disabled={attMonth >= maxMonth}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-3 gap-2">
          <Card className="bg-green-50 dark:bg-green-950/20 border-0">
            <CardContent className="p-2.5 text-center">
              <p className="text-xl font-bold text-green-700">{summary.present ?? 0}</p>
              <p className="text-xs text-muted-foreground">Present</p>
            </CardContent>
          </Card>
          <Card className="bg-amber-50 dark:bg-amber-950/20 border-0">
            <CardContent className="p-2.5 text-center">
              <p className="text-xl font-bold text-amber-700">{summary.late ?? 0}</p>
              <p className="text-xs text-muted-foreground">Late</p>
            </CardContent>
          </Card>
          <Card className="bg-red-50 dark:bg-red-950/20 border-0">
            <CardContent className="p-2.5 text-center">
              <p className="text-xl font-bold text-red-700">{summary.absent ?? 0}</p>
              <p className="text-xs text-muted-foreground">Absent</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Records list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Records</CardTitle>
          <CardDescription>{records.length} entries</CardDescription>
        </CardHeader>
        <CardContent>
          {recordsQ.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : records.length > 0 ? (
            <div className="divide-y">
              {records.map((rec: any, i: number) => (
                <div key={rec.id ?? i} className="py-2 flex items-center justify-between gap-4 text-sm">
                  <span className="font-medium">{rec.businessDate ?? rec.date ?? "—"}</span>
                  <span className="text-muted-foreground text-xs">
                    {rec.shiftName ?? "—"}
                    {rec.shiftStart && rec.shiftEnd ? ` (${rec.shiftStart}–${rec.shiftEnd})` : ""}
                  </span>
                  <Badge variant="outline" className="text-xs capitalize shrink-0">
                    {rec.completionStatus ?? rec.status ?? "—"}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No attendance records for this month.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Requests tab
// ---------------------------------------------------------------------------

function RequestsTab({ activeCompanyId }: { activeCompanyId: number | null }) {
  const manualsQ = trpc.attendance.myManualCheckIns.useQuery(
    {},
    { enabled: activeCompanyId != null, retry: false },
  );
  const correctionsQ = trpc.attendance.myCorrections.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null, retry: false },
  );

  return (
    <div className="space-y-4">
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
                <div key={req.id} className="py-2 space-y-1 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-medium">{req.requestedDate ?? "—"}</span>
                    {statusBadge(req.status)}
                  </div>
                  {req.reason && (
                    <p className="text-xs text-muted-foreground">{req.reason}</p>
                  )}
                  {req.status === "approved" && (
                    <p className="text-[11px] text-emerald-800 dark:text-emerald-200/90">
                      Approved{sanitizeAdminNote(req.adminNote) ? ` — HR note: ${sanitizeAdminNote(req.adminNote)}` : " — times updated by HR."}
                    </p>
                  )}
                  {req.status === "rejected" && (
                    <p className="text-[11px] text-red-800 dark:text-red-200/90">
                      Not approved{sanitizeAdminNote(req.adminNote) ? ` — HR: ${sanitizeAdminNote(req.adminNote)}` : "."} Contact HR if you disagree.
                    </p>
                  )}
                  {req.status === "pending" && (
                    <p className="text-[11px] text-muted-foreground">With HR for review.</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No correction requests.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Manual Check-in Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {manualsQ.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (manualsQ.data?.length ?? 0) > 0 ? (
            <div className="divide-y">
              {(manualsQ.data ?? []).map((row: any) => {
                const req = row.req ?? row;
                const reqSite = row.site;
                return (
                  <div key={req.id} className="py-2 space-y-1 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-medium truncate">{reqSite?.name ?? "Attendance site"}</span>
                      {statusBadge(req.status)}
                    </div>
                    {req.justification && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{req.justification}</p>
                    )}
                    {req.requestedAt && (
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(req.requestedAt).toLocaleString()}
                      </p>
                    )}
                    {req.status === "approved" && sanitizeAdminNote(req.adminNote) && (
                      <p className="text-[11px] text-emerald-800 dark:text-emerald-200/90">
                        HR note: {sanitizeAdminNote(req.adminNote)}
                      </p>
                    )}
                    {req.status === "rejected" && sanitizeAdminNote(req.adminNote) && (
                      <p className="text-[11px] text-red-800 dark:text-red-200/90">
                        HR: {sanitizeAdminNote(req.adminNote)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No manual check-in requests.</p>
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
  const [location, navigate] = useLocation();
  const rawTab = location.match(/^\/my-portal\/attendance\/(.+)$/)?.[1] ?? "today";
  const activeTab = VALID_TABS.includes(rawTab as TabId) ? (rawTab as TabId) : null;

  const { activeCompanyId } = useActiveCompany();

  // Queries needed for Today tab (loaded unconditionally since it's the default)
  const { data: profile } = trpc.employeePortal.getMyProfile.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );
  const { data: myActiveSchedule } = trpc.scheduling.getMyActiveSchedule.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null, refetchOnWindowFocus: true, refetchInterval: 120_000 },
  );
  const { data: operationalHints, isSuccess: operationalHintsReady } =
    trpc.employeePortal.getMyOperationalHints.useQuery(
      { companyId: activeCompanyId ?? undefined },
      { enabled: activeCompanyId != null },
    );

  const emp = profile as ProfileEmpData | undefined;

  // Redirect invalid tabs
  if (!activeTab) {
    return <Redirect to="/my-portal/attendance/today" />;
  }

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <Link href="/my-portal">
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            Portal
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold">My Attendance</h1>
          <p className="text-sm text-muted-foreground">Check-ins, history, and requests.</p>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(val) => navigate(`/my-portal/attendance/${val}`)}
      >
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
          <AttendanceTodayCard
            employeeId={emp?.id ?? null}
            companyId={activeCompanyId}
            todaySchedule={myActiveSchedule}
            operationalHints={operationalHintsReady ? (operationalHints as ServerEligibilityHints | null | undefined) ?? null : undefined}
            operationalHintsReady={operationalHintsReady}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryTab activeCompanyId={activeCompanyId} />
        </TabsContent>

        <TabsContent value="requests" className="mt-4">
          <RequestsTab activeCompanyId={activeCompanyId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
