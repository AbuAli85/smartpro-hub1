import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { trpc } from "@/lib/trpc";
import { useActionQueue } from "@/hooks/useActionQueue";
import { useSmartRoleHomeRedirect } from "@/hooks/useSmartRoleHomeRedirect";
import { seesPlatformOperatorNav } from "@shared/clientNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Radar,
  ShieldAlert,
  Users,
} from "lucide-react";
import { fmtDate } from "@/lib/dateUtils";

function severityBadgeClass(s: "high" | "medium" | "low") {
  if (s === "high") return "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-200";
  if (s === "medium") return "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-100";
  return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200";
}

function sourceLabel(source: string) {
  switch (source) {
    case "payroll":
      return "Payroll";
    case "workforce":
      return "Workforce";
    case "contracts":
      return "Contracts";
    default:
      return "HR";
  }
}

export default function ControlTowerPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  useSmartRoleHomeRedirect();

  const platformOp = seesPlatformOperatorNav(user);
  const scopeEnabled = activeCompanyId != null && !platformOp;

  const { items: actionItems, isLoading: actionsLoading, isEmpty: actionsEmpty } = useActionQueue();

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

  const pendingApprovals =
    pulse?.controlTower?.decisionsQueue.totalOpenCount ??
    (dailySnap
      ? (dailySnap.pendingLeaveRequests ?? 0) + (dailySnap.pendingContracts ?? 0) + (dailySnap.pendingPayrollApprovals ?? 0)
      : 0);

  const revenueMtd =
    pulse?.revenue?.combinedPaid?.monthToDateOmr ?? dailySnap?.revenueMtdOmr ?? null;

  const loadingStrip = scopeEnabled && (wpsLoading || scoreLoading || dailyLoading || pulseLoading);

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

        {/* Critical risk strip */}
        <section aria-label="Critical risk indicators">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Risk & compliance pulse
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="shadow-sm">
              <CardContent className="p-4 flex items-center gap-3">
                <ShieldAlert className={`w-8 h-8 shrink-0 ${wpsBlocked ? "text-red-600" : "text-emerald-600"}`} />
                <div>
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">WPS</p>
                  <p className="text-sm font-semibold">
                    {loadingStrip ? "…" : wpsBlocked ? "Attention" : "OK"}
                  </p>
                  <Link href="/payroll" className="text-[11px] text-primary hover:underline">
                    Payroll / WPS
                  </Link>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className={`w-8 h-8 shrink-0 ${expiredPermits > 0 ? "text-red-600" : "text-muted-foreground"}`} />
                <div>
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Expired permits</p>
                  <p className="text-sm font-semibold tabular-nums">{loadingStrip ? "…" : expiredPermits}</p>
                  <Link href="/workforce/permits?status=expired" className="text-[11px] text-primary hover:underline">
                    View permits
                  </Link>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4 flex items-center gap-3">
                <Activity className="w-8 h-8 shrink-0 text-amber-600" />
                <div>
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Expiring ≤7d</p>
                  <p className="text-sm font-semibold tabular-nums">{loadingStrip ? "…" : expiring7}</p>
                  <Link href="/workforce/permits?status=expiring_soon" className="text-[11px] text-primary hover:underline">
                    Renewals
                  </Link>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4 flex items-center gap-3">
                <ClipboardList className="w-8 h-8 shrink-0 text-rose-600" />
                <div>
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Compliance fails</p>
                  <p className="text-sm font-semibold tabular-nums">{scoreLoading ? "…" : complianceFailures}</p>
                  <Link href="/compliance" className="text-[11px] text-primary hover:underline">
                    Compliance centre
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

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
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Action queue */}
        <section aria-label="Action queue">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Top action queue
            </h2>
            {actionsEmpty && !actionsLoading && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" /> All clear
              </span>
            )}
          </div>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                Critical & blocking work
                <Badge variant="outline" className="text-[10px] font-normal">
                  Max 10
                </Badge>
              </CardTitle>
              <CardDescription>
                Prioritised by severity. Links open the module with the right context.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {actionsLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Loading actions…
                </div>
              ) : actionsEmpty ? (
                <div className="flex flex-col items-center justify-center py-12 text-center gap-2 rounded-lg border border-emerald-200/80 bg-emerald-50/50 dark:bg-emerald-950/20">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                  <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">All clear</p>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    No blocking payroll, permit, contract, or HR items in your queue right now.
                  </p>
                </div>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {actionItems.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-3 p-3 hover:bg-muted/40 transition-colors">
                      <Badge className={`shrink-0 ${severityBadgeClass(a.severity)}`}>
                        {a.severity}
                      </Badge>
                      <div className="flex-1 min-w-[200px]">
                        <p className="text-sm font-medium leading-snug">{a.title}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-muted-foreground">
                          <span>{sourceLabel(a.source)}</span>
                          {a.dueAt && <span>Due {fmtDate(a.dueAt)}</span>}
                          {a.owner && <span>Owner #{a.owner}</span>}
                        </div>
                      </div>
                      <Button size="sm" className="shrink-0 gap-1" asChild>
                        <Link href={a.href}>
                          Open <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
