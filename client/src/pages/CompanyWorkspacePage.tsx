import { useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import {
  Users, DollarSign, FileText, Shield, Building2, BarChart3,
  ChevronRight, CheckCircle2, Clock, AlertTriangle, TrendingUp,
  Briefcase, Calendar, CreditCard, Globe, Zap, UserPlus,
  Bell, ArrowRight, Activity, BookOpen, Target, UserCheck,
  Plus, Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// ─── KPI tile ─────────────────────────────────────────────────────────────────

function KpiTile({
  icon, label, value, sub, color, href, loading,
}: {
  icon: React.ReactNode; label: string; value: string | number;
  sub?: string; color: string; href?: string; loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-4 flex items-start gap-3">
        <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-12" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    );
  }
  const inner = (
    <div className={`rounded-xl border bg-card p-4 flex items-start gap-3 transition-all ${href ? "hover:shadow-md hover:border-[var(--smartpro-orange)] cursor-pointer" : ""}`}>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-2xl font-black text-foreground leading-none">{value}</div>
        <div className="text-xs font-medium text-muted-foreground mt-1">{label}</div>
        {sub && <div className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</div>}
      </div>
      {href && <ChevronRight size={14} className="text-muted-foreground/40 ml-auto mt-1 shrink-0" />}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

// ─── Module card ──────────────────────────────────────────────────────────────

function ModuleCard({
  icon, title, description, href, badge, actions,
}: {
  icon: React.ReactNode; title: string; description: string;
  href: string; badge?: { label: string; color: string };
  actions?: { label: string; href: string; icon?: React.ReactNode }[];
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 hover:shadow-md hover:border-[var(--smartpro-orange)]/40 transition-all group">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-muted border border-border flex items-center justify-center shrink-0 group-hover:bg-[var(--smartpro-orange)]/10 transition-colors">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-foreground">{title}</span>
            {badge && (
              <Badge className={`text-[10px] border px-1.5 py-0 ${badge.color}`}>{badge.label}</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Link href={href}>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 bg-background">
            Open <ArrowRight size={11} />
          </Button>
        </Link>
        {actions?.map((a) => (
          <Link key={a.href} href={a.href}>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1">
              {a.icon}{a.label}
            </Button>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── Setup step ──────────────────────────────────────────────────────────────

function SetupStep({
  step, title, description, done, href,
}: {
  step: number; title: string; description: string; done: boolean; href: string;
}) {
  return (
    <Link href={href}>
      <div className={`flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer
        ${done
          ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
          : "border-border bg-card hover:border-[var(--smartpro-orange)] hover:bg-[var(--smartpro-orange)]/5"
        }`}>
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0
          ${done ? "bg-emerald-500 text-white" : "bg-[var(--smartpro-orange)] text-white"}`}>
          {done ? <CheckCircle2 size={14} /> : step}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-semibold ${done ? "text-emerald-700 dark:text-emerald-400 line-through" : "text-foreground"}`}>{title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
        </div>
        {!done && <ChevronRight size={14} className="text-muted-foreground/40 ml-auto mt-1 shrink-0" />}
      </div>
    </Link>
  );
}

// ─── No Company Guard ─────────────────────────────────────────────────────────

function NoCompanyPrompt() {
  const [, navigate] = useLocation();
  return (
    <div className="min-h-full bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-20 h-20 rounded-2xl bg-[var(--smartpro-orange)]/10 flex items-center justify-center mx-auto">
          <Building2 size={36} className="text-[var(--smartpro-orange)]" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-foreground">Set Up Your Company Workspace</h2>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            Create your company profile to unlock staff management, payroll, contracts, PRO services, and all business tools — all in one place.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-left">
          {[
            { icon: <Users size={16} className="text-orange-600" />, label: "Staff Management", color: "bg-orange-50 dark:bg-orange-950/30" },
            { icon: <DollarSign size={16} className="text-green-600" />, label: "Payroll & WPS", color: "bg-green-50 dark:bg-green-950/30" },
            { icon: <FileText size={16} className="text-blue-600" />, label: "Smart Contracts", color: "bg-blue-50 dark:bg-blue-950/30" },
            { icon: <Shield size={16} className="text-purple-600" />, label: "PRO Services", color: "bg-purple-50 dark:bg-purple-950/30" },
          ].map((f) => (
            <div key={f.label} className={`${f.color} rounded-xl p-3 flex items-center gap-2.5`}>
              {f.icon}
              <span className="text-sm font-medium text-foreground">{f.label}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <Button className="w-full gap-2" size="lg" onClick={() => navigate("/onboarding")}>
            <Sparkles size={16} /> Create Company Workspace
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => navigate("/dashboard")}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CompanyWorkspacePage() {
  const { user } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const { data: myCompany, isLoading: companyLoading } = trpc.companies.myCompany.useQuery({ companyId: activeCompanyId ?? undefined });
  const { data: teamStats, isLoading: teamLoading } = trpc.team.getTeamStats.useQuery();
  const { data: alertCount } = trpc.alerts.getAlertBadgeCount.useQuery();
  const { data: companyStats, isLoading: statsLoading } = trpc.companies.myStats.useQuery({ companyId: activeCompanyId ?? undefined });

  const company = myCompany?.company;
  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";
  const dayName = now.toLocaleDateString("en-OM", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const kpiLoading = teamLoading || statsLoading;

  // Setup checklist — infer completion from live data
  const hasStaff = (teamStats?.total ?? 0) > 0;
  const hasContract = (companyStats?.contracts ?? 0) > 0;
  const hasProService = (companyStats?.proServices ?? 0) > 0;
  const setupDone = [Boolean(company), hasStaff, hasContract, hasProService].filter(Boolean).length;

  // Show guard if company is loaded but doesn't exist
  if (!companyLoading && !company) {
    return <NoCompanyPrompt />;
  }

  return (
    <div className="min-h-full bg-background">
      {/* Hero header */}
      <div className="bg-card border-b border-border px-6 py-5">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
                <Building2 size={11} />
                {companyLoading ? <Skeleton className="h-3 w-28 inline-block" /> : (company?.name ?? "Your Company")}
                <span className="mx-1">·</span>
                {dayName}
              </div>
              <h1 className="text-2xl font-black text-foreground">
                {greeting}, {user?.name?.split(" ")[0] ?? "there"} 👋
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Your all-in-one business operating centre — staff, payroll, contracts, compliance, and more.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <Link href="/my-team">
                <Button className="gap-2" size="sm">
                  <UserPlus size={14} /> Add Staff
                </Button>
              </Link>
              <Link href="/alerts">
                <Button variant="outline" size="sm" className="gap-2 relative bg-background">
                  <Bell size={14} />
                  {(alertCount?.count ?? 0) > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                      {alertCount!.count}
                    </span>
                  )}
                  Alerts
                </Button>
              </Link>
              <Link href="/company-admin">
                <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                  Settings
                </Button>
              </Link>
            </div>
          </div>

          {/* Setup progress bar */}
          {setupDone < 4 && !companyLoading && (
            <div className="mt-4 flex items-center gap-3 bg-[var(--smartpro-orange)]/8 border border-[var(--smartpro-orange)]/20 rounded-xl px-4 py-3">
              <Sparkles size={16} className="text-[var(--smartpro-orange)] shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold text-foreground">Getting started</span>
                <span className="text-xs text-muted-foreground ml-2">{setupDone} of 4 steps complete</span>
              </div>
              <div className="flex gap-1 shrink-0">
                {[Boolean(company), hasStaff, hasContract, hasProService].map((done, i) => (
                  <div key={i} className={`w-6 h-1.5 rounded-full transition-colors ${done ? "bg-[var(--smartpro-orange)]" : "bg-border"}`} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-8">

        {/* Live KPI tiles */}
        <section>
          <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Live Overview</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiTile loading={kpiLoading}
              icon={<Users size={18} className="text-orange-600" />}
              label="Total Staff" value={teamStats?.total ?? 0}
              sub={`${teamStats?.active ?? 0} active`}
              color="bg-orange-100 dark:bg-orange-950/40" href="/my-team"
            />
            <KpiTile loading={kpiLoading}
              icon={<UserCheck size={18} className="text-emerald-600" />}
              label="Active Staff" value={teamStats?.active ?? 0}
              sub={`${teamStats?.onLeave ?? 0} on leave`}
              color="bg-emerald-100 dark:bg-emerald-950/40" href="/my-team"
            />
            <KpiTile loading={kpiLoading}
              icon={<FileText size={18} className="text-blue-600" />}
              label="Contracts" value={companyStats?.contracts ?? 0}
              sub="Active agreements"
              color="bg-blue-100 dark:bg-blue-950/40" href="/contracts"
            />
            <KpiTile loading={kpiLoading}
              icon={<Shield size={18} className="text-purple-600" />}
              label="PRO Services" value={companyStats?.proServices ?? 0}
              sub="Managed cases"
              color="bg-purple-100 dark:bg-purple-950/40" href="/pro"
            />
            <KpiTile loading={kpiLoading}
              icon={<Bell size={18} className="text-red-600" />}
              label="Expiry Alerts" value={alertCount?.count ?? 0}
              sub="Require attention"
              color="bg-red-100 dark:bg-red-950/40" href="/alerts"
            />
            <KpiTile loading={kpiLoading}
              icon={<BarChart3 size={18} className="text-teal-600" />}
              label="Departments" value={teamStats?.byDepartment.length ?? 0}
              sub="Across your company"
              color="bg-teal-100 dark:bg-teal-950/40" href="/my-team"
            />
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left: Business modules */}
          <div className="lg:col-span-2 space-y-6">

            {/* Core HR & People */}
            <section>
              <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                <Users size={12} /> People & HR
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ModuleCard
                  icon={<Users size={16} className="text-orange-600" />}
                  title="My Team"
                  description="Add and manage your staff. View profiles, track employment status, and maintain your workforce directory."
                  href="/my-team"
                  badge={{ label: `${teamStats?.total ?? 0} staff`, color: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800" }}
                  actions={[{ label: "Add Staff", href: "/my-team", icon: <Plus size={11} /> }]}
                />
                <ModuleCard
                  icon={<DollarSign size={16} className="text-green-600" />}
                  title="Payroll Engine"
                  description="Run monthly payroll, generate payslips, calculate PASI deductions, and export WPS files for bank transfers."
                  href="/payroll"
                  actions={[{ label: "Run Payroll", href: "/payroll" }]}
                />
                <ModuleCard
                  icon={<Calendar size={16} className="text-blue-600" />}
                  title="Leave Management"
                  description="Manage leave requests, track approvals, and maintain payroll records for your employees."
                  href="/hr/leave"
                  actions={[{ label: "View Requests", href: "/hr/leave" }]}
                />
                <ModuleCard
                  icon={<Briefcase size={16} className="text-violet-600" />}
                  title="Employees (HR)"
                  description="Full HR employee profiles, documents, performance records, and employment history."
                  href="/hr/employees"
                  badge={{ label: `${companyStats?.employees ?? 0} records`, color: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-400 dark:border-violet-800" }}
                />
              </div>
            </section>

            {/* Business Operations */}
            <section>
              <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                <Activity size={12} /> Business Operations
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ModuleCard
                  icon={<FileText size={16} className="text-blue-600" />}
                  title="Contracts"
                  description="Draft, negotiate, and sign employment, service, NDA, and vendor contracts. AI-assisted generation."
                  href="/contracts"
                  badge={{ label: `${companyStats?.contracts ?? 0} contracts`, color: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800" }}
                  actions={[{ label: "New Contract", href: "/contracts", icon: <Plus size={11} /> }]}
                />
                <ModuleCard
                  icon={<Target size={16} className="text-orange-600" />}
                  title="CRM"
                  description="Manage your clients, leads, and deals. Track pipeline stages and business relationships."
                  href="/crm"
                  badge={{ label: `${companyStats?.deals ?? 0} deals`, color: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800" }}
                />
                <ModuleCard
                  icon={<TrendingUp size={16} className="text-indigo-600" />}
                  title="Quotations"
                  description="Create professional quotations and proposals for clients. Track acceptance and convert to contracts."
                  href="/quotations"
                />
                <ModuleCard
                  icon={<BookOpen size={16} className="text-amber-600" />}
                  title="Recruitment"
                  description="Post job openings, manage applications, and track your hiring pipeline end-to-end."
                  href="/hr/recruitment"
                  badge={{ label: `${companyStats?.openJobs ?? 0} open`, color: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800" }}
                />
              </div>
            </section>

            {/* Government & Compliance */}
            <section>
              <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                <Shield size={12} /> Government & Compliance
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ModuleCard
                  icon={<Shield size={16} className="text-purple-600" />}
                  title="PRO Services"
                  description="Visa processing, work permits, labour cards, residence renewals, and government filings."
                  href="/pro"
                  badge={{ label: `${companyStats?.proServices ?? 0} cases`, color: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800" }}
                  actions={[{ label: "New Request", href: "/pro", icon: <Plus size={11} /> }]}
                />
                <ModuleCard
                  icon={<Globe size={16} className="text-teal-600" />}
                  title="Sanad Services"
                  description="Access government service centres, track applications, and manage Sanad office interactions."
                  href="/sanad"
                />
                <ModuleCard
                  icon={<Bell size={16} className="text-red-600" />}
                  title="Expiry Alerts"
                  description="Stay ahead of document and permit expirations. Get notified before deadlines."
                  href="/alerts"
                  badge={
                    (alertCount?.count ?? 0) > 0
                      ? { label: `${alertCount!.count} pending`, color: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800" }
                      : undefined
                  }
                />
                <ModuleCard
                  icon={<Zap size={16} className="text-emerald-600" />}
                  title="Compliance Dashboard"
                  description="Monitor PASI contributions, Omanisation quota, WPS salary transfers, and labour law filings."
                  href="/compliance"
                />
              </div>
            </section>
          </div>

          {/* Right: Setup checklist + Recent hires */}
          <div className="space-y-5">

            {/* Getting started */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Sparkles size={14} className="text-[var(--smartpro-orange)]" />
                  Getting Started
                  <Badge className="ml-auto text-[10px] bg-[var(--smartpro-orange)]/10 text-[var(--smartpro-orange)] border-[var(--smartpro-orange)]/20">
                    {setupDone}/4
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                <SetupStep step={1} title="Create Company" description="Register your business profile" done={Boolean(company)} href="/company-admin" />
                <SetupStep step={2} title="Add Your Staff" description="Build your team directory" done={hasStaff} href="/my-team" />
                <SetupStep step={3} title="Create a Contract" description="Draft your first agreement" done={hasContract} href="/contracts" />
                <SetupStep step={4} title="Submit PRO Request" description="Start a government service" done={hasProService} href="/pro" />
              </CardContent>
            </Card>

            {/* Recent hires */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <UserPlus size={14} className="text-emerald-600" />
                  Recent Hires
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {teamLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Skeleton className="w-8 h-8 rounded-full" />
                        <div className="flex-1 space-y-1">
                          <Skeleton className="h-3 w-24" />
                          <Skeleton className="h-2.5 w-16" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (teamStats?.recentHires ?? []).length === 0 ? (
                  <div className="text-center py-4">
                    <Users size={24} className="mx-auto text-muted-foreground/30 mb-2" />
                    <p className="text-xs text-muted-foreground">No recent hires in the last 30 days.</p>
                    <Link href="/my-team">
                      <Button size="sm" variant="ghost" className="mt-2 text-xs gap-1 text-[var(--smartpro-orange)]">
                        <Plus size={11} /> Add First Staff Member
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(teamStats?.recentHires ?? []).slice(0, 5).map((emp) => (
                      <div key={emp.id} className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[var(--smartpro-orange)]/15 flex items-center justify-center text-xs font-bold text-[var(--smartpro-orange)] shrink-0">
                          {(emp.firstName?.[0] ?? "") + (emp.lastName?.[0] ?? "")}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">{emp.firstName} {emp.lastName}</div>
                          <div className="text-xs text-muted-foreground truncate">{emp.position ?? emp.department ?? "Staff"}</div>
                        </div>
                        <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800 shrink-0">New</Badge>
                      </div>
                    ))}
                    <Link href="/my-team">
                      <Button size="sm" variant="ghost" className="w-full text-xs text-muted-foreground mt-1 gap-1">
                        View All Staff <ChevronRight size={11} />
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Department breakdown */}
            {(teamStats?.byDepartment ?? []).length > 0 && (
              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <BarChart3 size={14} className="text-teal-600" />
                    Staff by Department
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {(teamStats?.byDepartment ?? []).slice(0, 6).map((dept, i) => {
                    const max = Math.max(...(teamStats?.byDepartment ?? []).map((d) => d.count));
                    const pct = max > 0 ? Math.round((dept.count / max) * 100) : 0;
                    const deptLabel = dept.dept;
                    const colors = ["bg-orange-500", "bg-teal-500", "bg-blue-500", "bg-purple-500", "bg-emerald-500", "bg-amber-500"];
                    return (
                      <div key={deptLabel} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-foreground font-medium truncate max-w-[120px]">{dept.dept}</span>
                          <span className="text-muted-foreground shrink-0">{dept.count}</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${colors[i % colors.length]}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Quick links */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold">Quick Links</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-1">
                {[
                  { label: "Subscriptions & Billing", href: "/subscriptions", icon: <CreditCard size={13} className="text-muted-foreground" /> },
                  { label: "Company Settings", href: "/company-admin", icon: <Building2 size={13} className="text-muted-foreground" /> },
                  { label: "Workforce Hub", href: "/workforce", icon: <Globe size={13} className="text-muted-foreground" /> },
                  { label: "Analytics", href: "/analytics", icon: <BarChart3 size={13} className="text-muted-foreground" /> },
                  { label: "Client Portal", href: "/client-portal", icon: <UserCheck size={13} className="text-muted-foreground" /> },
                ].map((l) => (
                  <Link key={l.href} href={l.href}>
                    <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-muted transition-colors cursor-pointer">
                      {l.icon}
                      <span className="text-xs text-foreground">{l.label}</span>
                      <ChevronRight size={11} className="text-muted-foreground/40 ml-auto" />
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
