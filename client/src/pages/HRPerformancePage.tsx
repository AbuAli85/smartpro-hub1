import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  invalidateAfterKpiTargetMutation,
  invalidateAfterSelfReviewMutation,
  invalidateAfterTrainingMutation,
} from "@/lib/hrPerformanceInvalidation";
import {
  Target,
  Trophy,
  GraduationCap,
  ClipboardCheck,
  Sparkles,
  BarChart2,
  Plus,
  ExternalLink,
  Users,
  Filter,
} from "lucide-react";
import { HubBreadcrumb } from "@/components/hub/HubBreadcrumb";
import { hrInsightsTrail } from "@/components/hub/hubCrumbs";

const TAB_IDS = ["overview", "training", "reviews", "targets", "insights"] as const;
type TabId = (typeof TAB_IDS)[number];

const METRIC_TYPE_VALUES = ["sales_amount", "client_count", "revenue", "custom"] as const;
const MONTH_KEYS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const;
const TRAINING_STATUS_VALUES = ["assigned", "in_progress", "completed", "overdue"] as const;
const TRAINING_CATEGORY_VALUES = ["technical", "compliance", "leadership", "safety", "soft_skills", "other"] as const;

type TFn = (key: string, opts?: Record<string, unknown>) => string;

function TrainingStatusBadge({ status, t }: { status: string; t: TFn }) {
  const colorMap: Record<string, string> = {
    assigned: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
    in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    completed: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    overdue: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  };
  return (
    <Badge variant="secondary" className={colorMap[status] ?? ""}>
      {t(`performance.trainingStatus.${status}`, { defaultValue: status })}
    </Badge>
  );
}

function SelfReviewStatusBadge({ status, t }: { status: string; t: TFn }) {
  const variantMap: Record<string, string> = {
    draft: "secondary",
    submitted: "default",
    reviewed: "default",
    acknowledged: "outline",
  };
  return (
    <Badge variant={variantMap[status] as "default" | "secondary" | "outline"}>
      {t(`performance.reviewStatus.${status}`, { defaultValue: status })}
    </Badge>
  );
}

