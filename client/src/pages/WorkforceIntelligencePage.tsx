import { useState } from "react";
import { useLocation } from "wouter";
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
  ArrowUpRight, Calendar, Building2
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Priority = "critical" | "high" | "medium";
type TriggerType = "visa_expiry" | "work_permit_expiry" | "passport_expiry" | "completeness_below" | "no_department";
type ActionType = "notify_admin" | "notify_employee" | "create_task" | "escalate";

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
};

const ACTION_LABELS: Record<ActionType, string> = {
  notify_admin: "Notify Admin",
  notify_employee: "Notify Employee",
  create_task: "Create Task",
  escalate: "Escalate",
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
  });

  const utils = trpc.useUtils();

  // Queries
  const { data: kpi, isLoading: kpiLoading, refetch: refetchKPI } = trpc.automation.getWorkforceKPI.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const { data: rules, isLoading: rulesLoading } = trpc.automation.listRules.useQuery();
  const { data: logs } = trpc.automation.getLogs.useQuery({ limit: 30 });
  const { data: trend } = trpc.automation.getHealthTrend.useQuery();

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

  function openCreateDialog() {
    setEditingRule(null);
    setRuleForm({ name: "", description: "", triggerType: "visa_expiry", conditionValue: "30", actionType: "notify_admin", isActive: true });
    setShowRuleDialog(true);
  }

  function openEditDialog(rule: NonNullable<typeof rules>[number]) {
    setEditingRule({ id: rule.id, name: rule.name, description: rule.description ?? "", triggerType: rule.triggerType as TriggerType, conditionValue: rule.conditionValue ?? "30", actionType: rule.actionType as ActionType, isActive: rule.isActive });
    setRuleForm({ name: rule.name, description: rule.description ?? "", triggerType: rule.triggerType as TriggerType, conditionValue: rule.conditionValue ?? "30", actionType: rule.actionType as ActionType, isActive: rule.isActive });
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

  const needsConditionValue = ["visa_expiry", "work_permit_expiry", "passport_expiry", "completeness_below"].includes(ruleForm.triggerType);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
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
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetchKPI(); }} disabled={kpiLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${kpiLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => runRules.mutate()} disabled={runRules.isPending}>
            <Play className="h-4 w-4 mr-1" />
            {runRules.isPending ? "Running..." : "Run All Rules"}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="expiry">Expiry Timeline</TabsTrigger>
          <TabsTrigger value="automation">Automation Rules</TabsTrigger>
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
                              Run {rule.runCount}× {rule.lastRunAt ? `· Last: ${new Date(rule.lastRunAt).toLocaleDateString()}` : ""}
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
                        {new Date(log.createdAt).toLocaleString()}
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
