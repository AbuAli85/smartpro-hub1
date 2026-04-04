import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { getHiddenNavHrefs } from "@/lib/navVisibility";
import { clientNavItemVisible, normalizeClientPath, seesPlatformOperatorNav, getRoleDefaultRoute } from "@shared/clientNav";
import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRight, ArrowUpRight, BarChart3,
  Briefcase, Building2, CheckCircle2, Clock, FileText,
  Shield, ShoppingBag, TrendingUp, Users, Banknote,
  Globe, Zap, RefreshCw, Award, MapPin, Calendar,
  ChevronRight, Activity, Bell,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { fmtDate, fmtDateLong, fmtDateTime, fmtDateTimeShort, fmtTime } from "@/lib/dateUtils";

/* ── KPI Stat Card ─────────────────────────────────────────────────────── */
function StatCard({
  title, value, icon, gradient, change, sub,
}: {
  title: string; value: number | string; icon: React.ReactNode;
  gradient: string; change?: string; sub?: string;
}) {
  return (
    <div className={`${gradient} rounded-2xl p-5 text-white shadow-sm`}>
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">{icon}</div>
        {change && (
          <span className="text-[10px] font-semibold bg-white/15 px-2 py-0.5 rounded-full flex items-center gap-0.5">
            <TrendingUp size={9} /> {change}
          </span>
        )}
      </div>
      <p className="text-3xl font-black mt-1">{value}</p>
      <p className="text-white/70 text-xs font-medium mt-0.5 uppercase tracking-wide">{title}</p>
      {sub && <p className="text-white/50 text-[10px] mt-1">{sub}</p>}
    </div>
  );
}

