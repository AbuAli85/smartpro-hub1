import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Users, DollarSign, FileText, Shield, Building2, BarChart3,
  ChevronRight, CheckCircle2, Clock, AlertTriangle, TrendingUp,
  Briefcase, Calendar, CreditCard, Globe, Star, Zap, UserPlus,
  Play, Download, Bell, Settings, ArrowRight, Activity,
  BookOpen, Target, RefreshCw, UserCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

// ─── KPI tile ─────────────────────────────────────────────────────────────────

function KpiTile({
  icon, label, value, sub, color, href,
}: {
  icon: React.ReactNode; label: string; value: string | number;
  sub?: string; color: string; href?: string;
}) {
  const inner = (
    <div className={`rounded-xl border p-4 flex items-start gap-3 transition-all ${href ? "hover:shadow-md hover:border-[var(--smartpro-orange)] cursor-pointer" : ""} bg-white`}>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-black text-gray-900 leading-none">{value}</div>
        <div className="text-xs font-medium text-gray-600 mt-1">{label}</div>
        {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
      </div>
      {href && <ChevronRight size={14} className="text-gray-300 ml-auto mt-1 shrink-0" />}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

// ─── Module card ──────────────────────────────────────────────────────────────

function ModuleCard({
  icon, title, description, href, status, actions,
}: {
  icon: React.ReactNode; title: string; description: string;
  href: string; status?: { label: string; color: string };
  actions?: { label: string; href: string }[];
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3 hover:shadow-md hover:border-gray-300 transition-all">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-gray-900">{title}</span>
            {status && (
              <Badge className={`text-[10px] border px-1.5 py-0 ${status.color}`}>{status.label}</Badge>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Link href={href}>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
            Open <ArrowRight size={11} />
          </Button>
        </Link>
        {actions?.map((a) => (
          <Link key={a.href} href={a.href}>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-500 hover:text-gray-700">
              {a.label}
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
        ${done ? "border-emerald-200 bg-emerald-50" : "border-gray-200 bg-white hover:border-[var(--smartpro-orange)] hover:bg-orange-50"}`}>
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0
          ${done ? "bg-emerald-500 text-white" : "bg-[var(--smartpro-orange)] text-white"}`}>
          {done ? "✓" : step}
        </div>
        <div>
          <div className={`text-sm font-semibold ${done ? "text-emerald-700 line-through" : "text-gray-800"}`}>{title}</div>
          <div className="text-xs text-gray-500 mt-0.5">{description}</div>
        </div>
        {!done && <ChevronRight size={14} className="text-gray-400 ml-auto mt-1 shrink-0" />}
      </div>
    </Link>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CompanyWorkspacePage() {
  const { user } = useAuth();
  const { data: myCompany } = trpc.companies.myCompany.useQuery();
  const { data: teamStats } = trpc.team.getTeamStats.useQuery();
  const { data: alertCount } = trpc.alerts.getAlertBadgeCount.useQuery();
  const { data: companyStats } = trpc.companies.myStats.useQuery();

  const company = myCompany?.company;
  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";

  // Setup checklist — infer completion from live data
  const hasStaff = (teamStats?.total ?? 0) > 0;
  const hasPayroll = (companyStats?.employees ?? 0) > 0;
  const hasContract = (companyStats?.contracts ?? 0) > 0;

  return (
    <div className="min-h-full bg-gray-50">
      {/* Hero header */}
      <div className="bg-white border-b border-gray-200 px-6 py-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm text-gray-500 mb-1">
                {greeting}, {user?.name?.split(" ")[0] ?? "there"} 👋
              </div>
              <h1 className="text-2xl font-black text-gray-900">
                {company?.name ?? "Your Company"} Workspace
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Your all-in-one business operating centre — staff, payroll, contracts, compliance, and more.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link href="/my-team">
                <Button className="bg-[var(--smartpro-orange)] hover:bg-orange-600 text-white gap-2" size="sm">
                  <UserPlus size={14} /> Add Staff
                </Button>
              </Link>
              <Link href="/alerts">
                <Button variant="outline" size="sm" className="gap-2 relative">
                  <Bell size={14} />
                  {(alertCount?.count ?? 0) > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                      {alertCount!.count}
                    </span>
                  )}
                  Alerts
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-8">

        {/* Live KPI tiles */}
        <section>
          <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Live Overview</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiTile
              icon={<Users size={18} className="text-orange-600" />}
              label="Total Staff" value={teamStats?.total ?? 0}
              sub={`${teamStats?.active ?? 0} active`}
              color="bg-orange-50" href="/my-team"
            />
            <KpiTile
              icon={<UserCheck size={18} className="text-emerald-600" />}
              label="Active Staff" value={teamStats?.active ?? 0}
              sub={`${teamStats?.onLeave ?? 0} on leave`}
              color="bg-emerald-50" href="/my-team"
            />
            <KpiTile
              icon={<FileText size={18} className="text-blue-600" />}
              label="Contracts" value={companyStats?.contracts ?? 0}
              sub="Active agreements"
              color="bg-blue-50" href="/contracts"
            />
            <KpiTile
              icon={<Shield size={18} className="text-purple-600" />}
              label="PRO Services" value={companyStats?.proServices ?? 0}
              sub="Managed cases"
              color="bg-purple-50" href="/pro"
            />
            <KpiTile
              icon={<Bell size={18} className="text-red-600" />}
              label="Expiry Alerts" value={alertCount?.count ?? 0}
              sub="Require attention"
              color="bg-red-50" href="/alerts"
            />
            <KpiTile
              icon={<BarChart3 size={18} className="text-teal-600" />}
              label="Departments" value={teamStats?.byDepartment.length ?? 0}
              sub="Across your company"
              color="bg-teal-50" href="/my-team"
            />
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left: Business modules */}
          <div className="lg:col-span-2 space-y-6">

            {/* Core HR & People */}
            <section>
              <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
                <Users size={12} /> People & HR
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ModuleCard
                  icon={<Users size={16} className="text-orange-600" />}
                  title="My Team"
                  description="Add and manage your staff. View profiles, track employment status, and maintain your workforce directory."
                  href="/my-team"
                  status={{ label: `${teamStats?.total ?? 0} staff`, color: "bg-orange-100 text-orange-700 border-orange-200" }}
                  actions={[{ label: "Add Staff", href: "/my-team" }]}
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
                  title="Leave & Payroll Records"
                  description="Manage leave requests, track approvals, and maintain payroll records for your employees."
                  href="/hr/leave"
                  actions={[{ label: "View Requests", href: "/hr/leave" }]}
                />
                <ModuleCard
                  icon={<Clock size={16} className="text-amber-600" />}
                  title="Attendance"
                  description="Track daily attendance, clock-in/out records, and generate weekly attendance reports."
                  href="/hr/attendance"
                  actions={[{ label: "View Attendance", href: "/hr/attendance" }]}
                />
                <ModuleCard
                  icon={<Briefcase size={16} className="text-indigo-600" />}
                  title="HR Employees"
                  description="Full HR employee management with government fields, MOL compliance, and detailed workforce profiles."
                  href="/hr/employees"
                  actions={[{ label: "View All", href: "/hr/employees" }]}
                />
                <ModuleCard
                  icon={<BookOpen size={16} className="text-pink-600" />}
                  title="Recruitment"
                  description="Post job openings, manage applications, and track your hiring pipeline with ATS."
                  href="/hr/recruitment"
                  actions={[{ label: "Post Job", href: "/hr/recruitment" }]}
                />
              </div>
            </section>

            {/* Business operations */}
            <section>
              <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
                <Briefcase size={12} /> Business Operations
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ModuleCard
                  icon={<FileText size={16} className="text-blue-600" />}
                  title="Contracts"
                  description="Draft, negotiate, and manage contracts. AI-powered templates, e-signature tracking, and version control."
                  href="/contracts"
                  status={{ label: `${companyStats?.contracts ?? 0} active`, color: "bg-blue-100 text-blue-700 border-blue-200" }}
                />
                <ModuleCard
                  icon={<Target size={16} className="text-teal-600" />}
                  title="Quotations"
                  description="Create and send professional quotations to clients. Track acceptance and convert to contracts."
                  href="/quotations"
                />
                <ModuleCard
                  icon={<Users size={16} className="text-purple-600" />}
                  title="CRM"
                  description="Manage client relationships, track communications, and run your sales pipeline."
                  href="/crm"
                />
                <ModuleCard
                  icon={<Activity size={16} className="text-gray-600" />}
                  title="Operations Centre"
                  description="Daily operations snapshot, AI insights, task management, and cross-module activity feed."
                  href="/operations"
                />
              </div>
            </section>

            {/* Government & Compliance */}
            <section>
              <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
                <Shield size={12} /> Government & Compliance
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ModuleCard
                  icon={<Shield size={16} className="text-purple-600" />}
                  title="PRO Services"
                  description="Manage work permits, visas, labour cards, and all government filings with expiry tracking."
                  href="/pro"
                  status={{ label: `${companyStats?.proServices ?? 0} cases`, color: "bg-purple-100 text-purple-700 border-purple-200" }}
                />
                <ModuleCard
                  icon={<CheckCircle2 size={16} className="text-emerald-600" />}
                  title="Compliance Dashboard"
                  description="Omanisation quota, PASI status, WPS compliance, and work permit validity matrix."
                  href="/compliance"
                />
                <ModuleCard
                  icon={<Building2 size={16} className="text-gray-600" />}
                  title="Sanad Offices"
                  description="Track Sanad office applications, service requests, and government document processing."
                  href="/sanad"
                />
                <ModuleCard
                  icon={<Bell size={16} className="text-red-600" />}
                  title="Expiry Alerts"
                  description="Unified dashboard for all upcoming document expiries — permits, visas, contracts, licences."
                  href="/alerts"
                  status={
                    (alertCount?.count ?? 0) > 0
                      ? { label: `${alertCount!.count} alerts`, color: "bg-red-100 text-red-700 border-red-200" }
                      : undefined
                  }
                />
              </div>
            </section>

          </div>

          {/* Right: Setup guide + recent hires */}
          <div className="space-y-5">

            {/* Setup checklist */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Zap size={14} className="text-[var(--smartpro-orange)]" />
                  Getting Started
                </CardTitle>
                <p className="text-xs text-gray-500">Complete these steps to get your workspace running.</p>
              </CardHeader>
              <CardContent className="space-y-2">
                <SetupStep
                  step={1} done={Boolean(company)}
                  title="Create your company"
                  description="Register your business on SmartPRO Hub"
                  href="/onboarding"
                />
                <SetupStep
                  step={2} done={hasStaff}
                  title="Add your first staff member"
                  description="Build your team directory"
                  href="/my-team"
                />
                <SetupStep
                  step={3} done={hasContract}
                  title="Create a contract"
                  description="Draft your first business contract"
                  href="/contracts"
                />
                <SetupStep
                  step={4} done={hasPayroll}
                  title="Set up payroll"
                  description="Configure salaries and run your first payroll"
                  href="/payroll"
                />
                <SetupStep
                  step={5} done={false}
                  title="Connect PRO services"
                  description="Link work permits and government filings"
                  href="/pro"
                />
              </CardContent>
            </Card>

            {/* Recent hires */}
            {(teamStats?.recentHires?.length ?? 0) > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp size={14} className="text-emerald-500" />
                    Recent Hires
                  </CardTitle>
                  <p className="text-xs text-gray-500">Staff added in the last 30 days</p>
                </CardHeader>
                <CardContent className="space-y-2">
                  {teamStats!.recentHires.map((e) => (
                    <div key={e.id} className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-[var(--smartpro-orange)] flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {(e.firstName[0] ?? "") + (e.lastName[0] ?? "")}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-gray-800 truncate">
                          {e.firstName} {e.lastName}
                        </div>
                        <div className="text-[10px] text-gray-400 truncate">{e.position || e.department || "—"}</div>
                      </div>
                      <Badge className="text-[9px] border bg-emerald-50 text-emerald-700 border-emerald-200 ml-auto shrink-0">New</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Department breakdown */}
            {(teamStats?.byDepartment?.length ?? 0) > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <BarChart3 size={14} className="text-blue-500" />
                    Staff by Department
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {teamStats!.byDepartment.slice(0, 6).map((d, i) => {
                    const max = teamStats!.byDepartment[0]?.count ?? 1;
                    const colors = ["bg-orange-500", "bg-blue-500", "bg-emerald-500", "bg-purple-500", "bg-amber-500", "bg-teal-500"];
                    return (
                      <div key={d.dept} className="flex items-center gap-2">
                        <div className="w-20 text-xs text-gray-600 truncate">{d.dept}</div>
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${colors[i % colors.length]}`}
                            style={{ width: `${(d.count / max) * 100}%` }}
                          />
                        </div>
                        <div className="w-5 text-xs font-semibold text-gray-700 text-right">{d.count}</div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Quick links */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Quick Links</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {[
                  { label: "Workforce Hub", href: "/workforce", icon: <Globe size={13} /> },
                  { label: "Client Portal", href: "/client-portal", icon: <UserCheck size={13} /> },
                  { label: "Analytics", href: "/analytics", icon: <BarChart3 size={13} /> },
                  { label: "Renewal Workflows", href: "/renewal-workflows", icon: <RefreshCw size={13} /> },
                  { label: "Company Settings", href: "/company-admin", icon: <Settings size={13} /> },
                ].map((l) => (
                  <Link key={l.href} href={l.href}>
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 text-sm text-gray-600 hover:text-gray-900 transition-colors cursor-pointer">
                      <span className="text-gray-400">{l.icon}</span>
                      {l.label}
                      <ChevronRight size={12} className="ml-auto text-gray-300" />
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
