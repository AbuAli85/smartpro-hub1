import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle, CheckCircle2, Clock, FileText, Users, TrendingUp,
  Briefcase, Calendar, ChevronRight, Activity, Target, Shield,
  Bell, RefreshCw, UserCheck,
} from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNow, format } from "date-fns";

function KpiCard({
  label, value, sub, icon: Icon, color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground font-medium">{label}</p>
            <p className="text-3xl font-black mt-1 tracking-tight">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function OperationsDashboardPage() {
  const { activeCompanyId } = useActiveCompany();
  const { data: snapshot, isLoading, refetch } = trpc.operations.getDailySnapshot.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { refetchInterval: 5 * 60 * 1000, enabled: activeCompanyId != null },
  );
  const { data: hrStats } = trpc.hr.getDashboardStats.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );

  const now = new Date();

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-sm">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Operations Overview</h1>
            <p className="text-sm text-muted-foreground">
              {format(now, "EEEE, d MMMM yyyy")} · Track delivery health, workload, and execution
              performance. Critical actions are managed in Control Tower.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2 shrink-0">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </div>

      {/* Control Tower blockers card */}
      <Card role="region" aria-label="Control Tower blockers" className="border-border/60 bg-muted/10">
        <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Need to act on blockers?</p>
            <p className="text-xs text-muted-foreground">
              Live priority signals, pending approvals, and compliance alerts are managed in Control
              Tower.
            </p>
          </div>
          <Button variant="outline" size="sm" className="shrink-0 text-xs" asChild>
            <Link href="/control-tower">Open Control Tower</Link>
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="border-0 shadow-sm animate-pulse">
              <CardContent className="p-5 h-24 bg-muted/30 rounded-xl" />
            </Card>
          ))}
        </div>
      ) : (
        <>
          {/* KPI row 1 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Open Cases"
              value={snapshot?.openCases.total ?? 0}
              sub={`${snapshot?.casesDueToday.length ?? 0} due today`}
              icon={Briefcase}
              color="bg-blue-500"
            />
            <KpiCard
              label="SLA Breaches"
              value={snapshot?.slaBreaches ?? 0}
              sub="Require immediate action"
              icon={AlertTriangle}
              color={snapshot?.slaBreaches ? "bg-red-500" : "bg-green-500"}
            />
            <KpiCard
              label="Revenue MTD"
              value={`OMR ${(snapshot?.revenueMtdOmr ?? 0).toFixed(3)}`}
              sub="Month to date, paid"
              icon={TrendingUp}
              color="bg-emerald-500"
            />
            <KpiCard
              label="Expiring Docs"
              value={snapshot?.expiringDocs7Days ?? 0}
              sub="Within 7 days"
              icon={Clock}
              color={snapshot?.expiringDocs7Days ? "bg-orange-500" : "bg-green-500"}
            />
          </div>

          {/* KPI row 2 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Pending Contracts"
              value={snapshot?.pendingContracts ?? 0}
              sub="Awaiting signature"
              icon={FileText}
              color="bg-indigo-500"
            />
            <KpiCard
              label="Leave Requests"
              value={snapshot?.pendingLeaveRequests ?? 0}
              sub="Pending approval"
              icon={Calendar}
              color="bg-purple-500"
            />
            <KpiCard
              label="Active Workflows"
              value={snapshot?.activeWorkflows ?? 0}
              sub="Renewal workflows"
              icon={RefreshCw}
              color="bg-teal-500"
            />
            <KpiCard
              label="Draft Quotations"
              value={snapshot?.draftQuotations ?? 0}
              sub="Not yet sent"
              icon={Target}
              color="bg-amber-500"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left — execution visibility */}
            <div className="lg:col-span-2 space-y-4">
              {hrStats && (
                <Card className="shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-emerald-500" />
                        Today's Workforce Status
                      </CardTitle>
                      <Link href="/hr/attendance">
                        <Button variant="ghost" size="sm" className="text-xs gap-1 h-6">
                          View All <ChevronRight className="w-3 h-3" />
                        </Button>
                      </Link>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-emerald-50 rounded-xl p-3 text-center">
                        <p className="text-2xl font-black text-emerald-700">{hrStats.todayPresent}</p>
                        <p className="text-[10px] text-emerald-600 font-medium uppercase tracking-wide mt-0.5">Present</p>
                      </div>
                      <div className="bg-red-50 rounded-xl p-3 text-center">
                        <p className="text-2xl font-black text-red-700">{hrStats.todayAbsent}</p>
                        <p className="text-[10px] text-red-600 font-medium uppercase tracking-wide mt-0.5">Absent</p>
                      </div>
                      <div className="bg-amber-50 rounded-xl p-3 text-center">
                        <p className="text-2xl font-black text-amber-700">{hrStats.pendingLeave}</p>
                        <p className="text-[10px] text-amber-600 font-medium uppercase tracking-wide mt-0.5">On Leave</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Attendance Rate</span>
                      <span className="font-semibold">
                        {hrStats.activeEmployees > 0
                          ? Math.round((hrStats.todayPresent / hrStats.activeEmployees) * 100)
                          : 0}%
                      </span>
                    </div>
                    <Progress
                      value={
                        hrStats.activeEmployees > 0
                          ? Math.round((hrStats.todayPresent / hrStats.activeEmployees) * 100)
                          : 0
                      }
                      className="h-2"
                    />
                    {hrStats.kpiAvgPct > 0 && (
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-border">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" /> KPI Average
                        </span>
                        <span className="font-semibold text-blue-600">{hrStats.kpiAvgPct}%</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right column */}
            <div className="space-y-4">
              {/* Officer workload */}
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-500" />
                    Officer Workload
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(snapshot?.officerWorkload?.length ?? 0) === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No officers assigned</p>
                  ) : (
                    snapshot?.officerWorkload.slice(0, 5).map((officer) => {
                      const capacity = officer.capacity ?? 20;
                      const pct = Math.min(
                        100,
                        Math.round((Number(officer.activeAssignments) / capacity) * 100),
                      );
                      return (
                        <div key={officer.officerId}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-medium truncate">{officer.name}</span>
                            <span className="text-muted-foreground">
                              {officer.activeAssignments}/{capacity}
                            </span>
                          </div>
                          <Progress
                            value={pct}
                            className={`h-1.5 ${pct >= 90 ? "[&>div]:bg-red-500" : pct >= 70 ? "[&>div]:bg-orange-500" : "[&>div]:bg-green-500"}`}
                          />
                        </div>
                      );
                    })
                  )}
                  <Link href="/omani-officers">
                    <Button variant="ghost" size="sm" className="w-full text-xs mt-2 gap-1">
                      Manage Officers <ChevronRight className="w-3 h-3" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              {/* Source module navigation */}
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold">Go to source module</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {(
                    [
                      { label: "Engagements Ops", href: "/engagements/ops", icon: Briefcase },
                      { label: "Tasks", href: "/operations/tasks", icon: CheckCircle2 },
                      { label: "HR & Attendance", href: "/hr/attendance", icon: UserCheck },
                      { label: "Payroll", href: "/payroll", icon: TrendingUp },
                      { label: "Compliance Center", href: "/compliance", icon: Shield },
                    ] as const
                  ).map((link) => (
                    <Link key={link.href} href={link.href}>
                      <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-xs">
                        <link.icon className="w-3.5 h-3.5 text-orange-500" />
                        {link.label}
                      </Button>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Recent activity */}
          {(snapshot?.recentActivity?.length ?? 0) > 0 && (
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Bell className="w-4 h-4 text-slate-500" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {snapshot?.recentActivity.slice(0, 6).map((event) => (
                    <div key={event.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                        <Activity className="w-3.5 h-3.5 text-slate-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          {event.action?.replace(/_/g, " ")} · {event.entityType?.replace(/_/g, " ")} #{event.entityId}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {event.createdAt
                            ? formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })
                            : "—"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
