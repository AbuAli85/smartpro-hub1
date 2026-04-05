import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, DollarSign, FileText, Shield, Bell, CheckCircle2,
  Clock, AlertTriangle, ChevronRight, Plus, Play, TrendingUp,
  Building2, Calendar, Briefcase, UserPlus, RefreshCw,
  ArrowRight, Zap, Target, Activity, BarChart3,
} from "lucide-react";
import { fmtDate, fmtDateLong, fmtDateTime, fmtDateTimeShort, fmtTime } from "@/lib/dateUtils";

function fmtOMR(n: number | string | null | undefined) {
  return `OMR ${Number(n ?? 0).toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
}
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// --- Setup Checklist ----------------------------------------------------------
const SETUP_STEPS = [
  { key: "company", label: "Company profile created", icon: Building2, href: "/company/workspace" },
  { key: "employees", label: "Add your first employee", icon: UserPlus, href: "/my-team" },
  { key: "payroll", label: "Run your first payroll", icon: DollarSign, href: "/payroll" },
  { key: "contracts", label: "Create a contract", icon: FileText, href: "/contracts" },
  { key: "pro", label: "Submit a PRO service request", icon: Shield, href: "/pro" },
];

// --- Action Item Card ---------------------------------------------------------
function ActionItem({
  icon: Icon, title, description, badge, badgeVariant = "secondary", href, urgent,
}: {
  icon: React.ElementType; title: string; description: string;
  badge?: string | number; badgeVariant?: "secondary" | "destructive" | "outline";
  href: string; urgent?: boolean;
}) {
  const [, navigate] = useLocation();
  return (
    <button
      onClick={() => navigate(href)}
      className={`w-full text-left flex items-start gap-3 p-3 rounded-lg border transition-all hover:shadow-sm ${
        urgent
          ? "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/30"
          : "border-border bg-card hover:bg-muted/40"
      }`}
    >
      <div className={`mt-0.5 p-1.5 rounded-md ${urgent ? "bg-red-100 dark:bg-red-900/40" : "bg-muted"}`}>
        <Icon size={14} className={urgent ? "text-red-600 dark:text-red-400" : "text-muted-foreground"} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{title}</span>
          {badge != null && (
            <Badge variant={badgeVariant} className="text-xs px-1.5 py-0 h-4 shrink-0">
              {badge}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{description}</p>
      </div>
      <ChevronRight size={14} className="text-muted-foreground mt-1 shrink-0" />
    </button>
  );
}

// --- KPI Tile -----------------------------------------------------------------
function KpiTile({
  icon: Icon, label, value, sub, color, href,
}: {
  icon: React.ElementType; label: string; value: string | number;
  sub?: string; color: string; href?: string;
}) {
  const [, navigate] = useLocation();
  return (
    <button
      onClick={() => href && navigate(href)}
      className={`w-full text-left p-4 rounded-xl border border-border bg-card hover:shadow-md transition-all group ${href ? "cursor-pointer" : "cursor-default"}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon size={18} className="text-white" />
        </div>
        {href && <ChevronRight size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />}
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      <div className="text-xs font-medium text-muted-foreground mt-0.5 uppercase tracking-wide">{label}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </button>
  );
}

