import React, { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { invalidateAfterKpiLifecycleMutation, invalidateAfterKpiTargetMutation } from "@/lib/hrPerformanceInvalidation";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import {
  Target, Trophy, Activity, TrendingUp, Plus, Edit2,
  Users, Award, Zap, ChevronDown, ChevronUp, Eye,
  DollarSign, MoreHorizontal,
} from "lucide-react";
import { HubBreadcrumb } from "@/components/hub/HubBreadcrumb";
import { hrInsightsTrail } from "@/components/hub/hubCrumbs";

const METRIC_TYPE_VALUES = [
  "sales_amount", "client_count", "leads_count", "calls_count",
  "meetings_count", "proposals_count", "revenue", "units_sold", "custom",
] as const;

const MONTH_KEYS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"] as const;

const fmtOmr = (n: number) => `OMR ${n.toFixed(3)}`;

type KpiLifecycleStatus = "draft" | "active" | "completed" | "archived" | "cancelled";

/** targetStatusLabel is replaced by t("kpi.lifecycle.<status>") at call sites */

function TargetStatusBadge({ status }: { status?: string | null }) {
  const { t } = useTranslation("hr");
  const s = (status ?? "active") as KpiLifecycleStatus;
  const cls =
    s === "active"
      ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300"
      : s === "draft"
        ? "bg-slate-100 text-slate-800 dark:bg-slate-800"
        : s === "completed"
          ? "bg-blue-100 text-blue-800 dark:bg-blue-950/30"
          : s === "archived"
            ? "bg-muted text-muted-foreground"
            : "bg-red-100 text-red-900 dark:bg-red-950/40";
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${cls}`}>
      {t(`kpi.lifecycle.${s}`, { defaultValue: s })}
    </span>
  );
}

/** Returns lifecycle transition keys; labels are resolved with t() at render time */
function lifecycleActionsFor(status: string): { to: KpiLifecycleStatus; labelKey: string }[] {
  switch (status) {
    case "draft":
      return [
        { to: "active", labelKey: "kpi.lifecycle.activate" },
        { to: "cancelled", labelKey: "kpi.lifecycle.cancel" },
      ];
    case "active":
      return [
        { to: "completed", labelKey: "kpi.lifecycle.markComplete" },
        { to: "archived", labelKey: "kpi.lifecycle.archive" },
        { to: "cancelled", labelKey: "kpi.lifecycle.cancel" },
      ];
    case "archived":
      return [{ to: "active", labelKey: "kpi.lifecycle.reactivate" }];
    default:
      return [];
  }
}

function getInitials(firstName: string, lastName: string) {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase();
}

function PctBadge({ pct }: { pct: number }) {
  const color = pct >= 100 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
    : pct >= 80 ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
    : pct >= 50 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>{pct.toFixed(1)}%</span>;
}

export default function HRKpiPage() {
  const { t } = useTranslation("hr");
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [activeTab, setActiveTab] = useState("team");

  // ── Set Target Dialog ──────────────────────────────────────────────────────
  const [showSetTarget, setShowSetTarget] = useState(false);
  const [editTargetId, setEditTargetId] = useState<number | null>(null);
  const [tEmpUserId, setTEmpUserId] = useState<number | null>(null);
  const [tMetricName, setTMetricName] = useState("");
  const [tMetricType, setTMetricType] = useState<string>("sales_amount");
  const [tTargetValue, setTTargetValue] = useState("");
  const [tCommRate, setTCommRate] = useState("0");
  const [tCommType, setTCommType] = useState<string>("percentage");
  const [tCurrency, setTCurrency] = useState("OMR");
  const [tNotes, setTNotes] = useState("");

  // ── View Logs Dialog ───────────────────────────────────────────────────────
  const [showLogs, setShowLogs] = useState(false);
  const [logsEmpUserId, setLogsEmpUserId] = useState<number | null>(null);
  const [logsEmpName, setLogsEmpName] = useState("");
  const [pendingLifecycleConfirm, setPendingLifecycleConfirm] = useState<{
    id: number;
    to: "completed" | "cancelled";
  } | null>(null);

  // ── Data ───────────────────────────────────────────────────────────────────
  const { activeCompanyId } = useActiveCompany();
  const { data: employees, isLoading: empsLoading } = trpc.hr.listEmployees.useQuery(
    { status: "active", companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );
  const { data: teamProgress, isLoading: progressLoading, refetch: refetchProgress } = trpc.kpi.adminGetTeamProgress.useQuery(
    { year, month, companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );
  const { data: leaderboard, isLoading: lbLoading, refetch: refetchLb } = trpc.kpi.getLeaderboard.useQuery(
    { year, month, companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );
  const { data: empLogs } = trpc.kpi.adminListEmployeeLogs.useQuery(
    { employeeUserId: logsEmpUserId ?? 0, year, month, companyId: activeCompanyId ?? undefined },
    { enabled: !!logsEmpUserId && activeCompanyId != null },
  );

  const utils = trpc.useUtils();

  const setTargetMut = trpc.kpi.setTarget.useMutation({
    onSuccess: async () => {
      toast.success(editTargetId ? t("kpi.targetUpdated") : t("kpi.targetSet"));
      setShowSetTarget(false);
      resetTargetForm();
      await invalidateAfterKpiTargetMutation(utils);
      refetchProgress();
      refetchLb();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const transitionMut = trpc.kpi.transitionKpiTarget.useMutation({
    onSuccess: async () => {
      toast.success(t("kpi.targetStatusUpdated"));
      setPendingLifecycleConfirm(null);
      await invalidateAfterKpiLifecycleMutation(utils);
      refetchProgress();
      refetchLb();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  function requestTargetTransition(id: number, to: KpiLifecycleStatus) {
    if (to === "completed" || to === "cancelled") {
      setPendingLifecycleConfirm({ id, to });
      return;
    }
    if (!activeCompanyId) {
      toast.error(t("kpi.selectCompany"));
      return;
    }
    transitionMut.mutate({ id, to, companyId: activeCompanyId });
  }

  function resetTargetForm() {
    setEditTargetId(null);
    setTEmpUserId(null);
    setTMetricName("");
    setTMetricType("sales_amount");
    setTTargetValue("");
    setTCommRate("0");
    setTCommType("percentage");
    setTCurrency("OMR");
    setTNotes("");
  }

  function openNewTarget(empUserId?: number) {
    resetTargetForm();
    if (empUserId) setTEmpUserId(empUserId);
    setShowSetTarget(true);
  }

  function openEditTarget(item: any) {
    const tgt = item.target;
    const st = (tgt.targetStatus ?? "active") as string;
    if (st !== "draft" && st !== "active") {
      toast.error(t("kpi.onlyDraftActiveEditable"));
      return;
    }
    setEditTargetId(tgt.id);
    setTEmpUserId(tgt.employeeUserId);
    setTMetricName(tgt.metricName);
    setTMetricType(tgt.metricType);
    setTTargetValue(String(tgt.targetValue));
    setTCommRate(String(tgt.commissionRate ?? 0));
    setTCommType(tgt.commissionType ?? "percentage");
    setTCurrency(tgt.currency ?? "OMR");
    setTNotes(tgt.notes ?? "");
    setShowSetTarget(true);
  }

  function handleSaveTarget() {
    if (!tEmpUserId || !tMetricName || !tTargetValue) {
      toast.error(t("kpi.fillRequired"));
      return;
    }
    if (!activeCompanyId) {
      toast.error(t("kpi.selectCompany"));
      return;
    }
    setTargetMut.mutate({
      id: editTargetId ?? undefined,
      employeeUserId: tEmpUserId,
      year,
      month,
      metricName: tMetricName,
      metricType: tMetricType as any,
      targetValue: Number(tTargetValue),
      commissionRate: Number(tCommRate),
      commissionType: tCommType as any,
      currency: tCurrency,
      notes: tNotes || undefined,
      companyId: activeCompanyId,
    });
  }

  // ── Group team progress by employee ────────────────────────────────────────
  const empProgressMap = useMemo(() => {
    if (!teamProgress) return new Map<number, any[]>();
    const map = new Map<number, any[]>();
    (teamProgress as any[]).forEach((item: any) => {
      const uid = item.target.employeeUserId;
      if (!map.has(uid)) map.set(uid, []);
      map.get(uid)!.push(item);
    });
    return map;
  }, [teamProgress]);

  const empList = useMemo(() => employees ?? [], [employees]);

  // ── Summary stats ──────────────────────────────────────────────────────────
  const summaryStats = useMemo(() => {
    const progress = (teamProgress as any[]) ?? [];
    const totalTargets = progress.length;
    const achieved = progress.filter((i: any) => i.pct >= 100).length;
    const onTrack = progress.filter((i: any) => i.pct >= 80 && i.pct < 100).length;
    const totalComm = progress.reduce((s: number, i: any) => s + Number(i.commissionEarned ?? 0), 0);
    const avgPct = totalTargets ? progress.reduce((s: number, i: any) => s + Number(i.pct ?? 0), 0) / totalTargets : 0;
    return { totalTargets, achieved, onTrack, totalComm, avgPct };
  }, [teamProgress]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <HubBreadcrumb items={hrInsightsTrail(t("kpi.title"))} />
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" /> {t("kpi.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("kpi.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
            <SelectTrigger className="h-9 w-32 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTH_KEYS.map((key, i) => (
                <SelectItem key={i+1} value={String(i+1)}>{t(`kpi.months.${key}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="h-9 w-24 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[2024,2025,2026,2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" className="gap-1.5" onClick={() => openNewTarget()}>
            <Plus className="w-4 h-4" /> {t("kpi.setTarget")}
          </Button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                <Target className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("kpi.targetsSet")}</p>
                <p className="text-xl font-bold">{summaryStats.totalTargets}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Award className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("kpi.lifecycle.completed")}</p>
                <p className="text-xl font-bold text-green-600">{summaryStats.achieved}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("kpi.avgAttainment")}</p>
                <p className="text-xl font-bold text-blue-600">{summaryStats.avgPct.toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("payroll.pasiContribution", { defaultValue: "Total Commission" })}</p>
                <p className="text-xl font-bold text-amber-600">OMR {summaryStats.totalComm.toFixed(3)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-9">
          <TabsTrigger value="team" className="text-xs gap-1.5">
            <Users className="w-3.5 h-3.5" /> {t("kpi.tabs.team")}
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className="text-xs gap-1.5">
            <Trophy className="w-3.5 h-3.5" /> {t("kpi.tabs.leaderboard")}
          </TabsTrigger>
        </TabsList>

        {/* ── Team Progress Tab ── */}
        <TabsContent value="team" className="mt-4 space-y-4">
          {progressLoading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}
            </div>
          ) : empList.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                <Users className="w-12 h-12 opacity-20" />
                <p className="text-sm">{t("workforce.noEmployeesYet")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {empList.map((emp: any) => {
                const uid = emp.userId ?? emp.id;
                const items = empProgressMap.get(uid) ?? [];
                const hasTargets = items.length > 0;
                const empAvgPct = hasTargets
                  ? items.reduce((s: number, i: any) => s + Number(i.pct ?? 0), 0) / items.length
                  : 0;
                const empTotalComm = items.reduce((s: number, i: any) => s + Number(i.commissionEarned ?? 0), 0);

                return (
                  <EmployeeKpiCard
                    key={emp.id}
                    emp={emp}
                    uid={uid}
                    items={items}
                    hasTargets={hasTargets}
                    avgPct={empAvgPct}
                    totalComm={empTotalComm}
                    onAddTarget={() => openNewTarget(uid)}
                    onEditTarget={openEditTarget}
                    onRequestTransition={requestTargetTransition}
                    transitionPending={transitionMut.isPending}
                    onViewLogs={() => {
                      setLogsEmpUserId(uid);
                      setLogsEmpName(`${emp.firstName} ${emp.lastName}`);
                      setShowLogs(true);
                    }}
                  />
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Leaderboard Tab ── */}
        <TabsContent value="leaderboard" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" />
                {t("kpi.tabs.leaderboard")} — {t(`kpi.months.${MONTH_KEYS[month-1]}`)} {year}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lbLoading ? (
                <div className="space-y-3">
                  {[1,2,3,4,5].map(i => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)}
                </div>
              ) : !leaderboard || (leaderboard as any[]).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                  <Trophy className="w-12 h-12 opacity-20" />
                  <p className="text-sm">{t("kpi.noKpiTargets")}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {(leaderboard as any[]).map((entry: any, idx: number) => {
                    const emp = entry.employee;
                    const name = emp ? `${emp.firstName} ${emp.lastName}` : `User #${entry.employeeUserId}`;
                    const initials = emp ? getInitials(emp.firstName, emp.lastName) : "?";
                    const rankColor = idx === 0 ? "bg-amber-400" : idx === 1 ? "bg-slate-400" : idx === 2 ? "bg-orange-400" : "bg-muted";
                    const rankTextColor = idx < 3 ? "text-white" : "text-muted-foreground";
                    const rowBg = idx === 0 ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200"
                      : idx === 1 ? "bg-slate-50 dark:bg-slate-900/20 border-slate-200"
                      : idx === 2 ? "bg-orange-50 dark:bg-orange-950/20 border-orange-200"
                      : "border-border";

                    return (
                      <div key={entry.employeeUserId} className={`flex items-center gap-3 p-3 rounded-xl border ${rowBg}`}>
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${rankColor} ${rankTextColor}`}>
                          {idx + 1}
                        </span>
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary">
                          {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{name}</p>
                          <p className="text-xs text-muted-foreground">{emp?.position ?? ""}{emp?.department ? ` · ${emp.department}` : ""}</p>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <div className="text-center hidden sm:block">
                            <p className="text-xs text-muted-foreground">{t("kpi.lifecycle.completed")}</p>
                            <p className="text-sm font-semibold">{Number(entry.totalAchieved ?? 0).toLocaleString()}</p>
                          </div>
                          <div className="text-center hidden sm:block">
                            <p className="text-xs text-muted-foreground">{t("kpi.commissionRate")}</p>
                            <p className="text-sm font-semibold text-amber-600">OMR {Number(entry.totalCommission ?? 0).toFixed(3)}</p>
                          </div>
                          <div className="text-right">
                            <PctBadge pct={Number(entry.avgPct ?? 0)} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Set / Edit Target Dialog ── */}
      <Dialog open={showSetTarget} onOpenChange={(o) => { if (!o) { setShowSetTarget(false); resetTargetForm(); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editTargetId ? t("kpi.editTarget") : t("kpi.setTarget")}</DialogTitle>
            <DialogDescription className="text-xs">
              {editTargetId ? t("kpi.editTarget") : `${t("kpi.setTarget")} — ${t(`kpi.months.${MONTH_KEYS[month-1]}`)} ${year}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Employee */}
            {!editTargetId && (
              <div className="space-y-1.5">
                <Label>{t("employee")} <span className="text-destructive">*</span></Label>
                <Select value={tEmpUserId ? String(tEmpUserId) : ""} onValueChange={v => setTEmpUserId(Number(v))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={t("kpi.selectEmployee")} /></SelectTrigger>
                  <SelectContent>
                    {(empList as any[]).map((e: any) => (
                      <SelectItem key={e.id} value={String(e.userId ?? e.id)}>
                        {e.firstName} {e.lastName} {e.position ? `— ${e.position}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Metric Name */}
            <div className="space-y-1.5">
              <Label>Metric Name <span className="text-destructive">*</span></Label>
              <Input
                value={tMetricName}
                onChange={e => setTMetricName(e.target.value)}
                placeholder="e.g. Monthly Sales, New Clients, Calls Made"
                className="h-9 text-sm"
              />
            </div>

            {/* Metric Type */}
            <div className="space-y-1.5">
              <Label>{t("kpi.metricType")}</Label>
              <Select value={tMetricType} onValueChange={setTMetricType}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METRIC_TYPE_VALUES.map(v => (
                    <SelectItem key={v} value={v}>{t(`kpi.metricTypes.${v}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Target Value + Currency */}
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1.5">
                <Label>{t("kpi.targetValue")} <span className="text-destructive">*</span></Label>
                <Input
                  type="number" min="0" step="any"
                  value={tTargetValue}
                  onChange={e => setTTargetValue(e.target.value)}
                  placeholder="e.g. 5000"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("kpi.currency")}</Label>
                <Select value={tCurrency} onValueChange={setTCurrency}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["OMR","USD","AED","SAR","EUR"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Commission */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>{t("kpi.commissionRate")}</Label>
                <Input
                  type="number" min="0" step="any"
                  value={tCommRate}
                  onChange={e => setTCommRate(e.target.value)}
                  placeholder="0"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("kpi.commissionType")}</Label>
                <Select value={tCommType} onValueChange={setTCommType}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">{t("kpi.percentage")}</SelectItem>
                    <SelectItem value="fixed_per_unit">{t("kpi.fixed")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>{t("kpi.notes")}</Label>
              <Textarea
                value={tNotes}
                onChange={e => setTNotes(e.target.value)}
                rows={2}
                className="text-sm resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowSetTarget(false); resetTargetForm(); }}>{t("common:actions.cancel", { ns: "common" })}</Button>
            <Button
              disabled={!tEmpUserId || !tMetricName || !tTargetValue || setTargetMut.isPending}
              onClick={handleSaveTarget}
            >
              {setTargetMut.isPending ? "…" : editTargetId ? t("kpi.editTarget") : t("kpi.setTarget")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── View Logs Dialog ── */}
      <Dialog open={showLogs} onOpenChange={setShowLogs}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              {t("kpi.tabs.logs")} — {logsEmpName}
            </DialogTitle>
            <DialogDescription className="text-xs">{t(`kpi.months.${MONTH_KEYS[month-1]}`)} {year}</DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto space-y-2 py-2">
            {!empLogs || (empLogs as any[]).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                <Activity className="w-10 h-10 opacity-20" />
                <p className="text-sm">{t("kpi.noKpiTargets")}</p>
              </div>
            ) : (
              (empLogs as any[]).map((log: any) => (
                <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Zap className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{log.metricName}</p>
                      <span className="text-xs font-semibold text-primary shrink-0">
                        {Number(log.valueAchieved ?? 0).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(log.logDate).toLocaleDateString("en-GB")}
                      {log.clientName ? ` · ${log.clientName}` : ""}
                    </p>
                    {log.notes && <p className="text-xs text-muted-foreground italic mt-0.5">{log.notes}</p>}
                  </div>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLogs(false)}>{t("common:actions.close", { ns: "common" })}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!pendingLifecycleConfirm}
        onOpenChange={(o) => {
          if (!o) setPendingLifecycleConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingLifecycleConfirm?.to === "completed"
                ? t("kpi.lifecycle.markComplete")
                : t("kpi.lifecycle.cancel")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingLifecycleConfirm?.to === "completed"
                ? t("kpi.targetStatusUpdated")
                : t("kpi.targetStatusUpdated")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:actions.back", { ns: "common" })}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingLifecycleConfirm) return;
                if (!activeCompanyId) return;
                transitionMut.mutate({
                  id: pendingLifecycleConfirm.id,
                  to: pendingLifecycleConfirm.to,
                  companyId: activeCompanyId,
                });
              }}
            >
              Confirm
            >
              {t("common:actions.confirm", { ns: "common" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Employee KPI Card ──────────────────────────────────────────────────────
function EmployeeKpiCard({
  emp, uid, items, hasTargets, avgPct, totalComm,
  onAddTarget, onEditTarget, onRequestTransition, transitionPending, onViewLogs,
}: {
  emp: any; uid: number; items: any[]; hasTargets: boolean;
  avgPct: number; totalComm: number;
  onAddTarget: () => void; onEditTarget: (item: any) => void;
  onRequestTransition: (id: number, to: KpiLifecycleStatus) => void;
  transitionPending: boolean;
  onViewLogs: () => void;
}) {
  const { t } = useTranslation("hr");
  const [expanded, setExpanded] = useState(false);
  const initials = getInitials(emp.firstName, emp.lastName);

  return (
    <Card className="overflow-hidden">
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-sm font-bold text-primary">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{emp.firstName} {emp.lastName}</p>
          <p className="text-xs text-muted-foreground">
            {emp.position ?? "Employee"}{emp.department ? ` · ${emp.department}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {hasTargets ? (
            <>
              <PctBadge pct={avgPct} />
              {totalComm > 0 && (
                <span className="text-xs font-medium text-amber-600 hidden sm:inline">
                  OMR {totalComm.toFixed(3)}
                </span>
              )}
              <Badge variant="outline" className="text-xs hidden sm:flex">
                {t("kpi.targetsSet")} · {items.length}
              </Badge>
            </>
          ) : (
            <span className="text-xs text-muted-foreground italic">{t("kpi.noKpiTargets")}</span>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div
          className="border-t px-4 pb-4 pt-3 space-y-3"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          role="presentation"
        >
          {/* Actions row */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onAddTarget}>
              <Plus className="w-3 h-3" /> {t("kpi.setTarget")}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onViewLogs}>
              <Eye className="w-3 h-3" /> {t("kpi.tabs.logs")}
            </Button>
          </div>

          {/* Targets list */}
          {!hasTargets ? (
            <div className="flex flex-col items-center justify-center py-6 gap-2 text-muted-foreground">
              <Target className="w-8 h-8 opacity-20" />
              <p className="text-xs">{t("kpi.noKpiTargets")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item: any) => {
                const tgt = item.target;
                const pct = Math.min(Number(item.pct ?? 0), 100);
                const isExceeded = pct >= 100;
                const isOnTrack = pct >= 80;
                const st = (tgt.targetStatus ?? "active") as string;
                const canEdit = st === "draft" || st === "active";
                const actions = lifecycleActionsFor(st);

                return (
                  <div key={tgt.id} className="space-y-1.5 p-3 rounded-lg bg-muted/30 border">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${
                          isExceeded ? "bg-green-500" : isOnTrack ? "bg-blue-500" : "bg-amber-500"
                        }`} />
                        <span className="font-medium text-sm truncate">{tgt.metricName}</span>
                        <span className="text-xs text-muted-foreground hidden sm:inline">({tgt.metricType})</span>
                        <TargetStatusBadge status={tgt.targetStatus} />
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <PctBadge pct={pct} />
                        {canEdit && (
                          <Button
                            size="sm" variant="ghost"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
                            onClick={() => onEditTarget(item)}
                            title="Edit target"
                          >
                            <Edit2 className="w-3 h-3" />
                          </Button>
                        )}
                        {actions.length > 0 && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs gap-1"
                                disabled={transitionPending}
                              >
                                <MoreHorizontal className="w-3 h-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              {actions.map((a) => (
                                <DropdownMenuItem
                                  key={a.to}
                                  onClick={() => onRequestTransition(tgt.id, a.to)}
                                >
                                  {t(a.labelKey)}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {Number(item.achievedValue ?? 0).toLocaleString()} / {Number(item.targetValue ?? 0).toLocaleString()} {tgt.unit ?? tgt.currency ?? ""}
                      </span>
                      {Number(tgt.commissionRate ?? 0) > 0 && (
                        <span className="text-amber-600 font-medium">
                          {t("kpi.commissionRate")}: OMR {Number(item.commissionEarned ?? 0).toFixed(3)}
                        </span>
                      )}
                    </div>
                    <div className="flex justify-end text-xs text-muted-foreground">
                      {Number(item.commissionEarned ?? 0) > 0
                        ? `${fmtOmr(Number(item.commissionEarned))} → payroll`
                        : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
