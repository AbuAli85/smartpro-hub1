import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity, AlertTriangle, BarChart3, Bell, CheckCircle2,
  Clock, Cpu, FileText, RefreshCw, Shield, TrendingDown,
  TrendingUp, Users, Zap, XCircle, Target, Globe,
} from "lucide-react";
import { toast } from "sonner";

// ─── Helpers ────────────────────────────────────────────────────────────────
function healthColor(score: number) {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-amber-400";
  if (score >= 40) return "text-orange-400";
  return "text-red-400";
}
function healthBg(score: number) {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-amber-500";
  if (score >= 40) return "bg-orange-500";
  return "bg-red-500";
}
function healthLabel(score: number) {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Needs Attention";
  return "Critical";
}
function fmt(n: number | undefined) {
  return (n ?? 0).toLocaleString();
}
function pct(n: number | undefined) {
  return `${Math.round(n ?? 0)}%`;
}

// ─── Trend Bar Chart ─────────────────────────────────────────────────────────
function TrendBars({ data }: { data: { day: string; total: number; successes: number; failures: number }[] }) {
  const max = Math.max(...data.map((d) => d.total), 1);
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-500 text-sm">
        No automation activity in the last 30 days
      </div>
    );
  }
  return (
    <div className="flex items-end gap-0.5 h-32 w-full">
      {data.map((d, i) => {
        const heightPct = (d.total / max) * 100;
        const failPct = d.total > 0 ? (d.failures / d.total) * 100 : 0;
        return (
          <div
            key={i}
            className="flex-1 flex flex-col justify-end group relative"
            title={`${d.day}\nTotal: ${d.total} | ✓ ${d.successes} | ✗ ${d.failures}`}
          >
            <div
              className="w-full rounded-t transition-all"
              style={{
                height: `${heightPct}%`,
                background: failPct > 20 ? "#f87171" : failPct > 5 ? "#fb923c" : "#34d399",
                minHeight: d.total > 0 ? "4px" : "0",
              }}
            />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
              {d.day}: {d.total} runs
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  trend,
  color = "text-slate-300",
  alert = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  trend?: "up" | "down" | "neutral";
  color?: string;
  alert?: boolean;
}) {
  return (
    <Card className={`bg-slate-800/60 border-slate-700 ${alert ? "border-red-500/50" : ""}`}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
          </div>
          <div className={`p-2 rounded-lg bg-slate-700/50 ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {trend && (
          <div className="mt-2 flex items-center gap-1">
            {trend === "up" ? (
              <TrendingUp className="h-3 w-3 text-emerald-400" />
            ) : trend === "down" ? (
              <TrendingDown className="h-3 w-3 text-red-400" />
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function ExecutiveDashboardPage() {
  const [activeTab, setActiveTab] = useState("overview");

  const { data: summary, isLoading, refetch } = trpc.automationSla.getExecutiveSummary.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const { data: slaAlerts } = trpc.automationSla.listAlerts.useQuery({ includeAcknowledged: false });
  const { data: tasks } = trpc.automationSla.listTasks.useQuery({ status: "open" });
  const { data: slaCheck } = trpc.automationSla.checkSLAs.useQuery(undefined);

  const acknowledgeAlert = trpc.automationSla.acknowledgeAlert.useMutation({
    onSuccess: () => {
      toast.success("Alert acknowledged");
      refetch();
    },
  });

  const updateTask = trpc.automationSla.updateTask.useMutation({
    onSuccess: () => {
      toast.success("Task updated");
      refetch();
    },
  });

  const score = summary?.healthScore ?? 0;

  // Derived metrics
  const automationEfficiency = summary?.automation.successRate ?? 100;
  const eventHealthy = (summary?.events.failed ?? 0) === 0 && (summary?.events.pending ?? 0) < 50;

  const slaBreaches = useMemo(() => slaCheck?.alerts ?? [], [slaCheck]);
  const hasCriticalIssues = slaBreaches.length > 0 || (summary?.sla.unacknowledged ?? 0) > 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading Executive Dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* ── Header ── */}
      <div className="border-b border-slate-700 bg-slate-900/95 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Globe className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Executive Platform Dashboard</h1>
              <p className="text-xs text-slate-400">Real-time platform intelligence · SmartPRO Business Services Hub</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {hasCriticalIssues && (
              <Badge variant="destructive" className="animate-pulse">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {slaBreaches.length + (summary?.sla.unacknowledged ?? 0)} Issue{slaBreaches.length + (summary?.sla.unacknowledged ?? 0) !== 1 ? "s" : ""}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* ── Health Score Hero ── */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Score Gauge */}
          <Card className="lg:col-span-1 bg-slate-800/60 border-slate-700">
            <CardContent className="pt-6 pb-4 flex flex-col items-center">
              <div className="relative w-36 h-36 mb-4">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="#1e293b" strokeWidth="12" />
                  <circle
                    cx="50" cy="50" r="40" fill="none"
                    stroke={score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : score >= 40 ? "#f97316" : "#ef4444"}
                    strokeWidth="12"
                    strokeDasharray={`${(score / 100) * 251.2} 251.2`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-3xl font-bold ${healthColor(score)}`}>{score}</span>
                  <span className="text-xs text-slate-400">/ 100</span>
                </div>
              </div>
              <p className="text-sm font-semibold text-white">Platform Health Score</p>
              <Badge
                className={`mt-2 ${score >= 80 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : score >= 60 ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}`}
                variant="outline"
              >
                {healthLabel(score)}
              </Badge>
              <p className="text-xs text-slate-500 mt-2 text-center">
                Query time: {summary?.queryTimeMs ?? 0}ms
              </p>
            </CardContent>
          </Card>

          {/* Top KPIs */}
          <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-3 gap-4">
            <KpiCard
              icon={Users}
              label="Total Employees"
              value={fmt(summary?.employees.total)}
              sub={`${fmt(summary?.employees.active)} active · ${fmt(summary?.employees.unassigned)} unassigned`}
              color="text-blue-400"
            />
            <KpiCard
              icon={Zap}
              label="Automation Rules"
              value={fmt(summary?.automation.activeRules)}
              sub={`of ${fmt(summary?.automation.totalRules)} total · ${fmt(summary?.automation.mutedRules)} muted`}
              color="text-purple-400"
            />
            <KpiCard
              icon={CheckCircle2}
              label="Success Rate (30d)"
              value={pct(summary?.automation.successRate)}
              sub={`${fmt(summary?.automation.successLogs)} ok · ${fmt(summary?.automation.failureLogs)} failed`}
              color={automationEfficiency >= 90 ? "text-emerald-400" : automationEfficiency >= 70 ? "text-amber-400" : "text-red-400"}
              alert={automationEfficiency < 70}
            />
            <KpiCard
              icon={Bell}
              label="Notifications"
              value={fmt(summary?.notifications.unread)}
              sub={`${fmt(summary?.notifications.total)} total`}
              color={summary?.notifications.unread ?? 0 > 10 ? "text-amber-400" : "text-slate-300"}
            />
            <KpiCard
              icon={Target}
              label="Open Tasks"
              value={fmt(summary?.tasks.open)}
              sub={`${fmt(summary?.tasks.critical)} critical`}
              color={summary?.tasks.critical ?? 0 > 0 ? "text-red-400" : "text-slate-300"}
              alert={(summary?.tasks.critical ?? 0) > 0}
            />
            <KpiCard
              icon={Activity}
              label="Event Queue"
              value={fmt(summary?.events.pending)}
              sub={`${fmt(summary?.events.failed)} failed events`}
              color={eventHealthy ? "text-emerald-400" : "text-red-400"}
              alert={!eventHealthy}
            />
          </div>
        </div>

        {/* ── SLA Breach Banner ── */}
        {slaBreaches.length > 0 && (
          <Card className="bg-red-950/40 border-red-500/40">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-300 mb-2">
                    {slaBreaches.length} SLA Threshold{slaBreaches.length !== 1 ? "s" : ""} Breached
                  </p>
                  <div className="space-y-1">
                    {slaBreaches.map((b: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-red-200">
                        <XCircle className="h-3 w-3 text-red-400 shrink-0" />
                        <span className="font-medium capitalize">{b.type.replace(/_/g, " ")}</span>
                        <span className="text-red-400">—</span>
                        <span>{b.message}</span>
                        <Badge variant="outline" className="border-red-500/40 text-red-300 ml-auto">
                          {b.severity}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Tabs ── */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-slate-800 border border-slate-700">
            <TabsTrigger value="overview" className="data-[state=active]:bg-slate-700">Overview</TabsTrigger>
            <TabsTrigger value="automation" className="data-[state=active]:bg-slate-700">Automation</TabsTrigger>
            <TabsTrigger value="tasks" className="data-[state=active]:bg-slate-700">
              Tasks
              {(summary?.tasks.open ?? 0) > 0 && (
                <Badge className="ml-1.5 h-4 px-1 text-xs bg-amber-500 text-white">{summary?.tasks.open}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="alerts" className="data-[state=active]:bg-slate-700">
              Alerts
              {(slaAlerts?.length ?? 0) > 0 && (
                <Badge className="ml-1.5 h-4 px-1 text-xs bg-red-500 text-white">{slaAlerts?.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="performance" className="data-[state=active]:bg-slate-700">Performance</TabsTrigger>
          </TabsList>

          {/* ── Overview Tab ── */}
          <TabsContent value="overview" className="space-y-6">
            {/* 30-day trend */}
            <Card className="bg-slate-800/60 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-blue-400" />
                  Automation Activity — Last 30 Days
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TrendBars data={summary?.trend ?? []} />
                <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-400 inline-block" /> Success</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-orange-400 inline-block" /> &gt;5% failures</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-400 inline-block" /> &gt;20% failures</span>
                </div>
              </CardContent>
            </Card>

            {/* Platform composition */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-slate-800/60 border-slate-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Users className="h-4 w-4 text-blue-400" />
                    Workforce Composition
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { label: "Active Employees", value: summary?.employees.active ?? 0, total: summary?.employees.total ?? 1, color: "bg-emerald-500" },
                    { label: "Department Coverage", value: (summary?.employees.total ?? 0) - (summary?.employees.unassigned ?? 0), total: summary?.employees.total ?? 1, color: "bg-blue-500" },
                  ].map((item) => (
                    <div key={item.label}>
                      <div className="flex justify-between text-xs text-slate-400 mb-1">
                        <span>{item.label}</span>
                        <span>{item.value} / {item.total}</span>
                      </div>
                      <Progress
                        value={item.total > 0 ? (item.value / item.total) * 100 : 0}
                        className="h-2 bg-slate-700"
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="bg-slate-800/60 border-slate-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-purple-400" />
                    Automation Engine Health
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { label: "Rule Success Rate (30d)", value: Math.round(summary?.automation.successRate ?? 100), color: "bg-emerald-500" },
                    { label: "Active Rules", value: summary?.automation.totalRules ? Math.round(((summary?.automation.activeRules ?? 0) / summary.automation.totalRules) * 100) : 100, color: "bg-purple-500" },
                  ].map((item) => (
                    <div key={item.label}>
                      <div className="flex justify-between text-xs text-slate-400 mb-1">
                        <span>{item.label}</span>
                        <span>{item.value}%</span>
                      </div>
                      <Progress value={item.value} className="h-2 bg-slate-700" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Automation Tab ── */}
          <TabsContent value="automation" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Total Executions (30d)", value: fmt(summary?.automation.totalLogs), icon: Activity, color: "text-blue-400" },
                { label: "Successful", value: fmt(summary?.automation.successLogs), icon: CheckCircle2, color: "text-emerald-400" },
                { label: "Failed", value: fmt(summary?.automation.failureLogs), icon: XCircle, color: "text-red-400" },
                { label: "Avg Duration", value: `${Math.round(summary?.automation.avgDurationMs ?? 0)}ms`, icon: Clock, color: "text-amber-400" },
              ].map((item) => (
                <Card key={item.label} className="bg-slate-800/60 border-slate-700">
                  <CardContent className="pt-4 pb-3">
                    <item.icon className={`h-5 w-5 ${item.color} mb-2`} />
                    <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
                    <p className="text-xs text-slate-400 mt-1">{item.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="bg-slate-800/60 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-300">Rule Efficiency Matrix</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-4 bg-slate-700/40 rounded-lg">
                    <p className="text-2xl font-bold text-purple-400">{fmt(summary?.automation.activeRules)}</p>
                    <p className="text-xs text-slate-400 mt-1">Active Rules</p>
                  </div>
                  <div className="p-4 bg-slate-700/40 rounded-lg">
                    <p className="text-2xl font-bold text-amber-400">{fmt(summary?.automation.mutedRules)}</p>
                    <p className="text-xs text-slate-400 mt-1">Muted Rules</p>
                  </div>
                  <div className="p-4 bg-slate-700/40 rounded-lg">
                    <p className={`text-2xl font-bold ${automationEfficiency >= 90 ? "text-emerald-400" : "text-red-400"}`}>
                      {pct(summary?.automation.successRate)}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">Success Rate</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tasks Tab ── */}
          <TabsContent value="tasks" className="space-y-3">
            {!tasks || tasks.length === 0 ? (
              <Card className="bg-slate-800/60 border-slate-700">
                <CardContent className="py-12 text-center">
                  <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-3" />
                  <p className="text-slate-300 font-medium">No open tasks</p>
                  <p className="text-slate-500 text-sm mt-1">All platform tasks are resolved</p>
                </CardContent>
              </Card>
            ) : (
              tasks.map((task: any) => (
                <Card key={task.id} className="bg-slate-800/60 border-slate-700">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge
                            variant="outline"
                            className={
                              task.priority === "critical" ? "border-red-500/40 text-red-300" :
                              task.priority === "high" ? "border-orange-500/40 text-orange-300" :
                              task.priority === "medium" ? "border-amber-500/40 text-amber-300" :
                              "border-slate-500/40 text-slate-400"
                            }
                          >
                            {task.priority}
                          </Badge>
                          <span className="text-sm font-medium text-slate-200 truncate">{task.title}</span>
                        </div>
                        <p className="text-xs text-slate-400 truncate">{task.description}</p>
                        {task.entityName && (
                          <p className="text-xs text-blue-400 mt-1">Employee: {task.entityName}</p>
                        )}
                        {task.ruleName && (
                          <p className="text-xs text-purple-400">Rule: {task.ruleName}</p>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-slate-600 text-slate-300 hover:bg-slate-700"
                          onClick={() => updateTask.mutate({ taskId: task.id, status: "in_progress" })}
                        >
                          Start
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => updateTask.mutate({ taskId: task.id, status: "done" })}
                        >
                          Done
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* ── Alerts Tab ── */}
          <TabsContent value="alerts" className="space-y-3">
            {!slaAlerts || slaAlerts.length === 0 ? (
              <Card className="bg-slate-800/60 border-slate-700">
                <CardContent className="py-12 text-center">
                  <Shield className="h-10 w-10 text-emerald-400 mx-auto mb-3" />
                  <p className="text-slate-300 font-medium">No active SLA alerts</p>
                  <p className="text-slate-500 text-sm mt-1">All thresholds are within acceptable limits</p>
                </CardContent>
              </Card>
            ) : (
              slaAlerts.map((alert: any) => (
                <Card key={alert.id} className="bg-slate-800/60 border-slate-700 border-l-4 border-l-red-500">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                          <span className="text-sm font-medium text-slate-200">{alert.alert_type?.replace(/_/g, " ")}</span>
                          <Badge variant="outline" className="border-red-500/40 text-red-300 ml-auto">
                            {alert.severity}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-400">{alert.message}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {new Date(alert.created_at).toLocaleString("en-GB")}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-slate-600 text-slate-300 hover:bg-slate-700 shrink-0"
                        onClick={() => acknowledgeAlert.mutate({ alertId: alert.id })}
                      >
                        Acknowledge
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* ── Performance Tab ── */}
          <TabsContent value="performance" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-slate-800/60 border-slate-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-blue-400" />
                    Query Performance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { label: "Dashboard Query Time", value: `${summary?.queryTimeMs ?? 0}ms`, ok: (summary?.queryTimeMs ?? 0) < 500 },
                    { label: "Active Employees", value: fmt(summary?.employees.active), ok: true },
                    { label: "Active Automation Rules", value: fmt(summary?.automation.activeRules), ok: true },
                    { label: "Estimated Eval Cost", value: `${(summary?.employees.active ?? 0) * (summary?.automation.activeRules ?? 0)} ops/run`, ok: (summary?.employees.active ?? 0) * (summary?.automation.activeRules ?? 0) < 5000 },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between py-1.5 border-b border-slate-700/50 last:border-0">
                      <span className="text-xs text-slate-400">{item.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-200">{item.value}</span>
                        {item.ok ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="bg-slate-800/60 border-slate-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Activity className="h-4 w-4 text-purple-400" />
                    Event Bus Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { label: "Total Events", value: fmt(summary?.events.total), ok: true },
                    { label: "Pending Events", value: fmt(summary?.events.pending), ok: (summary?.events.pending ?? 0) < 50 },
                    { label: "Failed Events", value: fmt(summary?.events.failed), ok: (summary?.events.failed ?? 0) === 0 },
                    { label: "Unread Notifications", value: fmt(summary?.notifications.unread), ok: (summary?.notifications.unread ?? 0) < 20 },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between py-1.5 border-b border-slate-700/50 last:border-0">
                      <span className="text-xs text-slate-400">{item.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-200">{item.value}</span>
                        {item.ok ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* SLA Thresholds */}
            <Card className="bg-slate-800/60 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-emerald-400" />
                  SLA Thresholds Status
                </CardTitle>
              </CardHeader>
            <CardContent>
                {!slaCheck ? (
                  <p className="text-xs text-slate-500">Loading SLA data…</p>
                ) : slaCheck.alerts.length === 0 ? (
                  <div className="flex items-center gap-2 py-4">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    <p className="text-sm text-emerald-300">All SLA thresholds within acceptable limits</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {slaCheck.alerts.map((alert: any, i: number) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-slate-700/50 last:border-0">
                        <div>
                          <p className="text-xs font-medium text-slate-300 capitalize">{alert.type.replace(/_/g, " ")}</p>
                          <p className="text-xs text-slate-500">{alert.message}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-200">{alert.currentValue}</span>
                          <Badge variant="outline" className="border-red-500/40 text-red-300 text-xs">{alert.severity}</Badge>
                          <XCircle className="h-4 w-4 text-red-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-800">
          <span>SmartPRO Business Services Hub · Executive Intelligence Layer</span>
          <span className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            Data refreshes every 60 seconds
          </span>
        </div>
      </div>
    </div>
  );
}