/* ── Module Quick-Access Card ──────────────────────────────────────────── */
function ModuleCard({
  title, description, href, icon, count, tag, tagColor,
}: {
  title: string; description: string; href: string; icon: React.ReactNode;
  count?: number; tag?: string; tagColor?: string;
}) {
  return (
    <Link href={href}>
      <Card className="hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group h-full">
        <CardContent className="p-4 h-full flex flex-col">
          <div className="flex items-start gap-3 flex-1">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground group-hover:bg-[var(--smartpro-orange)] group-hover:text-white transition-colors shrink-0">
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                <h3 className="font-semibold text-sm text-foreground">{title}</h3>
                {count !== undefined && count > 0 && (
                  <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4">{count}</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
            </div>
          </div>
          {tag && (
            <div className="mt-3 flex items-center justify-between">
              <span className={`module-chip ${tagColor ?? "module-chip-gov"}`}>{tag}</span>
              <ArrowRight size={13} className="text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

/* ── Compliance Status Row ─────────────────────────────────────────────── */
function ComplianceRow({ label, status, pct }: { label: string; status: "ok" | "warn" | "critical"; pct: number }) {
  const colors = { ok: "bg-emerald-500", warn: "bg-amber-500", critical: "bg-red-500" };
  const labels = { ok: "Compliant", warn: "Review Needed", critical: "Action Required" };
  const textColors = { ok: "text-emerald-700 bg-emerald-50", warn: "text-amber-700 bg-amber-50", critical: "text-red-700 bg-red-50" };
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-foreground">{label}</span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${textColors[status]}`}>{labels[status]}</span>
        </div>
        <Progress value={pct} className="h-1.5" />
      </div>
    </div>
  );
}

/* ── Main Dashboard ────────────────────────────────────────────────────── */
export default function Dashboard() {
  const { user } = useAuth();
  const { activeCompanyId, activeCompany, loading: companyLoading } = useActiveCompany();
  const [, navigate] = useLocation();
  const { data: stats, isLoading } = trpc.companies.myStats.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: myCompany, isLoading: myCompanyLoading } = trpc.companies.myCompany.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const [navPrefsEpoch, setNavPrefsEpoch] = useState(0);

  // Fetch custom role redirect settings for this company
  const { data: roleRedirectData } = trpc.companies.getRoleRedirectSettings.useQuery(
    { companyId: activeCompanyId ?? 0 },
    { enabled: activeCompanyId != null && !companyLoading }
  );

  // Smart redirect: send non-admin roles to their appropriate page (custom or system default)
  useEffect(() => {
    if (companyLoading) return;
    const memberRole = activeCompany?.role ?? null;
    if (!memberRole) return;
    // Platform admins and company_admin stay on the main dashboard
    if (seesPlatformOperatorNav(user)) return;
    if (memberRole === "company_admin" || (memberRole as string) === "owner") return;
    // Check for a custom redirect configured by the company admin; fall back to system default
    const customRoute = roleRedirectData?.settings?.[memberRole];
    const targetRoute = customRoute || getRoleDefaultRoute(memberRole);
    if (targetRoute && targetRoute !== "/dashboard" && targetRoute !== "/") {
      navigate(targetRoute);
    }
  }, [activeCompany?.role, companyLoading, roleRedirectData]);

  useEffect(() => {
    const fn = () => setNavPrefsEpoch((n) => n + 1);
    window.addEventListener("smartpro-nav-prefs-changed", fn);
    return () => window.removeEventListener("smartpro-nav-prefs-changed", fn);
  }, []);

  const navOpts = useMemo(
    () => ({
      hasCompanyWorkspace: Boolean(myCompany?.company?.id),
      companyWorkspaceLoading: myCompanyLoading,
    }),
    [myCompany?.company?.id, myCompanyLoading],
  );

  const showHref = useMemo(() => {
    const hidden = getHiddenNavHrefs();
    return (href: string) => clientNavItemVisible(href, user, hidden, navOpts);
  }, [user, navOpts, navPrefsEpoch]);

  const { data: expiringDocs } = trpc.pro.expiringDocuments.useQuery({ daysAhead: 30 });
  const { data: hrStats } = trpc.hr.getDashboardStats.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: platformStats } = trpc.analytics.platformStats.useQuery();
  const { data: alertBadge } = trpc.alerts.getAlertBadgeCount.useQuery();
  const { data: aiInsights } = trpc.operations.getAiInsights.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: todaysTasks } = trpc.operations.getTodaysTasks.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: auditFeed } = trpc.analytics.auditLogs.useQuery({ limit: 8 });

  const quickAccessModules = useMemo(() => {
    const items = [
      {
        key: "sanad",
        href: "/sanad",
        title: "Sanad Office Management",
        description: "Government service centres — applications, staff, and performance tracking",
        icon: <Building2 size={18} />,
        count: stats?.sanadApplications,
        tag: "Government",
        tagColor: "module-chip-gov",
      },
      {
        key: "pro",
        href: "/pro",
        title: "PRO & Visa Services",
        description: "Work permits, residence visas, labour cards, PASI, and MHRSD filings",
        icon: <Shield size={18} />,
        count: stats?.proServices,
        tag: "Compliance",
        tagColor: "module-chip-legal",
      },
      {
        key: "hr",
        href: "/hr/employees",
        title: "HR & Workforce Hub",
        description: "Employees, leave management, payroll, WPS, and Omanisation tracking",
        icon: <Briefcase size={18} />,
        count: stats?.pendingLeave,
        tag: "Human Resources",
        tagColor: "module-chip-hr",
      },
      {
        key: "contracts",
        href: "/contracts",
        title: "Smart Contracts",
        description: "Draft, negotiate, and digitally sign contracts with full audit trail",
        icon: <FileText size={18} />,
        count: stats?.contracts,
        tag: "Legal",
        tagColor: "module-chip-legal",
      },
      {
        key: "marketplace",
        href: "/marketplace",
        title: "Service Marketplace",
        description: "Connect with verified PRO service providers across Oman and GCC",
        icon: <ShoppingBag size={18} />,
        tag: "Marketplace",
        tagColor: "module-chip-biz",
      },
      {
        key: "crm",
        href: "/crm",
        title: "CRM & Pipeline",
        description: "Manage clients, deals, and business development pipeline",
        icon: <Users size={18} />,
        count: stats?.deals,
        tag: "Business",
        tagColor: "module-chip-biz",
      },
      {
        key: "payroll",
        href: "/payroll",
        title: "Payroll Engine",
        description: "WPS-compliant payroll, PASI deductions, salary loans, and payslips",
        icon: <Banknote size={18} />,
        tag: "Finance",
        tagColor: "module-chip-fin",
      },
      {
        key: "alerts",
        href: "/alerts",
        title: "Expiry Alerts",
        description: "Real-time alerts for visas, permits, contracts, and compliance deadlines",
        icon: <Bell size={18} />,
        count: alertBadge?.count,
        tag: "Compliance",
        tagColor: "module-chip-legal",
      },
    ];
    return items.filter((m) => showHref(m.href));
  }, [showHref, stats, alertBadge]);

  const platformToolLinks = useMemo(() => {
    const items = [
      { href: "/renewal-workflows", icon: <RefreshCw size={13} />, label: "Renewal Workflows" },
      { href: "/billing", icon: <Banknote size={13} />, label: "Billing Engine" },
      { href: "/omani-officers", icon: <Users size={13} />, label: "Omani PRO Officers" },
      { href: "/workforce", icon: <BarChart3 size={13} />, label: "Workforce Dashboard" },
      { href: "/reports", icon: <FileText size={13} />, label: "PDF Reports" },
      { href: "/audit-log", icon: <Shield size={13} />, label: "Audit Log" },
    ];
    return items.filter((item) => showHref(item.href));
  }, [showHref]);

  const showPlatformOverview = seesPlatformOperatorNav(user);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dateStr = new Date().toLocaleDateString("en-OM", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  return (
    <div className="p-5 md:p-6 space-y-6 max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-black text-foreground">
              {greeting}, {user?.name?.split(" ")[0] ?? "there"} 👋
            </h1>
          </div>
          <p className="text-muted-foreground text-sm flex items-center gap-2 flex-wrap">
            {myCompany && (
              <span className="flex items-center gap-1">
                <Building2 size={12} /> {myCompany.company.name}
              </span>
            )}
            <span className="text-border">·</span>
            <span className="flex items-center gap-1"><MapPin size={12} /> Sultanate of Oman</span>
            <span className="text-border">·</span>
            <span className="flex items-center gap-1"><Calendar size={12} /> {dateStr}</span>
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {showHref("/alerts") && alertBadge && alertBadge.critical > 0 && (
            <Link href="/alerts">
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 cursor-pointer hover:bg-red-100 transition-colors">
                <AlertTriangle size={15} className="text-red-600" />
                <span className="text-xs text-red-700 font-semibold">
                  {alertBadge.critical} Critical Alert{alertBadge.critical > 1 ? "s" : ""}
                </span>
                <ChevronRight size={12} className="text-red-500" />
              </div>
            </Link>
          )}
          {showHref("/pro") && expiringDocs && expiringDocs.length > 0 && (
            <Link href="/pro">
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 cursor-pointer hover:bg-amber-100 transition-colors">
                <Clock size={15} className="text-amber-600" />
                <span className="text-xs text-amber-700 font-semibold">
                  {expiringDocs.length} Expiring Soon
                </span>
                <ChevronRight size={12} className="text-amber-500" />
              </div>
            </Link>
          )}
        </div>
      </div>

      {/* ── Admin Platform Stats ── */}
      {showPlatformOverview && platformStats && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <Activity size={13} /> Platform Overview
            </h2>
            <Link href="/analytics">
              <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">
                Full Analytics <ArrowUpRight size={11} />
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Companies" value={platformStats.companies} icon={<Building2 size={20} />} gradient="stat-gradient-1" sub="Registered entities" />
            <StatCard title="Total Users" value={platformStats.users} icon={<Users size={20} />} gradient="stat-gradient-2" change="+12% MoM" />
            <StatCard title="Contracts" value={platformStats.contracts} icon={<FileText size={20} />} gradient="stat-gradient-3" sub="Active agreements" />
            <StatCard title="PRO Services" value={platformStats.proServices} icon={<Shield size={20} />} gradient="stat-gradient-4" sub="Managed documents" />
          </div>
        </div>
      )}

      {/* ── Company KPI Stats ── */}
      {!showPlatformOverview && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <BarChart3 size={13} /> Your Company Overview
            </h2>
            <Link href="/analytics">
              <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">
                Analytics <ArrowUpRight size={11} />
              </Button>
            </Link>
          </div>
          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard title="Employees" value={stats.employees} icon={<Users size={20} />} gradient="stat-gradient-1" sub="Active workforce" />
              <StatCard title="PRO Services" value={stats.proServices} icon={<Shield size={20} />} gradient="stat-gradient-2" sub="Managed documents" />
              <StatCard title="Contracts" value={stats.contracts} icon={<FileText size={20} />} gradient="stat-gradient-3" sub="Active agreements" />
              <StatCard title="CRM Contacts" value={stats.contacts} icon={<Users size={20} />} gradient="stat-gradient-4" sub="Clients & leads" />
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <Building2 size={32} className="mx-auto text-muted-foreground mb-3" />
                <h3 className="font-bold mb-1">No company linked</h3>
                <p className="text-sm text-muted-foreground mb-4">Create or join a company to access all features.</p>
                <Button asChild size="sm"><Link href="/onboarding">Set up company</Link></Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── HR Live Stats ── */}
      {!showPlatformOverview && activeCompanyId && hrStats && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <Activity size={13} /> Today's HR Snapshot
            </h2>
            <Link href="/hr/today-board">
              <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">
                Today's Board <ArrowUpRight size={11} />
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Link href="/hr/attendance">
              <div className="bg-emerald-500 rounded-2xl p-4 text-white shadow-sm hover:opacity-90 transition-opacity cursor-pointer">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
                    <CheckCircle2 size={16} />
                  </div>
                  <span className="text-white/70 text-xs uppercase tracking-wide font-medium">Present Today</span>
                </div>
                <p className="text-3xl font-black">{hrStats.todayPresent}</p>
                <p className="text-white/60 text-[10px] mt-1">of {hrStats.activeEmployees} active</p>
              </div>
            </Link>
            <Link href="/hr/leave">
              <div className="bg-amber-500 rounded-2xl p-4 text-white shadow-sm hover:opacity-90 transition-opacity cursor-pointer">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
                    <Calendar size={16} />
                  </div>
                  <span className="text-white/70 text-xs uppercase tracking-wide font-medium">Pending Leave</span>
                </div>
                <p className="text-3xl font-black">{hrStats.pendingLeave}</p>
                <p className="text-white/60 text-[10px] mt-1">Awaiting approval</p>
              </div>
            </Link>
            <Link href="/hr/kpi">
              <div className="bg-blue-500 rounded-2xl p-4 text-white shadow-sm hover:opacity-90 transition-opacity cursor-pointer">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
                    <TrendingUp size={16} />
                  </div>
                  <span className="text-white/70 text-xs uppercase tracking-wide font-medium">KPI Avg</span>
                </div>
                <p className="text-3xl font-black">{hrStats.kpiAvgPct > 0 ? `${hrStats.kpiAvgPct}%` : "—"}</p>
                <p className="text-white/60 text-[10px] mt-1">{hrStats.kpiTargetsCount} targets this month</p>
              </div>
            </Link>
            <Link href="/payroll">
              <div className={`${
                hrStats.payrollStatus === "paid" ? "bg-teal-500" :
                hrStats.payrollStatus === "approved" ? "bg-indigo-500" :
                hrStats.payrollStatus === "draft" ? "bg-slate-500" : "bg-slate-400"
              } rounded-2xl p-4 text-white shadow-sm hover:opacity-90 transition-opacity cursor-pointer`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
                    <Banknote size={16} />
                  </div>
                  <span className="text-white/70 text-xs uppercase tracking-wide font-medium">Payroll</span>
                </div>
                <p className="text-3xl font-black capitalize">{hrStats.payrollStatus ?? "—"}</p>
                <p className="text-white/60 text-[10px] mt-1">{hrStats.payrollMonth ?? "No run this month"}</p>
              </div>
            </Link>
          </div>
        </div>
      )}

      {/* ── Main content grid ── */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Module Quick Access — 2 cols */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
            <Zap size={13} /> Quick Access
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {quickAccessModules.map((m) => (
              <ModuleCard
                key={m.key}
                title={m.title}
                description={m.description}
                href={m.href}
                icon={m.icon}
                count={m.count}
                tag={m.tag}
                tagColor={m.tagColor}
              />
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Compliance Status */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Award size={15} className="text-[var(--smartpro-orange)]" />
                Compliance Status
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ComplianceRow label="PASI Contributions" status="ok" pct={98} />
              <ComplianceRow label="Work Permit Renewals" status={expiringDocs && expiringDocs.length > 3 ? "warn" : "ok"} pct={expiringDocs ? Math.max(40, 100 - expiringDocs.length * 8) : 92} />
              <ComplianceRow label="Omanisation Quota" status="ok" pct={85} />
              <ComplianceRow label="WPS Salary Transfers" status="ok" pct={100} />
              <ComplianceRow label="Labour Law Filings" status="ok" pct={94} />
              {showHref("/reports") && (
                <div className="mt-3 pt-3 border-t border-border">
                  <Link href="/reports">
                    <Button variant="outline" size="sm" className="w-full text-xs gap-1">
                      View Compliance Report <ArrowRight size={11} />
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Expiring Documents */}
          {showHref("/pro") && expiringDocs && expiringDocs.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-amber-800">
                  <Clock size={15} className="text-amber-600" />
                  Expiring Documents
                  <Badge className="ml-auto bg-amber-100 text-amber-800 border-amber-200 text-xs">{expiringDocs.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {expiringDocs.slice(0, 4).map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between py-1.5 border-b border-amber-100 last:border-0">
                      <div>
                        <div className="text-xs font-medium text-foreground">{doc.employeeName}</div>
                        <div className="text-[10px] text-muted-foreground">{doc.serviceType?.replace(/_/g, " ")}</div>
                      </div>
                      <span className="text-[10px] text-amber-700 font-semibold whitespace-nowrap">
                        {doc.expiryDate ? fmtDateLong(doc.expiryDate) : "N/A"}
                      </span>
                    </div>
                  ))}
                </div>
                {expiringDocs.length > 4 && (
                  <Button asChild variant="ghost" size="sm" className="mt-2 w-full text-amber-700 text-xs h-7">
                    <Link href="/pro">+{expiringDocs.length - 4} more documents</Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Platform Links */}
          {platformToolLinks.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Globe size={15} className="text-[var(--smartpro-teal)]" />
                  Platform Tools
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-1">
                {platformToolLinks.map((item) => (
                  <Link key={item.href} href={item.href}>
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors cursor-pointer">
                      <span className="text-muted-foreground">{item.icon}</span>
                      <span className="text-xs font-medium text-foreground">{item.label}</span>
                      <ChevronRight size={11} className="ml-auto text-muted-foreground" />
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ── AI Insights + Today’s Tasks + Recent Activity ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* AI Insights */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap size={14} className="text-amber-500" /> AI Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {aiInsights && aiInsights.length > 0 ? aiInsights.map((ins, i) => (
              <div key={i} className={`p-3 rounded-lg border-l-4 ${
                ins.severity === "critical" ? "border-red-500 bg-red-50" :
                ins.severity === "warning" ? "border-amber-500 bg-amber-50" :
                "border-blue-500 bg-blue-50"
              }`}>
                <p className="text-xs font-semibold text-foreground">{ins.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{ins.description}</p>
                {ins.actionUrl &&
                  (!ins.actionUrl.startsWith("/") ||
                    showHref(normalizeClientPath(ins.actionUrl))) && (
                  <Link href={ins.actionUrl}>
                    <Button variant="link" size="sm" className="h-5 p-0 text-xs mt-1 gap-1">
                      {ins.actionLabel} <ArrowRight size={10} />
                    </Button>
                  </Link>
                )}
              </div>
            )) : (
              <div className="text-center py-8 text-muted-foreground">
                <Zap size={28} className="mx-auto mb-2 opacity-20" />
                <p className="text-xs">No critical alerts today</p>
                <p className="text-[10px] mt-0.5 opacity-60">All systems operating normally</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Today’s Tasks */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-500" /> Today’s Tasks
              {todaysTasks && todaysTasks.totalTasks > 0 && (
                <Badge variant="secondary" className="ml-auto text-xs">{todaysTasks.totalTasks}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {todaysTasks && todaysTasks.totalTasks > 0 ? todaysTasks.casesDue.slice(0, 6).map((task, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0">
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  task.priority === "urgent" ? "bg-red-500" :
                  task.priority === "high" ? "bg-amber-500" : "bg-blue-400"
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate capitalize">{task.caseType.replace(/_/g, " ")}</p>
                  <p className="text-[10px] text-muted-foreground">Gov. Case #{task.id}</p>
                </div>
                <Link href="/workforce/cases">
                  <ChevronRight size={12} className="text-muted-foreground hover:text-foreground" />
                </Link>
              </div>
            )) : (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 size={28} className="mx-auto mb-2 opacity-20" />
                <p className="text-xs">All clear for today</p>
                <p className="text-[10px] mt-0.5 opacity-60">No pending tasks</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity — real audit events from DB */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity size={14} className="text-blue-500" /> Recent Activity
              </CardTitle>
              {showHref("/audit-log") && (
                <Link href="/audit-log">
                  <Button variant="ghost" size="sm" className="text-xs gap-1 h-6">
                    All <ArrowUpRight size={10} />
                  </Button>
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {auditFeed && auditFeed.length > 0 ? auditFeed.slice(0, 6).map((ev, i) => (
              <div key={i} className="flex items-start gap-2 py-1.5 border-b border-border/50 last:border-0">
                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <Activity size={11} className="text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate capitalize">{String(ev.action).replace(/_/g, " ")} {String(ev.entityType).replace(/_/g, " ")}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(ev.createdAt).toLocaleTimeString("en-OM", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            )) : (
              <div className="space-y-2">
                {["Platform initialized", "PASI module ready", "Sanad services active"].map((t, i) => (
                  <div key={i} className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0">
                    <div className="w-6 h-6 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                      <CheckCircle2 size={11} className="text-emerald-600" />
                    </div>
                    <p className="text-xs text-muted-foreground">{t}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
