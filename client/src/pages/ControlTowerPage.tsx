import { useMemo } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { trpc } from "@/lib/trpc";
import { useActionQueue } from "@/hooks/useActionQueue";
import { useSmartRoleHomeRedirect } from "@/hooks/useSmartRoleHomeRedirect";
import { buildRiskStripCards } from "@/features/controlTower/riskStripModel";
import { queueStatusDescription, queueStatusHeadline } from "@/features/controlTower/actionQueueComputeStatus";
import { buildPriorityItems } from "@/features/controlTower/priorityEngine";
import { getPriorityBadgeLabel } from "@/features/controlTower/actionLabels";
import type { PriorityLevel } from "@/features/controlTower/priorityTypes";
import { seesPlatformOperatorNav } from "@shared/clientNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Radar,
  Users,
  AlertCircle,
  Zap,
} from "lucide-react";
import { fmtDate } from "@/lib/dateUtils";

function severityBadgeClass(s: "high" | "medium" | "low") {
  if (s === "high") return "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-200";
  if (s === "medium") return "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-100";
  return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200";
}

function priorityLevelBadgeClass(level: PriorityLevel) {
  if (level === "critical") {
    return "bg-red-100 text-red-900 border-red-200 dark:bg-red-950/50 dark:text-red-100 dark:border-red-800";
  }
  if (level === "important") {
    return "bg-amber-100 text-amber-950 border-amber-200 dark:bg-amber-950/40 dark:text-amber-50 dark:border-amber-800";
  }
  return "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600";
}

function sourceLabel(source: string) {
  switch (source) {
    case "payroll":
      return "Payroll";
    case "workforce":
      return "Workforce";
    case "contracts":
      return "Contracts";
    case "operations":
      return "Operations";
    case "compliance":
      return "Compliance";
    case "system":
      return "System";
    default:
      return "HR";
  }
}

