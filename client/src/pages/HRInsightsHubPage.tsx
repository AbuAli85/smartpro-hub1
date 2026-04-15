import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { HubBreadcrumb } from "@/components/hub/HubBreadcrumb";
import {
  Activity,
  ArrowRight,
  BarChart2,
  ExternalLink,
  Globe,
  Sparkles,
  Target,
  Users,
  ClipboardList,
  AlertTriangle,
  Bell,
  Award,
  TrendingUp,
} from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";

export default function HRInsightsHubPage() {
  const { t } = useTranslation("hr");
  const { activeCompanyId } = useActiveCompany();

  const { data: stats, isLoading: statsLoading } = trpc.team.getTeamStats.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );

  const { data: dash, isLoading: dashLoading } = trpc.hr.getDashboardStats.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );

  const { data: execSummary, isLoading: execLoading, isError: execError } =
    trpc.automationSla.getExecutiveSummary.useQuery(
      activeCompanyId != null ? { companyId: activeCompanyId } : undefined,
      {
        enabled: activeCompanyId != null,
        retry: false,
      },
    );

  const { data: reviews, isLoading: reviewsLoading } = trpc.hr.listReviews.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );

  const { data: alertBadge } = trpc.alerts.getAlertBadgeCount.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );

  const { data: pendingQueue, isLoading: queueLoading, isError: queueError } =
    trpc.employeeRequests.adminList.useQuery(
      { companyId: activeCompanyId ?? undefined, status: "pending", type: "all", limit: 120 },
      { enabled: activeCompanyId != null, retry: false },
    );

  const total = stats?.total ?? 0;
  const active = stats?.active ?? 0;
  const onLeave = stats?.onLeave ?? 0;
  const terminated = (stats?.terminated ?? 0) + (stats?.resigned ?? 0);
  const health = execSummary?.healthScore;
  const pendingLeave = dash?.pendingLeave ?? 0;
  const kpiAvg = dash?.kpiAvgPct ?? 0;
  const kpiTargets = dash?.kpiTargetsCount ?? 0;
  const kpiTop = dash?.kpiTopPerformer;
  const reviewCount = reviews?.length ?? 0;

  const kpiBand =
    kpiAvg >= 80 ? "strong" : kpiAvg >= 50 ? "mixed" : kpiTargets > 0 ? "attention" : "empty";

  const insightCards = [
    {
      key: "workforce",
      title: t("insights.cards.workforce.title"),
      desc: t("insights.cards.workforce.desc"),
      href: "/hr/workforce-intelligence",
      icon: Activity,
      preview: statsLoading
        ? "…"
        : t("insights.cards.workforce.preview", {
            warnings: stats?.expiryWarnings ?? 0,
            total,
          }),
    },
    {
      key: "health",
      title: t("insights.cards.health.title"),
      desc: t("insights.cards.health.desc"),
      href: "/hr/executive-dashboard",
      icon: Globe,
      preview: execLoading
        ? "…"
        : execError
          ? t("insights.cards.health.previewError")
          : typeof health === "number"
            ? t("insights.cards.health.preview", { score: Math.round(health) })
            : t("insights.cards.health.previewDefault"),
    },
    {
      key: "kpi",
      title: t("insights.cards.kpi.title"),
      desc: t("insights.cards.kpi.desc"),
      href: "/hr/kpi",
      icon: Target,
      preview:
        dashLoading
          ? "…"
          : kpiTargets === 0
            ? t("insights.cards.kpi.previewEmpty")
            : t("kpi.avgAttainmentLabel", { pct: kpiAvg, count: kpiTargets }),
    },
    {
      key: "growth",
      title: t("insights.cards.growth.title"),
      desc: t("insights.cards.growth.desc"),
      href: "/hr/performance",
      icon: Sparkles,
      preview: reviewsLoading
        ? "…"
        : t("insights.cards.growth.preview", { count: reviewCount }),
    },
  ];

  const pendingHrCount =
    pendingQueue && !queueError ? pendingQueue.length : queueError ? null : queueLoading ? null : 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <HubBreadcrumb
        items={[
          { label: t("common:nav.home", { ns: "common" }), href: "/dashboard" },
          { label: t("workforce.directory"), href: "/my-team" },
          { label: t("insights.title") },
        ]}
      />

      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BarChart2 className="h-7 w-7 text-primary" />
          {t("insights.title")}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t("insights.subtitle")}
        </p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryTile label={t("employees")} value={statsLoading ? null : total} />
        <SummaryTile label={t("workforce.active")} value={statsLoading ? null : active} accent="text-emerald-600" />
        <SummaryTile label={t("workforce.onLeave")} value={statsLoading ? null : onLeave} />
        <SummaryTile
          label={t("workforce.attrition")}
          value={statsLoading ? null : terminated}
          hint={`${t("lifecycle.terminated")} + ${t("lifecycle.resigned")}`}
        />
        <SummaryTile
          label={t("workforce.opsHealth")}
          value={
            execLoading ? null : execError ? "—" : typeof health === "number" ? Math.round(health) : "—"
          }
          accent="text-primary"
        />
        <SummaryTile
          label={t("workforce.leaveToApprove")}
          value={dashLoading ? null : pendingLeave}
          accent="text-amber-600"
        />
      </div>

      {/* KPI snapshot */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> {t("kpi.kpiSnapshot")}
          </CardTitle>
          <CardDescription>{t("kpi.kpiSnapshotDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {dashLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <div className="grid sm:grid-cols-3 gap-4 text-sm">
              <div className="rounded-lg border bg-muted/30 px-3 py-2">
                <p className="text-[10px] uppercase text-muted-foreground font-medium">{t("kpi.targetsSet")}</p>
                <p className="text-2xl font-bold tabular-nums">{kpiTargets}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 px-3 py-2">
                <p className="text-[10px] uppercase text-muted-foreground font-medium">{t("kpi.avgAttainment")}</p>
                <p className="text-2xl font-bold tabular-nums">{kpiAvg}%</p>
              </div>
              <div className="rounded-lg border bg-muted/30 px-3 py-2">
                <p className="text-[10px] uppercase text-muted-foreground font-medium">{t("kpi.topPerformer")}</p>
                <p className="text-sm font-semibold truncate">{kpiTop ?? "—"}</p>
              </div>
            </div>
          )}
          {!dashLoading && kpiTargets > 0 && (
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{t("kpi.distribution")}</span>
                <span className="font-medium capitalize">{kpiBand}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden flex">
                <div
                  className="h-full bg-emerald-500/90 transition-all"
                  style={{ width: `${Math.min(100, kpiAvg)}%` }}
                  title={t("kpi.avgAttainment")}
                />
                <div className="flex-1 bg-slate-200/40 dark:bg-slate-700/50" />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {kpiAvg >= 80
                  ? t("kpi.attainmentHigh")
                  : kpiAvg >= 50
                    ? t("kpi.attainmentMed")
                    : t("kpi.attainmentLow")}
              </p>
            </div>
          )}
          <Button variant="outline" size="sm" className="mt-4 gap-1" asChild>
            <Link href="/hr/kpi">
              {t("kpi.openKpiWorkspace")} <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Status distribution */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> {t("insights.rosterMix")}
          </CardTitle>
          <CardDescription>{t("insights.rosterMixDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : total === 0 ? (
            <p className="text-sm text-muted-foreground">{t("workforce.noEmployeesYet")}</p>
          ) : (
            <div className="space-y-2">
              <BarRow label={t("workforce.active")} count={active} total={total} className="bg-emerald-500/80" />
              <BarRow label={t("workforce.onLeave")} count={onLeave} total={total} className="bg-amber-500/80" />
              <BarRow label={t("workforce.exited")} count={terminated} total={total} className="bg-slate-400/80" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Insight destinations */}
      <div className="grid md:grid-cols-2 gap-4">
        {insightCards.map((c) => (
          <Card key={c.key} className="hover:border-primary/30 transition-colors">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <c.icon className="h-4 w-4 text-primary" />
                {c.title}
              </CardTitle>
              <CardDescription>{c.desc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground line-clamp-2">{c.preview}</p>
              <Button asChild className="gap-1 w-fit">
                <Link href={c.href}>
                  {t("insights.open")} <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Needs attention */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4" /> {t("insights.priorityActions")}
          </CardTitle>
          <CardDescription>{t("insights.priorityActionsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {pendingLeave > 0 && (
              <Badge variant="secondary" className="gap-1">
                <ClipboardList className="h-3 w-3" />
                {t("insights.leaveRequestsToApprove", { count: pendingLeave })}
              </Badge>
            )}
            {pendingHrCount != null && pendingHrCount > 0 && (
              <Button variant="outline" size="sm" asChild className="gap-1 h-7">
                <Link href="/hr/employee-requests">
                  <ClipboardList className="h-3.5 w-3.5" />
                  {t("insights.employeeRequestsPending", { count: pendingHrCount })}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
            {(stats?.expiryWarnings ?? 0) > 0 && (
              <Badge variant="outline" className="gap-1 border-amber-500/50 text-amber-800 dark:text-amber-200">
                <AlertTriangle className="h-3 w-3" />
                {t("workforce.expiryWarnings", { count: stats?.expiryWarnings })}
              </Badge>
            )}
            {(alertBadge?.critical ?? 0) > 0 && (
              <Button variant="outline" size="sm" asChild className="gap-1 h-7">
                <Link href="/alerts">
                  <Bell className="h-3.5 w-3.5" />
                  {t("insights.criticalExpiry", { count: alertBadge?.critical })}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
            {reviewCount > 0 && (
              <Badge variant="outline" className="gap-1">
                <Award className="h-3 w-3" />
                {t("insights.reviewsLogged", { count: reviewCount })}
              </Badge>
            )}
          </div>
          {pendingLeave === 0 &&
            (pendingHrCount === 0 || pendingHrCount == null) &&
            (stats?.expiryWarnings ?? 0) === 0 &&
            (alertBadge?.critical ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">
                {t("insights.allClear")}
              </p>
            )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: number | string | null;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border bg-card px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
      {value === null ? (
        <Skeleton className="h-7 w-12 mt-1" />
      ) : (
        <p className={`text-xl font-bold tabular-nums ${accent ?? ""}`}>{value}</p>
      )}
      {hint ? <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p> : null}
    </div>
  );
}

function BarRow({
  label,
  count,
  total,
  className,
}: {
  label: string;
  count: number;
  total: number;
  className: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {count} ({pct}%)
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${className}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
