import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle, CheckCircle2, Clock, FileText, Users, TrendingUp,
  Briefcase, Calendar, ChevronRight, Activity, Target, Zap,
  Shield, BarChart3, Bell, ArrowRight, RefreshCw, Timer
} from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNow, format } from "date-fns";

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    critical: "bg-red-100 text-red-700 border-red-200",
    high: "bg-orange-100 text-orange-700 border-orange-200",
    medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
    low: "bg-green-100 text-green-700 border-green-200",
    ok: "bg-green-100 text-green-700 border-green-200",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${map[severity] ?? map.low}`}>
      {severity.toUpperCase()}
    </span>
  );
}

function KpiCard({ label, value, sub, icon: Icon, color }: { label: string; value: string | number; sub?: string; icon: React.ElementType; color: string }) {
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
    { refetchInterval: 5 * 60 * 1000, enabled: activeCompanyId != null }
  );
  const { data: insights } = trpc.operations.getAiInsights.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: tasks } = trpc.operations.getTodaysTasks.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });

  const now = new Date();

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-sm">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">Operations Command Centre</h1>
              <p className="text-sm text-muted-foreground">
                {format(now, "EEEE, d MMMM yyyy")} · SmartPRO Business Services Hub
              </p>
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </div>

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
          {/* KPI Row */}
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
            {/* AI Insights */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-orange-500" />
                <h2 className="font-bold text-base">AI Insights & Alerts</h2>
              </div>
              <div className="space-y-3">
                {insights?.map((insight, i) => (
                  <Card key={i} className={`border-l-4 ${insight.severity === "critical" ? "border-l-red-500" : insight.severity === "high" ? "border-l-orange-500" : insight.severity === "medium" ? "border-l-yellow-500" : "border-l-green-500"} shadow-sm`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <SeverityBadge severity={insight.severity} />
                            <span className="font-semibold text-sm">{insight.title}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{insight.description}</p>
                        </div>
                        <Link href={insight.actionUrl}>
                          <Button size="sm" variant="outline" className="shrink-0 text-xs gap-1">
                            {insight.actionLabel}
                            <ArrowRight className="w-3 h-3" />
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Cases Due Today */}
              {(tasks?.casesDue?.length ?? 0) > 0 && (
                <Card className="shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <Timer className="w-4 h-4 text-red-500" />
                      Cases Due Today ({tasks?.casesDue.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y">
                      {tasks?.casesDue.slice(0, 6).map((c) => (
                        <div key={c.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30">
                          <div>
                            <p className="text-sm font-medium">{c.caseType?.replace(/_/g, " ").toUpperCase()}</p>
                            <p className="text-xs text-muted-foreground">{c.governmentReference ?? `Case #${c.id}`}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={c.priority === "urgent" ? "destructive" : "secondary"} className="text-xs">
                              {c.priority}
                            </Badge>
                            <Link href="/pro-services">
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right Column */}
            <div className="space-y-4">
              {/* Officer Workload */}
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
                      const pct = Math.min(100, Math.round((Number(officer.activeAssignments) / capacity) * 100));
                      return (
                        <div key={officer.officerId}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-medium truncate">{officer.name}</span>
                            <span className="text-muted-foreground">{officer.activeAssignments}/{capacity}</span>
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

              {/* Expiring Documents */}
              {(snapshot?.expiringDocsList?.length ?? 0) > 0 && (
                <Card className="shadow-sm border-orange-200">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-bold flex items-center gap-2 text-orange-700">
                      <AlertTriangle className="w-4 h-4" />
                      Expiring in 7 Days
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {snapshot?.expiringDocsList.slice(0, 4).map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between text-xs">
                        <span className="font-medium truncate">{doc.permitNumber ?? `Permit #${doc.id}`}</span>
                        <span className="text-orange-600 font-semibold">
                          {doc.expiryDate ? formatDistanceToNow(new Date(doc.expiryDate), { addSuffix: true }) : "—"}
                        </span>
                      </div>
                    ))}
                    <Link href="/renewal-workflows">
                      <Button variant="outline" size="sm" className="w-full text-xs mt-2 border-orange-300 text-orange-700 hover:bg-orange-50">
                        Trigger Renewals
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              )}

              {/* Quick Actions */}
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold">Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {[
                    { label: "New Quotation", href: "/quotations", icon: FileText },
                    { label: "New PRO Case", href: "/pro-services", icon: Briefcase },
                    { label: "Run Payroll", href: "/payroll", icon: BarChart3 },
                    { label: "SLA Breaches", href: "/sla-management", icon: Shield },
                    { label: "Compliance Check", href: "/compliance", icon: CheckCircle2 },
                  ].map((action) => (
                    <Link key={action.href} href={action.href}>
                      <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-xs">
                        <action.icon className="w-3.5 h-3.5 text-orange-500" />
                        {action.label}
                      </Button>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Recent Activity */}
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
                          {event.createdAt ? formatDistanceToNow(new Date(event.createdAt), { addSuffix: true }) : "—"}
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
