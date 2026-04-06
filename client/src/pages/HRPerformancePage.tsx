import React, { useEffect, useMemo, useState } from "react";
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

const TAB_IDS = ["overview", "training", "reviews", "targets", "insights"] as const;
type TabId = (typeof TAB_IDS)[number];

const METRIC_TYPES = [
  { value: "sales_amount", label: "Sales Amount" },
  { value: "client_count", label: "Client Count" },
  { value: "revenue", label: "Revenue" },
  { value: "custom", label: "Custom" },
] as const;

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function trainingStatusBadge(status: string) {
  const map: Record<string, string> = {
    assigned: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
    in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    completed: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    overdue: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  };
  return (
    <Badge variant="secondary" className={map[status] ?? ""}>
      {status.replace("_", " ")}
    </Badge>
  );
}

function selfReviewStatusBadge(status: string) {
  const map: Record<string, string> = {
    draft: "secondary",
    submitted: "default",
    reviewed: "default",
    acknowledged: "outline",
  } as const;
  return <Badge variant={map[status] as "default" | "secondary" | "outline"}>{status}</Badge>;
}

export default function HRPerformancePage() {
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
  const { data: teamProgress, isLoading: progressLoading } = trpc.kpi.adminGetTeamProgress.useQuery({
    year,
    month,
  });
  const { data: leaderboard } = trpc.kpi.getLeaderboard.useQuery({ year, month });
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
      toast.success("Training assigned");
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
      toast.success("Training updated");
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
      toast.success("Review updated");
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
      toast.success("Performance review recorded");
      setFormalOpen(false);
      utils.hr.listReviews.invalidate();
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
      toast.success("Target set — employee notified.");
      setTargetOpen(false);
      await invalidateAfterKpiTargetMutation(utils);
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            HR Performance &amp; Growth
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Control layer for training, reviews, targets, and workforce intelligence — on top of existing HR data.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="h-9 w-[180px] text-sm">
              <Filter className="w-3.5 h-3.5 mr-1 opacity-60" />
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
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
            <BarChart2 className="w-3.5 h-3.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="training" className="text-xs gap-1">
            <GraduationCap className="w-3.5 h-3.5" /> Training
          </TabsTrigger>
          <TabsTrigger value="reviews" className="text-xs gap-1">
            <ClipboardCheck className="w-3.5 h-3.5" /> Reviews
          </TabsTrigger>
          <TabsTrigger value="targets" className="text-xs gap-1">
            <Target className="w-3.5 h-3.5" /> Targets
          </TabsTrigger>
          <TabsTrigger value="insights" className="text-xs gap-1">
            <Sparkles className="w-3.5 h-3.5" /> Insights
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          {hrDashboardError && (
            <Alert variant="destructive" data-testid="hr-dashboard-error">
              <AlertTitle>Could not load HR performance dashboard</AlertTitle>
              <AlertDescription>
                {hrDashboardErr?.message ?? "You may not have permission, or the server could not load data."}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="h-9 w-32 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((m, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>
                    {m}
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
            <span className="text-xs text-muted-foreground">Period for KPI snapshot and KPI leaderboard</span>
          </div>

          <p className="text-xs text-muted-foreground max-w-3xl leading-relaxed" data-testid="hr-dashboard-period-help">
            <span className="font-medium text-foreground">Period ({month}/{year}):</span> average KPI achievement (server) and the KPI
            leaderboard below use this month.{" "}
            <span className="font-medium text-foreground">All-time (company):</span> training counts, self-review backlog and response
            rate, training spotlight, and department health — not filtered by the month control.
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
              Overview data is unavailable.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="hr-dashboard-metrics">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Avg KPI achievement (this period)</p>
                    <p className="text-2xl font-bold">{overviewStats.avgPct.toFixed(1)}%</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {month}/{year}
                      {overviewStats.employeesActive != null && overviewStats.employeesTotal != null && (
                        <span className="block mt-0.5">
                          {overviewStats.employeesActive} active / {overviewStats.employeesTotal} employees
                        </span>
                      )}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Training completed (all-time)</p>
                    <p className="text-2xl font-bold">{overviewStats.completedTrain}</p>
                    {overviewStats.trainingCompletionRate != null && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {overviewStats.trainingCompletionRate}% completion rate
                      </p>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Self-reviews awaiting HR (all-time)</p>
                    <p className="text-2xl font-bold text-amber-600">{overviewStats.pendingSelf}</p>
                    {overviewStats.managerResponseRate != null && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {overviewStats.managerResponseRate}% manager response
                      </p>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Formal reviews on file (all-time)</p>
                    <p className="text-2xl font-bold">{overviewStats.formalCount}</p>
                  </CardContent>
                </Card>
              </div>

              {hrDashboard && (
                <div className="grid md:grid-cols-2 gap-3">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Training spotlight</CardTitle>
                      <CardDescription>Completed trainings and recent completions (server summary).</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {hrDashboard.leaderboard.topPerformers.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No completed training records yet.</p>
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
                                {row.completedTrainings} done
                                {row.averageTrainingScore != null ? ` · avg ${row.averageTrainingScore}` : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {hrDashboard.leaderboard.recentTrainingCompletions.length > 0 && (
                        <div className="text-xs text-muted-foreground space-y-1 pt-1 border-t border-border/60">
                          <p className="font-medium text-foreground text-sm">Recent completions</p>
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
                      <CardTitle className="text-base">Department training health</CardTitle>
                      <CardDescription>Share of completed assignments by department.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {hrDashboard.leaderboard.topDepartmentsByTrainingHealth.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No department data yet.</p>
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
                  <CardTitle className="text-base">Top performers (KPI)</CardTitle>
                  <CardDescription>From monthly leaderboard — commission-weighted activity.</CardDescription>
                </CardHeader>
                <CardContent>
                  {!leaderboard?.length ? (
                    <p className="text-sm text-muted-foreground">No achievement data for this period.</p>
                  ) : (
                    <ul className="space-y-2">
                      {leaderboard.slice(0, 5).map((row: { rank: number; employee: { firstName?: string; lastName?: string } | null; avgPct: number }) => (
                        <li key={row.rank} className="flex justify-between text-sm border-b border-border/60 pb-2 last:border-0">
                          <span className="flex items-center gap-2">
                            <Trophy className="w-4 h-4 text-amber-500" />#{row.rank}{" "}
                            {row.employee
                              ? `${row.employee.firstName ?? ""} ${row.employee.lastName ?? ""}`.trim()
                              : "Employee"}
                          </span>
                          <span className="font-medium">{row.avgPct.toFixed(1)}%</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button variant="outline" size="sm" className="mt-4 gap-1" asChild>
                    <Link href="/hr/kpi">
                      Open full KPI console <ExternalLink className="w-3.5 h-3.5" />
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
              Assign and track training — status, scores, and certification links are stored on each record.
            </p>
            <Button size="sm" className="gap-1" onClick={() => setAssignOpen(true)}>
              <Plus className="w-4 h-4" /> Assign training
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {trainingLoading ? (
                <div className="p-8 text-sm text-muted-foreground">Loading…</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Dept</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTraining.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No training records {deptFilter !== "all" ? "for this filter" : ""}.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredTraining.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.employeeName}</TableCell>
                          <TableCell>{row.title}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{row.department || "—"}</TableCell>
                          <TableCell>{trainingStatusBadge(row.trainingStatus)}</TableCell>
                          <TableCell>{row.score != null ? `${row.score}` : "—"}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => setEditTrain(row as Record<string, unknown>)}>
                              Update
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
              <TabsTrigger value="self">Self reviews</TabsTrigger>
              <TabsTrigger value="formal">Formal reviews</TabsTrigger>
            </TabsList>
            <TabsContent value="self" className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Employee-submitted self reviews. HR / managers add ratings and feedback to close the loop.
              </p>
              {selfLoading ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          <TableHead>Period</TableHead>
                          <TableHead>Self rating</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredSelfReviews.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                              No self reviews yet.
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredSelfReviews.map((r) => (
                            <TableRow key={r.id}>
                              <TableCell className="font-medium">{r.employeeName}</TableCell>
                              <TableCell>{r.reviewPeriod}</TableCell>
                              <TableCell>{r.selfRating ?? "—"}</TableCell>
                              <TableCell>{selfReviewStatusBadge(r.reviewStatus)}</TableCell>
                              <TableCell className="text-right">
                                <Button variant="ghost" size="sm" onClick={() => setEditSelf(r as Record<string, unknown>)}>
                                  {r.reviewStatus === "reviewed" ? "View / edit" : "Add feedback"}
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
                  Structured performance reviews (scores, strengths, goals) stored in HR records.
                </p>
                <Button size="sm" className="gap-1" onClick={() => setFormalOpen(true)}>
                  <Plus className="w-4 h-4" /> New review
                </Button>
              </div>
              {formalLoading ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          <TableHead>Period</TableHead>
                          <TableHead>Score</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {!(formalReviews ?? []).length ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                              No formal reviews yet.
                            </TableCell>
                          </TableRow>
                        ) : (
                          (formalReviews ?? []).map((rv: { id: number; employeeId: number; period: string; overallScore: string | null; status: string }) => (
                            <TableRow key={rv.id}>
                              <TableCell className="font-medium">
                                {empNameById.get(rv.employeeId) ?? `Employee #${rv.employeeId}`}
                              </TableCell>
                              <TableCell>{rv.period}</TableCell>
                              <TableCell>{rv.overallScore ?? "—"}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{rv.status}</Badge>
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
                  {MONTH_NAMES.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {m}
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
                <Plus className="w-4 h-4" /> Quick assign target
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/hr/kpi">Full KPI &amp; commission</Link>
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Team progress snapshot</CardTitle>
              <CardDescription>Targets vs achievement for the selected month.</CardDescription>
            </CardHeader>
            <CardContent>
              {progressLoading ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : !(teamProgress as any[])?.length ? (
                <p className="text-sm text-muted-foreground">No targets for this period.</p>
              ) : (
                <div className="space-y-3">
                  {(teamProgress as any[]).map((item: any) => {
                    const emp = item.employee;
                    const label = emp
                      ? `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim()
                      : `User ${item.target.employeeUserId}`;
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
            Connect operational data to decisions: use intelligence dashboards to spot risk, skill gaps, and ROI.
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            <Card className="hover:border-primary/40 transition-colors">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-4 h-4" /> Workforce Intelligence
                </CardTitle>
                <CardDescription>Automations, risk flags, and workforce health signals.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="secondary" className="gap-1">
                  <Link href="/hr/workforce-intelligence">
                    Open dashboard <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
            <Card className="hover:border-primary/40 transition-colors">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart2 className="w-4 h-4" /> Executive dashboard
                </CardTitle>
                <CardDescription>Company-wide HR and operations KPIs.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="secondary" className="gap-1">
                  <Link href="/hr/executive-dashboard">
                    Open dashboard <ExternalLink className="w-3.5 h-3.5" />
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
            <DialogTitle>Assign training</DialogTitle>
            <DialogDescription>Creates a training record for the selected employee (employee profile id).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Employee</Label>
              <Select value={trainEmpId} onValueChange={setTrainEmpId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
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
              <Label>Title</Label>
              <Input value={trainTitle} onChange={(ev) => setTrainTitle(ev.target.value)} placeholder="Course or programme name" />
            </div>
            <div>
              <Label>Provider (optional)</Label>
              <Input value={trainProvider} onChange={(ev) => setTrainProvider(ev.target.value)} />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={trainCategory} onValueChange={setTrainCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["technical", "compliance", "leadership", "safety", "soft_skills", "other"].map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Due date (optional)</Label>
              <Input type="date" value={trainDue} onChange={(ev) => setTrainDue(ev.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (!trainEmpId || trainTitle.trim().length < 2) {
                  toast.error("Choose an employee and enter a title.");
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
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit training */}
      <Dialog open={!!editTrain} onOpenChange={(o) => !o && setEditTrain(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update training</DialogTitle>
            <DialogDescription>Adjust status, score, or certification.</DialogDescription>
          </DialogHeader>
          {editTrain && (
            <div className="space-y-3">
              <p className="text-sm font-medium">{String(editTrain.title ?? "")}</p>
              <div>
                <Label>Status</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["assigned", "in_progress", "completed", "overdue"].map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Score (0–100)</Label>
                <Input value={editScore} onChange={(ev) => setEditScore(ev.target.value)} placeholder="Optional" />
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
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manager feedback on self-review */}
      <Dialog open={!!editSelf} onOpenChange={(o) => !o && setEditSelf(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Manager / HR feedback</DialogTitle>
            <DialogDescription>Self-review for {String(editSelf?.employeeName ?? "")}</DialogDescription>
          </DialogHeader>
          {editSelf && (
            <div className="space-y-3 max-h-[50vh] overflow-y-auto text-sm">
              <div>
                <Label className="text-muted-foreground">Period</Label>
                <p>{String(editSelf.reviewPeriod ?? "")}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Self rating</Label>
                <p>{editSelf.selfRating != null ? String(editSelf.selfRating) : "—"}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Achievements</Label>
                <p className="whitespace-pre-wrap">{String(editSelf.selfAchievements ?? "—")}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Goals</Label>
                <p className="whitespace-pre-wrap">{String(editSelf.selfGoals ?? "—")}</p>
              </div>
              <div>
                <Label>Manager rating (1–5)</Label>
                <Input value={mgrRating} onChange={(ev) => setMgrRating(ev.target.value)} type="number" min={1} max={5} />
              </div>
              <div>
                <Label>Feedback</Label>
                <Textarea value={mgrFeedback} onChange={(ev) => setMgrFeedback(ev.target.value)} rows={3} />
              </div>
              <div>
                <Label>Goals next period</Label>
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
              Mark reviewed
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
              Save draft feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New formal review */}
      <Dialog open={formalOpen} onOpenChange={setFormalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New formal performance review</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Employee</Label>
              <Select value={frEmpId} onValueChange={setFrEmpId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
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
              <Label>Period (e.g. Q1 2026)</Label>
              <Input value={frPeriod} onChange={(ev) => setFrPeriod(ev.target.value)} />
            </div>
            <div>
              <Label>Overall score (0–10)</Label>
              <Input value={frScore} onChange={(ev) => setFrScore(ev.target.value)} type="number" min={0} max={10} step={0.5} />
            </div>
            <div>
              <Label>Strengths</Label>
              <Textarea value={frStrengths} onChange={(ev) => setFrStrengths(ev.target.value)} rows={2} />
            </div>
            <div>
              <Label>Improvements</Label>
              <Textarea value={frImprove} onChange={(ev) => setFrImprove(ev.target.value)} rows={2} />
            </div>
            <div>
              <Label>Goals</Label>
              <Textarea value={frGoals} onChange={(ev) => setFrGoals(ev.target.value)} rows={2} />
            </div>
            <div>
              <Label>Comments</Label>
              <Textarea value={frComments} onChange={(ev) => setFrComments(ev.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (!frEmpId || !frPeriod.trim()) {
                  toast.error("Employee and period are required.");
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
              Save review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick KPI target */}
      <Dialog open={targetOpen} onOpenChange={setTargetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign KPI target</DialogTitle>
            <DialogDescription>Uses the same engine as KPI &amp; Performance — notifies the employee.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Employee (login user)</Label>
              <Select
                value={tEmpUserId != null ? String(tEmpUserId) : ""}
                onValueChange={(v) => setTEmpUserId(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
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
              <Label>Metric name</Label>
              <Input value={tMetricName} onChange={(ev) => setTMetricName(ev.target.value)} placeholder="e.g. Monthly sales" />
            </div>
            <div>
              <Label>Metric type</Label>
              <Select value={tMetricType} onValueChange={setTMetricType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRIC_TYPES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Target value</Label>
              <Input value={tTargetValue} onChange={(ev) => setTTargetValue(ev.target.value)} type="number" />
            </div>
            <div>
              <Label>Commission rate (%)</Label>
              <Input value={tCommRate} onChange={(ev) => setTCommRate(ev.target.value)} type="number" />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (!tEmpUserId || !tMetricName.trim() || !tTargetValue) {
                  toast.error("Fill required fields.");
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
              Set target
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