export default function HRPerformancePage() {
  const { t } = useTranslation("hr");
  const [tab, setTab] = useState<TabId>("overview");
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [reviewSubTab, setReviewSubTab] = useState<"self" | "formal">("self");

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("tab");
    if (p && TAB_IDS.includes(p as TabId)) setTab(p as TabId);
  }, []);

  function goTab(next: TabId) {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState({}, "", url.toString());
  }

  const utils = trpc.useUtils();
  const { activeCompanyId } = useActiveCompany();
  const { data: employees } = trpc.hr.listEmployees.useQuery(
    { status: "active", companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );
  const {
    data: hrDashboard,
    isLoading: hrDashboardLoading,
    isError: hrDashboardError,
    error: hrDashboardErr,
  } = trpc.financeHR.getHrPerformanceDashboard.useQuery(
    { year, month },
    { retry: false }
  );
  const { data: teamProgress, isLoading: progressLoading } = trpc.kpi.adminGetTeamProgress.useQuery(
    { year, month, companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );
  const { data: leaderboard } = trpc.kpi.getLeaderboard.useQuery(
    { year, month, companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );
  const { data: trainingRows, isLoading: trainingLoading } = trpc.financeHR.adminListTraining.useQuery();
  const { data: selfReviews, isLoading: selfLoading } = trpc.financeHR.adminListSelfReviews.useQuery();
  const { data: formalReviews, isLoading: formalLoading } = trpc.hr.listReviews.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );

  const departments = useMemo(() => {
    const s = new Set<string>();
    (employees ?? []).forEach((e: { department?: string | null }) => {
      if (e.department) s.add(e.department);
    });
    return Array.from(s).sort();
  }, [employees]);

  const filteredTraining = useMemo(() => {
    if (!trainingRows) return [];
    if (deptFilter === "all") return trainingRows;
    return trainingRows.filter((r) => (r.department ?? "") === deptFilter);
  }, [trainingRows, deptFilter]);

  const filteredSelfReviews = useMemo(() => {
    if (!selfReviews) return [];
    if (deptFilter === "all") return selfReviews;
    return selfReviews.filter((r) => (r.department ?? "") === deptFilter);
  }, [selfReviews, deptFilter]);

  /** When `hrDashboard` is missing (error / no access), values derive from list queries — transitional fallback only. */
  const overviewStats = useMemo(() => {
    const progress = (teamProgress as any[]) ?? [];
    const totalTargets = progress.length;
    const avgPctFromTeam = totalTargets
      ? progress.reduce((s, i) => s + Number(i.pct ?? 0), 0) / totalTargets
      : 0;
    if (hrDashboard) {
      const o = hrDashboard.overview;
      return {
        avgPct: o.targets.averageAchievementPctThisPeriod ?? avgPctFromTeam,
        completedTrain: o.training.completed,
        pendingSelf: o.selfReviews.pendingManagerReview,
        formalCount: (formalReviews ?? []).length,
        employeesActive: o.employees.active,
        employeesTotal: o.employees.total,
        trainingCompletionRate: hrDashboard.training.completionRate,
        managerResponseRate: hrDashboard.selfReviews.managerResponseRate,
      };
    }
    const tr = trainingRows ?? [];
    return {
      avgPct: avgPctFromTeam,
      completedTrain: tr.filter((t) => t.trainingStatus === "completed").length,
      pendingSelf: (selfReviews ?? []).filter((r) => r.reviewStatus === "submitted").length,
      formalCount: (formalReviews ?? []).length,
      employeesActive: undefined as number | undefined,
      employeesTotal: undefined as number | undefined,
      trainingCompletionRate: undefined as number | undefined,
      managerResponseRate: undefined as number | undefined,
    };
  }, [hrDashboard, teamProgress, trainingRows, selfReviews, formalReviews]);

  const empNameById = useMemo(() => {
    const m = new Map<number, string>();
    (employees ?? []).forEach((e: { id: number; firstName?: string; lastName?: string }) => {
      m.set(e.id, `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim());
    });
    return m;
  }, [employees]);

  // ── Training assign ───────────────────────────────────────────────────────
  const [assignOpen, setAssignOpen] = useState(false);
  const [trainEmpId, setTrainEmpId] = useState<string>("");
  const [trainTitle, setTrainTitle] = useState("");
  const [trainProvider, setTrainProvider] = useState("");
  const [trainCategory, setTrainCategory] = useState<string>("other");
  const [trainDue, setTrainDue] = useState("");

  const assignTrainingMut = trpc.financeHR.adminAssignTraining.useMutation({
    onSuccess: async () => {
      toast.success(t("performance.assignTrainingDialog.successToast"));
      setAssignOpen(false);
      setTrainTitle("");
      setTrainProvider("");
      setTrainDue("");
      await invalidateAfterTrainingMutation(utils);
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Training admin update ───────────────────────────────────────────────────
  const [editTrain, setEditTrain] = useState<Record<string, unknown> | null>(null);
  const [editStatus, setEditStatus] = useState<string>("assigned");
  const [editScore, setEditScore] = useState("");

  const updateTrainingMut = trpc.financeHR.adminUpdateTraining.useMutation({
    onSuccess: async () => {
      toast.success(t("performance.editTrainingDialog.successToast"));
      setEditTrain(null);
      await invalidateAfterTrainingMutation(utils);
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (editTrain) {
      setEditStatus(String(editTrain.trainingStatus ?? "assigned"));
      setEditScore(editTrain.score != null ? String(editTrain.score) : "");
    }
  }, [editTrain]);

  // ── Self-review manager dialog ─────────────────────────────────────────────
  const [editSelf, setEditSelf] = useState<Record<string, unknown> | null>(null);
  const [mgrRating, setMgrRating] = useState("3");
  const [mgrFeedback, setMgrFeedback] = useState("");
  const [goalsNext, setGoalsNext] = useState("");

  const updateSelfMut = trpc.financeHR.adminUpdateSelfReview.useMutation({
    onSuccess: async () => {
      toast.success(t("performance.feedbackDialog.successToast"));
      setEditSelf(null);
      await invalidateAfterSelfReviewMutation(utils);
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (editSelf) {
      setMgrRating(String(editSelf.managerRating ?? 3));
      setMgrFeedback(String(editSelf.managerFeedback ?? ""));
      setGoalsNext(String(editSelf.goalsNextPeriod ?? ""));
    }
  }, [editSelf]);

  // ── Formal review create ───────────────────────────────────────────────────
  const [formalOpen, setFormalOpen] = useState(false);
  const [frEmpId, setFrEmpId] = useState("");
  const [frPeriod, setFrPeriod] = useState("");
  const [frScore, setFrScore] = useState("7");
  const [frStrengths, setFrStrengths] = useState("");
  const [frImprove, setFrImprove] = useState("");
  const [frGoals, setFrGoals] = useState("");
  const [frComments, setFrComments] = useState("");

  const createReviewMut = trpc.hr.createReview.useMutation({
    onSuccess: () => {
      toast.success(t("performance.formalReviewDialog.successToast"));
      setFormalOpen(false);
      void utils.hr.listReviews.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Quick target (same semantics as HRKpiPage: employee user id for KPI) ─────
  const [targetOpen, setTargetOpen] = useState(false);
  const [tEmpUserId, setTEmpUserId] = useState<number | null>(null);
  const [tMetricName, setTMetricName] = useState("");
  const [tMetricType, setTMetricType] = useState("sales_amount");
  const [tTargetValue, setTTargetValue] = useState("");
  const [tCommRate, setTCommRate] = useState("0");

  const setTargetMut = trpc.kpi.setTarget.useMutation({
    onSuccess: async () => {
      toast.success(t("performance.targetDialog.successToast"));
      setTargetOpen(false);
      await invalidateAfterKpiTargetMutation(utils);
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <HubBreadcrumb items={hrInsightsTrail(t("performance.pageTitle"))} />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            {t("performance.pageTitle")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("performance.pageSubtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="h-9 w-[180px] text-sm">
              <Filter className="w-3.5 h-3.5 mr-1 opacity-60" />
              <SelectValue placeholder={t("performance.filters.department")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("performance.filters.allDepartments")}</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => goTab(v as TabId)}>
        <TabsList className="h-auto flex-wrap justify-start gap-1 bg-muted/50 p-1">
          <TabsTrigger value="overview" className="text-xs gap-1">
            <BarChart2 className="w-3.5 h-3.5" /> {t("performance.tabs.overview")}
          </TabsTrigger>
          <TabsTrigger value="training" className="text-xs gap-1">
            <GraduationCap className="w-3.5 h-3.5" /> {t("performance.tabs.training")}
          </TabsTrigger>
          <TabsTrigger value="reviews" className="text-xs gap-1">
            <ClipboardCheck className="w-3.5 h-3.5" /> {t("performance.tabs.reviews")}
          </TabsTrigger>
          <TabsTrigger value="targets" className="text-xs gap-1">
            <Target className="w-3.5 h-3.5" /> {t("performance.tabs.targets")}
          </TabsTrigger>
          <TabsTrigger value="insights" className="text-xs gap-1">
            <Sparkles className="w-3.5 h-3.5" /> {t("performance.tabs.insights")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          {hrDashboardError && (
            <Alert variant="destructive" data-testid="hr-dashboard-error">
              <AlertTitle>{t("performance.dashboard.loadError")}</AlertTitle>
              <AlertDescription>
                {hrDashboardErr?.message ?? t("performance.dashboard.loadErrorDesc")}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="h-9 w-32 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTH_KEYS.map((key, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>
                    {t(`kpi.months.${key}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-9 w-24 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2024, 2025, 2026, 2027].map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">{t("performance.filters.periodHelp")}</span>
          </div>

          <p className="text-xs text-muted-foreground max-w-3xl leading-relaxed" data-testid="hr-dashboard-period-help">
            <span className="font-medium text-foreground">{t("performance.periodLabel", { month, year })}</span>{" "}
            {t("performance.periodDesc")}{" "}
            <span className="font-medium text-foreground">{t("performance.allTimeLabel")}</span>{" "}
            {t("performance.allTimeDesc")}
          </p>

          {hrDashboardLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="hr-dashboard-loading">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <CardContent className="p-4 space-y-2">
                    <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                    <div className="h-8 w-20 bg-muted animate-pulse rounded" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : hrDashboard === null && !hrDashboardError ? (
            <p className="text-sm text-muted-foreground" data-testid="hr-dashboard-unavailable">
              {t("performance.dashboard.unavailable")}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="hr-dashboard-metrics">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">{t("performance.dashboard.avgKpiAchievement")}</p>
                    <p className="text-2xl font-bold">{overviewStats.avgPct.toFixed(1)}%</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {month}/{year}
                      {overviewStats.employeesActive != null && overviewStats.employeesTotal != null && (
                        <span className="block mt-0.5">
                          {t("performance.dashboard.activeOfTotal", { active: overviewStats.employeesActive, total: overviewStats.employeesTotal })}
                        </span>
                      )}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">{t("performance.dashboard.trainingCompleted")}</p>
                    <p className="text-2xl font-bold">{overviewStats.completedTrain}</p>
                    {overviewStats.trainingCompletionRate != null && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {t("performance.dashboard.completionRate", { rate: overviewStats.trainingCompletionRate })}
                      </p>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">{t("performance.dashboard.selfReviewsAwaiting")}</p>
                    <p className="text-2xl font-bold text-amber-600">{overviewStats.pendingSelf}</p>
                    {overviewStats.managerResponseRate != null && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {t("performance.dashboard.managerResponse", { rate: overviewStats.managerResponseRate })}
                      </p>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">{t("performance.dashboard.formalReviewsOnFile")}</p>
                    <p className="text-2xl font-bold">{overviewStats.formalCount}</p>
                  </CardContent>
                </Card>
              </div>

              {hrDashboard && (
                <div className="grid md:grid-cols-2 gap-3">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{t("performance.dashboard.trainingSpotlight")}</CardTitle>
                      <CardDescription>{t("performance.dashboard.trainingSpotlightDesc")}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {hrDashboard.leaderboard.topPerformers.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t("performance.dashboard.noCompletedTrainings")}</p>
                      ) : (
                        <ul className="space-y-2">
                          {hrDashboard.leaderboard.topPerformers.map((row) => (
                            <li
                              key={row.employeeId}
                              className="flex justify-between text-sm border-b border-border/60 pb-2 last:border-0"
                            >
                              <span className="flex items-center gap-2">
                                <GraduationCap className="w-4 h-4 text-primary" />
                                {row.employeeName}
                                {row.department ? (
                                  <span className="text-muted-foreground text-xs">({row.department})</span>
                                ) : null}
                              </span>
                              <span className="font-medium">
                                {t("performance.dashboard.trainingsCount", { count: row.completedTrainings })}
                                {row.averageTrainingScore != null ? t("performance.dashboard.avgScore", { score: row.averageTrainingScore }) : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {hrDashboard.leaderboard.recentTrainingCompletions.length > 0 && (
                        <div className="text-xs text-muted-foreground space-y-1 pt-1 border-t border-border/60">
                          <p className="font-medium text-foreground text-sm">{t("performance.dashboard.recentCompletions")}</p>
                          {hrDashboard.leaderboard.recentTrainingCompletions.map((r) => (
                            <div key={r.trainingId} className="flex justify-between gap-2">
                              <span className="truncate">{r.title}</span>
                              <span className="shrink-0">{r.employeeName}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{t("performance.dashboard.deptTrainingHealth")}</CardTitle>
                      <CardDescription>{t("performance.dashboard.deptTrainingHealthDesc")}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {hrDashboard.leaderboard.topDepartmentsByTrainingHealth.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t("performance.dashboard.noDeptData")}</p>
                      ) : (
                        <ul className="space-y-2">
                          {hrDashboard.leaderboard.topDepartmentsByTrainingHealth.map((d) => (
                            <li
                              key={d.department}
                              className="flex justify-between text-sm border-b border-border/60 pb-2 last:border-0"
                            >
                              <span>{d.department}</span>
                              <span className="font-medium">
                                {d.healthScore}% ({d.completed}/{d.totalAssignments})
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{t("performance.dashboard.topPerformersKpi")}</CardTitle>
                  <CardDescription>{t("performance.dashboard.topPerformersDesc")}</CardDescription>
                </CardHeader>
                <CardContent>
                  {!leaderboard?.length ? (
                    <p className="text-sm text-muted-foreground">{t("performance.dashboard.noAchievementData")}</p>
                  ) : (
                    <ul className="space-y-2">
                      {leaderboard.slice(0, 5).map((row: { rank: number; employee: { firstName?: string; lastName?: string } | null; avgPct: number }) => (
                        <li key={row.rank} className="flex justify-between text-sm border-b border-border/60 pb-2 last:border-0">
                          <span className="flex items-center gap-2">
                            <Trophy className="w-4 h-4 text-amber-500" />#{row.rank}{" "}
                            {row.employee
                              ? `${row.employee.firstName ?? ""} ${row.employee.lastName ?? ""}`.trim()
                              : t("performance.dashboard.employeeFallback")}
                          </span>
                          <span className="font-medium">{row.avgPct.toFixed(1)}%</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button variant="outline" size="sm" className="mt-4 gap-1" asChild>
                    <Link href="/hr/kpi">
                      {t("performance.dashboard.openKpiConsole")} <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="training" className="mt-4 space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <p className="text-sm text-muted-foreground">
              {t("performance.trainingTab.subtitle")}
            </p>
            <Button size="sm" className="gap-1" onClick={() => setAssignOpen(true)}>
              <Plus className="w-4 h-4" /> {t("performance.trainingTab.assignBtn")}
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {trainingLoading ? (
                <div className="p-8 text-sm text-muted-foreground">{t("performance.trainingTab.loading")}</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("performance.trainingTab.tableEmployee")}</TableHead>
                      <TableHead>{t("performance.trainingTab.tableTitle")}</TableHead>
                      <TableHead>{t("performance.trainingTab.tableDept")}</TableHead>
                      <TableHead>{t("performance.trainingTab.tableStatus")}</TableHead>
                      <TableHead>{t("performance.trainingTab.tableScore")}</TableHead>
                      <TableHead className="text-right">{t("performance.trainingTab.tableActions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTraining.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          {deptFilter !== "all" ? t("performance.trainingTab.noRecordsFiltered") : t("performance.trainingTab.noRecords")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredTraining.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.employeeName}</TableCell>
                          <TableCell>{row.title}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{row.department || "—"}</TableCell>
                          <TableCell>
                            <TrainingStatusBadge status={row.trainingStatus} t={t} />
                          </TableCell>
                          <TableCell>{row.score != null ? `${row.score}` : "—"}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => setEditTrain(row as Record<string, unknown>)}>
                              {t("performance.trainingTab.updateBtn")}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reviews" className="mt-4 space-y-4">
          <Tabs value={reviewSubTab} onValueChange={(v) => setReviewSubTab(v as "self" | "formal")}>
            <TabsList className="h-9">
              <TabsTrigger value="self">{t("performance.reviewsTab.selfSubTab")}</TabsTrigger>
              <TabsTrigger value="formal">{t("performance.reviewsTab.formalSubTab")}</TabsTrigger>
            </TabsList>
            <TabsContent value="self" className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                {t("performance.reviewsTab.selfSubtitle")}
              </p>
              {selfLoading ? (
                <div className="text-sm text-muted-foreground">{t("performance.reviewsTab.loading")}</div>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("performance.reviewsTab.selfTableEmployee")}</TableHead>
                          <TableHead>{t("performance.reviewsTab.selfTablePeriod")}</TableHead>
                          <TableHead>{t("performance.reviewsTab.selfTableSelfRating")}</TableHead>
                          <TableHead>{t("performance.reviewsTab.selfTableStatus")}</TableHead>
                          <TableHead className="text-right">{t("performance.reviewsTab.selfTableActions")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredSelfReviews.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                              {t("performance.reviewsTab.noSelfReviews")}
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredSelfReviews.map((r) => (
                            <TableRow key={r.id}>
                              <TableCell className="font-medium">{r.employeeName}</TableCell>
                              <TableCell>{r.reviewPeriod}</TableCell>
                              <TableCell>{r.selfRating ?? "—"}</TableCell>
                              <TableCell>
                                <SelfReviewStatusBadge status={r.reviewStatus} t={t} />
                              </TableCell>
                              <TableCell className="text-right">
                                <Button variant="ghost" size="sm" onClick={() => setEditSelf(r as Record<string, unknown>)}>
                                  {r.reviewStatus === "reviewed" ? t("performance.reviewsTab.viewEdit") : t("performance.reviewsTab.addFeedback")}
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
            <TabsContent value="formal" className="mt-4 space-y-3">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <p className="text-sm text-muted-foreground">
                  {t("performance.reviewsTab.formalSubtitle")}
                </p>
                <Button size="sm" className="gap-1" onClick={() => setFormalOpen(true)}>
                  <Plus className="w-4 h-4" /> {t("performance.reviewsTab.newReviewBtn")}
                </Button>
              </div>
              {formalLoading ? (
                <div className="text-sm text-muted-foreground">{t("performance.reviewsTab.loading")}</div>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("performance.reviewsTab.formalTableEmployee")}</TableHead>
                          <TableHead>{t("performance.reviewsTab.formalTablePeriod")}</TableHead>
                          <TableHead>{t("performance.reviewsTab.formalTableScore")}</TableHead>
                          <TableHead>{t("performance.reviewsTab.formalTableStatus")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {!(formalReviews ?? []).length ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                              {t("performance.reviewsTab.noFormalReviews")}
                            </TableCell>
                          </TableRow>
                        ) : (
                          (formalReviews ?? []).map((rv: { id: number; employeeId: number; period: string; overallScore: string | null; status: string }) => (
                            <TableRow key={rv.id}>
                              <TableCell className="font-medium">
                                {empNameById.get(rv.employeeId) ?? t("performance.reviewsTab.employeeFallback", { id: rv.employeeId })}
                              </TableCell>
                              <TableCell>{rv.period}</TableCell>
                              <TableCell>{rv.overallScore ?? "—"}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{t(`performance.reviewStatus.${rv.status}`, { defaultValue: rv.status })}</Badge>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="targets" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger className="h-9 w-32 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_KEYS.map((key, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {t(`kpi.months.${key}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="h-9 w-24 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2024, 2025, 2026, 2027].map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="gap-1" onClick={() => setTargetOpen(true)}>
                <Plus className="w-4 h-4" /> {t("performance.targetsTab.quickAssignBtn")}
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/hr/kpi">{t("performance.targetsTab.fullKpiBtn")}</Link>
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("performance.targetsTab.teamProgressTitle")}</CardTitle>
              <CardDescription>{t("performance.targetsTab.teamProgressDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              {progressLoading ? (
                <div className="text-sm text-muted-foreground">{t("performance.targetsTab.loading")}</div>
              ) : !(teamProgress as any[])?.length ? (
                <p className="text-sm text-muted-foreground">{t("performance.targetsTab.noTargets")}</p>
              ) : (
                <div className="space-y-3">
                  {(teamProgress as any[]).map((item: any) => {
                    const emp = item.employee;
                    const label = emp
                      ? `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim()
                      : t("performance.targetsTab.userFallback", { id: item.target.employeeUserId });
                    return (
                      <div key={`${item.target.id}-${item.target.metricName}`} className="border rounded-lg p-3 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{label}</span>
                          <span className="text-muted-foreground">{item.target.metricName}</span>
                        </div>
                        <Progress value={Math.min(Number(item.pct ?? 0), 100)} className="h-2" />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>
                            {Number(item.achievedValue ?? 0).toFixed(2)} / {Number(item.targetValue ?? 0).toFixed(2)}
                          </span>
                          <span>{Number(item.pct ?? 0).toFixed(1)}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("performance.insightsTab.subtitle")}
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            <Card className="hover:border-primary/40 transition-colors">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-4 h-4" /> {t("performance.insightsTab.workforceTitle")}
                </CardTitle>
                <CardDescription>{t("performance.insightsTab.workforceDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="secondary" className="gap-1">
                  <Link href="/hr/workforce-intelligence">
                    {t("performance.insightsTab.openDashboard")} <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
            <Card className="hover:border-primary/40 transition-colors">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart2 className="w-4 h-4" /> {t("performance.insightsTab.hrOpsTitle")}
                </CardTitle>
                <CardDescription>{t("performance.insightsTab.hrOpsDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="secondary" className="gap-1">
                  <Link href="/hr/executive-dashboard">
                    {t("performance.insightsTab.openDashboard")} <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Assign training */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("performance.assignTrainingDialog.title")}</DialogTitle>
            <DialogDescription>{t("performance.assignTrainingDialog.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("performance.assignTrainingDialog.employeeLabel")}</Label>
              <Select value={trainEmpId} onValueChange={setTrainEmpId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("performance.assignTrainingDialog.selectEmployee")} />
                </SelectTrigger>
                <SelectContent>
                  {(employees ?? []).map((e: { id: number; firstName?: string; lastName?: string }) => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {e.firstName} {e.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("performance.assignTrainingDialog.titleLabel")}</Label>
              <Input value={trainTitle} onChange={(ev) => setTrainTitle(ev.target.value)} placeholder={t("performance.assignTrainingDialog.titlePlaceholder")} />
            </div>
            <div>
              <Label>{t("performance.assignTrainingDialog.providerLabel")}</Label>
              <Input value={trainProvider} onChange={(ev) => setTrainProvider(ev.target.value)} />
            </div>
            <div>
              <Label>{t("performance.assignTrainingDialog.categoryLabel")}</Label>
              <Select value={trainCategory} onValueChange={setTrainCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRAINING_CATEGORY_VALUES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(`performance.trainingCategories.${c}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("performance.assignTrainingDialog.dueDateLabel")}</Label>
              <Input type="date" value={trainDue} onChange={(ev) => setTrainDue(ev.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (!trainEmpId || trainTitle.trim().length < 2) {
                  toast.error(t("performance.assignTrainingDialog.validationError"));
                  return;
                }
                assignTrainingMut.mutate({
                  employeeId: Number(trainEmpId),
                  title: trainTitle.trim(),
                  provider: trainProvider || undefined,
                  category: trainCategory as "technical" | "compliance" | "leadership" | "safety" | "soft_skills" | "other",
                  dueDate: trainDue || undefined,
                });
              }}
              disabled={assignTrainingMut.isPending}
            >
              {t("performance.assignTrainingDialog.assignBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit training */}
      <Dialog open={!!editTrain} onOpenChange={(o) => !o && setEditTrain(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("performance.editTrainingDialog.title")}</DialogTitle>
            <DialogDescription>{t("performance.editTrainingDialog.description")}</DialogDescription>
          </DialogHeader>
          {editTrain && (
            <div className="space-y-3">
              <p className="text-sm font-medium">{String(editTrain.title ?? "")}</p>
              <div>
                <Label>{t("performance.editTrainingDialog.statusLabel")}</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRAINING_STATUS_VALUES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`performance.trainingStatus.${s}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("performance.editTrainingDialog.scoreLabel")}</Label>
                <Input value={editScore} onChange={(ev) => setEditScore(ev.target.value)} placeholder={t("performance.editTrainingDialog.scorePlaceholder")} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                updateTrainingMut.mutate({
                  id: Number(editTrain!.id),
                  trainingStatus: editStatus as "assigned" | "in_progress" | "completed" | "overdue",
                  score: editScore === "" ? undefined : Number(editScore),
                })
              }
              disabled={updateTrainingMut.isPending || !editTrain}
            >
              {t("performance.editTrainingDialog.saveBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manager feedback on self-review */}
      <Dialog open={!!editSelf} onOpenChange={(o) => !o && setEditSelf(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("performance.feedbackDialog.title")}</DialogTitle>
            <DialogDescription>{t("performance.feedbackDialog.descriptionFor", { name: String(editSelf?.employeeName ?? "") })}</DialogDescription>
          </DialogHeader>
          {editSelf && (
            <div className="space-y-3 max-h-[50vh] overflow-y-auto text-sm">
              <div>
                <Label className="text-muted-foreground">{t("performance.feedbackDialog.periodLabel")}</Label>
                <p>{String(editSelf.reviewPeriod ?? "")}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">{t("performance.feedbackDialog.selfRatingLabel")}</Label>
                <p>{editSelf.selfRating != null ? String(editSelf.selfRating) : "—"}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">{t("performance.feedbackDialog.achievementsLabel")}</Label>
                <p className="whitespace-pre-wrap">{String(editSelf.selfAchievements ?? "—")}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">{t("performance.feedbackDialog.goalsLabel")}</Label>
                <p className="whitespace-pre-wrap">{String(editSelf.selfGoals ?? "—")}</p>
              </div>
              <div>
                <Label>{t("performance.feedbackDialog.mgrRatingLabel")}</Label>
                <Input value={mgrRating} onChange={(ev) => setMgrRating(ev.target.value)} type="number" min={1} max={5} />
              </div>
              <div>
                <Label>{t("performance.feedbackDialog.feedbackLabel")}</Label>
                <Textarea value={mgrFeedback} onChange={(ev) => setMgrFeedback(ev.target.value)} rows={3} />
              </div>
              <div>
                <Label>{t("performance.feedbackDialog.goalsNextLabel")}</Label>
                <Textarea value={goalsNext} onChange={(ev) => setGoalsNext(ev.target.value)} rows={2} />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="secondary"
              onClick={() =>
                editSelf &&
                updateSelfMut.mutate({
                  id: Number(editSelf.id),
                  managerRating: Number(mgrRating),
                  managerFeedback: mgrFeedback || undefined,
                  goalsNextPeriod: goalsNext || undefined,
                  reviewStatus: "reviewed",
                })
              }
              disabled={updateSelfMut.isPending || !editSelf}
            >
              {t("performance.feedbackDialog.markReviewedBtn")}
            </Button>
            <Button
              onClick={() =>
                editSelf &&
                updateSelfMut.mutate({
                  id: Number(editSelf.id),
                  managerRating: Number(mgrRating),
                  managerFeedback: mgrFeedback || undefined,
                  goalsNextPeriod: goalsNext || undefined,
                })
              }
              disabled={updateSelfMut.isPending || !editSelf}
            >
              {t("performance.feedbackDialog.saveDraftBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New formal review */}
      <Dialog open={formalOpen} onOpenChange={setFormalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("performance.formalReviewDialog.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("performance.formalReviewDialog.employeeLabel")}</Label>
              <Select value={frEmpId} onValueChange={setFrEmpId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("performance.formalReviewDialog.selectEmployee")} />
                </SelectTrigger>
                <SelectContent>
                  {(employees ?? []).map((e: { id: number; firstName?: string; lastName?: string }) => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {e.firstName} {e.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("performance.formalReviewDialog.periodLabel")}</Label>
              <Input value={frPeriod} onChange={(ev) => setFrPeriod(ev.target.value)} />
            </div>
            <div>
              <Label>{t("performance.formalReviewDialog.scoreLabel")}</Label>
              <Input value={frScore} onChange={(ev) => setFrScore(ev.target.value)} type="number" min={0} max={10} step={0.5} />
            </div>
            <div>
              <Label>{t("performance.formalReviewDialog.strengthsLabel")}</Label>
              <Textarea value={frStrengths} onChange={(ev) => setFrStrengths(ev.target.value)} rows={2} />
            </div>
            <div>
              <Label>{t("performance.formalReviewDialog.improvementsLabel")}</Label>
              <Textarea value={frImprove} onChange={(ev) => setFrImprove(ev.target.value)} rows={2} />
            </div>
            <div>
              <Label>{t("performance.formalReviewDialog.goalsLabel")}</Label>
              <Textarea value={frGoals} onChange={(ev) => setFrGoals(ev.target.value)} rows={2} />
            </div>
            <div>
              <Label>{t("performance.formalReviewDialog.commentsLabel")}</Label>
              <Textarea value={frComments} onChange={(ev) => setFrComments(ev.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (!frEmpId || !frPeriod.trim()) {
                  toast.error(t("performance.formalReviewDialog.validationError"));
                  return;
                }
                createReviewMut.mutate({
                  employeeId: Number(frEmpId),
                  period: frPeriod.trim(),
                  overallScore: frScore === "" ? undefined : Number(frScore),
                  strengths: frStrengths || undefined,
                  improvements: frImprove || undefined,
                  goals: frGoals || undefined,
                  comments: frComments || undefined,
                });
              }}
              disabled={createReviewMut.isPending}
            >
              {t("performance.formalReviewDialog.saveBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick KPI target */}
      <Dialog open={targetOpen} onOpenChange={setTargetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("performance.targetDialog.title")}</DialogTitle>
            <DialogDescription>{t("performance.targetDialog.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("performance.targetDialog.employeeLabel")}</Label>
              <Select
                value={tEmpUserId != null ? String(tEmpUserId) : ""}
                onValueChange={(v) => setTEmpUserId(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("performance.targetDialog.selectEmployee")} />
                </SelectTrigger>
                <SelectContent>
                  {(employees ?? []).map((e: { id: number; userId?: number | null; firstName?: string; lastName?: string }) => {
                    const uid = e.userId ?? e.id;
                    return (
                      <SelectItem key={e.id} value={String(uid)}>
                        {e.firstName} {e.lastName}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("performance.targetDialog.metricNameLabel")}</Label>
              <Input value={tMetricName} onChange={(ev) => setTMetricName(ev.target.value)} placeholder={t("performance.targetDialog.metricNamePlaceholder")} />
            </div>
            <div>
              <Label>{t("performance.targetDialog.metricTypeLabel")}</Label>
              <Select value={tMetricType} onValueChange={setTMetricType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRIC_TYPE_VALUES.map((v) => (
                    <SelectItem key={v} value={v}>
                      {t(`kpi.metricTypes.${v}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("performance.targetDialog.targetValueLabel")}</Label>
              <Input value={tTargetValue} onChange={(ev) => setTTargetValue(ev.target.value)} type="number" />
            </div>
            <div>
              <Label>{t("performance.targetDialog.commissionRateLabel")}</Label>
              <Input value={tCommRate} onChange={(ev) => setTCommRate(ev.target.value)} type="number" />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (!tEmpUserId || !tMetricName.trim() || !tTargetValue) {
                  toast.error(t("performance.targetDialog.validationError"));
                  return;
                }
                setTargetMut.mutate({
                  employeeUserId: tEmpUserId,
                  year,
                  month,
                  metricName: tMetricName.trim(),
                  metricType: tMetricType as "sales_amount" | "client_count" | "revenue" | "custom",
                  targetValue: Number(tTargetValue),
                  commissionRate: Number(tCommRate),
                  commissionType: "percentage",
                  currency: "OMR",
                });
              }}
              disabled={setTargetMut.isPending}
            >
              {t("performance.targetDialog.setBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