// --- Module Card --------------------------------------------------------------
function ModuleCard({
  icon: Icon, title, description, status, statusColor, href, actions,
}: {
  icon: React.ElementType; title: string; description: string;
  status?: string; statusColor?: string; href: string;
  actions?: { label: string; href: string }[];
}) {
  const [, navigate] = useLocation();
  return (
    <Card className="hover:shadow-md transition-all group cursor-pointer" onClick={() => navigate(href)}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-muted group-hover:bg-primary/10 transition-colors">
            <Icon size={18} className="text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-foreground text-sm">{title}</span>
              {status && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${statusColor}`}>{status}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>
            {actions && actions.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {actions.map((a) => (
                  <button
                    key={a.href}
                    onClick={(e) => { e.stopPropagation(); navigate(a.href); }}
                    className="text-xs text-primary hover:underline flex items-center gap-0.5"
                  >
                    {a.label} <ArrowRight size={10} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Main Page ----------------------------------------------------------------
export default function BusinessDashboardPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { activeCompanyId } = useActiveCompany();
  const { data: company } = trpc.companies.myCompany.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: stats, isLoading: statsLoading } = trpc.companies.myStats.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: teamStats, isLoading: teamLoading } = trpc.team.getTeamStats.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: tasks, isLoading: tasksLoading } = trpc.operations.getTodaysTasks.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: smartDash } = trpc.operations.getSmartDashboard.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: payrollRuns } = trpc.payroll.listRuns.useQuery({ year: new Date().getFullYear(), companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: alertsData } = trpc.alerts.getExpiryAlerts.useQuery({ maxDays: 30, companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const alerts = alertsData?.alerts ?? [];

  const companyName = company?.company?.name ?? "Your Company";
  const now = new Date();
  const currentMonth = MONTH_NAMES[now.getMonth()];
  const currentYear = now.getFullYear();

  // Payroll status for current month
  const currentPayroll = payrollRuns?.find(
    (r) => r.periodMonth === now.getMonth() + 1 && r.periodYear === currentYear
  );
  const payrollStatus = currentPayroll?.status ?? "not_started";

  // Setup checklist completion
  const setupDone = {
    company: !!company?.company,
    employees: (teamStats?.total ?? 0) > 0,
    payroll: (payrollRuns?.length ?? 0) > 0,
    contracts: (stats?.contracts ?? 0) > 0,
    pro: (stats?.proServices ?? 0) > 0,
  };
  const setupComplete = Object.values(setupDone).filter(Boolean).length;
  const setupTotal = SETUP_STEPS.length;
  const isNewCompany = setupComplete < 3;

  // Action items — merge smart dashboard actions with legacy task counts
  const pendingLeaves = tasks?.pendingLeaveApprovals?.length ?? 0;
  const pendingPayrolls = tasks?.pendingPayrollApprovals?.length ?? 0;
  const criticalAlerts = alerts.filter((a: any) => a.severity === "critical" || a.severity === "high").length;
  const smartActions = smartDash?.actions ?? [];
  const totalActions = Math.max(pendingLeaves + pendingPayrolls + criticalAlerts, smartActions.filter(a => a.priority === "critical" || a.priority === "high").length);

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ── */}
      <div className="border-b bg-card px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {greeting()}, {user?.name?.split(" ")[0] ?? "there"} 👋
            </h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Building2 size={14} />
                {companyName}
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Calendar size={14} />
                {now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </span>
              {totalActions > 0 && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400 font-medium">
                    <AlertTriangle size={14} />
                    {totalActions} action{totalActions !== 1 ? "s" : ""} needed
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => navigate("/my-team")} className="gap-1.5">
              <UserPlus size={14} /> Add Employee
            </Button>
            <Button size="sm" onClick={() => navigate("/company/operations")} className="gap-1.5">
              <Activity size={14} /> Operations
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* ── Setup Checklist (new companies) ── */}
        {isNewCompany && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap size={16} className="text-primary" />
                  Getting Started — Set Up Your Business
                </CardTitle>
                <span className="text-sm font-medium text-muted-foreground">{setupComplete}/{setupTotal} complete</span>
              </div>
              <Progress value={(setupComplete / setupTotal) * 100} className="h-1.5 mt-2" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                {SETUP_STEPS.map((step, i) => {
                  const done = setupDone[step.key as keyof typeof setupDone];
                  const Icon = step.icon;
                  return (
                    <button
                      key={step.key}
                      onClick={() => !done && navigate(step.href)}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all ${
                        done
                          ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20 cursor-default"
                          : "border-border bg-card hover:border-primary/40 hover:bg-primary/5 cursor-pointer"
                      }`}
                    >
                      <div className={`p-1 rounded-md shrink-0 ${done ? "bg-emerald-100 dark:bg-emerald-900/40" : "bg-muted"}`}>
                        {done
                          ? <CheckCircle2 size={12} className="text-emerald-600 dark:text-emerald-400" />
                          : <Icon size={12} className="text-muted-foreground" />
                        }
                      </div>
                      <span className={`text-xs font-medium ${done ? "text-emerald-700 dark:text-emerald-400 line-through" : "text-foreground"}`}>
                        {i + 1}. {step.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── KPI Tiles ── */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Company Overview</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3">
            {statsLoading || teamLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))
            ) : (
              <>
                <KpiTile icon={Users} label="Total Staff" value={teamStats?.total ?? 0}
                  sub={`${teamStats?.active ?? 0} active`} color="bg-blue-500" href="/my-team" />
                <KpiTile icon={UserPlus} label="On Leave" value={smartDash?.headcount?.onLeave ?? teamStats?.onLeave ?? 0}
                  sub="Currently away" color="bg-amber-500" href="/hr/leave" />
                <KpiTile icon={Target} label="Omanisation"
                  value={`${smartDash?.omanisation?.rate ?? 0}%`}
                  sub={`${smartDash?.omanisation?.omani ?? 0} Omani / ${smartDash?.omanisation?.expat ?? 0} expat`}
                  color={(smartDash?.omanisation?.rate ?? 0) >= 35 ? "bg-emerald-500" : "bg-orange-500"}
                  href="/company/profile" />
                <KpiTile icon={DollarSign} label="Monthly Payroll"
                  value={smartDash?.payroll?.monthlyTotal ? fmtOMR(smartDash.payroll.monthlyTotal) : (currentPayroll ? fmtOMR(currentPayroll.totalNet) : "Not run")}
                  sub={`${currentMonth} ${currentYear} • ${smartDash?.payroll?.thisMonthStatus?.replace("_", " ") ?? payrollStatus}`}
                  color={payrollStatus === "paid" ? "bg-emerald-500" : "bg-gray-500"} href="/payroll" />
                <KpiTile icon={FileText} label="Contracts" value={stats?.contracts ?? 0}
                  sub="Active agreements" color="bg-violet-500" href="/contracts" />
                <KpiTile icon={Shield} label="PRO Cases" value={stats?.proServices ?? 0}
                  sub="Managed services" color="bg-teal-500" href="/pro" />
                <KpiTile icon={AlertTriangle} label="Expiring Docs"
                  value={(smartDash?.documents?.expiring30d ?? 0) + (smartDash?.permits?.expiring30d ?? 0)}
                  sub={`${(smartDash?.documents?.expired ?? 0) + (smartDash?.permits?.expired ?? 0)} already expired`}
                  color={((smartDash?.documents?.expired ?? 0) + (smartDash?.permits?.expired ?? 0)) > 0 ? "bg-red-500" : "bg-orange-500"}
                  href="/hr/documents-dashboard" />
                <KpiTile icon={Bell} label="Expiry Alerts" value={alerts.length}
                  sub={`${criticalAlerts} critical`} color={criticalAlerts > 0 ? "bg-red-500" : "bg-gray-500"} href="/alerts" />
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Action Items ── */}
          <div className="lg:col-span-1">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Needs Attention
              </h2>
              {totalActions > 0 && (
                <Badge variant="destructive" className="text-xs">{totalActions}</Badge>
              )}
            </div>
            <div className="space-y-2">
              {tasksLoading ? (
                Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)
              ) : smartActions.length === 0 && totalActions === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center border border-dashed border-border rounded-xl">
                  <CheckCircle2 size={28} className="text-emerald-500 mb-2" />
                  <p className="text-sm font-medium text-foreground">All caught up!</p>
                  <p className="text-xs text-muted-foreground mt-1">No pending actions today</p>
                </div>
              ) : smartActions.length > 0 ? (
                // Smart dashboard actions (richer, from getSmartDashboard)
                <>
                  {smartActions.map((action, i) => (
                    <ActionItem
                      key={i}
                      icon={action.priority === "critical" ? AlertTriangle : action.priority === "high" ? Bell : Clock}
                      title={action.title}
                      description={action.description}
                      badge={action.count > 1 ? action.count : undefined}
                      badgeVariant={action.priority === "critical" ? "destructive" : action.priority === "high" ? "destructive" : "secondary"}
                      href={action.url}
                      urgent={action.priority === "critical" || action.priority === "high"}
                    />
                  ))}
                </>
              ) : (
                // Fallback legacy actions
                <>
                  {pendingLeaves > 0 && (
                    <ActionItem icon={Calendar} title="Pending Leave Requests"
                      description={`${pendingLeaves} employee${pendingLeaves > 1 ? "s" : ""} waiting for approval`}
                      badge={pendingLeaves} badgeVariant="destructive" href="/hr/leave" urgent />
                  )}
                  {pendingPayrolls > 0 && (
                    <ActionItem icon={DollarSign} title="Payroll Awaiting Approval"
                      description={`${pendingPayrolls} payroll run${pendingPayrolls > 1 ? "s" : ""} ready to approve`}
                      badge={pendingPayrolls} badgeVariant="destructive" href="/payroll" urgent />
                  )}
                  {criticalAlerts > 0 && (
                    <ActionItem icon={AlertTriangle} title="Critical Document Expiries"
                      description={`${criticalAlerts} document${criticalAlerts > 1 ? "s" : ""} expiring very soon`}
                      badge={criticalAlerts} badgeVariant="destructive" href="/alerts" urgent />
                  )}
                  {payrollStatus === "not_started" && (teamStats?.total ?? 0) > 0 && (
                    <ActionItem icon={Play} title={`Run ${currentMonth} Payroll`}
                      description={`${teamStats?.active ?? 0} active employees ready for payroll`} href="/payroll" />
                  )}
                </>
              )}

              {/* Quick Actions */}
              <div className="pt-2 border-t border-border mt-2">
                <p className="text-xs font-medium text-muted-foreground mb-2">Quick Actions</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={() => navigate("/my-team")}>
                    <UserPlus size={12} /> Add Staff
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={() => navigate("/payroll")}>
                    <DollarSign size={12} /> Payroll
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={() => navigate("/hr/leave")}>
                    <Calendar size={12} /> Leave
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={() => navigate("/pro")}>
                    <Shield size={12} /> PRO
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Business Modules ── */}
          <div className="lg:col-span-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Your Business Modules</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ModuleCard
                icon={Users}
                title="People & HR"
                description="Manage employees, leave requests, attendance, and performance reviews."
                status={teamStats ? `${teamStats.active} active` : undefined}
                statusColor="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                href="/my-team"
                actions={[
                  { label: "My Team", href: "/my-team" },
                  { label: "Leave", href: "/hr/leave" },
                  { label: "Attendance", href: "/hr/attendance" },
                ]}
              />
              <ModuleCard
                icon={DollarSign}
                title="Payroll & Compensation"
                description="Run monthly payroll, generate WPS files, view payslips, and manage salaries."
                status={currentPayroll ? currentPayroll.status.replace("_", " ") : `${currentMonth} pending`}
                statusColor={
                  currentPayroll?.status === "paid"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                }
                href="/payroll"
                actions={[
                  { label: "Run Payroll", href: "/payroll" },
                  { label: "Payroll History", href: "/payroll" },
                ]}
              />
              <ModuleCard
                icon={FileText}
                title="Contracts"
                description="Draft, negotiate, and digitally sign employment and service contracts."
                status={stats ? `${stats.contracts} total` : undefined}
                statusColor="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
                href="/contracts"
                actions={[
                  { label: "New Contract", href: "/contracts" },
                  { label: "View All", href: "/contracts" },
                ]}
              />
              <ModuleCard
                icon={Shield}
                title="PRO & Government Services"
                description="Work permits, visas, labour cards, PASI contributions, and MHRSD filings."
                status={stats ? `${stats.proServices} cases` : undefined}
                statusColor="bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400"
                href="/pro"
                actions={[
                  { label: "New Request", href: "/pro" },
                  { label: "Workforce Hub", href: "/workforce" },
                ]}
              />
              <ModuleCard
                icon={Bell}
                title="Document Expiry & Alerts"
                description="Track passport, visa, and work permit expiries. Get notified before they expire."
                status={criticalAlerts > 0 ? `${criticalAlerts} critical` : "All clear"}
                statusColor={
                  criticalAlerts > 0
                    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                }
                href="/alerts"
                actions={[
                  { label: "View Alerts", href: "/alerts" },
                  { label: "Renewals", href: "/renewal-workflows" },
                ]}
              />
              <ModuleCard
                icon={BarChart3}
                title="Analytics & Reports"
                description="Business intelligence, HR analytics, financial reports, and compliance dashboards."
                href="/analytics"
                actions={[
                  { label: "Analytics", href: "/analytics" },
                  { label: "Compliance", href: "/compliance" },
                  { label: "Reports", href: "/reports" },
                ]}
              />
            </div>
          </div>
        </div>

        {/* ── Recent Hires + Payroll Summary ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Recent Hires */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <UserPlus size={15} className="text-primary" />
                  Recent Hires
                </CardTitle>
                <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={() => navigate("/my-team")}>
                  View All <ChevronRight size={12} />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {teamLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
                </div>
              ) : (teamStats?.recentHires?.length ?? 0) === 0 ? (
                <div className="text-center py-6">
                  <Users size={24} className="text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No recent hires in the last 30 days</p>
                  <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => navigate("/my-team")}>
                    <UserPlus size={13} /> Add Your First Employee
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {teamStats?.recentHires?.map((emp) => (
                    <div key={emp.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-primary">
                          {emp.firstName[0]}{emp.lastName[0]}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {emp.firstName} {emp.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {emp.position ?? emp.department ?? "—"}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">{fmtDate(emp.hireDate)}</p>
                        <Badge variant="outline" className="text-xs px-1.5 py-0 h-4 mt-0.5">
                          {emp.employmentType?.replace("_", " ") ?? "full time"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payroll Summary */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <DollarSign size={15} className="text-primary" />
                  Payroll Summary — {currentYear}
                </CardTitle>
                <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={() => navigate("/payroll")}>
                  Manage <ChevronRight size={12} />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {(payrollRuns?.length ?? 0) === 0 ? (
                <div className="text-center py-6">
                  <DollarSign size={24} className="text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No payroll runs yet this year</p>
                  <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => navigate("/payroll")}>
                    <Play size={13} /> Run First Payroll
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {payrollRuns?.slice(0, 5).map((run) => (
                    <div key={run.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${
                          run.status === "paid" ? "bg-emerald-500" :
                          run.status === "approved" ? "bg-blue-500" :
                          "bg-amber-500"
                        }`} />
                        <span className="text-sm font-medium text-foreground">
                          {MONTH_NAMES[run.periodMonth - 1]} {run.periodYear}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-foreground font-medium">{fmtOMR(run.totalNet)}</span>
                        <Badge
                          variant="outline"
                          className={`text-xs px-1.5 py-0 h-4 ${
                            run.status === "paid" ? "border-emerald-300 text-emerald-700 dark:text-emerald-400" :
                            run.status === "approved" ? "border-blue-300 text-blue-700 dark:text-blue-400" :
                            "border-amber-300 text-amber-700 dark:text-amber-400"
                          }`}
                        >
                          {run.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Department Breakdown ── */}
        {(teamStats?.byDepartment?.length ?? 0) > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Target size={15} className="text-primary" />
                Staff by Department
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {teamStats?.byDepartment?.slice(0, 6).map((d) => (
                  <div key={d.dept} className="flex items-center gap-3">
                    <span className="text-sm text-foreground w-36 truncate shrink-0">{d.dept}</span>
                    <div className="flex-1">
                      <Progress
                        value={teamStats.total > 0 ? (d.count / teamStats.total) * 100 : 0}
                        className="h-2"
                      />
                    </div>
                    <span className="text-sm font-medium text-foreground w-8 text-right shrink-0">{d.count}</span>
                    <span className="text-xs text-muted-foreground w-10 text-right shrink-0">
                      {teamStats.total > 0 ? Math.round((d.count / teamStats.total) * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}