export default function ControlTowerPage() {
  const { user } = useAuth();
  const { activeCompanyId, activeCompany } = useActiveCompany();
  useSmartRoleHomeRedirect();

  const platformOp = seesPlatformOperatorNav(user);
  const scopeEnabled = activeCompanyId != null && !platformOp;

  const {
    items: actionItems,
    isLoading: actionsLoading,
    status: queueStatus,
    lastUpdatedLabel: queueUpdatedLabel,
    scopeActive: queueScopeActive,
  } = useActionQueue();

  const priorityItems = useMemo(
    () => buildPriorityItems(actionItems, activeCompany?.role ?? null),
    [actionItems, activeCompany?.role],
  );

  const priorityIds = useMemo(() => new Set(priorityItems.map((p) => p.actionId)), [priorityItems]);

  const queueForList = useMemo(
    () => actionItems.filter((a) => !priorityIds.has(a.id)),
    [actionItems, priorityIds],
  );

  const hasStrongPriorities = priorityItems.some((p) => p.priorityLevel === "critical" || p.priorityLevel === "important");

  const { data: pulse, isLoading: pulseLoading } = trpc.operations.getOwnerBusinessPulse.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: scopeEnabled, staleTime: 60_000 },
  );

  const { data: myStats, isLoading: statsLoading } = trpc.companies.myStats.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null, staleTime: 60_000 },
  );

  const now = new Date();
  const { data: wps, isLoading: wpsLoading } = trpc.compliance.getWpsStatus.useQuery(
    { companyId: activeCompanyId ?? undefined, month: now.getMonth() + 1, year: now.getFullYear() },
    { enabled: scopeEnabled, staleTime: 60_000 },
  );

  const { data: complianceScore, isLoading: scoreLoading } = trpc.compliance.getComplianceScore.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: scopeEnabled, staleTime: 120_000 },
  );

  const { data: dailySnap, isLoading: dailyLoading } = trpc.operations.getDailySnapshot.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: scopeEnabled, staleTime: 60_000 },
  );

  const wpsBlocked =
    wps != null && wps.status !== "paid" && wps.status !== "not_generated";

  const permitCheck = complianceScore?.checks?.find((c) => c.id === "work_permit_validity");
  const expiredPermits = Number((permitCheck?.meta as { count?: number } | undefined)?.count ?? 0);

  const expiring7 =
    pulse?.controlTower?.riskCompliance.workPermitsExpiring7Days ?? dailySnap?.expiringDocs7Days ?? 0;

  const complianceFailures = complianceScore?.checks?.filter((c) => c.status === "fail").length ?? 0;
  const complianceWarnings = complianceScore?.checks?.filter((c) => c.status === "warn").length ?? 0;

  const pendingApprovals =
    pulse?.controlTower?.decisionsQueue.totalOpenCount ??
    (dailySnap
      ? (dailySnap.pendingLeaveRequests ?? 0) + (dailySnap.pendingContracts ?? 0) + (dailySnap.pendingPayrollApprovals ?? 0)
      : 0);

  const revenueMtd =
    pulse?.revenue?.combinedPaid?.monthToDateOmr ?? dailySnap?.revenueMtdOmr ?? null;

  const loadingStrip = scopeEnabled && (wpsLoading || scoreLoading || dailyLoading || pulseLoading);

  const riskCards = buildRiskStripCards({
    loading: loadingStrip,
    expiredPermits,
    wpsBlocked,
    complianceFailCount: complianceFailures,
    permitsExpiring7d: expiring7,
    slaBreaches: typeof dailySnap?.slaBreaches === "number" ? dailySnap.slaBreaches : 0,
    complianceWarnCount: complianceWarnings,
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-[var(--smartpro-orange)]/15 flex items-center justify-center">
              <Radar className="w-6 h-6 text-[var(--smartpro-orange)]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Control Tower</h1>
              <p className="text-sm text-muted-foreground mt-0.5 max-w-xl">
                What needs your attention today — payroll, permits, contracts, and HR decisions in one place.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard">Executive dashboard</Link>
            </Button>
            <Button size="sm" className="gap-1" asChild>
              <Link href="/operations">
                Operations centre <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {platformOp && (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">Platform scope</CardTitle>
              <CardDescription>
                Open a tenant workspace from the company switcher to load tenant-specific signals. Platform tools stay in the sidebar.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {/* Risk strip — blocked vs at-risk vs watch */}
        <section aria-label="Risk indicators">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Risk & compliance pulse
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {riskCards.map((card) => (
              <Card
                key={card.tier}
                className={`shadow-sm border-l-4 ${
                  card.semanticClass === "blocked"
                    ? "border-l-red-500"
                    : card.semanticClass === "at_risk"
                      ? "border-l-amber-500"
                      : "border-l-slate-400"
                }`}
              >
                <CardContent className="p-4 space-y-1">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">{card.label}</p>
                  <p className="text-2xl font-bold tabular-nums">
                    {card.loading ? "…" : card.count}
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-snug">{card.helper}</p>
                  <Link href={card.href} className="text-[11px] text-primary hover:underline inline-block pt-1">
                    Open related view →
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Today's priorities — same normalized queue as the list below */}
        {queueScopeActive && (
          <section aria-label="Today's priorities">
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-[var(--smartpro-orange)]" />
                Today&apos;s priorities
              </h2>
            </div>

            {!actionsLoading && (queueStatus === "partial" || queueStatus === "error") && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-950/25 px-3 py-2 text-xs text-amber-950 dark:text-amber-100 mb-3">
                {queueStatus === "error" ? queueStatusDescription("error") : queueStatusDescription("partial")}
              </div>
            )}

            <Card className="shadow-md border-[var(--smartpro-orange)]/25">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">What to handle first</CardTitle>
                <CardDescription>
                  {actionsLoading
                    ? "Loading…"
                    : queueStatus === "error"
                      ? "Priorities may be incomplete until the queue loads reliably."
                      : "Ranked from the same action queue — with context on why it matters."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!queueScopeActive ? null : actionsLoading ? (
                  <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Loading priorities…
                  </div>
                ) : queueStatus === "error" && priorityItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">{queueStatusHeadline("error")}</p>
                ) : priorityItems.length === 0 ? (
                  <div className="py-8 text-center space-y-2">
                    <p className="text-sm font-medium text-foreground">No critical priorities right now</p>
                    <p className="text-xs text-muted-foreground max-w-md mx-auto">
                      {actionItems.length > 0
                        ? "Nothing in the top band — review the full queue below for remaining items."
                        : "When actionable items appear in your queue, the top three will surface here with guidance."}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {!hasStrongPriorities && actionItems.length > 0 && (
                      <p className="text-xs text-muted-foreground rounded-md border border-dashed px-3 py-2">
                        No critical priorities right now — showing lower-urgency watch items first.
                      </p>
                    )}
                    <ul className="space-y-4">
                      {priorityItems.map((p) => (
                        <li
                          key={p.id}
                          className="rounded-lg border bg-card/50 p-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
                        >
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge className={`text-[10px] ${priorityLevelBadgeClass(p.priorityLevel)}`}>
                                {getPriorityBadgeLabel(p.priorityLevel)}
                              </Badge>
                              <span className="text-[10px] font-semibold uppercase text-muted-foreground">{sourceLabel(p.source)}</span>
                            </div>
                            <p className="text-base font-semibold leading-snug">{p.title}</p>
                            <p className="text-sm text-muted-foreground leading-relaxed">{p.whyThisMatters}</p>
                            <p className="text-xs text-muted-foreground/90 italic">{p.recommendedAction}</p>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                              {p.dueLabel && p.dueLabel !== "No deadline" && <span>{p.dueLabel}</span>}
                              {p.ownerLabel && <span>{p.ownerLabel}</span>}
                            </div>
                          </div>
                          <Button size="sm" className="shrink-0 gap-1 w-full sm:w-auto" asChild>
                            <Link href={p.href}>
                              {p.ctaLabel} <ArrowUpRight className="w-3.5 h-3.5" />
                            </Link>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        )}

        {/* KPI summary */}
        <section aria-label="Key metrics">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            KPI snapshot
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-[10px] font-semibold uppercase">
                  <Users className="w-3.5 h-3.5" /> Active employees
                </div>
                <p className="text-2xl font-bold mt-1 tabular-nums">
                  {statsLoading ? "—" : myStats?.employees ?? "—"}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {statsLoading ? "Loading…" : myStats != null ? "HR · companies.myStats" : "Unavailable"}
                </p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-[10px] font-semibold uppercase">
                  <ClipboardList className="w-3.5 h-3.5" /> Pending approvals
                </div>
                <p className="text-2xl font-bold mt-1 tabular-nums">
                  {pulseLoading && scopeEnabled ? "—" : pendingApprovals}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {scopeEnabled && pulse
                    ? "Operations · pulse decisions queue"
                    : dailySnap && scopeEnabled
                      ? "Operations · daily snapshot"
                      : scopeEnabled
                        ? "—"
                        : "N/A"}
                </p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-[10px] font-semibold uppercase">
                  <Activity className="w-3.5 h-3.5" /> Revenue (MTD)
                </div>
                <p className="text-2xl font-bold mt-1 tabular-nums">
                  {revenueMtd == null ? "—" : `OMR ${Number(revenueMtd).toLocaleString("en-OM", { minimumFractionDigits: 3 })}`}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {revenueMtd == null && !pulseLoading && scopeEnabled
                    ? "Cash MTD unavailable for this scope"
                    : pulse?.revenue
                      ? "Finance · executive revenue (paid)"
                      : dailySnap
                        ? "Finance · daily snapshot (paid)"
                        : "—"}
                </p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-[10px] font-semibold uppercase">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Compliance score
                </div>
                <p className="text-2xl font-bold mt-1 tabular-nums">
                  {scoreLoading ? "—" : complianceScore ? `${complianceScore.score}` : "—"}
                </p>
                {complianceScore?.grade && (
                  <p className="text-xs text-muted-foreground">Grade {complianceScore.grade}</p>
                )}
                <p className="text-[10px] text-muted-foreground mt-1">
                  {scoreLoading ? "Loading…" : complianceScore ? "Compliance · weighted checks" : "Unavailable"}
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Action queue */}
        <section aria-label="Action queue">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Top action queue
            </h2>
            {queueScopeActive && !actionsLoading && (
              <span className="text-[11px] text-muted-foreground">{queueUpdatedLabel}</span>
            )}
          </div>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                {queueScopeActive ? queueStatusHeadline(queueStatus) : "Action queue"}
                <Badge variant="outline" className="text-[10px] font-normal">
                  Max 10
                </Badge>
              </CardTitle>
              <CardDescription>
                {queueScopeActive ? queueStatusDescription(queueStatus) : "Sign in with a company workspace to load tenant actions."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!queueScopeActive ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Select a company to load the action queue.</p>
              ) : actionsLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Loading actions…
                </div>
              ) : queueStatus === "error" ? (
                <div className="flex flex-col items-center justify-center py-12 text-center gap-2 rounded-lg border border-red-200 bg-red-50/50 dark:bg-red-950/20 px-4">
                  <AlertCircle className="w-10 h-10 text-red-600" />
                  <p className="text-sm font-medium text-red-900 dark:text-red-100">{queueStatusHeadline("error")}</p>
                  <p className="text-xs text-muted-foreground max-w-sm">{queueStatusDescription("error")}</p>
                </div>
              ) : queueStatus === "partial" ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-950/25 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
                    {queueStatusDescription("partial")}
                  </div>
                  {queueForList.length > 0 ? (
                    <ul className="divide-y rounded-lg border">
                      {queueForList.map((a) => (
                        <li key={a.id} className="flex flex-wrap items-center gap-3 p-3 hover:bg-muted/40 transition-colors">
                          <Badge className={`shrink-0 ${severityBadgeClass(a.severity)}`}>{a.severity}</Badge>
                          <div className="flex-1 min-w-[200px]">
                            <p className="text-sm font-medium leading-snug">{a.title}</p>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-muted-foreground">
                              <span>{sourceLabel(a.source)}</span>
                              {a.count != null && a.count > 1 && <span>×{a.count}</span>}
                              {a.dueAt && <span>Due {fmtDate(a.dueAt)}</span>}
                              {a.ownerLabel && <span>{a.ownerLabel}</span>}
                            </div>
                            {a.reason && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{a.reason}</p>}
                          </div>
                          <Button size="sm" className="shrink-0 gap-1" asChild>
                            <Link href={a.href}>
                              {a.ctaLabel} <ArrowUpRight className="w-3.5 h-3.5" />
                            </Link>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : actionItems.length > 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                      Every item in your queue is listed in Today&apos;s priorities above.
                    </p>
                  ) : null}
                </div>
              ) : queueStatus === "all_clear" ? (
                <div className="flex flex-col items-center justify-center py-12 text-center gap-2 rounded-lg border border-emerald-200/80 bg-emerald-50/50 dark:bg-emerald-950/20">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                  <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">{queueStatusHeadline("all_clear")}</p>
                  <p className="text-xs text-muted-foreground max-w-sm">{queueStatusDescription("all_clear")}</p>
                </div>
              ) : queueStatus === "no_urgent_blockers" ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-amber-200/80 bg-amber-50/40 dark:bg-amber-950/20 px-3 py-2 text-xs">
                    {queueStatusDescription("no_urgent_blockers")}
                  </div>
                  {queueForList.length > 0 ? (
                    <ul className="divide-y rounded-lg border">
                      {queueForList.map((a) => (
                        <li key={a.id} className="flex flex-wrap items-center gap-3 p-3 hover:bg-muted/40 transition-colors">
                          <Badge className={`shrink-0 ${severityBadgeClass(a.severity)}`}>{a.severity}</Badge>
                          <div className="flex-1 min-w-[200px]">
                            <p className="text-sm font-medium leading-snug">{a.title}</p>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-muted-foreground">
                              <span>{sourceLabel(a.source)}</span>
                              {a.count != null && a.count > 1 && <span>×{a.count}</span>}
                              {a.dueAt && <span>Due {fmtDate(a.dueAt)}</span>}
                              {a.ownerLabel && <span>{a.ownerLabel}</span>}
                            </div>
                          </div>
                          <Button size="sm" className="shrink-0 gap-1" asChild>
                            <Link href={a.href}>
                              {a.ctaLabel} <ArrowUpRight className="w-3.5 h-3.5" />
                            </Link>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : actionItems.length > 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                      Every item in your queue is listed in Today&apos;s priorities above.
                    </p>
                  ) : null}
                </div>
              ) : queueForList.length > 0 ? (
                <ul className="divide-y rounded-lg border">
                  {queueForList.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-3 p-3 hover:bg-muted/40 transition-colors">
                      <Badge className={`shrink-0 ${severityBadgeClass(a.severity)}`}>{a.severity}</Badge>
                      <div className="flex-1 min-w-[200px]">
                        <p className="text-sm font-medium leading-snug">{a.title}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-muted-foreground">
                          <span>{sourceLabel(a.source)}</span>
                          {a.count != null && a.count > 1 && <span>×{a.count}</span>}
                          {a.dueAt && <span>Due {fmtDate(a.dueAt)}</span>}
                          {a.ownerLabel && <span>{a.ownerLabel}</span>}
                        </div>
                        {a.reason && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{a.reason}</p>}
                      </div>
                      <Button size="sm" className="shrink-0 gap-1" asChild>
                        <Link href={a.href}>
                          {a.ctaLabel} <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : actionItems.length > 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Every item in your queue is listed in Today&apos;s priorities above.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground py-6 text-center">No additional items in the queue.</p>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
