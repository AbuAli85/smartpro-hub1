import { useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle2, Clock, Users, TrendingUp, TrendingDown,
  Zap, Plus, Trash2, Edit3, Play, RefreshCw, ChevronRight,
  Shield, FileWarning, UserX, BarChart3, Activity, Bell, Settings2,
  ArrowUpRight, Calendar, Building2, Download, Cpu, GitBranch, Repeat, XCircle
} from "lucide-react";
import { HubBreadcrumb } from "@/components/hub/HubBreadcrumb";
import { hrInsightsTrail } from "@/components/hub/hubCrumbs";

// ─── Types ────────────────────────────────────────────────────────────────────
type Priority = "critical" | "high" | "medium";
type TriggerType = "visa_expiry" | "work_permit_expiry" | "passport_expiry" | "completeness_below" | "no_department" | "contract_expiry" | "booking_overdue" | "payment_overdue" | "client_inactive";
type ActionType = "notify_admin" | "notify_employee" | "create_task" | "escalate" | "send_email" | "flag_review";

// ─── Health Score Gauge ───────────────────────────────────────────────────────
function HealthGauge({ score }: { score: number }) {
  const clamp = Math.max(0, Math.min(100, score));
  const angle = (clamp / 100) * 180 - 90; // -90 to +90 degrees
  const color = clamp >= 80 ? "#22c55e" : clamp >= 60 ? "#f59e0b" : clamp >= 40 ? "#f97316" : "#ef4444";
  const label = clamp >= 80 ? "Excellent" : clamp >= 60 ? "Good" : clamp >= 40 ? "Fair" : "Critical";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-48 h-24 overflow-hidden">
        {/* Background arc */}
        <svg viewBox="0 0 200 100" className="w-full h-full">
          <path d="M 10 100 A 90 90 0 0 1 190 100" fill="none" stroke="#e5e7eb" strokeWidth="16" strokeLinecap="round" />
          {/* Colored arc */}
          <path
            d="M 10 100 A 90 90 0 0 1 190 100"
            fill="none"
            stroke={color}
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={`${(clamp / 100) * 283} 283`}
          />
          {/* Needle */}
          <line
            x1="100" y1="100"
            x2={100 + 70 * Math.cos(((angle - 90) * Math.PI) / 180)}
            y2={100 + 70 * Math.sin(((angle - 90) * Math.PI) / 180)}
            stroke="#374151"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="100" cy="100" r="6" fill="#374151" />
        </svg>
      </div>
      <div className="text-center -mt-2">
        <div className="text-4xl font-bold" style={{ color }}>{clamp}</div>
        <div className="text-sm font-medium text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KPICard({
  title, value, subtitle, icon: Icon, color, trend, onClick
}: {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: React.ElementType;
  color: string;
  trend?: "up" | "down" | "neutral";
  onClick?: () => void;
}) {
  return (
    <Card
      className={`relative overflow-hidden transition-all ${onClick ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5" : ""}`}
      onClick={onClick}
    >
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
            <p className="text-3xl font-bold mt-1" style={{ color }}>{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className="p-2 rounded-lg" style={{ backgroundColor: `${color}18` }}>
            <Icon className="h-5 w-5" style={{ color }} />
          </div>
        </div>
        {trend && (
          <div className="flex items-center gap-1 mt-2">
            {trend === "up" ? <TrendingUp className="h-3 w-3 text-green-500" /> : trend === "down" ? <TrendingDown className="h-3 w-3 text-red-500" /> : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Trigger label helpers ────────────────────────────────────────────────────
const TRIGGER_LABELS: Record<TriggerType, string> = {
  visa_expiry: "Visa Expiry",
  work_permit_expiry: "Work Permit Expiry",
  passport_expiry: "Passport Expiry",
  completeness_below: "Profile Completeness Below",
  no_department: "No Department Assigned",
  contract_expiry: "Contract Expiry",
  booking_overdue: "Booking Overdue",
  payment_overdue: "Payment Overdue",
  client_inactive: "Client Inactive",
};

const ACTION_LABELS: Record<ActionType, string> = {
  notify_admin: "Notify Admin",
  notify_employee: "Notify Employee",
  create_task: "Create Task",
  escalate: "Escalate",
  send_email: "Send Email",
  flag_review: "Flag for Review",
};

const PRIORITY_COLORS: Record<Priority, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
};

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function WorkforceIntelligencePage() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("overview");
  const [showRuleDialog, setShowRuleDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<null | { id: number; name: string; description?: string; triggerType: TriggerType; conditionValue?: string; actionType: ActionType; isActive: boolean }>(null);
  const [ruleForm, setRuleForm] = useState({
    name: "",
    description: "",
    triggerType: "visa_expiry" as TriggerType,
    conditionValue: "30",
    actionType: "notify_admin" as ActionType,
    isActive: true,
    alertRecipients: "all_admins" as "all_admins" | "hr_admin" | "company_owner",
    throttleHours: 24,
  });
  const [simulatingRuleId, setSimulatingRuleId] = useState<number | null>(null);
  const [snoozeRuleId, setSnoozeRuleId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  // Queries
  const { data: kpi, isLoading: kpiLoading, refetch: refetchKPI } = trpc.automation.getWorkforceKPI.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const { data: rules, isLoading: rulesLoading } = trpc.automation.listRules.useQuery();
  const { data: logs } = trpc.automation.getLogs.useQuery({ limit: 30 });
  const { data: trend } = trpc.automation.getHealthTrend.useQuery();
  const { data: templates = [], isLoading: templatesLoading } = trpc.automation.getTemplates.useQuery();
  const installTemplate = trpc.automation.installTemplate.useMutation({
    onSuccess: () => {
      utils.automation.getTemplates.invalidate();
      utils.automation.listRules.invalidate();
      toast.success("Template installed as a new automation rule");
    },
    onError: (e) => toast.error(e.message),
  });

  // Mutations
  const createRule = trpc.automation.createRule.useMutation({
    onSuccess: () => { utils.automation.listRules.invalidate(); toast.success("Automation rule created"); setShowRuleDialog(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateRule = trpc.automation.updateRule.useMutation({
    onSuccess: () => { utils.automation.listRules.invalidate(); toast.success("Rule updated"); setShowRuleDialog(false); setEditingRule(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteRule = trpc.automation.deleteRule.useMutation({
    onSuccess: () => { utils.automation.listRules.invalidate(); toast.success("Rule deleted"); },
    onError: (e) => toast.error(e.message),
  });
  const toggleRule = trpc.automation.toggleRule.useMutation({
    onSuccess: () => utils.automation.listRules.invalidate(),
    onError: (e) => toast.error(e.message),
  });
  const runRules = trpc.automation.runRules.useMutation({
    onSuccess: (data) => {
      utils.automation.getLogs.invalidate();
      toast.success(`Ran ${data.rulesRun} rule(s) — ${data.totalMatches} match(es) found`);
    },
    onError: (e) => toast.error(e.message),
  });
  const muteRule = trpc.automation.muteRule.useMutation({
    onSuccess: () => { utils.automation.listRules.invalidate(); toast.success("Rule muted"); },
    onError: (e) => toast.error(e.message),
  });
  const snoozeRule = trpc.automation.snoozeRule.useMutation({
    onSuccess: () => { utils.automation.listRules.invalidate(); toast.success("Rule snoozed for 24 hours"); setSnoozeRuleId(null); },
    onError: (e) => toast.error(e.message),
  });
  const { data: ruleStats = [] } = trpc.automation.getRuleStats.useQuery();
  const { data: perfMetrics } = trpc.automation.getPerformanceMetrics.useQuery();
  const { data: simulation, isLoading: simLoading } = trpc.automation.simulateRule.useQuery(
    { id: simulatingRuleId! },
    { enabled: simulatingRuleId !== null }
  );
  const { data: failureSummary } = trpc.automation.getFailureSummary.useQuery();
  const { data: platformSummary } = trpc.automation.getPlatformTriggerSummary.useQuery();
  const processEvents = trpc.automation.processEvents.useMutation({
    onSuccess: (data) => {
      utils.automation.getLogs.invalidate();
      toast.success(`Processed ${data.processed} event(s) — ${data.triggered} rule(s) triggered`);
    },
    onError: (e) => toast.error(e.message),
  });
  const exportLogsCsv = trpc.automation.exportLogsCsv.useMutation({
    onSuccess: (data) => {
      toast.success(`Exported ${data.rowCount} log entries`);
      window.open(data.url, "_blank");
    },
    onError: (e) => toast.error(e.message),
  });
  const exportRuleHistoryCsv = trpc.automation.exportRuleHistoryCsv.useMutation({
    onSuccess: (data) => {
      toast.success(`Exported ${data.rowCount} rule(s)`);
      window.open(data.url, "_blank");
    },
    onError: (e) => toast.error(e.message),
  });

  function openCreateDialog() {
    setEditingRule(null);
    setRuleForm({ name: "", description: "", triggerType: "visa_expiry", conditionValue: "30", actionType: "notify_admin", isActive: true, alertRecipients: "all_admins", throttleHours: 24 });
    setShowRuleDialog(true);
  }

  function openEditDialog(rule: NonNullable<typeof rules>[number]) {
    setEditingRule({ id: rule.id, name: rule.name, description: rule.description ?? "", triggerType: rule.triggerType as TriggerType, conditionValue: rule.conditionValue ?? "30", actionType: rule.actionType as ActionType, isActive: rule.isActive });
    setRuleForm({ name: rule.name, description: rule.description ?? "", triggerType: rule.triggerType as TriggerType, conditionValue: rule.conditionValue ?? "30", actionType: rule.actionType as ActionType, isActive: rule.isActive, alertRecipients: (rule as any).alertRecipients ?? "all_admins", throttleHours: (rule as any).throttleHours ?? 24 });
    setShowRuleDialog(true);
  }

  function saveRule() {
    if (!ruleForm.name.trim()) { toast.error("Rule name is required"); return; }
    if (editingRule) {
      updateRule.mutate({ id: editingRule.id, ...ruleForm });
    } else {
      createRule.mutate(ruleForm);
    }
  }

  const RECIPIENT_LABELS: Record<string, string> = {
    all_admins: "All Admins",
    hr_admin: "HR Admin Only",
    company_owner: "Company Owner Only",
  };

  const needsConditionValue = ["visa_expiry", "work_permit_expiry", "passport_expiry", "completeness_below"].includes(ruleForm.triggerType);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <HubBreadcrumb items={hrInsightsTrail("Workforce intelligence")} />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Workforce Intelligence
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time health monitoring, automation rules, and predictive insights
          </p>
          <p className="text-xs text-muted-foreground mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>HR insights:</span>
            <Link href="/hr/executive-dashboard" className="text-primary hover:underline">
              HR operations health
            </Link>
            <span className="text-muted-foreground/60">·</span>
            <Link href="/hr/kpi" className="text-primary hover:underline">
              KPIs &amp; performance
            </Link>
            <span className="text-muted-foreground/60">·</span>
            <Link href="/hr/performance" className="text-primary hover:underline">
              Performance &amp; growth
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetchKPI(); }} disabled={kpiLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${kpiLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => runRules.mutate({ dryRun: false })} disabled={runRules.isPending}>
            <Play className="h-4 w-4 mr-1" />
            {runRules.isPending ? "Running..." : "Run All Rules"}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trend">Health Trend</TabsTrigger>
          <TabsTrigger value="expiry">Expiry Timeline</TabsTrigger>
          <TabsTrigger value="automation">Automation Rules</TabsTrigger>
          <TabsTrigger value="templates">Rule Templates</TabsTrigger>
          <TabsTrigger value="observability">Observability</TabsTrigger>
          <TabsTrigger value="failures">Failure Analysis</TabsTrigger>
          <TabsTrigger value="platform">Platform Triggers</TabsTrigger>
          <TabsTrigger value="exports">Exports</TabsTrigger>
          <TabsTrigger value="logs">Activity Logs</TabsTrigger>
        </TabsList>

        {/* ── OVERVIEW TAB ── */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          {kpiLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-28 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : kpi ? (
            <>
              {/* Health Score + KPIs row */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Health Score Gauge */}
                <Card className="lg:col-span-1">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                      Workforce Health Score
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center">
                    <HealthGauge score={kpi.healthScore} />
                    <div className="mt-3 w-full grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-muted-foreground">Healthy: <strong>{kpi.healthyCount}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="text-muted-foreground">Incomplete: <strong>{kpi.incompleteCount}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-orange-500" />
                        <span className="text-muted-foreground">Warning: <strong>{kpi.warningCount}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-red-500" />
                        <span className="text-muted-foreground">Critical: <strong>{kpi.criticalCount}</strong></span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* KPI Grid */}
                <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-4">
                  <KPICard title="Total Employees" value={kpi.totalEmployees} icon={Users} color="#6366f1" subtitle="Active workforce" onClick={() => navigate("/hr/employees")} />
                  <KPICard title="Avg Completeness" value={`${kpi.avgCompletenessScore}%`} icon={BarChart3} color={kpi.avgCompletenessScore >= 80 ? "#22c55e" : kpi.avgCompletenessScore >= 60 ? "#f59e0b" : "#ef4444"} subtitle="Profile quality score" />
                  <KPICard title="Omanisation Rate" value={`${kpi.omanisationRate}%`} icon={Shield} color="#0ea5e9" subtitle="Omani nationals" />
                  <KPICard title="Expiring Docs" value={kpi.expiringDocsCount} icon={Clock} color="#f59e0b" subtitle="Within 30 days" onClick={() => setActiveTab("expiry")} />
                  <KPICard title="Expired Docs" value={kpi.expiredDocsCount} icon={FileWarning} color="#ef4444" subtitle="Immediate action" onClick={() => setActiveTab("expiry")} />
                  <KPICard title="Unassigned" value={kpi.unassignedCount} icon={UserX} color="#8b5cf6" subtitle="No department" onClick={() => navigate("/hr/departments")} />
                </div>
              </div>

              {/* Recommendations */}
              {kpi.recommendations.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Bell className="h-4 w-4 text-amber-500" />
                      Recommendations
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {kpi.recommendations.map((rec, i) => (
                      <div
                        key={i}
                        className={`flex items-center justify-between p-3 rounded-lg border text-sm ${PRIORITY_COLORS[rec.priority]}`}
                      >
                        <div className="flex items-center gap-2">
                          {rec.priority === "critical" ? <AlertTriangle className="h-4 w-4 shrink-0" /> :
                           rec.priority === "high" ? <Clock className="h-4 w-4 shrink-0" /> :
                           <CheckCircle2 className="h-4 w-4 shrink-0" />}
                          <span>{rec.message}</span>
                        </div>
                        <Badge variant="outline" className="ml-2 shrink-0 text-xs">{rec.priority}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Department Breakdown */}
              {kpi.departmentBreakdown.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" />
                      Department Health Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {kpi.departmentBreakdown.map((dept) => {
                        const barColor = dept.avgScore >= 80 ? "#22c55e" : dept.avgScore >= 60 ? "#f59e0b" : "#ef4444";
                        return (
                          <div key={dept.name} className="flex items-center gap-3">
                            <div className="w-28 text-sm font-medium truncate">{dept.name}</div>
                            <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${dept.avgScore}%`, backgroundColor: barColor }}
                              />
                            </div>
                            <div className="w-12 text-right text-sm font-semibold" style={{ color: barColor }}>
                              {dept.avgScore}%
                            </div>
                            <div className="w-16 text-right text-xs text-muted-foreground">
                              {dept.count} emp.
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No workforce data available yet.</p>
              <Button className="mt-4" onClick={() => navigate("/hr/employees")}>
                Add Employees <ArrowUpRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </TabsContent>

        {/* ── EXPIRY TIMELINE TAB ── */}
        <TabsContent value="expiry" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4 text-amber-500" />
                Document Expiry Timeline (Next 90 Days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {kpi?.expiryTimeline && kpi.expiryTimeline.length > 0 ? (
                <div className="space-y-2">
                  {kpi.expiryTimeline.map((evt, i) => {
                    const isExpired = evt.daysLeft < 0;
                    const isUrgent = evt.daysLeft >= 0 && evt.daysLeft <= 7;
                    const isWarning = evt.daysLeft > 7 && evt.daysLeft <= 30;
                    const dotColor = isExpired ? "#ef4444" : isUrgent ? "#f97316" : isWarning ? "#f59e0b" : "#22c55e";
                    return (
                      <div key={i} className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{evt.employeeName}</div>
                          <div className="text-xs text-muted-foreground">{evt.type}</div>
                        </div>
                        <div className="text-sm text-muted-foreground">{evt.date}</div>
                        <Badge
                          variant="outline"
                          className={`text-xs shrink-0 ${isExpired ? "border-red-300 text-red-600 bg-red-50" : isUrgent ? "border-orange-300 text-orange-600 bg-orange-50" : isWarning ? "border-amber-300 text-amber-600 bg-amber-50" : "border-green-300 text-green-600 bg-green-50"}`}
                        >
                          {isExpired ? `${Math.abs(evt.daysLeft)}d overdue` : evt.daysLeft === 0 ? "Today" : `${evt.daysLeft}d left`}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-green-500 opacity-60" />
                  <p className="font-medium">No documents expiring in the next 90 days</p>
                  <p className="text-sm mt-1">All employee documents are up to date</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── HEALTH TREND TAB ── */}
        <TabsContent value="trend" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Workforce Health Score — 30-Day Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              {trend && trend.length > 0 ? (
                <div className="space-y-6">
                  {/* SVG Sparkline */}
                  <div className="relative">
                    <div className="flex items-end gap-0.5 h-32">
                      {trend.map((pt, i) => {
                        const h = Math.max(4, (pt.health_score / 100) * 128);
                        const color = pt.health_score >= 80 ? "#22c55e" : pt.health_score >= 60 ? "#f59e0b" : pt.health_score >= 40 ? "#f97316" : "#ef4444";
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                            <div className="w-full rounded-t" style={{ height: h, backgroundColor: color, minWidth: 4 }} />
                            <div className="absolute bottom-full mb-1 hidden group-hover:block bg-card border rounded px-2 py-1 text-xs whitespace-nowrap shadow z-10">
                              <div className="font-semibold">{pt.health_score} pts</div>
                              <div className="text-muted-foreground">{pt.snapshot_date}</div>
                              <div>{pt.total_employees} employees</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-2">
                      <span>{trend[0]?.snapshot_date}</span>
                      <span>{trend[trend.length - 1]?.snapshot_date}</span>
                    </div>
                  </div>
                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-4">
                    {["health_score", "avg_completeness", "critical_count"].map((field) => {
                      const latest = trend[trend.length - 1];
                      const prev = trend[trend.length - 2];
                      const val = latest?.[field as keyof typeof latest] ?? 0;
                      const prevVal = prev?.[field as keyof typeof prev] ?? 0;
                      const diff = Number(val) - Number(prevVal);
                      const label = field === "health_score" ? "Latest Score" : field === "avg_completeness" ? "Avg Completeness" : "Critical Alerts";
                      const suffix = field === "critical_count" ? "" : "%";
                      return (
                        <div key={field} className="text-center p-3 rounded-lg border">
                          <div className="text-2xl font-bold">{val}{suffix}</div>
                          <div className="text-xs text-muted-foreground">{label}</div>
                          {prev && (
                            <div className={`text-xs mt-1 font-medium ${diff > 0 ? (field === "critical_count" ? "text-red-500" : "text-green-500") : diff < 0 ? (field === "critical_count" ? "text-green-500" : "text-red-500") : "text-muted-foreground"}`}>
                              {diff > 0 ? "↑" : diff < 0 ? "↓" : "→"} {Math.abs(diff)}{suffix} vs prev
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-center py-16 text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No trend data yet</p>
                  <p className="text-sm mt-1">Health snapshots are recorded daily. Check back tomorrow for trend data.</p>
                  <p className="text-xs mt-2 text-muted-foreground">Tip: Run automation rules to generate the first snapshot.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── AUTOMATION RULES TAB ── */}
        <TabsContent value="automation" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Automation Rules</h2>
              <p className="text-sm text-muted-foreground">Configure triggers that automatically detect and flag workforce issues</p>
            </div>
            <Button size="sm" onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-1" /> New Rule
            </Button>
          </div>

          {rulesLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}
            </div>
          ) : rules && rules.length > 0 ? (
            <div className="space-y-3">
              {rules.map((rule) => (
                <Card key={rule.id} className={`transition-all ${!rule.isActive ? "opacity-60" : ""}`}>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{rule.name}</span>
                          <Badge variant="outline" className="text-xs">
                            <Zap className="h-3 w-3 mr-1" />
                            {TRIGGER_LABELS[rule.triggerType as TriggerType] ?? rule.triggerType}
                            {rule.conditionValue && ["visa_expiry","work_permit_expiry","passport_expiry"].includes(rule.triggerType) && ` ≤ ${rule.conditionValue}d`}
                            {rule.conditionValue && rule.triggerType === "completeness_below" && ` < ${rule.conditionValue}%`}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {ACTION_LABELS[rule.actionType as ActionType] ?? rule.actionType}
                          </Badge>
                          {rule.runCount > 0 && (
                            <span className="text-xs text-muted-foreground">
                              Run {rule.runCount}× {rule.lastRunAt ? `· Last: ${new Date(rule.lastRunAt).toLocaleDateString("en-GB")}` : ""}
                            </span>
                          )}
                        </div>
                        {rule.description && (
                          <p className="text-xs text-muted-foreground mt-1">{rule.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Switch
                          checked={rule.isActive}
                          onCheckedChange={(v) => toggleRule.mutate({ id: rule.id, isActive: v })}
                        />
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          title="Simulate (30-day backtest)"
                          onClick={() => { setSimulatingRuleId(rule.id); setActiveTab("observability"); }}
                        >
                          <BarChart3 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          title={(rule as any).isMuted ? "Unmute rule" : "Mute rule"}
                          onClick={() => muteRule.mutate({ id: rule.id, muted: !(rule as any).isMuted })}
                        >
                          <Bell className={`h-3.5 w-3.5 ${(rule as any).isMuted ? "text-muted-foreground line-through" : ""}`} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(rule as any)}>
                          <Edit3 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => { if (confirm(`Delete rule "${rule.name}"?`)) deleteRule.mutate({ id: rule.id }); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 border-2 border-dashed rounded-xl text-muted-foreground">
              <Settings2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No automation rules yet</p>
              <p className="text-sm mt-1">Create rules to automatically detect expiring documents, incomplete profiles, and more</p>
              <Button className="mt-4" onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-1" /> Create First Rule
              </Button>
            </div>
          )}
        </TabsContent>

        {/* ── RULE TEMPLATES TAB ── */}
        <TabsContent value="templates" className="mt-4">
          <div className="mb-4">
            <h2 className="font-semibold">Pre-built Rule Templates</h2>
            <p className="text-sm text-muted-foreground">One-click install for the most common workforce automation scenarios</p>
          </div>
          {templatesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(5)].map((_, i) => <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map((tpl) => {
                const severityColor = tpl.severity === "critical" ? "text-red-600 bg-red-50 border-red-200" : tpl.severity === "high" ? "text-orange-600 bg-orange-50 border-orange-200" : "text-amber-600 bg-amber-50 border-amber-200";
                return (
                  <Card key={tpl.key} className={`transition-all ${tpl.installed ? "opacity-70" : "hover:shadow-md"}`}>
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-semibold text-sm">{tpl.name}</span>
                            <Badge variant="outline" className={`text-xs ${severityColor}`}>{tpl.severity}</Badge>
                            {tpl.installed && <Badge variant="secondary" className="text-xs text-green-700 bg-green-50">Installed</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground">{tpl.description}</p>
                          <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                            <span>Trigger: {TRIGGER_LABELS[tpl.triggerType as TriggerType] ?? tpl.triggerType}</span>
                            {tpl.conditionValue !== "0" && <span>≤ {tpl.conditionValue}{tpl.triggerType === "completeness_below" ? "%" : "d"}</span>}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant={tpl.installed ? "outline" : "default"}
                          disabled={tpl.installed || installTemplate.isPending}
                          onClick={() => installTemplate.mutate({ templateKey: tpl.key })}
                          className="shrink-0"
                        >
                          {tpl.installed ? <CheckCircle2 className="h-4 w-4" /> : <Plus className="h-4 w-4 mr-1" />}
                          {tpl.installed ? "Installed" : "Install"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── OBSERVABILITY TAB ── */}
        <TabsContent value="observability" className="mt-4 space-y-6">
          {/* Performance Metrics */}
          {perfMetrics && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  System Performance Metrics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <div className="text-2xl font-bold">{perfMetrics.activeEmployees}</div>
                    <div className="text-xs text-muted-foreground mt-1">Active Employees</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <div className="text-2xl font-bold">{perfMetrics.activeRules}</div>
                    <div className="text-xs text-muted-foreground mt-1">Active Rules</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <div className="text-2xl font-bold text-amber-600">{perfMetrics.estimatedRuleEvalCost}</div>
                    <div className="text-xs text-muted-foreground mt-1">Est. Eval Operations</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <div className="text-2xl font-bold">{perfMetrics.queryTimeMs}ms</div>
                    <div className="text-xs text-muted-foreground mt-1">Query Time</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <div className="text-2xl font-bold">{perfMetrics.totalNotifications}</div>
                    <div className="text-xs text-muted-foreground mt-1">Total Notifications</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <div className="text-2xl font-bold text-red-600">{perfMetrics.unreadNotifications}</div>
                    <div className="text-xs text-muted-foreground mt-1">Unread</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <div className="text-2xl font-bold">{perfMetrics.notificationsLast24h}</div>
                    <div className="text-xs text-muted-foreground mt-1">Notifications (24h)</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <div className="text-2xl font-bold">{perfMetrics.totalLogEntries}</div>
                    <div className="text-xs text-muted-foreground mt-1">Log Entries</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Rule Success/Failure Stats */}
          {ruleStats.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Rule Execution Stats
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {ruleStats.map((stat) => {
                    const rule = rules?.find((r) => r.id === stat.ruleId);
                    return (
                      <div key={stat.ruleId} className="flex items-center gap-4 p-3 rounded-lg border">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{rule?.name ?? `Rule #${stat.ruleId}`}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {stat.totalRuns} runs · Last: {stat.lastRunAt ? new Date(stat.lastRunAt).toLocaleDateString("en-GB") : "Never"}
                            {stat.avgDurationMs && ` · Avg ${stat.avgDurationMs}ms`}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-center">
                            <div className="text-sm font-bold text-green-600">{stat.successRuns}</div>
                            <div className="text-xs text-muted-foreground">Success</div>
                          </div>
                          <div className="text-center">
                            <div className="text-sm font-bold text-red-600">{stat.failureRuns}</div>
                            <div className="text-xs text-muted-foreground">Failure</div>
                          </div>
                          <div className="w-16">
                            <div className="text-xs text-muted-foreground mb-1 text-right">{stat.successRate}%</div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div className="h-full bg-green-500 rounded-full" style={{ width: `${stat.successRate}%` }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Rule Simulation (30-day backtest) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Play className="h-4 w-4 text-primary" />
                Rule Simulation (30-Day Backtest)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Select
                    value={simulatingRuleId?.toString() ?? ""}
                    onValueChange={(v) => setSimulatingRuleId(v ? parseInt(v) : null)}
                  >
                    <SelectTrigger className="w-64">
                      <SelectValue placeholder="Select a rule to simulate..." />
                    </SelectTrigger>
                    <SelectContent>
                      {rules?.map((r) => (
                        <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {simulatingRuleId && (
                    <Button variant="outline" size="sm" onClick={() => setSimulatingRuleId(null)}>
                      Clear
                    </Button>
                  )}
                </div>

                {simLoading && <div className="h-24 bg-muted animate-pulse rounded-lg" />}

                {simulation && !simLoading && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="p-3 rounded-lg bg-blue-50 text-center">
                        <div className="text-2xl font-bold text-blue-700">{simulation.totalTriggers}</div>
                        <div className="text-xs text-muted-foreground mt-1">Total Triggers (30d)</div>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50 text-center">
                        <div className="text-2xl font-bold">{simulation.avgPerDay}</div>
                        <div className="text-xs text-muted-foreground mt-1">Avg / Day</div>
                      </div>
                      <div className="p-3 rounded-lg bg-orange-50 text-center">
                        <div className="text-2xl font-bold text-orange-700">{simulation.peakCount}</div>
                        <div className="text-xs text-muted-foreground mt-1">Peak Day Count</div>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50 text-center">
                        <div className="text-sm font-bold">{simulation.peakDay ?? "—"}</div>
                        <div className="text-xs text-muted-foreground mt-1">Peak Date</div>
                      </div>
                    </div>
                    {/* Daily bar chart */}
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Daily trigger count (last 30 days)</p>
                      <div className="flex items-end gap-0.5 h-20">
                        {simulation.dailyResults.map((d) => {
                          const maxCount = Math.max(...simulation.dailyResults.map((x) => x.triggerCount), 1);
                          const pct = (d.triggerCount / maxCount) * 100;
                          return (
                            <div
                              key={d.date}
                              className="flex-1 rounded-t cursor-pointer group relative"
                              style={{ height: `${Math.max(pct, 4)}%`, backgroundColor: d.triggerCount > 0 ? "#3b82f6" : "#e5e7eb" }}
                              title={`${d.date}: ${d.triggerCount} trigger(s)`}
                            />
                          );
                        })}
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{simulation.dailyResults[0]?.date}</span>
                        <span>{simulation.dailyResults[simulation.dailyResults.length - 1]?.date}</span>
                      </div>
                    </div>
                  </div>
                )}

                {!simulatingRuleId && (
                  <div className="text-center py-8 text-muted-foreground">
                    <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Select a rule above to see how it would have performed over the last 30 days</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── FAILURE ANALYSIS TAB ── */}
        <TabsContent value="failures" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                Failure Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {failureSummary ? (
                <>
                  {failureSummary.highFailureAlert && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>High failure rate detected: <strong>{failureSummary.failureRate}%</strong> of rule executions are failing.</span>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 rounded-lg border text-center">
                      <div className="text-2xl font-bold">{failureSummary.totalRuns}</div>
                      <div className="text-xs text-muted-foreground mt-1">Total Runs</div>
                    </div>
                    <div className="p-4 rounded-lg border text-center">
                      <div className="text-2xl font-bold text-green-600">{failureSummary.totalSuccesses}</div>
                      <div className="text-xs text-muted-foreground mt-1">Successes</div>
                    </div>
                    <div className="p-4 rounded-lg border text-center">
                      <div className="text-2xl font-bold text-red-600">{failureSummary.totalFailures}</div>
                      <div className="text-xs text-muted-foreground mt-1">Failures ({failureSummary.failureRate}%)</div>
                    </div>
                  </div>
                  {(failureSummary.byCategory as Array<{ category: string; count: number }>).length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Failures by Category</h4>
                      <div className="space-y-2">
                        {(failureSummary.byCategory as Array<{ category: string; count: number }>).map((cat) => (
                          <div key={cat.category} className="flex items-center gap-3">
                            <Badge variant="outline" className="w-28 justify-center text-xs capitalize">{cat.category}</Badge>
                            <div className="flex-1 bg-muted rounded-full h-2">
                              <div className="bg-red-500 h-2 rounded-full" style={{ width: `${Math.min(100, (cat.count / Math.max(1, failureSummary.totalFailures)) * 100)}%` }} />
                            </div>
                            <span className="text-sm font-medium w-8 text-right">{cat.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(failureSummary.repeatedFailureRules as Array<{ ruleId: number; ruleName: string; failureCount: number; lastFailure: string | null }>).length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                        <Repeat className="h-3.5 w-3.5 text-orange-500" />
                        Rules with Repeated Failures (≥3)
                      </h4>
                      <div className="space-y-2">
                        {(failureSummary.repeatedFailureRules as Array<{ ruleId: number; ruleName: string; failureCount: number; lastFailure: string | null }>).map((r) => (
                          <div key={r.ruleId} className="flex items-center justify-between p-3 rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950">
                            <div>
                              <div className="font-medium text-sm">{r.ruleName}</div>
                              <div className="text-xs text-muted-foreground">Last failed: {r.lastFailure ? new Date(r.lastFailure).toLocaleString("en-GB") : "Unknown"}</div>
                            </div>
                            <Badge variant="destructive">{r.failureCount} failures</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {failureSummary.totalFailures === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-green-500 opacity-60" />
                      <p>No failures recorded — all rules are running cleanly</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">Loading failure data...</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── PLATFORM TRIGGERS TAB ── */}
        <TabsContent value="platform" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Cpu className="h-4 w-4 text-primary" />
                Platform-Wide Automation Triggers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Automation rules can now trigger on events across the entire platform — not just HR. Use the triggers below when creating rules.</p>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { icon: FileWarning, label: "Contract Expiry", trigger: "contract_expiry", description: "Fires when a contract is expiring within N days", count: platformSummary?.contractsExpiringSoon ?? 0, countLabel: "expiring soon" },
                  { icon: Calendar, label: "Booking Overdue", trigger: "booking_overdue", description: "Fires when a marketplace booking is past its scheduled date", count: 0, countLabel: "overdue" },
                  { icon: AlertTriangle, label: "Payment Overdue", trigger: "payment_overdue", description: "Fires when an invoice payment is past due", count: 0, countLabel: "overdue" },
                  { icon: Users, label: "Client Inactive", trigger: "client_inactive", description: "Fires when a client has had no activity for N days", count: 0, countLabel: "inactive" },
                ] as Array<{ icon: React.ElementType; label: string; trigger: string; description: string; count: number; countLabel: string }>).map((item) => (
                  <div key={item.trigger} className="p-4 rounded-lg border space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <item.icon className="h-4 w-4 text-primary" />
                        <span className="font-medium text-sm">{item.label}</span>
                      </div>
                      {item.count > 0 && <Badge variant="destructive">{item.count} {item.countLabel}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                    <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => {
                      setRuleForm((p) => ({ ...p, triggerType: item.trigger as TriggerType }));
                      setShowRuleDialog(true);
                    }}>
                      <Plus className="h-3 w-3 mr-1" />
                      Create Rule for This Trigger
                    </Button>
                  </div>
                ))}
              </div>
              {platformSummary && platformSummary.pendingEvents > 0 && (
                <div className="flex items-center justify-between p-3 rounded-lg border bg-amber-50 dark:bg-amber-950">
                  <div className="flex items-center gap-2 text-sm">
                    <GitBranch className="h-4 w-4 text-amber-600" />
                    <span><strong>{platformSummary.pendingEvents}</strong> unprocessed event(s) in the queue</span>
                  </div>
                  <Button size="sm" onClick={() => processEvents.mutate()} disabled={processEvents.isPending}>
                    <Play className="h-3.5 w-3.5 mr-1" />
                    {processEvents.isPending ? "Processing..." : "Process Now"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── EXPORTS TAB ── */}
        <TabsContent value="exports" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Download className="h-4 w-4 text-primary" />
                Audit-Grade Exports
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Export automation data for compliance audits, regulatory reviews, or internal reporting.</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg border space-y-3">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">Automation Logs</span>
                  </div>
                  <p className="text-xs text-muted-foreground">All rule execution logs with status, failure details, duration, and retry counts.</p>
                  <Button size="sm" className="w-full" onClick={() => exportLogsCsv.mutate({ days: 30 })} disabled={exportLogsCsv.isPending}>
                    <Download className="h-3.5 w-3.5 mr-1" />
                    {exportLogsCsv.isPending ? "Generating..." : "Export Logs (30 days)"}
                  </Button>
                  <Button size="sm" variant="outline" className="w-full" onClick={() => exportLogsCsv.mutate({ days: 90 })} disabled={exportLogsCsv.isPending}>
                    <Download className="h-3.5 w-3.5 mr-1" />
                    Export Logs (90 days)
                  </Button>
                </div>
                <div className="p-4 rounded-lg border space-y-3">
                  <div className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">Rule History</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Full rule configuration with success/failure counts, priority, recipients, and execution statistics.</p>
                  <Button size="sm" className="w-full" onClick={() => exportRuleHistoryCsv.mutate()} disabled={exportRuleHistoryCsv.isPending}>
                    <Download className="h-3.5 w-3.5 mr-1" />
                    {exportRuleHistoryCsv.isPending ? "Generating..." : "Export Rule History"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ACTIVITY LOGS TAB ── */}
        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Recent Automation Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {logs && logs.length > 0 ? (
                <div className="space-y-2">
                  {logs.map((log) => (
                    <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border text-sm">
                      <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${log.status === "success" ? "bg-green-500" : "bg-red-500"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{log.message}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {TRIGGER_LABELS[log.triggerType as TriggerType] ?? log.triggerType} → {ACTION_LABELS[log.actionType as ActionType] ?? log.actionType}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground shrink-0">
                        {new Date(log.createdAt).toLocaleString("en-GB")}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Activity className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>No automation activity yet</p>
                  <p className="text-sm mt-1">Run your automation rules to see activity here</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Rule Create/Edit Dialog ── */}
      <Dialog open={showRuleDialog} onOpenChange={(v) => { setShowRuleDialog(v); if (!v) setEditingRule(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRule ? "Edit Automation Rule" : "Create Automation Rule"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Rule Name *</Label>
              <Input
                placeholder="e.g. Alert on visa expiry within 30 days"
                value={ruleForm.name}
                onChange={(e) => setRuleForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                placeholder="Optional description..."
                value={ruleForm.description}
                onChange={(e) => setRuleForm((p) => ({ ...p, description: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Trigger</Label>
                <Select value={ruleForm.triggerType} onValueChange={(v) => setRuleForm((p) => ({ ...p, triggerType: v as TriggerType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Action</Label>
                <Select value={ruleForm.actionType} onValueChange={(v) => setRuleForm((p) => ({ ...p, actionType: v as ActionType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ACTION_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {needsConditionValue && (
              <div className="space-y-1.5">
                <Label>
                  {ruleForm.triggerType === "completeness_below" ? "Completeness threshold (%)" : "Days before expiry"}
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={ruleForm.triggerType === "completeness_below" ? 100 : 365}
                  value={ruleForm.conditionValue}
                  onChange={(e) => setRuleForm((p) => ({ ...p, conditionValue: e.target.value }))}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Alert Recipients</Label>
                <Select value={ruleForm.alertRecipients} onValueChange={(v) => setRuleForm((p) => ({ ...p, alertRecipients: v as typeof ruleForm.alertRecipients }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(RECIPIENT_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Throttle (hours)</Label>
                <Input
                  type="number"
                  min={1}
                  max={168}
                  value={ruleForm.throttleHours}
                  onChange={(e) => setRuleForm((p) => ({ ...p, throttleHours: parseInt(e.target.value) || 24 }))}
                  placeholder="24"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={ruleForm.isActive}
                onCheckedChange={(v) => setRuleForm((p) => ({ ...p, isActive: v }))}
              />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowRuleDialog(false); setEditingRule(null); }}>Cancel</Button>
            <Button onClick={saveRule} disabled={createRule.isPending || updateRule.isPending}>
              {editingRule ? "Save Changes" : "Create Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
