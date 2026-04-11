import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { buildProfileChangeQueueHref } from "@shared/profileChangeRequestQueueUrl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, FileText, AlertTriangle, Clock, CheckCircle2,
  RefreshCw, Plus, ChevronRight, Building2, Shield, TrendingUp,
  AlertCircle, Calendar, FolderOpen, ClipboardList,
} from "lucide-react";

export default function WorkforceDashboard() {
  const [, navigate] = useLocation();
  const { data: stats, isLoading } = trpc.workforce.dashboardStats.useQuery();
  const { data: pcrQueueKpis } = trpc.workforce.profileChangeRequests.queueKpis.useQuery(undefined, {
    staleTime: 60_000,
  });

  const statCards = [
    {
      title: "Active Employees",
      value: stats?.totalActiveEmployees ?? 0,
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-50",
      href: "/workforce/employees",
    },
    {
      title: "Active Work Permits",
      value: stats?.activePermits ?? 0,
      icon: FileText,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      href: "/workforce/permits",
    },
    {
      title: "Expiring in 30 Days",
      value: stats?.permitsExpiring30Days ?? 0,
      icon: AlertTriangle,
      color: "text-amber-600",
      bg: "bg-amber-50",
      href: "/workforce/permits?filter=expiring30",
      urgent: (stats?.permitsExpiring30Days ?? 0) > 0,
    },
    {
      title: "Expiring in 90 Days",
      value: stats?.permitsExpiring90Days ?? 0,
      icon: Clock,
      color: "text-orange-600",
      bg: "bg-orange-50",
      href: "/workforce/permits?filter=expiring90",
    },
    {
      title: "Open Gov. Cases",
      value: stats?.openGovernmentCases ?? 0,
      icon: FolderOpen,
      color: "text-purple-600",
      bg: "bg-purple-50",
      href: "/workforce/cases",
    },
    {
      title: "Pending Verifications",
      value: stats?.pendingDocumentVerifications ?? 0,
      icon: Shield,
      color: "text-rose-600",
      bg: "bg-rose-50",
      href: "/workforce/documents",
    },
    {
      title: "Profile change requests",
      value: stats?.pendingProfileChangeRequests ?? 0,
      icon: ClipboardList,
      color: "text-indigo-600",
      bg: "bg-indigo-50",
      href: buildProfileChangeQueueHref({ status: "pending" }),
      urgent: (stats?.pendingProfileChangeRequests ?? 0) > 0,
    },
  ];

  const quickActions = [
    { label: "Upload MOL Certificate", icon: Plus, href: "/workforce/permits/upload", primary: true },
    { label: "New Service Case", icon: FolderOpen, href: "/workforce/cases/new" },
    { label: "View Employees", icon: Users, href: "/workforce/employees" },
    { label: "Sync with MOL", icon: RefreshCw, href: "/workforce/sync" },
    { label: "Document Vault", icon: Shield, href: "/workforce/documents" },
    { label: "Profile requests", icon: ClipboardList, href: buildProfileChangeQueueHref({ status: "pending" }) },
    { label: "Audit Log", icon: FileText, href: "/workforce/audit" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Workforce Hub</h1>
          <p className="text-muted-foreground text-sm mt-1">
            MOL-aligned workforce management — work permits, government cases, document vault
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/workforce/sync")}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Sync MOL
          </Button>
          <Button size="sm" onClick={() => navigate("/workforce/permits/upload")}>
            <Plus className="w-4 h-4 mr-2" />
            Upload Certificate
          </Button>
        </div>
      </div>

      {/* Alert banner for urgent expiries */}
      {!isLoading && (stats?.permitsExpiring30Days ?? 0) > 0 && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">
              {stats!.permitsExpiring30Days} work permit{stats!.permitsExpiring30Days > 1 ? "s" : ""} expiring within 30 days
            </p>
            <p className="text-xs text-amber-600 mt-0.5">Immediate renewal action required to avoid labour law violations</p>
          </div>
          <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-100" onClick={() => navigate("/workforce/permits?filter=expiring30")}>
            View Now
          </Button>
        </div>
      )}

      {!isLoading && pcrQueueKpis != null && pcrQueueKpis.pendingTotal > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-indigo-200/80 bg-indigo-50/60 px-4 py-2.5 text-sm dark:bg-indigo-950/25 dark:border-indigo-900/60">
          <ClipboardList className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <span className="font-medium text-indigo-950 dark:text-indigo-100">
              {pcrQueueKpis.pendingTotal} pending profile request{pcrQueueKpis.pendingTotal === 1 ? "" : "s"}
            </span>
            {pcrQueueKpis.pendingOther > 0 ? (
              <span className="text-indigo-800/85 dark:text-indigo-200/80">
                {" "}
                · {pcrQueueKpis.pendingOther} uncategorized (field: Other / custom)
              </span>
            ) : null}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs shrink-0 border-indigo-300 text-indigo-800 hover:bg-indigo-100 dark:border-indigo-800 dark:text-indigo-100 dark:hover:bg-indigo-950/50"
            onClick={() => navigate(buildProfileChangeQueueHref({ status: "pending" }))}
          >
            Open queue
          </Button>
        </div>
      ) : null}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card
              key={card.title}
              className={`cursor-pointer hover:shadow-md transition-all border ${card.urgent ? "border-amber-300 ring-1 ring-amber-200" : "border-border"}`}
              onClick={() => navigate(card.href)}
            >
              <CardContent className="p-4">
                <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center mb-3`}>
                  <Icon className={`w-5 h-5 ${card.color}`} />
                </div>
                {isLoading ? (
                  <Skeleton className="h-7 w-12 mb-1" />
                ) : (
                  <p className={`text-2xl font-bold ${card.urgent ? "text-amber-700" : "text-foreground"}`}>{card.value}</p>
                )}
                <p className="text-xs text-muted-foreground leading-tight mt-1">{card.title}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Quick Actions + Module Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  onClick={() => navigate(action.href)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left ${
                    action.primary
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "hover:bg-muted text-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {action.label}
                  <ChevronRight className="w-3 h-3 ml-auto opacity-50" />
                </button>
              );
            })}
          </CardContent>
        </Card>

        {/* Module Overview */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Module Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                {
                  title: "Work Permit Lifecycle",
                  desc: "Ingest MOL certificates, track expiry, manage renewals and cancellations",
                  icon: FileText,
                  href: "/workforce/permits",
                  badge: "MOL-Aligned",
                  badgeColor: "bg-blue-100 text-blue-700",
                },
                {
                  title: "Government Cases",
                  desc: "End-to-end case management for renewals, amendments, transfers",
                  icon: FolderOpen,
                  href: "/workforce/cases",
                  badge: "Workflow",
                  badgeColor: "bg-purple-100 text-purple-700",
                },
                {
                  title: "Document Vault",
                  desc: "Secure storage for passports, visas, labour cards, medical certificates",
                  icon: Shield,
                  href: "/workforce/documents",
                  badge: "Encrypted",
                  badgeColor: "bg-emerald-100 text-emerald-700",
                },
                {
                  title: "MOL Sync Monitor",
                  desc: "Track government portal sync jobs, delta updates, and error logs",
                  icon: RefreshCw,
                  href: "/workforce/sync",
                  badge: "Live",
                  badgeColor: "bg-amber-100 text-amber-700",
                },
              ].map((module) => {
                const Icon = module.icon;
                return (
                  <button
                    key={module.title}
                    onClick={() => navigate(module.href)}
                    className="text-left p-4 rounded-lg border border-border hover:border-primary/30 hover:bg-muted/50 transition-all group"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <Icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${module.badgeColor}`}>
                        {module.badge}
                      </span>
                    </div>
                    <p className="font-medium text-sm text-foreground">{module.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{module.desc}</p>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Compliance Health */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Compliance Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                label: "Permit Compliance Rate",
                value: isLoading ? null : stats && stats.activePermits > 0
                  ? Math.round(((stats.activePermits - stats.permitsExpiring30Days) / stats.activePermits) * 100)
                  : 100,
                suffix: "%",
                good: true,
                desc: "Active permits not in critical expiry window",
              },
              {
                label: "Document Verification Rate",
                value: isLoading ? null : stats && (stats.pendingDocumentVerifications + stats.activePermits) > 0
                  ? Math.round((stats.activePermits / (stats.activePermits + stats.pendingDocumentVerifications)) * 100)
                  : 100,
                suffix: "%",
                good: true,
                desc: "Documents verified vs pending",
              },
              {
                label: "Open Cases",
                value: isLoading ? null : stats?.openGovernmentCases ?? 0,
                suffix: "",
                good: (stats?.openGovernmentCases ?? 0) === 0,
                desc: "Government service cases awaiting resolution",
              },
            ].map((metric) => (
              <div key={metric.label} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{metric.label}</span>
                  {isLoading ? (
                    <Skeleton className="h-5 w-12" />
                  ) : (
                    <span className={`text-lg font-bold ${metric.good ? "text-emerald-600" : "text-amber-600"}`}>
                      {metric.value}{metric.suffix}
                    </span>
                  )}
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${metric.good ? "bg-emerald-500" : "bg-amber-500"}`}
                    style={{ width: `${metric.suffix === "%" ? (metric.value ?? 0) : Math.min(100, ((metric.value ?? 0) / 10) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{metric.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
